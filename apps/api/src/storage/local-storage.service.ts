import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

@Injectable()
export class LocalStorageService {
  private readonly storageRoot = resolve(process.cwd(), 'storage');

  async saveDocument(studyPackId: string, file: Express.Multer.File) {
    const extension = extname(file.originalname).toLowerCase();

    const storageKey = join(
      'documents',
      studyPackId,
      `${randomUUID()}${extension}`,
    );

    const absolutePath = join(this.storageRoot, storageKey);

    await mkdir(dirname(absolutePath), {
      recursive: true,
    });

    await writeFile(absolutePath, file.buffer);

    return {
      storageKey,
    };
  }

  async delete(storageKey: string) {
    const absolutePath = join(this.storageRoot, storageKey);

    await rm(absolutePath, {
      force: true,
    });
  }
}
