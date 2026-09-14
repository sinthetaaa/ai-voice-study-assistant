import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RequireResourceOwnership } from '../auth/resource-ownership.decorator';

import { DocumentsService } from './documents.service';
import { boundedDocumentMemoryStorage } from './bounded-document-memory.storage';
import {
  DOCUMENT_UPLOAD_HARD_FILE_BYTES,
  MAX_DOCUMENT_FILES_PER_REQUEST,
} from './document-upload-policy';

@RequireResourceOwnership('STUDY_PACK', 'studyPackId')
@Controller('study-packs/:studyPackId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  listDocuments(
    @Param('studyPackId', new ParseUUIDPipe())
    studyPackId: string,
  ) {
    return this.documentsService.listDocuments(studyPackId);
  }

  @Get(':documentId/file')
  async getDocumentFile(
    @Param('studyPackId', new ParseUUIDPipe())
    studyPackId: string,

    @Param('documentId', new ParseUUIDPipe())
    documentId: string,

    @Res({ passthrough: true })
    response: Response,
  ): Promise<StreamableFile> {
    const file = await this.documentsService.getDocumentFile(
      studyPackId,
      documentId,
    );

    response.setHeader('Content-Type', file.mimeType);

    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );

    response.setHeader('Cache-Control', 'private, max-age=3600');

    return new StreamableFile(file.buffer);
  }

  @Get(':documentId/preview')
  async getDocumentPreview(
    @Param('studyPackId', new ParseUUIDPipe())
    studyPackId: string,
    @Param('documentId', new ParseUUIDPipe())
    documentId: string,
    @Res({ passthrough: true })
    response: Response,
  ): Promise<StreamableFile> {
    const file = await this.documentsService.getDocumentPreview(
      studyPackId,
      documentId,
    );

    response.setHeader('Content-Type', 'application/pdf');

    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );

    response.setHeader('Cache-Control', 'private, max-age=3600');

    return new StreamableFile(file.buffer);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_DOCUMENT_FILES_PER_REQUEST, {
      storage: boundedDocumentMemoryStorage(),
      limits: {
        /*
         * Files above the 50 MB product limit are handled as
         * per-file rejections by boundedDocumentMemoryStorage.
         *
         * This higher ceiling remains as a hard transport guard
         * against unbounded multipart uploads.
         */
        fileSize: DOCUMENT_UPLOAD_HARD_FILE_BYTES,
      },
    }),
  )
  uploadDocuments(
    @Param('studyPackId', new ParseUUIDPipe())
    studyPackId: string,

    @UploadedFiles()
    files: Express.Multer.File[],
  ) {
    return this.documentsService.uploadDocuments(studyPackId, files);
  }
}
