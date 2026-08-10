from pathlib import Path

from ..models import NormalizedUnit, ParsedDocument
from .base import DocumentParser


class TextParser(DocumentParser):
    def _decode(self, data: bytes) -> str:
        for encoding in (
            "utf-8",
            "utf-8-sig",
            "latin-1",
        ):
            try:
                return data.decode(encoding)
            except UnicodeDecodeError:
                continue

        return data.decode(
            "utf-8",
            errors="replace",
        )

    def parse(
        self,
        data: bytes,
        filename: str,
        mime_type: str | None,
    ) -> ParsedDocument:
        text = self._decode(data).strip()

        extension = Path(filename).suffix.lower()

        unit = NormalizedUnit(
            index=1,
            kind="text",
            label=filename,
            text=text,
        )

        return ParsedDocument(
            filename=filename,
            extension=extension,
            mime_type=mime_type,
            parser="text",
            units=[unit],
            full_text=text,
        )