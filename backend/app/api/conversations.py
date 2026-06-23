from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.api.messages import delete_image_file_if_present
from app.api.websockets import broadcast_conversation_deleted
from app.db.session import get_db
from app.models import ConnectionRequest, Conversation, Message, User
from app.schemas.conversation import ConversationCreate, ConversationDetail, ConversationOut
from app.schemas.user import PublicUser
from app.services.connections import has_accepted_connection
from app.services.conversations import (
    get_or_create_conversation,
    load_conversation_summary,
    participant_filter,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def serialize_conversation(conversation: Conversation, current_user: User) -> ConversationOut:
    other = (
        conversation.user_two
        if conversation.user_one_id == current_user.id
        else conversation.user_one
    )
    return ConversationOut(
        id=conversation.id,
        user_one_id=conversation.user_one_id,
        user_two_id=conversation.user_two_id,
        created_at=conversation.created_at,
        other_user=PublicUser.model_validate(other),
        last_message=getattr(conversation, "last_message", None),
    )


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversations = (
        await db.scalars(
            select(Conversation)
            .join(
                ConnectionRequest,
                and_(
                    ConnectionRequest.status == "accepted",
                    or_(
                        and_(
                            ConnectionRequest.requester_id == Conversation.user_one_id,
                            ConnectionRequest.receiver_id == Conversation.user_two_id,
                        ),
                        and_(
                            ConnectionRequest.requester_id == Conversation.user_two_id,
                            ConnectionRequest.receiver_id == Conversation.user_one_id,
                        ),
                    ),
                ),
            )
            .where(participant_filter(current_user.id))
            .options(
                selectinload(Conversation.user_one),
                selectinload(Conversation.user_two),
            )
            .order_by(desc(Conversation.created_at))
        )
    ).unique().all()
    conversation_ids = [conversation.id for conversation in conversations]
    latest_by_conversation: dict[int, Message] = {}
    if conversation_ids:
        recent_messages = (
            await db.scalars(
                select(Message)
                .where(Message.conversation_id.in_(conversation_ids))
                .options(selectinload(Message.sender))
                .order_by(desc(Message.id))
            )
        ).all()
        for message in recent_messages:
            latest_by_conversation.setdefault(message.conversation_id, message)
    serialized: list[ConversationOut] = []
    for conversation in conversations:
        conversation.last_message = latest_by_conversation.get(conversation.id)
        serialized.append(serialize_conversation(conversation, current_user))
    serialized.sort(
        key=lambda conversation: (
            conversation.last_message.created_at if conversation.last_message else conversation.created_at
        ),
        reverse=True,
    )
    return serialized


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
    conversation = await load_conversation_summary(db, conversation.id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return serialize_conversation(conversation, current_user)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = await load_conversation_summary(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    base = serialize_conversation(conversation, current_user)
    return ConversationDetail(**base.model_dump(), messages=[])


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = await db.scalar(
        select(Conversation)
        .where(participant_filter(current_user.id), Conversation.id == conversation_id)
        .options(selectinload(Conversation.messages))
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    for message in conversation.messages:
        delete_image_file_if_present(message)

    await db.delete(conversation)
    await db.commit()
    await broadcast_conversation_deleted(conversation_id)
