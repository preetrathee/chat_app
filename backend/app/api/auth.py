from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.user import MessageResponse, Token, UserCreate, UserLogin, UserOut
from app.services.email import send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(
        select(User).where(or_(User.email == payload.email, User.username == payload.username))
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email or username already exists")

    existing_admin = await db.scalar(select(User.id).where(User.is_admin.is_(True)).limit(1))
    wants_admin = payload.register_as_admin
    if wants_admin:
        if existing_admin is not None:
            raise HTTPException(status_code=409, detail="An admin account already exists")
        if payload.admin_code != settings.admin_registration_code:
            raise HTTPException(status_code=403, detail="Invalid admin code")

    verification_token = secrets.token_urlsafe(32)
    verification_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    user = User(
        username=payload.username,
        email=str(payload.email),
        hashed_password=hash_password(payload.password),
        is_admin=wants_admin,
        is_verified=False,
        email_verification_token=verification_token,
        email_verification_expires_at=verification_expires_at,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    verification_url = f"{settings.frontend_verify_url}?token={verification_token}"
    send_verification_email(user.email, user.username, verification_url)
    return MessageResponse(message="Registration successful. Please verify your email before logging in.")


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    identifier = payload.identifier.strip()
    user = await db.scalar(
        select(User).where(or_(User.email == identifier, User.username == identifier))
    )
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email first")

    token = create_access_token(str(user.id))
    return Token(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/verify-email", response_model=MessageResponse)
async def verify_email(
    token: str = Query(min_length=10),
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.email_verification_token == token))
    if not user:
        raise HTTPException(status_code=404, detail="Invalid verification token")
    if user.email_verification_expires_at and user.email_verification_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification token expired")
    if user.is_verified:
        return MessageResponse(message="Email already verified")

    user.is_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    await db.commit()
    return MessageResponse(message="Email verified successfully. You can log in now.")
