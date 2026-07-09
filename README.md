# Secure Assets - Full Stack from Scratch

Production-oriented modular starter for:
- React Web (`apps/web`)
- React Native Mobile (`apps/mobile`)
- Node/Next-style API module (`apps/api` currently express-based starter)
- Python AI service (`services/ai`)
- PostgreSQL

## One-click install
```bash
./scripts/install.sh
```

## Modules
- `apps/api/server.js`: API + DB health + marketplace search endpoint
- `apps/web/index.html`: elegant luxury UI starter consuming API
- `apps/mobile/README.md`: React Native module bootstrap plan
- `services/ai/main.py`: FastAPI AI starter with document scoring endpoint
- `OPERATIONS_BASELINE.md`: SLO/SLI, backup, migration, observability, queue operations baseline

## Quick checks
- `curl http://localhost:3000/health`
- `curl http://localhost:8000/health`
