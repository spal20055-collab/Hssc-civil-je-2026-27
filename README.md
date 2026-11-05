# HSSC CIVIL JE 2026-27 — Version 2

Telegram-first CBT mock platform configured for `@Hssc_Civil_je_2026_27`.
Each mock must contain exactly 50 questions. No negative marking. Channel-only leaderboard.

## Features
- Telegram Web App student authentication using signed `initData`
- Telegram channel membership check using Bot API `getChatMember`
- Student CBT interface, navigation palette, countdown and auto-submit
- Automatic score, correct / incorrect / unanswered counts
- Channel leaderboard with rank by score and submission time
- Graphical admin dashboard at `/admin.html`
- CSV question import and downloadable 50-row CSV template
- Draft creation, publish/unpublish and student results view

## Run locally
1. Create a Telegram bot using @BotFather.
2. Add the bot as an administrator of `@Hssc_Civil_je_2026_27`.
3. Copy `.env.example` to `.env` and fill in `BOT_TOKEN` and a strong `ADMIN_KEY`.
4. Install Node.js 20+ and run:
   ```bash
   npm install
   npm start
   ```
5. Deploy to a public HTTPS host. Configure the bot's Web App menu button URL to your domain.
6. Open `/admin.html` on your domain to manage mock tests.

## CSV format
Columns:
`question,option_a,option_b,option_c,option_d,correct_option,explanation,marks`

`correct_option` must be A, B, C or D. CSV must have exactly 50 question rows.
Use double quotes around fields containing commas or line breaks.

## Telegram setup
The bot must be an administrator in the channel. `getChatMember` requires the bot to be an administrator to reliably check other users. Configure the Telegram bot Menu Button as a Web App URL pointing to the deployed HTTPS site. Students must open the site inside Telegram, not by pasting the URL into a regular browser.

## Admin access
`/admin.html` uses the `ADMIN_KEY` from `.env`. Keep this key private and use HTTPS. This starter keeps the admin key in browser session memory only; do not expose it to students or put it in public source code.

## Production limitations / recommended next work
- The starter uses SQLite, suitable for a single-instance pilot; use PostgreSQL for a larger multi-instance service.
- Add rate limiting, CSRF/origin protections, backups, audit logs, stronger admin authentication, and a secure deployment secret manager before public launch.
- The exam timer is client-side in this starter; production exams should store server-side start times and enforce expiry on submission.
- Browser-based CBT cannot guarantee prevention of screenshots, tab switching or external assistance.
- Review questions and answer keys before publishing. AI-generated questions can contain errors.
