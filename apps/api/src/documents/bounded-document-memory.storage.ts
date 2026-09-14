import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { MAX_DOCUMENT_FILE_BYTES } from './document-upload-policy';
import { isSupportedDocument } from './supported-document-types';

type HandleFileCallback = Parameters<StorageEngine['_handleFile']>[2];

type RemoveFileCallback = Parameters<StorageEngine['_removeFile']>[2];

export class BoundedDocumentMemoryStorage implements StorageEngine {
  constructor(
    private readonly maxBufferedFileBytes = MAX_DOCUMENT_FILE_BYTES,
  ) {}

  _handleFile(
    _request: Request,
    file: Express.Multer.File,
    callback: HandleFileCallback,
  ): void {
    const shouldBuffer = isSupportedDocument(file);

    let size = 0;
    let chunks: Buffer[] = [];
    let completed = false;

    const finish: HandleFileCallback = (error, info) => {
      if (completed) {
        return;
      }

      completed = true;
      callback(error, info);
    };

    file.stream.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      size += buffer.length;

      if (!shouldBuffer) {
        return;
      }

      if (size > this.maxBufferedFileBytes) {
        chunks = [];
        return;
      }

      chunks.push(buffer);
    });

    file.stream.once('error', (error: Error) => {
      chunks = [];
      finish(error);
    });

    file.stream.once('end', () => {
      const withinBufferLimit =
        shouldBuffer && size <= this.maxBufferedFileBytes;

      finish(undefined, {
        size,
        buffer: withinBufferLimit
          ? Buffer.concat(chunks, size)
          : Buffer.alloc(0),
      });

      chunks = [];
    });
  }

  _removeFile(
    _request: Request,
    _file: Express.Multer.File,
    callback: RemoveFileCallback,
  ): void {
    callback(null);
  }
}

export function boundedDocumentMemoryStorage(): StorageEngine {
  return new BoundedDocumentMemoryStorage();
}
