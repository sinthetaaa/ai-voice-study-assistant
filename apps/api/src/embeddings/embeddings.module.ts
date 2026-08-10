import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EmbeddingClientService } from './embedding-client.service';

@Module({
  imports: [ConfigModule],

  providers: [EmbeddingClientService],

  exports: [EmbeddingClientService],
})
export class EmbeddingsModule {}
