from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserMediaOut(BaseModel):
    id: int
    user_id: int
    media_url: str
    media_type: str
    caption: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
