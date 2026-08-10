from fastapi import FastAPI

from app.embeddings.router import router as embeddings_router
from app.ingestion.router import router as ingestion_router


app = FastAPI(
    title="StudyLoop AI Service",
    version="0.1.0",
)


app.include_router(
    ingestion_router,
)

app.include_router(
    embeddings_router,
)


@app.get("/health")
async def health_check():
    return {
        "service": "studyloop-ai",
        "status": "ok",
    }