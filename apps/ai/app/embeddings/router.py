from fastapi import APIRouter

from .bge_provider import (
    get_embedding_provider,
)
from .models import (
    EmbeddingInfoResponse,
    EmbeddingRequest,
    EmbeddingResponse,
)


router = APIRouter(
    prefix="/embeddings",
    tags=["embeddings"],
)


@router.get(
    "/info",
    response_model=EmbeddingInfoResponse,
)
def embedding_info() -> EmbeddingInfoResponse:
    provider = get_embedding_provider()

    return EmbeddingInfoResponse(
        provider=provider.provider_name,
        model=provider.model_name,
        dimensions=provider.dimensions,
    )


@router.post(
    "/embed",
    response_model=EmbeddingResponse,
)
def create_embeddings(
    request: EmbeddingRequest,
) -> EmbeddingResponse:
    provider = get_embedding_provider()

    if request.input_type == "query":
        embeddings = (
            provider.embed_queries(
                request.texts,
            )
        )
    else:
        embeddings = (
            provider.embed_documents(
                request.texts,
            )
        )

    return EmbeddingResponse(
        provider=provider.provider_name,
        model=provider.model_name,
        dimensions=provider.dimensions,
        count=len(embeddings),
        input_type=request.input_type,
        embeddings=embeddings,
    )