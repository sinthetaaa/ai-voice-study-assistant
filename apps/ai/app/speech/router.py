from fastapi import (
    APIRouter,
    File,
    UploadFile,
)

from app.speech.models import (
    TranscriptionResponse,
)
from app.speech.stt_service import (
    stt_service,
)


router = APIRouter(
    prefix="/speech",
    tags=["speech"],
)


@router.post(
    "/transcribe",
    response_model=TranscriptionResponse,
)
async def transcribe_speech(
    audio: UploadFile = File(...),
) -> TranscriptionResponse:
    return await stt_service.transcribe(
        audio,
    )
