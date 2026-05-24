"""connection requests and admin flag

Revision ID: 0002_connection_requests
Revises: 0001_initial
Create Date: 2026-05-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_connection_requests"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "connection_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requester_id", sa.Integer(), nullable=False),
        sa.Column("receiver_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["receiver_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requester_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("requester_id", "receiver_id", name="uq_connection_request_direction"),
    )
    op.create_index(op.f("ix_connection_requests_id"), "connection_requests", ["id"], unique=False)
    op.create_index(
        op.f("ix_connection_requests_receiver_id"),
        "connection_requests",
        ["receiver_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_connection_requests_requester_id"),
        "connection_requests",
        ["requester_id"],
        unique=False,
    )

    op.execute("UPDATE users SET is_admin = true WHERE id = (SELECT MIN(id) FROM users)")


def downgrade() -> None:
    op.drop_index(op.f("ix_connection_requests_requester_id"), table_name="connection_requests")
    op.drop_index(op.f("ix_connection_requests_receiver_id"), table_name="connection_requests")
    op.drop_index(op.f("ix_connection_requests_id"), table_name="connection_requests")
    op.drop_table("connection_requests")
    op.drop_column("users", "is_admin")
