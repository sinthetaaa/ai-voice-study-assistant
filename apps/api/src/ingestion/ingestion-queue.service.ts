import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DOCUMENT_INGESTION_QUEUE,
  PROCESS_DOCUMENT_JOB,
} from './ingestion.constants';
import { ProcessDocumentJobData } from './ingestion.types';

@Injectable()
export class IngestionQueueService {
  constructor(
    @InjectQueue(DOCUMENT_INGESTION_QUEUE)
    private readonly ingestionQueue: Queue<ProcessDocumentJobData>,
  ) {}

  async enqueueDocuments(documentIds: string[]) {
    if (documentIds.length === 0) {
      return [];
    }

    return this.ingestionQueue.addBulk(
      documentIds.map((documentId) => ({
        name: PROCESS_DOCUMENT_JOB,
        data: {
          documentId,
        },
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: {
            count: 100,
          },
          removeOnFail: {
            count: 500,
          },
        },
      })),
    );
  }
}
