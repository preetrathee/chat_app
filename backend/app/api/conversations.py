from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Conversation, Message, User
from app.schemas.conversation import ConversationCreate, ConversationDetail, ConversationOut
from app.schemas.user import PublicUser
from app.services.connections import get_connection_between, has_accepted_connection
from app.services.conversations import (
    get_or_create_conversation,
    load_conversation,
    participant_filter,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def serialize_conversation(conversation: Conversation, current_user: User) -> ConversationOut:
    other = (
        conversation.user_two
        if conversation.user_one_id == current_user.id
        else conversation.user_one
    )
    messages = list(conversation.messages or [])
    last_message = messages[-1] if messages else None
    return ConversationOut(
        id=conversation.id,
        user_one_id=conversation.user_one_id,
        user_two_id=conversation.user_two_id,
        created_at=conversation.created_at,
        other_user=PublicUser.model_validate(other),
        last_message=last_message,
    )


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversations = (
        await db.scalars(
            select(Conversation)
            .where(participant_filter(current_user.id))
            .options(
                selectinload(Conversation.user_one),
                selectinload(Conversation.user_two),
                selectinload(Conversation.messages).selectinload(Message.sender),
            )
            .order_by(desc(Conversation.created_at))
        )
    ).all()
    accepted_conversations: list[ConversationOut] = []
    for conversation in conversations:
        other_user_id = (
            conversation.user_two_id
            if conversation.user_one_id == current_user.id
            else conversation.user_one_id
        )
        connection = await get_connection_between(db, current_user.id, other_user_id)
        if connection and connection.status == "accepted":
            accepted_conversations.append(serialize_conversation(conversation, current_user))
    return accepted_conversations


@router.post("", response_model=ConversationOut)
async def start_conversation(
    payload: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot create a conversation with yourself")
    other_user = await db.get(User, payload.user_id)
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not await has_accepted_connection(db, current_user.id, other_user.id):
        raise HTTPException(status_code=403, detail="Connection request must be accepted first")
    conversation = await get_or_create_conversation(db, current_user, other_user)
    conversation = await load_conversation(db, conversation.id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return serialize_conversation(conversation, current_user)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = await load_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    base = serialize_conversation(conversation, current_user)
    return ConversationDetail(**base.model_dump(), messages=conversation.messages)
