import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { StudyPacksModule } from './study-packs/study-packs.module';
import { DocumentsModule } from './documents/documents.module';
import { RetrievalModule } from './retrieval/retrieval.module';

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
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}
