from typing import Any, Literal

from pydantic import BaseModel, Field


UnitKind = Literal[
    "page",
    "slide",
    "section",
    "sheet",
    "text",
    "rows",
]


class NormalizedUnit(BaseModel):
    index: int
    kind: UnitKind
    label: str
    text: str

    metadata: dict[str, Any] = Field(
        default_factory=dict,
    )


class ParsedDocument(BaseModel):
    filename: str
    extension: str
    mime_type: str | None = None
    parser: str

    units: list[NormalizedUnit]

    full_text: str

    metadata: dict[str, Any] = Field(
        default_factory=dict,
    )