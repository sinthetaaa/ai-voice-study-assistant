from .parsers.base import DocumentParser
from .parsers.csv_parser import CsvParser
from .parsers.docx_parser import DocxParser
from .parsers.pdf_parser import PdfParser
from .parsers.pptx_parser import PptxParser
from .parsers.rtf_parser import RtfParser
from .parsers.text_parser import TextParser
from .parsers.xlsx_parser import XlsxParser


class UnsupportedDocumentTypeError(Exception):
    pass


PARSERS: dict[str, DocumentParser] = {
    ".pdf": PdfParser(),

    ".txt": TextParser(),
    ".md": TextParser(),

    ".csv": CsvParser(),

    ".docx": DocxParser(),

    ".pptx": PptxParser(),

    ".xlsx": XlsxParser(),

    ".rtf": RtfParser(),
}


def get_parser(
    extension: str,
) -> DocumentParser:
    parser = PARSERS.get(
        extension.lower(),
    )

    if parser is None:
        raise UnsupportedDocumentTypeError(
            f"No parser is currently registered "
            f"for {extension}"
        )

    return parser