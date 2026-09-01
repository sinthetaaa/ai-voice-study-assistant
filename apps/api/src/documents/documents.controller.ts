import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UnsupportedMediaTypeException,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import {
  isSupportedDocument,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from './supported-document-types';

@Controller('study-packs/:studyPackId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),

      limits: {
        // Maximum supported document size: 50 MB per file.
        fileSize: 50 * 1024 * 1024,
      },

      fileFilter: (_request, file, callback) => {
        if (!isSupportedDocument(file)) {
          callback(
            new UnsupportedMediaTypeException(
              `Unsupported file type. Supported formats: ${SUPPORTED_DOCUMENT_EXTENSIONS.join(
                ', ',
              )}`,
            ),
            false,
          );

          return;
        }

        callback(null, true);
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
