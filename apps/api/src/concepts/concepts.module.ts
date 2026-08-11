import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ConceptAiClientService } from './concept-ai-client.service';
import { ConceptsController } from './concepts.controller';
import { ConceptsService } from './concepts.service';

@Module({
  imports: [PrismaModule],

  controllers: [ConceptsController],

  providers: [ConceptAiClientService, ConceptsService],

  exports: [ConceptsService],
})
export class ConceptsModule {}
