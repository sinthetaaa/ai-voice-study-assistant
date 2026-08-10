import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {}

  async uploadDocuments(studyPackId: string, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one PDF must be uploaded');
    }

    const studyPack = await this.prisma.studyPack.findUnique({
      where: {
        id: studyPackId,
      },
      select: {
        id: true,
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study pack ${studyPackId} was not found`);
    }

    const storedFiles: {
      file: Express.Multer.File;
      storageKey: string;
    }[] = [];

    try {
      for (const file of files) {
        const stored = await this.storage.saveDocument(studyPackId, file);

        storedFiles.push({
          file,
          storageKey: stored.storageKey,
        });
      }

      const documents = await this.prisma.$transaction(
        storedFiles.map(({ file, storageKey }) =>
          this.prisma.document.create({
            data: {
              studyPackId,
              originalName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              storageKey,
            },
          }),
        ),
      );

      return {
        studyPackId,
        uploaded: documents.length,
        documents,
      };
    } catch (error) {
      await Promise.allSettled(
        storedFiles.map(({ storageKey }) => this.storage.delete(storageKey)),
      );

      throw error;
    }
  }
}
