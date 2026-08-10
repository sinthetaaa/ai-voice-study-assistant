import { Module } from '@nestjs/common';

import { EmbeddingsModule } from '../embeddings/embeddings.module';

import { RetrievalController } from './retrieval.controller';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [EmbeddingsModule],

  controllers: [RetrievalController],

  providers: [RetrievalService],

  exports: [RetrievalService],
})
export class RetrievalModule {}
