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
from app.services.conversations import get_conversation_participants

router = APIRouter(tags=["websockets"])


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[int, list[WebSocket]] = defaultdict(list)
        self.user_connections: dict[int, list[WebSocket]] = defaultdict(list)
        self.presence_connections: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, conversation_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[conversation_id].append(websocket)

    async def connect_user(self, user_id: int, websocket: WebSocket) -> None:
        was_online = self.is_user_online(user_id)
        await websocket.accept()
        self.user_connections[user_id].append(websocket)
        if not was_online:
            await self.broadcast_presence(user_id, True)

    async def connect_presence(self, user_id: int, websocket: WebSocket) -> None:
        was_online = self.is_user_online(user_id)
        await websocket.accept()
        self.presence_connections[user_id].append(websocket)
        await websocket.send_json(
            {
                "type": "presence_snapshot",
                "online_user_ids": sorted(self.online_user_ids()),
            }
        )
        if not was_online:
            await self.broadcast_presence(user_id, True)

    def disconnect(self, conversation_id: int, websocket: WebSocket) -> None:
        sockets = self.active_connections.get(conversation_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and conversation_id in self.active_connections:
            del self.active_connections[conversation_id]

    async def disconnect_user(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self.user_connections.get(user_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and user_id in self.user_connections:
            del self.user_connections[user_id]
        if not self.is_user_online(user_id):
            await self.broadcast_presence(user_id, False)

    async def disconnect_presence(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self.presence_connections.get(user_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and user_id in self.presence_connections:
            del self.presence_connections[user_id]
        if not self.is_user_online(user_id):
            await self.broadcast_presence(user_id, False)

    def online_user_ids(self) -> set[int]:
        return set(self.user_connections) | set(self.presence_connections)

    def is_user_online(self, user_id: int) -> bool:
        return user_id in self.online_user_ids()

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
            await self.disconnect_user(user_id, websocket)

    async def broadcast_presence(self, user_id: int, is_online: bool) -> None:
        payload = {
            "type": "presence",
            "user_id": user_id,
            "is_online": is_online,
        }
        disconnected: list[tuple[int, WebSocket]] = []
        for recipient_id, sockets in list(self.presence_connections.items()):
            for websocket in list(sockets):
                try:
                    await websocket.send_json(payload)
                except Exception:
                    disconnected.append((recipient_id, websocket))
        for recipient_id, websocket in disconnected:
            await self.disconnect_presence(recipient_id, websocket)


manager = ConnectionManager()


async def broadcast_message(conversation_id: int, message: Message) -> None:
    await manager.broadcast(
        conversation_id,
        {
            "type": "message",
            "message": MessageOut.model_validate(message).model_dump(mode="json"),
        },
    )


async def broadcast_message_deleted(conversation_id: int, message_id: int) -> None:
    await manager.broadcast(
        conversation_id,
        {
            "type": "message_deleted",
            "message_id": message_id,
            "conversation_id": conversation_id,
        },
    )


async def broadcast_conversation_deleted(conversation_id: int) -> None:
    await manager.broadcast(
        conversation_id,
        {
            "type": "conversation_deleted",
            "conversation_id": conversation_id,
        },
    )


async def resolve_call_target(
    caller_id: int,
    conversation_id: int,
) -> tuple[User | None, int | None]:
    async with AsyncSessionLocal() as db:
        user = await db.get(User, caller_id)
        participants = await get_conversation_participants(db, conversation_id, caller_id)
        if not user or not participants:
            return None, None
        user_one_id, user_two_id = participants
        other_user_id = user_two_id if user_one_id == caller_id else user_one_id
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
        participants = await get_conversation_participants(db, conversation_id, int(subject))
        if not user or not participants:
            await websocket.close(code=1008)
            return
        user_one_id, user_two_id = participants
        other_user_id = user_two_id if user_one_id == int(subject) else user_one_id
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
                participants = await get_conversation_participants(db, conversation_id, int(subject))
                if not participants:
                    await websocket.send_json({"type": "error", "detail": "Conversation not found"})
                    continue
                user_one_id, user_two_id = participants
                other_user_id = user_two_id if user_one_id == int(subject) else user_one_id
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
        await manager.disconnect_user(user_id, websocket)


@router.websocket("/ws/presence")
async def presence_websocket(
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

    await manager.connect_presence(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect_presence(user_id, websocket)
