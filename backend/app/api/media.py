from pathlib import Path
import secrets

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.api.websockets import manager
from app.db.session import get_db
from app.models import ConnectionRequest, User, UserMedia
from app.schemas.media import UserMediaFeedOut, UserMediaOut
from app.schemas.user import PublicUser
from app.services.connections import has_accepted_connection
from app.services.storage import storage

router = APIRouter(prefix="/media", tags=["media"])

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_VIDEO_SIZE = 50 * 1024 * 1024


def media_type_from_content_type(content_type: str | None) -> str:
    if content_type and content_type.startswith("image/"):
        return "image"
    if content_type and content_type.startswith("video/"):
        return "video"
    raise HTTPException(status_code=400, detail="Only image and video files are allowed")


def serialize_public_user(user: User) -> PublicUser:
    return PublicUser(
        id=user.id,
        username=user.username,
        bio=user.bio,
        avatar_url=user.avatar_url,
        is_admin=user.is_admin,
        is_online=manager.is_user_online(user.id),
    )


def serialize_feed_item(item: UserMedia) -> UserMediaFeedOut:
    return UserMediaFeedOut(
        id=item.id,
        user_id=item.user_id,
        media_url=item.media_url,
        media_type=item.media_type,
        caption=item.caption,
        created_at=item.created_at,
        user=serialize_public_user(item.user),
    )


@router.get("/me", response_model=list[UserMediaOut])
async def list_my_media(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media = (
        await db.scalars(
            select(UserMedia)
            .where(UserMedia.user_id == current_user.id)
            .order_by(desc(UserMedia.created_at), desc(UserMedia.id))
        )
    ).all()
    return media


@router.get("/feed", response_model=list[UserMediaFeedOut])
async def list_media_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    accepted_connections = (
        await db.scalars(
            select(ConnectionRequest).where(
                ConnectionRequest.status == "accepted",
                or_(
                    ConnectionRequest.requester_id == current_user.id,
                    ConnectionRequest.receiver_id == current_user.id,
                ),
            )
        )
    ).all()
    visible_user_ids = {current_user.id}
    for connection in accepted_connections:
        visible_user_ids.add(
            connection.receiver_id
            if connection.requester_id == current_user.id
            else connection.requester_id
        )

    media = (
        await db.scalars(
            select(UserMedia)
            .where(UserMedia.user_id.in_(visible_user_ids))
            .options(selectinload(UserMedia.user))
            .order_by(desc(UserMedia.created_at), desc(UserMedia.id))
        )
    ).all()
    return [serialize_feed_item(item) for item in media]


@router.get("/users/{user_id}", response_model=list[UserMediaOut])
async def list_user_media(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id and not await has_accepted_connection(db, current_user.id, user_id):
        raise HTTPException(status_code=403, detail="You can only view media from accepted connections")
    owner = await db.get(User, user_id)
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")
    media = (
        await db.scalars(
            select(UserMedia)
            .where(UserMedia.user_id == user_id)
            .order_by(desc(UserMedia.created_at), desc(UserMedia.id))
        )
    ).all()
    return media


@router.post("", response_model=UserMediaOut)
async def upload_my_media(
    file: UploadFile = File(...),
    caption: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media_type = media_type_from_content_type(file.content_type)
    contents = await file.read()
    max_size = MAX_VIDEO_SIZE if media_type == "video" else MAX_IMAGE_SIZE
    if len(contents) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"{media_type.title()} must be smaller than {limit_mb} MB")

    suffix = Path(file.filename or "upload").suffix.lower()
    if not suffix:
        suffix = ".mp4" if media_type == "video" else ".png"
    filename = f"{current_user.id}_{secrets.token_hex(12)}{suffix}"
    folder = f"user_media/{current_user.id}/{media_type}s"
    media_url = await storage.upload_file(file, filename, contents, folder=folder)

    item = UserMedia(
        user_id=current_user.id,
        media_url=media_url,
        media_type=media_type,
        caption=caption.strip()[:280],
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{media_id}", status_code=204)
async def delete_my_media(
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = await db.get(UserMedia, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own media")

    await storage.delete_public_url(item.media_url)
    await db.delete(item)
    await db.commit()
    return Response(status_code=204)
