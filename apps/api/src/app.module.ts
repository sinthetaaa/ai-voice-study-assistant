import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ConceptsModule } from './concepts/concepts.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuestionsModule } from './questions/questions.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { StudyPacksModule } from './study-packs/study-packs.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { MasteryModule } from './mastery/mastery.module';
import { AdaptiveModule } from './adaptive/adaptive.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),

    HealthModule,

    PrismaModule,

    StudyPacksModule,

    DocumentsModule,

    RetrievalModule,

    ConceptsModule,

    QuestionsModule,

    EvaluationsModule,

    MasteryModule,

    AdaptiveModule,
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}
