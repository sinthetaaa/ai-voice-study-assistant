import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UnsupportedMediaTypeException,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import {
  isSupportedDocument,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from './supported-document-types';

@Controller('study-packs/:studyPackId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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
