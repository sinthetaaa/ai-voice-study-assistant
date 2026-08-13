from fastapi import (
    APIRouter,
    File,
    Response,
    UploadFile,
)

from app.speech.models import (
    SynthesisRequest,
    TranscriptionResponse,
)
from app.speech.stt_service import (
    stt_service,
)
from app.speech.tts_service import (
    tts_service,
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


@router.post(
    "/synthesize",
    response_class=Response,
    responses={
        200: {
            "content": {
                "audio/wav": {},
            },
            "description": (
                "Synthesized WAV audio."
            ),
        },
    },
)
def synthesize_speech(
    request: SynthesisRequest,
) -> Response:
    result = tts_service.synthesize(
        request.text,
    )

    return Response(
        content=result.audio_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": (
                'inline; filename="'
                'studyloop-speech.wav"'
            ),
            "X-TTS-Model": result.model,
            "X-TTS-Speaker": (
                result.speaker
            ),
            "X-Audio-Sample-Rate": str(
                result.sample_rate
            ),
            "X-Audio-Duration-Seconds": (
                f"{result.duration_seconds:.3f}"
            ),
        },
    )
