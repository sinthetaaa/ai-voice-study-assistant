from fastapi import FastAPI

app = FastAPI(
    title="StudyLoop AI Service",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    return {
        "service": "studyloop-ai",
        "status": "ok",
    }