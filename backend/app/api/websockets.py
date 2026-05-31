import json
from collections import defaultdict

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal
from app.models import Message, User
from app.schemas.message import MessageCreate, MessageOut
from app.services.connections import has_accepted_connection
from app.services.conversations import load_conversation

router = APIRouter(tags=["websockets"])


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[int, list[WebSocket]] = defaultdict(list)
        self.user_connections: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, conversation_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[conversation_id].append(websocket)

    async def connect_user(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.user_connections[user_id].append(websocket)

    def disconnect(self, conversation_id: int, websocket: WebSocket) -> None:
        sockets = self.active_connections.get(conversation_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and conversation_id in self.active_connections:
            del self.active_connections[conversation_id]

    def disconnect_user(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self.user_connections.get(user_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and user_id in self.user_connections:
            del self.user_connections[user_id]

    async def broadcast(self, conversation_id: int, payload: dict) -> None:
        disconnected: list[WebSocket] = []
        for websocket in self.active_connections.get(conversation_id, []):
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(conversation_id, websocket)

    async def send_to_user(self, user_id: int, payload: dict) -> None:
        disconnected: list[WebSocket] = []
        for websocket in self.user_connections.get(user_id, []):
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect_user(user_id, websocket)


manager = ConnectionManager()


async def broadcast_message(conversation_id: int, message: Message) -> None:
    await manager.broadcast(
        conversation_id,
        {
            "type": "message",
            "message": MessageOut.model_validate(message).model_dump(mode="json"),
        },
    )


async def resolve_call_target(
    caller_id: int,
    conversation_id: int,
) -> tuple[User | None, int | None]:
    async with AsyncSessionLocal() as db:
        user = await db.get(User, caller_id)
        conversation = await load_conversation(db, conversation_id, caller_id)
        if not user or not conversation:
            return None, None
        other_user_id = (
            conversation.user_two_id if conversation.user_one_id == caller_id else conversation.user_one_id
        )
        if not await has_accepted_connection(db, caller_id, other_user_id):
            return None, None
        return user, other_user_id


@router.websocket("/ws/chat/{conversation_id}")
async def chat_websocket(
    websocket: WebSocket,
    conversation_id: int,
    token: str = Query(default=""),
):
    subject = decode_access_token(token)
    if not subject:
        await websocket.close(code=1008)
        return

    async with AsyncSessionLocal() as db:
        user = await db.get(User, int(subject))
        conversation = await load_conversation(db, conversation_id, int(subject))
        if not user or not conversation:
            await websocket.close(code=1008)
            return
        other_user_id = (
            conversation.user_two_id if conversation.user_one_id == int(subject) else conversation.user_one_id
        )
        if not await has_accepted_connection(db, int(subject), other_user_id):
            await websocket.close(code=1008)
            return

    await manager.connect(conversation_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                payload = MessageCreate(content=data.get("content", "").strip())
            except Exception:
                await websocket.send_json({"type": "error", "detail": "Invalid message payload"})
                continue

            async with AsyncSessionLocal() as db:
                conversation = await load_conversation(db, conversation_id, int(subject))
                if not conversation:
                    await websocket.send_json({"type": "error", "detail": "Conversation not found"})
                    continue
                other_user_id = (
                    conversation.user_two_id
                    if conversation.user_one_id == int(subject)
                    else conversation.user_one_id
                )
                if not await has_accepted_connection(db, int(subject), other_user_id):
                    await websocket.send_json(
                        {"type": "error", "detail": "Connection request must be accepted first"}
                    )
                    continue

                message = Message(
                    conversation_id=conversation_id,
                    sender_id=int(subject),
                    content=payload.content,
                )
                db.add(message)
                await db.commit()
                loaded = await db.scalar(
                    select(Message)
                    .where(Message.id == message.id)
                    .options(selectinload(Message.sender))
                )
                if loaded:
                    await broadcast_message(conversation_id, loaded)
    except WebSocketDisconnect:
        manager.disconnect(conversation_id, websocket)


@router.websocket("/ws/signaling")
async def signaling_websocket(
    websocket: WebSocket,
    token: str = Query(default=""),
):
    subject = decode_access_token(token)
    if not subject:
        await websocket.close(code=1008)
        return

    user_id = int(subject)
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        if not user:
            await websocket.close(code=1008)
            return

    await manager.connect_user(user_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid signaling payload"})
                continue

            event_type = data.get("type")
            conversation_id = data.get("conversation_id")
            if not isinstance(conversation_id, int):
                await websocket.send_json({"type": "error", "detail": "Missing conversation ID"})
                continue

            user, target_user_id = await resolve_call_target(user_id, conversation_id)
            if not user or not target_user_id:
                await websocket.send_json({"type": "error", "detail": "Conversation not available for calling"})
                continue

            if event_type == "call_invite":
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "call_invite",
                        "conversation_id": conversation_id,
                        "from_user_id": user.id,
                        "from_username": user.username,
                        "mode": data.get("mode", "audio"),
                    },
                )
                continue

            if event_type == "call_busy":
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "call_busy",
                        "conversation_id": conversation_id,
                        "from_user_id": user_id,
                    },
                )
                continue

            if event_type in {"call_accept", "call_decline", "call_hangup"}:
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": event_type,
                        "conversation_id": conversation_id,
                        "from_user_id": user_id,
                    },
                )
                continue

            if event_type in {"webrtc_offer", "webrtc_answer", "ice_candidate"}:
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": event_type,
                        "conversation_id": conversation_id,
                        "from_user_id": user_id,
                        "payload": data.get("payload"),
                    },
                )
                continue

            await websocket.send_json({"type": "error", "detail": "Unsupported signaling event"})
    except WebSocketDisconnect:
        manager.disconnect_user(user_id, websocket)
