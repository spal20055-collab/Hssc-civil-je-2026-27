HSSC CIVIL JE 2026-27 — WEBSITE UPDATE PACKAGE

Files included:
- server.js
- package.json
- public/index.html
- public/style.css
- public/student.js
- public/admin.html
- public/admin.js

IMPORTANT BEFORE DEPLOYING
1. Make a backup of the current GitHub repository and current Render environment variables.
2. Do NOT delete or change BOT_TOKEN, TELEGRAM_CHANNEL_ID, or ADMIN_KEY in Render Environment.
3. Replace/add the files in GitHub while keeping any existing unrelated files (for example bot files or configuration files) unless you know they are no longer used.
4. The server migrates the existing attempts table to allow two attempts and keeps already submitted attempt rows. However, Render Free local SQLite storage may be ephemeral. Download/backup the database if you have access to it before redeploying; a code update cannot guarantee recovery of data already lost on a free ephemeral filesystem.
5. Keep ADMIN_KEY and BOT_TOKEN private. Never put secrets in GitHub.
6. After deploy, test first with a draft/test mock before publishing to students.

FEATURES IN THIS UPDATE
- Admin can create 25/50/100-question mocks.
- Mock duration choices: 25/50/90 minutes.
- Student must choose exactly one category: GEN, EWS, BCA, BCB, OSC, DSC.
- Up to two submitted attempts per student per mock.
- Server-side attempt start time and countdown based on configured duration.
- Auto-submit when timer expires.
- CBT question palette, previous/next, answered state and mark-for-review.
- Progress autosave while a test is active; refresh can resume the active attempt.
- Result analysis: correct, incorrect, unattempted, accuracy, rank, category, time taken.
- Review Solutions: selected answer, correct answer, status and admin explanation.
- Leaderboard and admin result rows include attempt/category/time.

LIMITATIONS / TEST NOTES
- Existing legacy attempts are preserved and counted as attempt 1; their category is shown as Legacy/blank and old time taken is 0 because the old version did not save those values.
- Subject-wise analysis is not included because the existing CSV/database format does not contain a subject field. Add subject metadata in a future update if subject-wise breakdown is required.
- A student can change category on a second attempt; each attempt stores its own category.
