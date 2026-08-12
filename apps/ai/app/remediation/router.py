from fastapi import (
    APIRouter,
    HTTPException,
)

from app.llm.provider import (
    LlmProviderError,
)

from .models import (
    RemediationGenerationRequest,
    RemediationGenerationResult,
)
from .remediation_service import (
    RemediationGenerationError,
    get_remediation_service,
)


router = APIRouter(
    prefix="/remediation",
    tags=["remediation"],
)


@router.post(
    "/generate",
    response_model=(
        RemediationGenerationResult
    ),
)
async def generate_remediation(
    request:
        RemediationGenerationRequest,
) -> RemediationGenerationResult:
    service = (
        get_remediation_service()
    )

    try:
        return await service.generate(
            request,
        )

    except RemediationGenerationError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error

    except LlmProviderError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error