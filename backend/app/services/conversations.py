from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Conversation, Message, User


def ordered_pair(user_a_id: int, user_b_id: int) -> tuple[int, int]:
    return (user_a_id, user_b_id) if user_a_id < user_b_id else (user_b_id, user_a_id)


async def get_conversation_for_users(
    db: AsyncSession, user_a_id: int, user_b_id: int
) -> Conversation | None:
    user_one_id, user_two_id = ordered_pair(user_a_id, user_b_id)
    return await db.scalar(
        select(Conversation)
        .where(
            Conversation.user_one_id == user_one_id,
            Conversation.user_two_id == user_two_id,
        )
        .options(selectinload(Conversation.user_one), selectinload(Conversation.user_two))
    )


async def get_or_create_conversation(
    db: AsyncSession, current_user: User, other_user: User
) -> Conversation:
    existing = await get_conversation_for_users(db, current_user.id, other_user.id)
    if existing:
        return existing
    user_one_id, user_two_id = ordered_pair(current_user.id, other_user.id)
    conversation = Conversation(user_one_id=user_one_id, user_two_id=user_two_id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation, attribute_names=["user_one", "user_two"])
    return conversation


def participant_filter(user_id: int):
    return or_(Conversation.user_one_id == user_id, Conversation.user_two_id == user_id)


def conversation_access_filter(conversation_id: int, user_id: int):
    return and_(Conversation.id == conversation_id, participant_filter(user_id))


async def load_conversation(db: AsyncSession, conversation_id: int, user_id: int) -> Conversation | None:
    return await db.scalar(
        select(Conversation)
        .where(conversation_access_filter(conversation_id, user_id))
        .options(
            selectinload(Conversation.user_one),
            selectinload(Conversation.user_two),
            selectinload(Conversation.messages).selectinload(Message.sender),
        )
    )
