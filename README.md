# NASJ (نسج)

Bilingual (Arabic/French, RTL-aware) learning app for children aged 3–10. Five universes, a weaving reward mechanic, a yarn mascot family, a parent dashboard and an optional AI assistant.

- `frontend/` React + TypeScript + Vite + React Router (Capacitor config for Android)
- `backend/` Express + TypeScript REST API, PostgreSQL, zod validation, JWT auth, rate limiting
- `assets/` reference boards, asset build tools (`assets/tools`)
- `scripts/dev-db.sh` throwaway local PostgreSQL

## Run locally
```bash
scripts/dev-db.sh start                 # or point DATABASE_URL at your own Postgres
cd backend && cp .env.example .env      # set JWT_SECRET
npm install && npm run migrate && npm run seed && npm run dev   # API on :4000
cd ../frontend && npm install && npm run dev                    # app on :5173 (proxies /api)
```
Tests: `npm test` in each package. Production build: `npm run build` in each.

## Environment
Backend (`backend/.env`): `PORT`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, optional `ANTHROPIC_API_KEY` (the assistant is shown only when the API reports it as enabled).
Frontend: `VITE_API_URL` for native/Capacitor builds (empty in the browser, where `/api` is proxied).

## How rewards work
The server records each child's first answer per question, grades at completion, and alone awards threads, badges and patches. Completion is idempotent. The client never decides a reward.

## Assets
Images live in `frontend/public/img`, produced by `python3 assets/tools/build_assets.py` (needs OpenCV, PIL, numpy) from `assets/reference`. To replace one, drop a file with the same name in `public/img`. Missing art is shown with a labelled placeholder.

## Audio
`frontend/public/audio/manifest.json` lists effects and music. Voice lines are not recorded yet: the app falls back to the device speech synthesis (Arabic voices vary by device). Record files named per `public/audio/README.md`, add them to the `speech` map in the manifest, and they take over. Audio is never required.

## Android
```bash
cd frontend && npm run cap:android      # needs the Android SDK; run `npx cap add android` once first
```

## Test on your phone (APK via GitHub)
The APK is only the app shell; it talks to the API, so the API must be online.
1. Push this folder to a new GitHub repo (branch `main`).
2. Deploy the API: on Render choose New > Blueprint and select the repo (uses `render.yaml`; free Postgres included). Copy the service URL, e.g. `https://nasj-api.onrender.com`.
3. In the repo: Settings > Secrets and variables > Actions > Variables > New variable `API_URL` = that URL.
4. Actions tab > "Build Android APK" > Run workflow. When it finishes, download the `nasj-debug-apk` artifact, unzip, and install `app-debug.apk` on your phone (allow installs from unknown sources).
The free Render API sleeps when idle, so the first request can take about a minute.
