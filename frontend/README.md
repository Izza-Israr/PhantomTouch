# PhantomTouch

Browser-based mirror therapy for phantom limb pain. No headset, no physical mirror box — a webcam, hand tracking, and a mirrored 3D hand replace both.

## What it does

Phantom limb pain (PLP) happens when the brain keeps sending signals to a limb that no longer exists and reads the lack of feedback as pain. The standard clinical fix, mirror therapy, reflects a patient's intact limb in a mirror so the brain sees two whole limbs moving — but it only works for unilateral amputees, produces no record of practice, and has no built-in engagement.

PhantomTouch replaces the physical mirror with real-time hand/pose tracking in the browser, renders a mirrored 3D hand, and wraps that reflection in a gamified exercise instead of a passive one. It also supports bilateral amputees (via a recordable pose library), voice control for hands-free use, and a clinician dashboard that logs session telemetry.

**Core features**
- Real-time hand/pose tracking via MediaPipe, no external hardware
- Mirrored 3D hand rendered with Three.js
- Gamified reach-and-hold therapy exercises with scoring
- Bilateral amputee support through a recordable/replayable pose library
- Voice control for session start/pause and pain-level logging
- Clinician-side prescriptions (session length, target radius, dwell time) and per-session telemetry (range of motion, accuracy, pain trend)
- Email/password and Google sign-in, with separate patient and clinician roles

## Tech stack

**Frontend** — React 19 + Vite, Three.js, MediaPipe (Hands / Tasks Vision), Web Speech API for voice control, `jspdf` + `html2canvas` for exporting session reports.

**Backend** — Node.js + Express 5, Supabase (PostgreSQL) as the database, Google OAuth for sign-in, role-based auth (`PATIENT`, `CLINICIAN`).

## Project structure

```
PhantomTouch/
├── frontend/
│   └── src/
│       ├── components/     # Auth, dashboards, hand tracking, therapy game UI
│       ├── hooks/          # useMirrorEngine — core mirroring logic
│       └── utils/          # 3D hand models, voice recognition
└── backend/
    ├── routes/             # auth, patients, prescriptions, sessions, notifications
    ├── models/             # Data model definitions (patients, clinicians, sessions, chat, etc.)
    ├── middleware/          # Auth middleware
    ├── utils/               # Supabase client and helpers
    └── supabase_schema.sql  # Database schema
```

## Getting started

### Prerequisites
- Node.js
- A [Supabase](https://supabase.com) project (URL + service role key)
- A Google OAuth client ID (only required if you want Google sign-in)

### 1. Set up the database
Run `backend/supabase_schema.sql` against your Supabase project to create the required tables.

### 2. Backend

```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:

```
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id   # optional, needed for Google sign-in
PORT=5000
```

> Use the Supabase **service role** key here, not the anon/public key — row-level security requires it.

```bash
npm run dev     # starts the API with nodemon on http://localhost:5000
```

On first run, the server seeds the database with a demo hospital, one clinician, and two patients (see [Demo accounts](#demo-accounts) below). It only seeds once — it skips this if the `hospitals` table already has data.

### 3. Frontend

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/` if you're using Google sign-in:

```
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

```bash
npm run dev      # starts Vite on http://localhost:5173
```

### 4. Run tests

```bash
cd backend
npm test
```

## Demo accounts

Seeded automatically on first backend start:

| Role      | Email                        | Password    |
|-----------|-------------------------------|-------------|
| Clinician | doctor@phantomtouch.com       | doctor123   |
| Patient   | patient@phantomtouch.com      | patient123  |
| Patient   | john@phantomtouch.com         | patient123  |

The clinician account is pre-linked to both patients, and one patient has four historical therapy sessions seeded so the dashboard charts have data to show.

## Status

Early-stage / prototype. No clinical validation has been done on this specific delivery method (mirror therapy itself is well-established; this implementation of it is not yet tested). Not a regulated medical device. Treat it as a research/demo build, not a clinical product, until it has real user data and a QA pass behind it.

## License

Not yet specified — add one before sharing this publicly if you want others to know what they can and can't do with it.