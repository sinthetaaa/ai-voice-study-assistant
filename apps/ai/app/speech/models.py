from pydantic import BaseModel


class TranscriptionResponse(BaseModel):
    text: str
    model: str
    duration_seconds: float
