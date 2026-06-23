from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ConnectionRequest


async def get_connection_between(
    db: AsyncSession, user_a_id: int, user_b_id: int
) -> ConnectionRequest | None:
    return await db.scalar(
        select(ConnectionRequest)
        .where(
            or_(
                and_(
                    ConnectionRequest.requester_id == user_a_id,
                    ConnectionRequest.receiver_id == user_b_id,
                ),
                and_(
                    ConnectionRequest.requester_id == user_b_id,
                    ConnectionRequest.receiver_id == user_a_id,
                ),
            )
        )
        .options(
            selectinload(ConnectionRequest.requester),
            selectinload(ConnectionRequest.receiver),
        )
    )


async def has_accepted_connection(db: AsyncSession, user_a_id: int, user_b_id: int) -> bool:
    status = await db.scalar(
        select(ConnectionRequest.status).where(
            or_(
                and_(
                    ConnectionRequest.requester_id == user_a_id,
                    ConnectionRequest.receiver_id == user_b_id,
                ),
                and_(
                    ConnectionRequest.requester_id == user_b_id,
                    ConnectionRequest.receiver_id == user_a_id,
                ),
            )
        )
    )
    return status == "accepted"
