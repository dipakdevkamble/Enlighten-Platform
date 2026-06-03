# Enlighten Platform

Enlighten is a student resource website for notes, previous year question papers, lecture links, account access, admin PDF uploads, and class test results.

## Software To Install

- Node.js LTS: https://nodejs.org/en/download
- Git: https://git-scm.com/downloads
- DBeaver Community, optional database viewer: https://dbeaver.io/download/
- Postman or Thunder Client, optional API tester

You do not need to install PostgreSQL locally if you use Supabase cloud.

## Project Structure

- `index.html` - home page.
- `Notes.html`, `Notes.css`, `Notes.js` - notes library plus uploaded notes from `/api/notes`.
- `Papers.html`, `Papers.css`, `Papers.js` - question paper archive plus uploaded papers from `/api/papers`.
- `admin.html`, `admin.css`, `admin.js` - admin page for uploading notes PDFs, paper PDFs, and adding results.
- `admin-login.html` - admin login page for Supabase users with an admin role/email.
- `reset-password.html`, `reset-password.js` - password recovery landing page.
- `login.html`, `signup.html`, `forgot-password.html`, `auth.js` - auth forms wired to Supabase through the backend.
- `result.html` - class test result lookup.
- `server.js` - Express backend connected to Supabase.
- `supabase-schema.sql` - SQL tables/policies to run in Supabase.
- `.env.example` - required environment variables.
- `config.js` - public frontend API base config for separate frontend/backend deployments.
- `papers/` - existing local PDF question papers.
- `Assets/` - optimized images used by the pages.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example` and fill your Supabase values:

```bash
copy .env.example .env
```

Start the site and backend:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Admin page:

```text
http://localhost:3000/admin.html
```

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
3. Create a Storage bucket named `papers`.
4. Make the `papers` bucket public so uploaded notes and paper URLs can be opened by students.
5. Copy these values into `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` - use the Supabase publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` - use the Supabase secret key
   - `SUPABASE_STORAGE_BUCKET=papers`
   - `ADMIN_API_KEY=your-long-random-secret`
   - `ADMIN_EMAILS=your-admin-email@example.com`

Keep the service role key private. It must only exist on the backend host, never inside frontend JavaScript.

## Login Roles

Student flow:

- Students create accounts on `signup.html`.
- Students log in on `login.html`.
- After login they can open Home, Notes, Papers, Lectures, About, and Results pages.

Admin flow:

- Create an admin user in Supabase Auth.
- Add the admin email to `ADMIN_EMAILS` in `.env`.
- Admin logs in at `admin-login.html`.
- Admin can upload notes PDFs, question paper PDFs, and result records.

You can also mark a Supabase user with `user_metadata.role = "admin"`, but `ADMIN_EMAILS` is the simplest first setup.

## Backend API

Public:

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/admin-login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot`
- `POST /api/auth/reset-password`

Student/admin logged-in:

- `GET /api/auth/me`
- `GET /api/notes`
- `GET /api/papers`
- `POST /api/results`

Admin, requires admin login. `x-admin-key` still works for Postman/testing if `ADMIN_API_KEY` is set:

- `POST /api/admin/notes`
- `POST /api/admin/papers`
- `POST /api/admin/results`
- `GET /api/admin/results`

## Deployment Plan

Recommended simple deployment:

- Backend and static frontend together on Render using `npm start`.
- Database/Auth/Storage on Supabase.

Alternative split deployment:

- Frontend on Vercel/Netlify.
- Backend on Render/Railway.
- Set `window.ENLIGHTEN_API_BASE` in `config.js` to your deployed backend URL.
- Add your frontend URL to `FRONTEND_URL` in the backend environment variables.

## Production Checklist

- Run `npm install` and commit `package-lock.json`.
- Run `supabase-schema.sql` in Supabase.
- Create public `papers` Storage bucket.
- Add strong `ADMIN_API_KEY`.
- Add admin email to `ADMIN_EMAILS`.
- Set all environment variables on the hosting platform.
- Test student signup/login, admin login, forgot password/reset password, admin notes upload, admin paper upload, subject card PDF loading, subject paper PDF loading, admin result entry, `/api/notes`, `/api/papers`, and result lookup.
- Add a privacy policy before storing real student data.
- Do not commit `.env`, service role keys, or real private student data.
