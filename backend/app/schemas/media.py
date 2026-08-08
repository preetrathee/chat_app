from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.user import PublicUser


class UserMediaOut(BaseModel):
    id: int
    user_id: int
    media_url: str
    media_type: str
    caption: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserMediaFeedOut(UserMediaOut):
    user: PublicUser
