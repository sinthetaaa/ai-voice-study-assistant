from pathlib import Path

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    UploadFile,
)

from .models import ParsedDocument
from .registry import (
    UnsupportedDocumentTypeError,
    get_parser,
)


router = APIRouter(
    prefix="/ingestion",
    tags=["ingestion"],
)


@router.post(
    "/parse",
    response_model=ParsedDocument,
)
async def parse_document(
    file: UploadFile = File(...),
) -> ParsedDocument:
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Uploaded document must have a filename",
        )

    extension = Path(
        file.filename,
    ).suffix.lower()

    try:
        parser = get_parser(extension)

    except UnsupportedDocumentTypeError as error:
        raise HTTPException(
            status_code=415,
            detail=str(error),
        ) from error

    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="Uploaded document is empty",
        )

    try:
        return parser.parse(
            data=data,
            filename=file.filename,
            mime_type=file.content_type,
        )

    except Exception as error:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Failed to parse document: "
                f"{type(error).__name__}: {error}"
            ),
        ) from error

    finally:
        await file.close()