# Enlighten Platform

Enlighten is a student resource website for notes, previous year question papers, lecture links, account access, admin PDF uploads, and class test results.

## Requirements

- Node.js 20 or newer: https://nodejs.org/en/download
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
- `result.html`, `result.css`, `result.js` - class test result lookup.
- `api.js` - shared frontend API base and JSON response helper.
- `server.js` - Express backend connected to Supabase.
- `scripts/build.js` - creates the minified, bundled `dist/` deployment artifact.
- `scripts/validate-build.js` - validates source and distribution structure, references, CSP compatibility, and secret exclusion.
- `scripts/smoke-dist.js` - starts the built artifact on an ephemeral port and verifies protected files, redirects, compression, and headers.
- `scripts/start.js` - starts `dist/server.js` after a production build and falls back to the source server for development.
- `supabase-schema.sql` - SQL tables, private Storage bucket setup, policies, indexes, and triggers to run in Supabase.
- `.env.example` - required environment variables.
- `config.js` - public frontend API base config for separate frontend/backend deployments.
- `papers/` - existing local PDF question papers.
- `Assets/` - optimized images used by the pages.

## Local Setup

Install the exact locked dependencies:

```bash
npm ci
```

Create `.env` from `.env.example` and fill your Supabase values:

```bash
copy .env.example .env
```

Start the source site and backend during development:

```bash
npm run start:dev
```

Open:

```text
http://localhost:3000
```

Admin page:

```text
http://localhost:3000/admin.html
```

Run the complete release gate and create `dist/`:

```bash
npm test
npm run build
npm run check:dist
npm run smoke:dist
npm run audit:prod
```

`dist/` is the deployable application. It contains the server, optimized static
pages and assets, production package manifests, an environment template, and a
hash manifest. It never contains the local `.env`, logs, source maps, SQL, or
repository metadata.

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
   - For an existing `results` table, first add the ownership column with
     `alter table public.results add column if not exists student_email text;`.
   - Backfill every legacy row with the student's confirmed, lowercase login
     email. The full schema intentionally stops if any row is missing a valid
     email; after the backfill, rerun the complete file to enforce `NOT NULL`,
     format, and per-student uniqueness constraints.
3. Keep the `papers` Storage bucket private; the schema creates/updates it with public access disabled.
4. Students open uploaded PDFs through short-lived signed links created by the backend after login.
5. Copy these values into `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` - use the Supabase publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` - use the Supabase secret key
   - `SUPABASE_STORAGE_BUCKET=papers`
   - `SIGNED_URL_TTL_SECONDS=900`
   - `FRONTEND_URL=https://your-domain.example`
   - `TRUST_PROXY=1` for the usual single managed reverse proxy
   - `ADMIN_EMAILS=your-admin-email@example.com`
   - `PASSWORD_RESET_REDIRECT_URL=https://your-domain.example/reset-password.html`

Keep the service role key private. It must only exist on the backend host, never inside frontend JavaScript.

## Login Roles

Student flow:

- Students create accounts on `signup.html`.
- Students log in on `login.html`.
- After login they can open Home, Notes, Papers, Lectures, About, and Results pages.

Admin flow:

- Create an admin user in Supabase Auth.
- Add the admin email to `ADMIN_EMAILS`, or set `app_metadata.role` to `admin`
  through a trusted server-side Supabase admin operation.
- Admin logs in at `admin-login.html`.
- For each question paper, the admin selects its department, enters the subject
  name and visible PDF name, then chooses the PDF file. The archive places the
  upload inside that department and subject accordion automatically.
- Admin can also upload notes PDFs and add result records.
- Each result record must include the student's login email. Result lookup is limited to rows matching the signed-in student's email.

Never put roles in `user_metadata`; users can edit that field and it is not an
authorization source.

## Backend API

Public:

- `GET /api/health`
- `GET /api/readiness` - verifies the required live Supabase columns and private PDF bucket policy.
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

Admin, requires an authenticated Supabase user authorized by trusted
`app_metadata` or `ADMIN_EMAILS`:

- `POST /api/admin/notes`
- `POST /api/admin/papers`
- `POST /api/admin/results`
- `GET /api/admin/results`

## Deployment Plan

Recommended deployment:

- Host the backend and frontend together on a Node 20+ service such as Render,
  Railway, or Fly.io so secure cookies remain same-origin.
- Build command: `npm ci && npm test && npm run build`.
- Start command: `npm start`.
- Database/Auth/Storage on Supabase.
- Liveness check: `/api/health`.
- Deployment readiness check: `/api/readiness`. Do not promote a release until it returns HTTP 200.

## Production Checklist

- Run `npm ci`, `npm test`, `npm run build`, `npm run check:dist`, `npm run smoke:dist`, and `npm run audit:prod`.
- Set `NODE_ENV=production`.
- Set `TRUST_PROXY` for the hosting topology (`1` for the usual single managed proxy).
- Run `supabase-schema.sql` in Supabase.
- Keep the `papers` Storage bucket private and verify signed PDF links work after login.
- Add admin email to `ADMIN_EMAILS`.
- Set every variable from `.env.example` on the hosting platform.
- Confirm `supabase-schema.sql` completed without duplicate-result errors before importing real result data.
- Confirm `/api/readiness` returns HTTP 200; this catches missing result columns or an unsafe Storage bucket policy.
- Test student signup/login, admin login, forgot password/reset password, admin notes upload, admin paper upload, subject card PDF loading, subject paper PDF loading, admin result entry, `/api/notes`, `/api/papers`, and result lookup.
- Add a privacy policy before storing real student data.
- Do not commit or share `.env`, service role keys, `.git`, `node_modules`, logs, private student data, or raw project ZIPs containing those files.
