from fastapi import (
    APIRouter,
    HTTPException,
)

from app.llm.provider import (
    LlmProviderError,
)

from .extraction_service import (
    get_concept_extraction_service,
)
from .models import (
    ConceptExtractionRequest,
    ConceptExtractionResult,
)


router = APIRouter(
    prefix="/concepts",
    tags=["concepts"],
)


@router.post(
    "/extract",
    response_model=ConceptExtractionResult,
)
async def extract_concepts(
    request: ConceptExtractionRequest,
) -> ConceptExtractionResult:
    service = (
        get_concept_extraction_service()
    )

    try:
        return await service.extract(
            request.chunks,
        )

    except LlmProviderError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error