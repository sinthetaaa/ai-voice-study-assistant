from pathlib import Path
from typing import Any

import pymupdf
import pymupdf4llm

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

        try:
            page_chunks = pymupdf4llm.to_markdown(
                document,
                page_chunks=True,

                # Preserve readable text around graphics.
                force_text=True,

                # We do not need image files during
                # text ingestion.
                write_images=False,
                embed_images=False,

                # Let PyMuPDF4LLM use its layout-aware
                # extraction.
                show_progress=False,

                # Repeated academic-paper headers and
                # footers generally add retrieval noise.
                header=False,
                footer=False,
            )

            if not isinstance(page_chunks, list):
                raise ValueError(
                    "PyMuPDF4LLM did not return page-level chunks",
                )

            units: list[NormalizedUnit] = []

            for fallback_index, page_chunk in enumerate(
                page_chunks,
                start=1,
            ):
                metadata = page_chunk.get(
                    "metadata",
                    {},
                )

                page_number = self._get_page_number(
                    metadata=metadata,
                    fallback=fallback_index,
                )

                text = str(
                    page_chunk.get(
                        "text",
                        "",
                    )
                ).strip()

                units.append(
                    NormalizedUnit(
                        index=page_number,
                        kind="page",
                        label=f"Page {page_number}",
                        text=text,
                        metadata={
                            "page_number": page_number,
                            "source_parser":
                                "pymupdf4llm",
                            "layout_aware": True,
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
                parser="pymupdf4llm",
                units=units,
                full_text=full_text,
                metadata={
                    "page_count": len(units),
                    "layout_aware": True,
                },
            )

        finally:
            document.close()

    def _get_page_number(
        self,
        metadata: dict[str, Any],
        fallback: int,
    ) -> int:
        page_number = metadata.get(
            "page_number",
        )

        if isinstance(page_number, int):
            return page_number

        return fallback