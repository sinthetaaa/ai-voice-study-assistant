from fastapi import FastAPI

from app.concepts.router import (
    router as concepts_router,
)
from app.embeddings.router import (
    router as embeddings_router,
)
from app.evaluations.router import (
    router as evaluations_router,
)
from app.ingestion.router import (
    router as ingestion_router,
)
from app.questions.router import (
    router as questions_router,
)
from app.remediation.router import (
    router as remediation_router,
)


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

app.include_router(
    concepts_router,
)

app.include_router(
    questions_router,
)

app.include_router(
    evaluations_router,
)

app.include_router(
    remediation_router,
)


@app.get("/health")
async def health_check():
    return {
        "service": "studyloop-ai",
        "status": "ok",
    }