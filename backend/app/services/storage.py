from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from fastapi import HTTPException, UploadFile

from app.core.config import get_settings


class SupabaseStorage:
    def __init__(self) -> None:
        settings = get_settings()
        self.supabase_url = (settings.supabase_url or "").rstrip("/")
        self.secret_key = settings.supabase_secret_key or settings.supabase_service_role_key
        self.bucket = settings.supabase_storage_bucket
        self.folder = settings.supabase_storage_folder.strip("/")

    @property
    def configured(self) -> bool:
        return bool(self.supabase_url and self.secret_key and self.bucket)

    def _require_configured(self) -> None:
        if not self.configured:
            raise HTTPException(
                status_code=500,
                detail="Supabase Storage is not configured on the backend",
            )

    def _headers(self, content_type: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.secret_key or "",
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def object_path(self, filename: str, folder: str | None = None) -> str:
        target_folder = self.folder if folder is None else folder.strip("/")
        return f"{target_folder}/{filename}" if target_folder else filename

    def public_url(self, object_path: str) -> str:
        encoded_path = "/".join(quote(part) for part in object_path.split("/"))
        return f"{self.supabase_url}/storage/v1/object/public/{self.bucket}/{encoded_path}"

    async def upload_file(
        self,
        file: UploadFile,
        filename: str,
        contents: bytes,
        folder: str | None = None,
    ) -> str:
        self._require_configured()
        object_path = self.object_path(filename, folder)
        encoded_path = "/".join(quote(part) for part in object_path.split("/"))
        upload_url = f"{self.supabase_url}/storage/v1/object/{self.bucket}/{encoded_path}"

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                upload_url,
                content=contents,
                headers={
                    **self._headers(file.content_type or "application/octet-stream"),
                    "x-upsert": "false",
                },
            )

        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Supabase image upload failed: {response.text}",
            )
        return self.public_url(object_path)

    async def upload_image(self, image: UploadFile, filename: str, contents: bytes) -> str:
        return await self.upload_file(image, filename, contents)

    async def delete_public_url(self, public_url: str) -> None:
        self._require_configured()
        object_path = self.object_path_from_public_url(public_url)
        if not object_path:
            return
        delete_url = f"{self.supabase_url}/storage/v1/object/{self.bucket}"
        async with httpx.AsyncClient(timeout=30) as client:
            await client.request(
                "DELETE",
                delete_url,
                json={"prefixes": [object_path]},
                headers=self._headers("application/json"),
            )

    def object_path_from_public_url(self, public_url: str) -> str | None:
        parsed = urlparse(public_url)
        base = urlparse(self.supabase_url)
        if parsed.netloc != base.netloc:
            return None
        marker = f"/storage/v1/object/public/{self.bucket}/"
        if marker not in parsed.path:
            return None
        return parsed.path.split(marker, 1)[1]


storage = SupabaseStorage()


def local_upload_path_from_message_content(content: str, upload_dir: Path) -> Path | None:
    if not content.startswith("/uploads/"):
        return None
    file_name = Path(content).name
    if not file_name:
        return None
    return upload_dir / file_name
