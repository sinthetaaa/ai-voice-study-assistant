import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { StorageModule } from '../storage/storage.module';

import { IngestionQueueService } from './ingestion-queue.service';
import { IngestionProcessor } from './ingestion.processor';
import { DOCUMENT_INGESTION_QUEUE } from './ingestion.constants';

@Module({
  imports: [
    ConfigModule,

    StorageModule,

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => {
        const redisUrl = new URL(configService.getOrThrow<string>('REDIS_URL'));

        return {
          connection: {
            host: redisUrl.hostname,

            port: Number(redisUrl.port || '6379'),

            username: redisUrl.username || undefined,

            password: redisUrl.password || undefined,

            db:
              redisUrl.pathname.length > 1
                ? Number(redisUrl.pathname.slice(1))
                : 0,
          },
        };
      },
    }),

    BullModule.registerQueue({
      name: DOCUMENT_INGESTION_QUEUE,
    }),
  ],

  providers: [IngestionQueueService, IngestionProcessor],

  exports: [IngestionQueueService],
})
export class IngestionModule {}
