from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import HTTPException, UploadFile
from scipy.io import wavfile

from app.speech.models import (
    TranscriptionResponse,
)
from app.speech.stt_provider import (
    stt_provider,
)


MAX_AUDIO_BYTES = 20 * 1024 * 1024


class SttService:
    async def transcribe(
        self,
        audio: UploadFile,
    ) -> TranscriptionResponse:
        contents = await audio.read()

        if not contents:
            raise HTTPException(
                status_code=400,
                detail="Uploaded audio is empty.",
            )

        if len(contents) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    "Audio exceeds the "
                    "20 MB limit."
                ),
            )

        if (
            len(contents) < 12
            or contents[:4] != b"RIFF"
            or contents[8:12] != b"WAVE"
        ):
            raise HTTPException(
                status_code=415,
                detail=(
                    "Only WAV audio is "
                    "supported currently."
                ),
            )

        temp_path: Path | None = None

        try:
            with tempfile.NamedTemporaryFile(
                suffix=".wav",
                delete=False,
            ) as temp_file:
                temp_file.write(contents)

                temp_path = Path(
                    temp_file.name,
                )

            duration_seconds = (
                self._wav_duration(
                    temp_path,
                )
            )

            text = stt_provider.transcribe(
                temp_path,
            )

            return TranscriptionResponse(
                text=text,
                model=stt_provider.model_name,
                duration_seconds=(
                    duration_seconds
                ),
            )

        except HTTPException:
            raise

        except (
            ValueError,
            OSError,
            EOFError,
        ) as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The uploaded WAV file "
                    "is invalid."
                ),
            ) from exc

        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Speech transcription "
                    "failed."
                ),
            ) from exc

        finally:
            if (
                temp_path is not None
                and temp_path.exists()
            ):
                temp_path.unlink()

            await audio.close()

    @staticmethod
    def _wav_duration(
        audio_path: Path,
    ) -> float:
        sample_rate, audio_data = (
            wavfile.read(
                str(audio_path),
                mmap=True,
            )
        )

        if sample_rate <= 0:
            raise ValueError(
                "Invalid WAV sample rate."
            )

        if audio_data.ndim == 0:
            raise ValueError(
                "WAV file contains no "
                "audio frames."
            )

        frame_count = audio_data.shape[0]

        if frame_count <= 0:
            raise ValueError(
                "WAV file contains no "
                "audio frames."
            )

        return (
            frame_count / sample_rate
        )


stt_service = SttService()
