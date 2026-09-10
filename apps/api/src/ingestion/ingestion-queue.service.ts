import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DOCUMENT_INGESTION_QUEUE,
  GENERATE_STUDY_PACK_HIERARCHY_JOB,
  PROCESS_DOCUMENT_JOB,
} from './ingestion.constants';
import { IngestionJobData } from './ingestion.types';

@Injectable()
export class IngestionQueueService {
  constructor(
    @InjectQueue(DOCUMENT_INGESTION_QUEUE)
    private readonly ingestionQueue: Queue<IngestionJobData>,
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

  async enqueueStudyPackHierarchy(studyPackId: string) {
    return this.ingestionQueue.add(
      GENERATE_STUDY_PACK_HIERARCHY_JOB,
      {
        studyPackId,
      },
      {
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
    );
  }
}
