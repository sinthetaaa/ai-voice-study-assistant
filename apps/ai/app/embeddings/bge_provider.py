from functools import lru_cache

from sentence_transformers import SentenceTransformer

from .provider import EmbeddingProvider


class BgeSmallEnV15Provider(EmbeddingProvider):
    PROVIDER_NAME = "sentence-transformers"

    MODEL_NAME = "BAAI/bge-small-en-v1.5"

    DIMENSIONS = 384

    QUERY_INSTRUCTION = (
        "Represent this sentence for searching relevant passages: "
    )

    def __init__(self) -> None:
        self._model = SentenceTransformer(
            self.MODEL_NAME,
        )

    @property
    def provider_name(self) -> str:
        return self.PROVIDER_NAME

    @property
    def model_name(self) -> str:
        return self.MODEL_NAME

    @property
    def dimensions(self) -> int:
        return self.DIMENSIONS

    def embed_documents(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        return self._encode(texts)

    def embed_queries(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        instructed_texts = [
            f"{self.QUERY_INSTRUCTION}{text}"
            for text in texts
        ]

        return self._encode(
            instructed_texts,
        )

    def _encode(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        if not texts:
            return []

        embeddings = self._model.encode(
            texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

        if (
            embeddings.ndim != 2
            or embeddings.shape[1]
            != self.DIMENSIONS
        ):
            raise RuntimeError(
                "Embedding model returned "
                f"unexpected shape: {embeddings.shape}"
            )

        return embeddings.tolist()


@lru_cache(maxsize=1)
def get_embedding_provider() -> EmbeddingProvider:
    return BgeSmallEnV15Provider()