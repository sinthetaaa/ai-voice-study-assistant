import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ConceptsModule } from './concepts/concepts.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { StudyPacksModule } from './study-packs/study-packs.module';

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
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}
