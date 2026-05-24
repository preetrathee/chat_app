import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


def send_verification_email(email: str, username: str, verification_url: str) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["Subject"] = "Verify your SocialChat account"
    message["From"] = settings.smtp_from_email or "no-reply@socialchat.local"
    message["To"] = email
    message.set_content(
        (
            f"Hi {username},\n\n"
            "Verify your SocialChat account by opening this link:\n"
            f"{verification_url}\n\n"
            "This link expires in 24 hours."
        )
    )

    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        print(f"[email debug] verification link for {email}: {verification_url}")
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_use_tls:
            server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)
