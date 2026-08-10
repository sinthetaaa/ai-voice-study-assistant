from pathlib import Path

from striprtf.striprtf import rtf_to_text

from ..models import NormalizedUnit, ParsedDocument
from .base import DocumentParser


class RtfParser(DocumentParser):
    def parse(
        self,
        data: bytes,
        filename: str,
        mime_type: str | None,
    ) -> ParsedDocument:
        decoded = data.decode(
            "utf-8",
            errors="replace",
        )

        text = rtf_to_text(decoded).strip()

        return ParsedDocument(
            filename=filename,
            extension=Path(filename).suffix.lower(),
            mime_type=mime_type,
            parser="striprtf",
            units=[
                NormalizedUnit(
                    index=1,
                    kind="text",
                    label=filename,
                    text=text,
                )
            ],
            full_text=text,
        )