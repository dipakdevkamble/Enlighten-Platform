# Enlighten Platform

This repository now includes a Django + PostgreSQL backend (`/backend`) connected to the frontend auth pages.

## Backend features

- Email/password signup and login
- JWT access + refresh tokens
- Token refresh and logout (refresh token blacklist)
- Current user (`/api/auth/me/`)
- Google OAuth login
- GitHub OAuth login

## Project structure

- `backend/` Django project
- `auth.js`, `login.html`, `signup.html`, `auth.html` frontend auth integration
- `render.yaml` Render blueprint config

## Local development

### 1) Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

### 2) Environment variables

Use `backend/.env.example` as reference.

Required for production:

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG=false`
- `DJANGO_ALLOWED_HOSTS`
- `DATABASE_URL` (Render PostgreSQL connection string)
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `FRONTEND_URL`
- `FRONTEND_OAUTH_REDIRECT_URL`
- `BACKEND_BASE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`

### 3) Frontend API base URL

Frontend auth calls use:

- `window.ENLIGHTEN_API_BASE_URL` (if set in your page)
- fallback: `http://localhost:8000`

Example for a React app:

```js
window.ENLIGHTEN_API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
```

## Auth API endpoints

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`
- `GET /api/auth/oauth/google/start/`
- `GET /api/auth/oauth/google/callback/`
- `GET /api/auth/oauth/github/start/`
- `GET /api/auth/oauth/github/callback/`

## Render deployment

A `render.yaml` blueprint is included.

### Deploy steps

1. Create a new Render Blueprint service from this repo.
2. Render provisions:
   - web service: `enlighten-backend`
   - PostgreSQL database: `enlighten-db`
3. Set frontend domain values in:
   - `CORS_ALLOWED_ORIGINS`
   - `CSRF_TRUSTED_ORIGINS`
   - `FRONTEND_URL`
   - `FRONTEND_OAUTH_REDIRECT_URL`
4. Configure OAuth app callback URLs:
   - Google: `https://<your-backend-domain>/api/auth/oauth/google/callback/`
   - GitHub: `https://<your-backend-domain>/api/auth/oauth/github/callback/`

## Validation

```bash
cd backend
python manage.py check
python manage.py test accounts
```
