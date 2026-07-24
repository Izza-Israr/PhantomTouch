# PhantomTouch

PhantomTouch is a browser-based mirror-therapy prototype for people with phantom limb pain. It uses a webcam, MediaPipe tracking, and an animated 3D hand to provide a digital alternative to a physical mirror box—no headset or dedicated hardware required.

> **Prototype notice:** PhantomTouch is an educational/research prototype. It has not been clinically validated and is not a regulated medical device. It must not replace assessment, treatment, or advice from a qualified healthcare professional.

## Highlights

- Webcam-based hand and pose tracking with MediaPipe
- Mirrored, configurable 3D hand rendered with Three.js
- Two patient practice modes:
  - **Camera mirror** for open-ended mirrored movement practice
  - **Therapy game** with reach-and-hold targets, scoring, accuracy, and range-of-motion measurements
- Prescription-driven sessions: duration, target radius, and hover/dwell time
- Bilateral-amputation workflow with a recordable, reusable pose library
- Patient profile configuration for amputation side/level, missing fingers, hand appearance, scale, and clinician assignment
- Speech recognition and speech feedback for patient navigation, profile setup, session control, gesture prompts, and pain logging (when supported by the browser)
- Patient dashboard with session history, progress charts, reports, theme preference, and PDF report export
- Clinician dashboard for patient onboarding, prescriptions, and session/pain reports
- Email/password authentication, optional Google sign-in, role-based patient and clinician access, and in-app notifications

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React 19, Vite, Axios, Three.js |
| Vision | MediaPipe Hands and Tasks Vision |
| Accessibility | Web Speech API (speech recognition and synthesis) |
| Reports | jsPDF and html2canvas |
| Backend | Node.js, Express 5 |
| Data | Supabase (PostgreSQL) |
| Deployment | Vercel serverless functions |

## Repository layout

```text
PhantomTouch/
├── api/
│   └── index.js                 # Vercel entry point for the Express API
├── backend/
│   ├── middleware/              # Token authentication
│   ├── routes/                  # Auth, patients, prescriptions, sessions, notifications
│   ├── tests/                   # API smoke test
│   ├── utils/                   # Supabase and auth helpers
│   ├── server.js                # Local Express server and demo-data seeding
│   └── supabase_schema.sql      # Database schema and additive migrations
├── frontend/
│   ├── public/models/           # Bundled 3D hand models
│   └── src/
│       ├── components/          # Auth, dashboards, tracking, and therapy UI
│       ├── hooks/               # Mirror/3D engine logic
│       └── utils/               # Hand models and therapy voice recognition
├── .env.example                 # Root deployment environment template
└── vercel.json                  # Single-project Vercel configuration
```

## Requirements

- Node.js 22 (see `.nvmrc`)
- A Supabase project and its project URL and **service-role** key
- A modern browser with webcam permission; Chrome or Edge is recommended for speech features
- Optional: a Google OAuth client ID for Google sign-in
- Optional: a Vercel account for deployment

## Local setup

### 1. Install dependencies

From the repository root:

```bash
npm install
```

The root project uses npm workspaces for `frontend`, `backend`, and `api`.

### 2. Configure Supabase

In the Supabase SQL Editor, run [`backend/supabase_schema.sql`](backend/supabase_schema.sql). The script creates the application tables and includes additive migrations for the newer bilateral-pose, voice-preference, pain-score, and session-type fields.

Create `backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id
PORT=5000
```

`GOOGLE_CLIENT_ID` is optional. Keep the service-role key on the server only; never expose it to the browser or commit it to source control.

### 3. Configure the frontend

Create `frontend/.env` if needed:

```env
# Required only for Google sign-in
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id

# Required only when the API runs at another origin
VITE_API_BASE_URL=http://localhost:5000
```

For the usual local two-server setup, set `VITE_API_BASE_URL=http://localhost:5000`. When frontend and API are deployed together on Vercel, leave it unset so the app uses same-origin `/api` routes.

If using Google sign-in, add `http://localhost:5173` to the OAuth client's authorized JavaScript origins.

### 4. Start the app

Use two terminals.

```bash
# Terminal 1 — API, available at http://localhost:5000
npm --workspace backend run dev
```

```bash
# Terminal 2 — frontend, available at http://localhost:5173
npm run dev
```

On the first local backend startup, the app seeds a demo hospital, clinician, patients, an active prescription, and historical sessions. Seeding is skipped once the `hospitals` table contains data.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Clinician | `doctor@phantomtouch.com` | `doctor123` |
| Patient | `patient@phantomtouch.com` | `patient123` |
| Patient | `john@phantomtouch.com` | `patient123` |

The seeded clinician is linked to both patients. `patient@phantomtouch.com` includes historical sessions for dashboard charts.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite frontend |
| `npm run build` | Create the production frontend build |
| `npm start` | Start the Express backend |
| `npm --workspace backend run dev` | Start the backend with nodemon |
| `npm --workspace frontend run lint` | Lint the frontend |
| `npm --workspace backend test` | Run backend API smoke tests (backend must already be running) |

## Deployment to Vercel

The root [`vercel.json`](vercel.json) supports a single Vercel project: Vite builds the frontend into `frontend/dist`, and `api/index.js` exposes the Express app as a serverless function.

1. Import the repository into Vercel or run `npx vercel` from the root.
2. Add the variables from [`.env.example`](.env.example) in **Project Settings → Environment Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `GOOGLE_CLIENT_ID` (optional)
   - `VITE_GOOGLE_CLIENT_ID` (optional)
3. Add the deployed site URL to Google OAuth's authorized JavaScript origins if Google sign-in is enabled.
4. Deploy:

```bash
npx vercel --prod
```

`frontend/vercel.json` is retained for a separate-frontend deployment. If you use that route, configure its API rewrite or set `VITE_API_BASE_URL` to the separately deployed backend URL.

## API overview

All protected endpoints require `Authorization: Bearer <token>`.

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Authentication | `/api/auth/register`, `/login`, `/google`, `/complete-profile`, `/me`, `/logout` |
| Patients | `/api/patients`, `/:id`, `/:id/bilateral-pose-library`, `/lookup-clinician` |
| Prescriptions | `/api/prescriptions`, `/patient/:patientId`, `/:id/deactivate` |
| Sessions | `POST /api/sessions`, `/patient/:patientId`, `/:sessionId/telemetry` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/:id/read` |

Access controls limit patients to their own data and clinicians to their assigned patients.

## Browser permissions and data

The therapy experience needs webcam access. Speech commands depend on browser support and microphone permission; users can still use on-screen controls if they are unavailable. Session data can include duration, targets, accuracy, therapy score, range of motion, pain level, and optional kinematic telemetry. Use only test or appropriately consented data in this prototype.

## License

No license has been specified yet. Add one before distributing or reusing this project publicly.
