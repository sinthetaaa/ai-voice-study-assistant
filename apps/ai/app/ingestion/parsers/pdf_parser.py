from pathlib import Path

import pymupdf

from ..models import NormalizedUnit, ParsedDocument
from .base import DocumentParser


class PdfParser(DocumentParser):
    def parse(
        self,
        data: bytes,
        filename: str,
        mime_type: str | None,
    ) -> ParsedDocument:
        document = pymupdf.open(
            stream=data,
            filetype="pdf",
        )

        units: list[NormalizedUnit] = []

        try:
            for page_index, page in enumerate(
                document,
                start=1,
            ):
                text = page.get_text(
                    "text",
                    sort=True,
                ).strip()

                units.append(
                    NormalizedUnit(
                        index=page_index,
                        kind="page",
                        label=f"Page {page_index}",
                        text=text,
                        metadata={
                            "page_number": page_index,
                        },
                    )
                )

            full_text = "\n\n".join(
                unit.text
                for unit in units
                if unit.text
            )

            return ParsedDocument(
                filename=filename,
                extension=Path(
                    filename,
                ).suffix.lower(),
                mime_type=mime_type,
                parser="pymupdf",
                units=units,
                full_text=full_text,
                metadata={
                    "page_count": len(units),
                },
            )

        finally:
            document.close()