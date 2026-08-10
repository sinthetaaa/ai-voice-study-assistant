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
import { extname } from 'node:path';
import { DocumentsService } from './documents.service';

@Controller('study-packs/:studyPackId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),

      limits: {
        fileSize: 20 * 1024 * 1024,
      },

      fileFilter: (_request, file, callback) => {
        const hasPdfMimeType = file.mimetype === 'application/pdf';

        const hasPdfExtension =
          extname(file.originalname).toLowerCase() === '.pdf';

        if (!hasPdfMimeType || !hasPdfExtension) {
          callback(
            new UnsupportedMediaTypeException(
              'Only PDF files are currently supported',
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
