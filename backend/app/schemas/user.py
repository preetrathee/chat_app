from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)
    register_as_admin: bool = False
    admin_code: str | None = None


class UserLogin(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str


class UserUpdate(BaseModel):
    bio: str | None = Field(default=None, max_length=280)
    avatar_url: str | None = Field(default=None, max_length=500)


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    bio: str
    avatar_url: str
    is_admin: bool
    is_verified: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PublicUser(BaseModel):
    id: int
    username: str
    bio: str
    avatar_url: str
    is_admin: bool
    is_online: bool = False

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MessageResponse(BaseModel):
    message: str
