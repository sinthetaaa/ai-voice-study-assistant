import type { Request } from 'express';
import { PassThrough } from 'node:stream';
import { BoundedDocumentMemoryStorage } from './bounded-document-memory.storage';

function createIncomingFile(originalname: string, mimetype: string) {
  const stream = new PassThrough();

  const file = {
    fieldname: 'files',
    originalname,
    encoding: '7bit',
    mimetype,
    stream,
  } as Express.Multer.File;

  return {
    file,
    stream,
  };
}

function storeFile(
  storage: BoundedDocumentMemoryStorage,
  originalname: string,
  mimetype: string,
  chunks: Buffer[],
): Promise<Partial<Express.Multer.File>> {
  const { file, stream } = createIncomingFile(originalname, mimetype);

  return new Promise((resolve, reject) => {
    storage._handleFile({} as Request, file, (error, info) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      resolve(info ?? {});
    });

    for (const chunk of chunks) {
      stream.write(chunk);
    }

    stream.end();
  });
}

describe('BoundedDocumentMemoryStorage', () => {
  it('buffers a supported file within the configured limit', async () => {
    const storage = new BoundedDocumentMemoryStorage(5);

    const info = await storeFile(storage, 'notes.txt', 'text/plain', [
      Buffer.from('abc'),
      Buffer.from('de'),
    ]);

    expect(info.size).toBe(5);
    expect(info.buffer?.toString()).toBe('abcde');
  });

  it('drains unsupported files without buffering them', async () => {
    const storage = new BoundedDocumentMemoryStorage(5);

    const info = await storeFile(
      storage,
      'program.exe',
      'application/octet-stream',
      [Buffer.from('abcd')],
    );

    expect(info.size).toBe(4);
    expect(info.buffer).toEqual(Buffer.alloc(0));
  });

  it('discards buffered content after the product limit is exceeded', async () => {
    const storage = new BoundedDocumentMemoryStorage(5);

    const info = await storeFile(storage, 'notes.txt', 'text/plain', [
      Buffer.from('abc'),
      Buffer.from('def'),
    ]);

    expect(info.size).toBe(6);
    expect(info.buffer).toEqual(Buffer.alloc(0));
  });
});
