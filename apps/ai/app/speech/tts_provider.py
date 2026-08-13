from __future__ import annotations

import io
import os
import threading
from dataclasses import dataclass

import numpy as np
import soundfile as sf

from mlx_audio.tts.utils import load_model


DEFAULT_TTS_MODEL = (
    "mlx-community/"
    "Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16"
)

DEFAULT_TTS_SPEAKER = "Ryan"

DEFAULT_TTS_LANGUAGE = "English"

DEFAULT_TTS_INSTRUCTION = (
    "Speak like a calm, clear, "
    "supportive study tutor."
)


@dataclass(frozen=True)
class SynthesizedAudio:
    audio_bytes: bytes

    model: str

    speaker: str

    sample_rate: int

    duration_seconds: float


class MlxQwenTtsProvider:
    def __init__(
        self,
        model_name: str | None = None,
        speaker: str | None = None,
        language: str | None = None,
        instruction: str | None = None,
    ) -> None:
        self.model_name = (
            model_name
            or os.getenv(
                "TTS_MODEL",
                DEFAULT_TTS_MODEL,
            )
        )

        self.speaker = (
            speaker
            or os.getenv(
                "TTS_SPEAKER",
                DEFAULT_TTS_SPEAKER,
            )
        )

        self.language = (
            language
            or os.getenv(
                "TTS_LANGUAGE",
                DEFAULT_TTS_LANGUAGE,
            )
        )

        self.instruction = (
            instruction
            or os.getenv(
                "TTS_INSTRUCTION",
                DEFAULT_TTS_INSTRUCTION,
            )
        )

        self._model = None

        self._model_lock = threading.Lock()

        self._generation_lock = (
            threading.Lock()
        )

    def _get_model(self):
        if self._model is not None:
            return self._model

        with self._model_lock:
            if self._model is None:
                self._model = load_model(
                    self.model_name,
                )

        return self._model

    def synthesize(
        self,
        text: str,
    ) -> SynthesizedAudio:
        model = self._get_model()

        # The model instance is shared by the
        # FastAPI process. Serialize inference
        # for the MVP rather than entering the
        # same MLX model concurrently.
        with self._generation_lock:
            results = list(
                model.generate_custom_voice(
                    text=text,
                    speaker=self.speaker,
                    language=self.language,
                    instruct=self.instruction,
                )
            )

        if not results:
            raise ValueError(
                "Speech synthesis returned "
                "no audio."
            )

        chunks = [
            np.asarray(
                result.audio,
                dtype=np.float32,
            ).reshape(-1)
            for result in results
        ]

        audio = np.concatenate(chunks)

        if audio.size == 0:
            raise ValueError(
                "Speech synthesis returned "
                "empty audio."
            )

        sample_rate = int(
            model.sample_rate
        )

        if sample_rate <= 0:
            raise ValueError(
                "Speech synthesis returned "
                "an invalid sample rate."
            )

        duration_seconds = (
            audio.size / sample_rate
        )

        buffer = io.BytesIO()

        sf.write(
            buffer,
            audio,
            sample_rate,
            format="WAV",
            subtype="PCM_16",
        )

        return SynthesizedAudio(
            audio_bytes=buffer.getvalue(),
            model=self.model_name,
            speaker=self.speaker,
            sample_rate=sample_rate,
            duration_seconds=(
                duration_seconds
            ),
        )


tts_provider = MlxQwenTtsProvider()
