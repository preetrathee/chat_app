from pathlib import Path
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.api.websockets import broadcast_message, broadcast_message_deleted
from app.db.session import get_db
from app.models import Message, User
from app.schemas.message import MessageBulkDelete, MessageCreate, MessageOut, MessagePage
from app.services.connections import has_accepted_connection
from app.services.conversations import get_conversation_participants

router = APIRouter(prefix="/messages", tags=["messages"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "chat_images"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def delete_image_file_if_present(message: Message) -> None:
    if message.message_type != "image":
        return
    file_name = Path(message.content).name
    if not file_name:
        return
    target_path = UPLOAD_DIR / file_name
    if target_path.exists():
        target_path.unlink()


@router.get("/conversation/{conversation_id}", response_model=MessagePage)
async def list_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    participants = await get_conversation_participants(db, conversation_id, current_user.id)
    if not participants:
        raise HTTPException(status_code=404, detail="Conversation not found")
    user_one_id, user_two_id = participants
    other_user_id = user_two_id if user_one_id == current_user.id else user_one_id
    if not await has_accepted_connection(db, current_user.id, other_user_id):
        raise HTTPException(status_code=403, detail="Connection request must be accepted first")
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .options(selectinload(Message.sender))
        .order_by(desc(Message.id))
        .limit(limit + 1)
    )
    if before_id:
        query = query.where(Message.id < before_id)
    rows = (await db.scalars(query)).all()
    has_more = len(rows) > limit
    items = list(reversed(rows[:limit]))
    return MessagePage(items=items, has_more=has_more)


@router.post("/conversation/{conversation_id}", response_model=MessageOut)
async def create_message(
    conversation_id: int,
    payload: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    participants = await get_conversation_participants(db, conversation_id, current_user.id)
    if not participants:
        raise HTTPException(status_code=404, detail="Conversation not found")
    user_one_id, user_two_id = participants
    other_user_id = user_two_id if user_one_id == current_user.id else user_one_id
    if not await has_accepted_connection(db, current_user.id, other_user_id):
        raise HTTPException(status_code=403, detail="Connection request must be accepted first")

    message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=payload.content.strip(),
    )
    db.add(message)
    await db.commit()
    message = await db.scalar(
        select(Message)
        .where(Message.id == message.id)
        .options(selectinload(Message.sender))
    )
    if not message:
        raise HTTPException(status_code=500, detail="Message could not be loaded")
    return message


@router.post("/conversation/{conversation_id}/image", response_model=MessageOut)
async def upload_image_message(
    conversation_id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    participants = await get_conversation_participants(db, conversation_id, current_user.id)
    if not participants:
        raise HTTPException(status_code=404, detail="Conversation not found")
    user_one_id, user_two_id = participants
    other_user_id = user_two_id if user_one_id == current_user.id else user_one_id
    if not await has_accepted_connection(db, current_user.id, other_user_id):
        raise HTTPException(status_code=403, detail="Connection request must be accepted first")
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    suffix = Path(image.filename or "upload.png").suffix.lower() or ".png"
    filename = f"{conversation_id}_{current_user.id}_{secrets.token_hex(8)}{suffix}"
    target_path = UPLOAD_DIR / filename
    contents = await image.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be smaller than 5 MB")
    target_path.write_bytes(contents)

    message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=f"/uploads/chat_images/{filename}",
        message_type="image",
    )
    db.add(message)
    await db.commit()
    loaded = await db.scalar(
        select(Message)
        .where(Message.id == message.id)
        .options(selectinload(Message.sender))
    )
    if not loaded:
        raise HTTPException(status_code=500, detail="Image message could not be loaded")
    await broadcast_message(conversation_id, loaded)
    return loaded


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = await db.scalar(select(Message).where(Message.id == message_id))
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")

    participants = await get_conversation_participants(db, message.conversation_id, current_user.id)
    if not participants:
        raise HTTPException(status_code=404, detail="Conversation not found")

    delete_image_file_if_present(message)
    conversation_id = message.conversation_id
    await db.delete(message)
    await db.commit()
    await broadcast_message_deleted(conversation_id, message_id)
    return Response(status_code=204)


@router.post("/bulk-delete", status_code=204)
async def bulk_delete_messages(
    payload: MessageBulkDelete,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message_ids = list(dict.fromkeys(payload.message_ids))
    messages = (await db.scalars(select(Message).where(Message.id.in_(message_ids)))).all()
    if len(messages) != len(message_ids):
        raise HTTPException(status_code=404, detail="One or more messages were not found")

    conversation_ids = {message.conversation_id for message in messages}
    if len(conversation_ids) != 1:
        raise HTTPException(status_code=400, detail="Messages must belong to the same conversation")

    for message in messages:
        if message.sender_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only delete your own messages")

    conversation_id = messages[0].conversation_id
    participants = await get_conversation_participants(db, conversation_id, current_user.id)
    if not participants:
        raise HTTPException(status_code=404, detail="Conversation not found")

    for message in messages:
        delete_image_file_if_present(message)
        await db.delete(message)
    await db.commit()

    for message_id in message_ids:
        await broadcast_message_deleted(conversation_id, message_id)
    return Response(status_code=204)
