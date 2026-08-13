from __future__ import annotations

from fastapi import HTTPException

from app.speech.tts_provider import (
    SynthesizedAudio,
    tts_provider,
)


class TtsService:
    def synthesize(
        self,
        text: str,
    ) -> SynthesizedAudio:
        normalized_text = text.strip()

        if not normalized_text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Speech synthesis text "
                    "cannot be empty."
                ),
            )

        try:
            return tts_provider.synthesize(
                normalized_text,
            )

        except HTTPException:
            raise

        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Speech synthesis failed."
                ),
            ) from exc


tts_service = TtsService()
