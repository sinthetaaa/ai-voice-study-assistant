from __future__ import annotations

import os
import threading
from pathlib import Path

from mlx_audio.stt import load


DEFAULT_STT_MODEL = (
    "mlx-community/"
    "whisper-large-v3-turbo-asr-fp16"
)


class MlxWhisperSttProvider:
    def __init__(
        self,
        model_name: str | None = None,
    ) -> None:
        self.model_name = (
            model_name
            or os.getenv(
                "STT_MODEL",
                DEFAULT_STT_MODEL,
            )
        )

        self._model = None

        self._model_lock = threading.Lock()
        self._transcription_lock = (
            threading.Lock()
        )

    def _get_model(self):
        if self._model is not None:
            return self._model

        with self._model_lock:
            if self._model is None:
                self._model = load(
                    self.model_name,
                )

        return self._model

    def transcribe(
        self,
        audio_path: Path,
    ) -> str:
        model = self._get_model()

        # The model instance is shared across
        # requests. Serialize MVP inference
        # rather than entering it concurrently.
        with self._transcription_lock:
            result = model.generate(
                str(audio_path),
            )

        text = result.text.strip()

        if not text:
            raise ValueError(
                "Speech transcription "
                "returned empty text."
            )

        return text


stt_provider = MlxWhisperSttProvider()
