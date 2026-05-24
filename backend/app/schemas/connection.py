from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import PublicUser


class ConnectionRequestCreate(BaseModel):
    user_id: int


class ConnectionRequestOut(BaseModel):
    id: int
    status: str
    created_at: datetime
    requester: PublicUser
    receiver: PublicUser


class DiscoverUserOut(PublicUser):
    connection_status: str
    request_id: int | None = None
