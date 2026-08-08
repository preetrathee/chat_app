"""user media

Revision ID: 0004_user_media
Revises: 0003_email_verification
Create Date: 2026-08-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_user_media"
down_revision: Union[str, None] = "0003_email_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_media",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("media_url", sa.Text(), nullable=False),
        sa.Column("media_type", sa.String(length=20), nullable=False),
        sa.Column("caption", sa.String(length=280), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_media_id"), "user_media", ["id"], unique=False)
    op.create_index(op.f("ix_user_media_user_id"), "user_media", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_media_user_id"), table_name="user_media")
    op.drop_index(op.f("ix_user_media_id"), table_name="user_media")
    op.drop_table("user_media")
