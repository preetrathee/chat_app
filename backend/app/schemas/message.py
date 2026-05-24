from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import PublicUser


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str
    message_type: str
    created_at: datetime
    sender: PublicUser

    model_config = ConfigDict(from_attributes=True)
