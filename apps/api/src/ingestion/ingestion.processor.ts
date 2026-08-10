import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  DOCUMENT_INGESTION_QUEUE,
  PROCESS_DOCUMENT_JOB,
} from './ingestion.constants';
import { ProcessDocumentJobData } from './ingestion.types';

@Processor(DOCUMENT_INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ProcessDocumentJobData>): Promise<void> {
    if (job.name !== PROCESS_DOCUMENT_JOB) {
      throw new Error(`Unsupported ingestion job: ${job.name}`);
    }

    const document = await this.prisma.document.findUnique({
      where: {
        id: job.data.documentId,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        storageKey: true,
        status: true,
      },
    });

    if (!document) {
      throw new Error(`Document ${job.data.documentId} was not found`);
    }

    this.logger.log(
      `Received ingestion job for ${document.originalName} (${document.id})`,
    );

    this.logger.log(
      `Format=${document.mimeType}, storageKey=${document.storageKey}`,
    );
  }
}
