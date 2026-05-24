from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.message import MessageOut
from app.schemas.user import PublicUser


class ConversationCreate(BaseModel):
    user_id: int


class ConversationOut(BaseModel):
    id: int
    user_one_id: int
    user_two_id: int
    created_at: datetime
    other_user: PublicUser
    last_message: MessageOut | None = None

    model_config = ConfigDict(from_attributes=True)


class ConversationDetail(ConversationOut):
    messages: list[MessageOut] = []
