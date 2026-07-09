from fastapi import FastAPI

app = FastAPI(title="Secure Assets AI Service")


@app.get('/health')
def health():
    return {"status": "ok"}


@app.post('/score-document')
def score_document(payload: dict):
    text = payload.get("text", "")
    score = min(len(text) / 1000, 1.0)
    return {"risk_score": round(score, 3), "model": "baseline-v1"}
