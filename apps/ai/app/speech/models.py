from pydantic import BaseModel, Field


class TranscriptionResponse(BaseModel):
    text: str
    model: str
    duration_seconds: float


class SynthesisRequest(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=3000,
    )
