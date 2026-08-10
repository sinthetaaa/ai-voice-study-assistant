import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type EmbeddingInputType = 'document' | 'query';

type EmbeddingApiResponse = {
  provider: string;
  model: string;
  dimensions: number;
  count: number;

  input_type: EmbeddingInputType;

  embeddings: number[][];
};

export type EmbeddingBatchResult = {
  provider: string;
  model: string;
  dimensions: number;
  embeddings: number[][];
};

@Injectable()
export class EmbeddingClientService {
  private readonly logger = new Logger(EmbeddingClientService.name);

  private readonly batchSize = 64;

  private readonly expectedDimensions = 384;

  constructor(private readonly configService: ConfigService) {}

  async embedDocuments(texts: string[]): Promise<EmbeddingBatchResult> {
    return this.embed(texts, 'document');
  }

  async embedQueries(texts: string[]): Promise<EmbeddingBatchResult> {
    return this.embed(texts, 'query');
  }

  private async embed(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<EmbeddingBatchResult> {
    if (texts.length === 0) {
      return {
        provider: '',
        model: '',
        dimensions: this.expectedDimensions,
        embeddings: [],
      };
    }

    const allEmbeddings: number[][] = [];

    let providerName: string | null = null;

    let modelName: string | null = null;

    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);

      const response = await this.embedBatch(batch, inputType);

      if (response.dimensions !== this.expectedDimensions) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.expectedDimensions}, received ${response.dimensions}`,
        );
      }

      if (response.embeddings.length !== batch.length) {
        throw new Error(
          `Embedding count mismatch: expected ${batch.length}, received ${response.embeddings.length}`,
        );
      }

      for (const embedding of response.embeddings) {
        if (embedding.length !== this.expectedDimensions) {
          throw new Error(
            `Invalid embedding vector length: expected ${this.expectedDimensions}, received ${embedding.length}`,
          );
        }
      }

      if (providerName !== null && providerName !== response.provider) {
        throw new Error('Embedding provider changed between batches');
      }

      if (modelName !== null && modelName !== response.model) {
        throw new Error('Embedding model changed between batches');
      }

      providerName = response.provider;

      modelName = response.model;

      allEmbeddings.push(...response.embeddings);
    }

    this.logger.log(
      `Generated ${allEmbeddings.length} ${inputType} embeddings using ${modelName}`,
    );

    return {
      provider: providerName ?? '',

      model: modelName ?? '',

      dimensions: this.expectedDimensions,

      embeddings: allEmbeddings,
    };
  }

  private async embedBatch(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<EmbeddingApiResponse> {
    const aiServiceUrl = this.configService
      .getOrThrow<string>('AI_SERVICE_URL')
      .replace(/\/$/, '');

    const response = await fetch(`${aiServiceUrl}/embeddings/embed`, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        texts,

        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text();

      throw new Error(
        `Embedding service returned ${response.status}: ${responseBody}`,
      );
    }

    return (await response.json()) as EmbeddingApiResponse;
  }
}
