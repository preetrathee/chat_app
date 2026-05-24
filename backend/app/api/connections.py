from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import ConnectionRequest, User
from app.schemas.connection import ConnectionRequestCreate, ConnectionRequestOut, DiscoverUserOut
from app.schemas.user import PublicUser
from app.services.connections import get_connection_between
from app.services.conversations import get_or_create_conversation

router = APIRouter(prefix="/connections", tags=["connections"])


def serialize_request(request: ConnectionRequest) -> ConnectionRequestOut:
    return ConnectionRequestOut(
        id=request.id,
        status=request.status,
        created_at=request.created_at,
        requester=PublicUser.model_validate(request.requester),
        receiver=PublicUser.model_validate(request.receiver),
    )


@router.get("/discover", response_model=list[DiscoverUserOut])
async def discover_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = (await db.scalars(select(User).where(User.id != current_user.id).order_by(User.username))).all()
    result: list[DiscoverUserOut] = []
    for user in users:
        connection = await get_connection_between(db, current_user.id, user.id)
        status_value = "none"
        request_id = None
        if connection:
            request_id = connection.id
            if connection.status == "accepted":
                status_value = "accepted"
            elif connection.requester_id == current_user.id:
                status_value = "pending_sent"
            else:
                status_value = "pending_received"
        result.append(
            DiscoverUserOut(
                id=user.id,
                username=user.username,
                bio=user.bio,
                avatar_url=user.avatar_url,
                is_admin=user.is_admin,
                connection_status=status_value,
                request_id=request_id,
            )
        )
    return result


@router.get("/requests", response_model=list[ConnectionRequestOut])
async def list_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requests = (
        await db.scalars(
            select(ConnectionRequest)
            .where(
                or_(
                    ConnectionRequest.requester_id == current_user.id,
                    ConnectionRequest.receiver_id == current_user.id,
                )
            )
            .where(ConnectionRequest.status == "pending")
            .options(
                selectinload(ConnectionRequest.requester),
                selectinload(ConnectionRequest.receiver),
            )
            .order_by(ConnectionRequest.created_at.desc())
        )
    ).all()
    return [serialize_request(request) for request in requests]


@router.post("/request", response_model=ConnectionRequestOut, status_code=status.HTTP_201_CREATED)
async def send_request(
    payload: ConnectionRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send a request to yourself")

    other_user = await db.get(User, payload.user_id)
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await get_connection_between(db, current_user.id, payload.user_id)
    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=409, detail="Connection already accepted")
        if existing.receiver_id == current_user.id and existing.status == "pending":
            raise HTTPException(status_code=409, detail="This user already sent you a request")
        raise HTTPException(status_code=409, detail="Request already sent")

    request = ConnectionRequest(requester_id=current_user.id, receiver_id=payload.user_id)
    db.add(request)
    await db.commit()
    await db.refresh(request, attribute_names=["requester", "receiver"])
    return serialize_request(request)


@router.post("/{request_id}/accept", response_model=ConnectionRequestOut)
async def accept_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    request = await db.scalar(
        select(ConnectionRequest)
        .where(ConnectionRequest.id == request_id)
        .options(
            selectinload(ConnectionRequest.requester),
            selectinload(ConnectionRequest.receiver),
        )
    )
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the receiver can accept this request")
    if request.status == "accepted":
        return serialize_request(request)

    request.status = "accepted"
    await db.commit()
    await get_or_create_conversation(db, request.requester, request.receiver)
    await db.refresh(request, attribute_names=["requester", "receiver"])
    return serialize_request(request)
