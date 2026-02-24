# AI Sports & Fitness Motion Analysis MVP

Hackathon-ready end-to-end project for live camera and uploaded video motion analysis.

## What It Does
- Live camera mode and video upload mode
- Pose detection using MoveNet in browser
- Activity detection (auto/squat/cricket cover drive)
- Technique scoring against reference ranges
- Deterministic coaching feedback
- Optional LLM rewriting layer (`gpt-4o-mini`) for human-friendly feedback
- Visual analytics: skeleton overlay + angle charts + metric table

## Architecture
- Frontend: HTML/CSS/JS + TensorFlow.js MoveNet + Chart.js
- Backend: FastAPI
- Scoring pipeline:
  1. Browser extracts normalized 17-point keypoints timeline
  2. POST keypoints to `/api/analyze`
  3. Backend detects activity, computes biomechanical metrics
  4. Scores deviations against target ranges
  5. Returns score + feedback + timeline for charts

## Project Structure
```
backend/
  app/
    analysis/
      activity.py
      angles.py
      constants.py
      features.py
      feedback.py
      reference_library.py
      scoring.py
    main.py
    schemas.py
  requirements.txt
frontend/
  index.html
  assets/
    app.js
    styles.css
```

## Run Locally
1. Create environment and install dependencies:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

2. Configure env:
```bash
cp .env.example .env
# optional LLM rewrite
# OPENAI_API_KEY=your_key
# OPENAI_MODEL=gpt-4o-mini
```

Backend auth/database env (`backend/.env.example`):
```bash
cp backend/.env.example backend/.env
# set NEON_DATABASE_URL
# set CLERK_ISSUER and CLERK_JWKS_URL
```

Frontend Clerk env (`frontend/.env.example`):
```bash
cp frontend/.env.example frontend/.env
# set VITE_CLERK_PUBLISHABLE_KEY
```

3. Start API + frontend server:
```bash
uvicorn app.main:app --app-dir backend --reload
npm --prefix frontend run dev
```

4. Open:
- Frontend: http://127.0.0.1:5174
- Backend API: http://127.0.0.1:8000

## Run with Docker
```bash
docker compose up --build
```

## Notes for Hackathon Demo
- Start with `Gym: Squat` in live mode for consistent scoring.
- Use a side-view clip for cricket cover drive.
- Keep full body visible in frame for stable keypoints.

## API Contract
### POST `/api/analyze`
```json
{
  "activity_hint": "auto",
  "fps": 10,
  "frames": [
    {
      "timestamp": 0.0,
      "keypoints": [
        {"x": 0.5, "y": 0.3, "score": 0.9}
      ]
    }
  ]
}
```

### GET `/api/sessions`
- Requires auth headers from Clerk session.
- Returns the signed-in athlete's saved analysis sessions from Neon/Postgres.

### POST `/api/sessions`
```json
{
  "activity": "squat",
  "score": 87,
  "ml_label": "Good Squat",
  "consistency": 91.2,
  "risk": "Low",
  "power": 452
}
```

### Response
```json
{
  "activity": "squat",
  "overall_score": 82.5,
  "metrics": [],
  "feedback": [],
  "timeline": {}
}
```
