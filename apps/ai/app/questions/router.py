from fastapi import (
    APIRouter,
    HTTPException,
)

from app.llm.provider import (
    LlmProviderError,
)

from .models import (
    QuestionGenerationRequest,
    QuestionGenerationResult,
)
from .question_service import (
    QuestionGenerationError,
    get_question_service,
)


router = APIRouter(
    prefix="/questions",
    tags=["questions"],
)


@router.post(
    "/generate",
    response_model=QuestionGenerationResult,
)
async def generate_questions(
    request: QuestionGenerationRequest,
) -> QuestionGenerationResult:
    service = get_question_service()

    try:
        return await service.generate(
            request,
        )

    except QuestionGenerationError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error

    except LlmProviderError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error