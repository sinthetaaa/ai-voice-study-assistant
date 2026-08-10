import csv
import io
from pathlib import Path

from ..models import NormalizedUnit, ParsedDocument
from .base import DocumentParser


class CsvParser(DocumentParser):
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
        decoded = self._decode(data)

        reader = csv.reader(
            io.StringIO(decoded),
        )

        rows: list[str] = []

        for row in reader:
            cleaned = [
                str(value).strip()
                for value in row
            ]

            rows.append(" | ".join(cleaned))

        text = "\n".join(rows).strip()

        unit = NormalizedUnit(
            index=1,
            kind="rows",
            label=filename,
            text=text,
            metadata={
                "row_count": len(rows),
            },
        )

        return ParsedDocument(
            filename=filename,
            extension=Path(filename).suffix.lower(),
            mime_type=mime_type,
            parser="csv",
            units=[unit],
            full_text=text,
            metadata={
                "row_count": len(rows),
            },
        )