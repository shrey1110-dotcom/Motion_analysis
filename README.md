# Synapse AI: Athlete Training Analyzer

Production-style hackathon project for live biomechanics coaching, cricket simulation, pro-motion comparison, and cloud athlete session tracking.

## Core Features
- Live webcam analysis with MoveNet keypoints
- Activity-aware scoring (`squat`, `cricket_cover_drive`, `auto`)
- Real-time coaching cues + biomechanics insights
- Pro-Compare mode (user vs uploaded reference motion)
- Cricket stadium simulation with timing outcomes:
  - `PERFECT`, `EARLY`, `LATE`, `MISS`
- Google login via Clerk
- User session persistence in Neon PostgreSQL
- Export analysis JSON/CSV for review

## Tech Stack
- Frontend: React, Vite, Tailwind CSS, Chart.js, Three.js
- Backend: FastAPI, Pydantic, SQLAlchemy
- ML/Data: NumPy, pandas, scikit-learn, OpenCV, Pillow, joblib
- Auth: Clerk
- Database: Neon PostgreSQL (fallback SQLite in local/dev if DB URL not set)

## High-Level Flow
1. Browser captures pose keypoints (17 landmarks).
2. Keypoints timeline is sent to backend `/api/analyze`.
3. Backend extracts features, detects activity, scores performance.
4. Response returns overall score, ML label, metrics, timeline, feedback.
5. Signed-in athlete sessions are stored in Neon via `/api/sessions`.

## Repository Structure
```text
backend/
  app/
    analysis/
      activity.py
      features.py
      scoring.py
      feedback.py
      image_squat_model.py
      video_cricket_model.py
    auth.py
    db.py
    models.py
    main.py
    schemas.py
  train_model.py
  train_real_squat.py
  train_real_cricket_action.py
frontend/
  src/
    views/
    components/
    hooks/
    config/
```

## Local Setup

### 1) Python environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 2) Frontend dependencies
```bash
npm --prefix frontend install
```

### 3) Environment files

Root `.env` (optional LLM rewrite):
```bash
cp .env.example .env
# OPENAI_API_KEY=...
# OPENAI_MODEL=gpt-4o-mini
```

Backend env:
```bash
cp backend/.env.example backend/.env
```
Set values:
- `NEON_DATABASE_URL=postgresql+psycopg://...`
- `CLERK_ISSUER=https://<your-clerk-domain>`
- `CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json`

Frontend env:
```bash
cp frontend/.env.example frontend/.env
```
Set value:
- `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...` (or `pk_live_...`)

### 4) Run
Backend:
```bash
source .venv/bin/activate
uvicorn app.main:app --app-dir backend --reload
```

Frontend:
```bash
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5174
```

Open:
- Frontend: http://127.0.0.1:5174
- Backend health: http://127.0.0.1:8000/api/health

## API Summary

### `POST /api/analyze`
Analyze keypoint timeline and return activity score, metrics, and feedback.

### `POST /api/predict-squat-image`
Classify squat posture from uploaded image using real-data squat model.

### `POST /api/predict-cricket-action-video`
Classify cricket action from uploaded video using real-data cricket model.

### `GET /api/sessions`
Get signed-in user's saved sessions.

### `POST /api/sessions`
Save a signed-in user's analysis session summary.

## Model Training Scripts

- Synthetic baseline models:
```bash
source .venv/bin/activate
python backend/train_model.py
```

- Real squat model:
```bash
source .venv/bin/activate
python backend/train_real_squat.py --data-root data/squat_real_dataset --out-model backend/models/rf_squat_real.pkl
```

- Real cricket action model:
```bash
source .venv/bin/activate
python backend/train_real_cricket_action.py --data-root data/real_cricket_actions/cricketshot --out-model backend/models/rf_cricket_action_real.pkl
```

## Dataset and Artifacts Policy

Large datasets and model binaries are excluded from git in this repo snapshot:
- `data/`
- `models/`
- `backend/models/*.pkl`

Use the training scripts above to regenerate models locally after downloading datasets.

## Demo Checklist
- Login with Google (Clerk)
- Start Live Analysis
- Show real-time coaching + ML label
- Toggle Pro-Compare
- Run cricket timing simulation
- End session and show saved history in Dashboard
