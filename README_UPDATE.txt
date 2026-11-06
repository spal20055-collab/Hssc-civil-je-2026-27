HSSC CIVIL JE 2026-27 — SUPABASE POSTGRESQL UPDATE (PRE-DEPLOY TEST PACKAGE)

This package replaces the previous local SQLite database with Supabase PostgreSQL.
It preserves the existing student CBT frontend and admin UI.

FEATURES PRESERVED IN SERVER
- Two submitted attempts per student per mock; active attempt can resume.
- Each submitted attempt has its own result and Review Solutions.
- Leaderboard contains one row per student, using their best score; ties prefer faster time.
- Server-side timer validation and autosave.
- Admin create/publish/unpublish/delete-draft/results/summary.
- JSON database backup download from Admin.
- Existing mobile CBT layout, question palette and result chart are retained in public files.

IMPORTANT: NOT YET DEPLOYED OR CONNECTED
This is a code package only. It has not been connected to your Supabase project or deployed to Render.
Do not replace the live Render app until the staged checks are completed.

FILES
- server.js: PostgreSQL version of API server.
- package.json: uses pg instead of better-sqlite3.
- supabase_schema.sql: schema for Supabase SQL Editor.
- public/: existing student/admin frontend from the current update package.

NEXT STEPS (do one at a time)
1. Create a fresh backup of any database data you can still access. Render Free SQLite may already have lost data after restarts; this package cannot recover lost records.
2. In Supabase SQL Editor, run supabase_schema.sql once. The server also creates/updates these tables on startup, but the SQL file is provided for review and manual setup.
3. In Render, add DATABASE_URL using Supabase's PostgreSQL connection string (prefer Session Pooler if direct IPv6 connectivity is unavailable). Keep the value private. Add DATABASE_SSL=true if needed.
4. Keep BOT_TOKEN, TELEGRAM_CHANNEL_ID and ADMIN_KEY unchanged in Render. Never place secrets in GitHub.
5. Deploy to a separate Render test service/branch first. Verify /api/health reports database=postgresql, then test one unpublished test mock, two attempts, separate reviews, leaderboard best score, admin backup and delete restrictions.
6. Only after all tests pass should the production service be updated.

ENVIRONMENT VARIABLES
DATABASE_URL=<Supabase PostgreSQL connection string; keep secret>
DATABASE_SSL=true
BOT_TOKEN=<existing Telegram bot token>
TELEGRAM_CHANNEL_ID=<existing channel ID>
ADMIN_KEY=<existing admin key>
PORT is supplied by Render.

DATA MIGRATION NOTE
The Supabase project currently had no tables and no confirmed export/import of existing SQLite data. This code does not automatically copy records from the old SQLite file. If the old database file is available, export/import must be performed separately before switching production traffic. Do not assume old mocks/results are present in Supabase.

SAFETY
Do not commit .env files, Supabase passwords, Telegram bot tokens, or Admin keys. Do not share the DATABASE_URL in chat or screenshots.
