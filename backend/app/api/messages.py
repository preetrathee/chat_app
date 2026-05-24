from pathlib import Path
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.api.websockets import broadcast_message
from app.db.session import get_db
from app.models import Message, User
from app.schemas.message import MessageCreate, MessageOut
from app.services.connections import has_accepted_connection
from app.services.conversations import load_conversation

router = APIRouter(prefix="/messages", tags=["messages"])
UPLOAD_DIR = Path("uploads/chat_images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/conversation/{conversation_id}", response_model=list[MessageOut])
async def list_messages(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = await load_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    other_user_id = (
        conversation.user_two_id if conversation.user_one_id == current_user.id else conversation.user_one_id
    )
    if not await has_accepted_connection(db, current_user.id, other_user_id):
        raise HTTPException(status_code=403, detail="Connection request must be accepted first")
    return conversation.messages


@router.post("/conversation/{conversation_id}", response_model=MessageOut)
async def create_message(
    conversation_id: int,
    payload: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = await load_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    other_user_id = (
        conversation.user_two_id if conversation.user_one_id == current_user.id else conversation.user_one_id
    )
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
    conversation = await load_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    other_user_id = (
        conversation.user_two_id if conversation.user_one_id == current_user.id else conversation.user_one_id
    )
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
