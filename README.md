# Social Chat MVP

A simple full-stack one-to-one chat app with React, FastAPI, PostgreSQL, JWT auth, SQLAlchemy, Alembic, and FastAPI WebSockets.

## Project Structure

```text
.
├── backend
│   ├── alembic
│   ├── app
│   │   ├── api
│   │   ├── core
│   │   ├── db
│   │   ├── models
│   │   ├── schemas
│   │   └── services
│   ├── Dockerfile
│   ├── alembic.ini
│   └── requirements.txt
├── frontend
│   ├── src
│   │   ├── api
│   │   ├── components
│   │   ├── context
│   │   └── pages
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Local Setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`.

Set these backend env vars before testing email verification:

```text
ADMIN_REGISTRATION_CODE=your-private-admin-code
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
FRONTEND_VERIFY_URL=http://localhost:5173/verify-email
```

If SMTP is not configured, the backend prints the verification link in the terminal for local development.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Main API Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/verify-email?token=...`
- `GET /api/users/search?q=ash`
- `PATCH /api/users/me`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/{conversation_id}`
- `GET /api/messages/conversation/{conversation_id}`
- `POST /api/messages/conversation/{conversation_id}`
- `GET /api/media/me`
- `POST /api/media`
- `DELETE /api/media/{media_id}`
- `WS /ws/chat/{conversation_id}?token=JWT_TOKEN`

## How Realtime Chat Works

The frontend opens a WebSocket when a conversation is selected:

```text
ws://localhost:8000/ws/chat/{conversation_id}?token={access_token}
```

Each sent message is stored in PostgreSQL, then broadcast to every open socket for that conversation.

## Deployment

### Backend on Render

1. Create a new Render Web Service from this repository.
2. Set root directory to `backend`.
3. Use the included `render.yaml` or configure a Docker web service manually.
4. Add environment variables:
   - `DATABASE_URL=postgresql+asyncpg://postgres:REAL_PASSWORD@db.vopwfeciyteoqpplfbnr.supabase.co:5432/postgres`
   - `SECRET_KEY=some-long-random-secret`
   - `ALGORITHM=HS256`
   - `ACCESS_TOKEN_EXPIRE_MINUTES=1440`
   - `FRONTEND_ORIGIN=https://your-frontend-domain.vercel.app`
   - `FRONTEND_VERIFY_URL=https://your-frontend-domain.vercel.app/verify-email`
   - `ADMIN_REGISTRATION_CODE=preet`
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
      - `SMTP_USERNAME=preet.rathee8571@gmail.com`
   - `SMTP_PASSWORD=YOUR_GMAIL_APP_PASSWORD`
   - `SMTP_FROM_EMAIL=preet.rathee8571@gmail.com`
   - `SMTP_USE_TLS=true`
   - `SUPABASE_URL=https://your-project.supabase.co`
   - `SUPABASE_SECRET_KEY=your-supabase-secret-key`
   - `SUPABASE_STORAGE_BUCKET=uploads`
   - `SUPABASE_STORAGE_FOLDER=chat_images`
For Render PostgreSQL, Neon, or Supabase, make sure the database URL uses SQLAlchemy async format:

```text
postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DATABASE
```

### Frontend on Vercel, Netlify, or Render Static Site

1. Set root directory to `frontend`.
2. Build command: `npm run build`.
3. Publish directory: `dist`.
4. Add environment variables:
   - `VITE_API_URL=https://your-backend-service.onrender.com`
   - `VITE_WS_URL=wss://your-backend-service.onrender.com`
   - `VITE_TURN_URLS=turn:your-turn-host:3478`
   - `VITE_TURN_USERNAME=your-turn-username`
   - `VITE_TURN_CREDENTIAL=your-turn-password`

Use `wss://` for production WebSockets when the backend is served over HTTPS.
Add TURN credentials if you want reliable audio/video calls behind NATs and firewalls.

### Free PostgreSQL from Neon or Supabase

1. Create a free project on Neon or Supabase.
2. Copy the connection string.
3. Convert the scheme to `postgresql+asyncpg://`.
4. Set it as `DATABASE_URL` in Render.
5. Run migrations on backend startup with `alembic upgrade head`.

## Notes

- Logout is client-side: the JWT is removed from local storage.
- Users must verify email before login.
- Admin signup is blocked unless the correct `ADMIN_REGISTRATION_CODE` is supplied and no admin already exists.
- Chat image uploads and dashboard media uploads go through the backend to Supabase Storage. The backend stores the resulting public URL in Postgres.
- The WebSocket manager is in memory, which is fine for an MVP on one backend instance.
- For multiple backend instances, use Redis Pub/Sub or a managed realtime service for fan-out.
