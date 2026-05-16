# Enlighten Platform

## Django authentication backend setup (local + Render)

This repository now includes a Django backend with:

- Email/password signup + login + logout
- Email verification via tokenized verify link
- Forgot/reset password flow (Django built-ins)
- Social login with Google and GitHub via `django-allauth`
- PostgreSQL-ready settings for Render (`DATABASE_URL`)

### Local setup

1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set environment variables (example):
   ```bash
   export SECRET_KEY='replace-me'
   export DEBUG='True'
   export ALLOWED_HOSTS='127.0.0.1,localhost'
   # Optional for PostgreSQL locally:
   # export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require'
   ```
4. Run migrations:
   ```bash
   python manage.py migrate
   ```
5. Start the server:
   ```bash
   python manage.py runserver
   ```

### Email configuration

By default, Django uses the console email backend (emails printed in server logs).

To use SMTP in local/Render, set:

- `EMAIL_HOST`
- `EMAIL_PORT` (default 587)
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `EMAIL_USE_TLS` (`True`/`False`)
- `EMAIL_USE_SSL` (`True`/`False`)
- `DEFAULT_FROM_EMAIL`

### Google/GitHub social login configuration

Set these environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

OAuth callback URLs (Render):

- `https://<your-render-domain>/accounts/google/login/callback/`
- `https://<your-render-domain>/accounts/github/login/callback/`

### Render deploy notes

1. Create a Render Web Service from this repo.
2. Set build command:
   ```bash
   pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --noinput
   ```
3. Start command (or use `Procfile`):
   ```bash
   gunicorn config.wsgi --log-file -
   ```
4. Add required env vars in Render dashboard:
   - `SECRET_KEY`
   - `DEBUG=False`
   - `ALLOWED_HOSTS=<your-render-domain>`
   - `CSRF_TRUSTED_ORIGINS=https://<your-render-domain>`
   - `DATABASE_URL=<render-postgres-internal-url>`
   - Optional email and social login vars from sections above.
