from abc import ABC, abstractmethod

from ..models import ParsedDocument


class DocumentParser(ABC):
    @abstractmethod
    def parse(
        self,
        data: bytes,
        filename: str,
        mime_type: str | None,
    ) -> ParsedDocument:
        raise NotImplementedError