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

    async def connect(self, conversation_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[conversation_id].append(websocket)

    def disconnect(self, conversation_id: int, websocket: WebSocket) -> None:
        sockets = self.active_connections.get(conversation_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and conversation_id in self.active_connections:
            del self.active_connections[conversation_id]

    async def broadcast(self, conversation_id: int, payload: dict) -> None:
        disconnected: list[WebSocket] = []
        for websocket in self.active_connections.get(conversation_id, []):
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(conversation_id, websocket)


manager = ConnectionManager()


async def broadcast_message(conversation_id: int, message: Message) -> None:
    await manager.broadcast(
        conversation_id,
        {
            "type": "message",
            "message": MessageOut.model_validate(message).model_dump(mode="json"),
        },
    )


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
