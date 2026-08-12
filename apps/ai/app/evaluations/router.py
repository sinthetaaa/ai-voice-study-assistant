from fastapi import (
    APIRouter,
    HTTPException,
)

from app.llm.provider import (
    LlmProviderError,
)

from .evaluation_service import (
    AnswerEvaluationError,
    get_answer_evaluation_service,
)
from .models import (
    AnswerEvaluationRequest,
    AnswerEvaluationResult,
)


router = APIRouter(
    prefix="/evaluations",
    tags=["evaluations"],
)


@router.post(
    "/evaluate",
    response_model=AnswerEvaluationResult,
)
async def evaluate_answer(
    request: AnswerEvaluationRequest,
) -> AnswerEvaluationResult:
    service = (
        get_answer_evaluation_service()
    )

    try:
        return await service.evaluate(
            request,
        )

    except AnswerEvaluationError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error

    except LlmProviderError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error