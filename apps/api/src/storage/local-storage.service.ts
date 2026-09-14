import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
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

    const absolutePath = this.resolveStoragePath(storageKey);

    await mkdir(dirname(absolutePath), {
      recursive: true,
    });

    await writeFile(absolutePath, file.buffer);

    return {
      storageKey,
    };
  }

  resolveStoragePath(storageKey: string): string {
    return join(this.storageRoot, storageKey);
  }

  previewStorageKey(storageKey: string): string {
    return `${storageKey}.preview.pdf`;
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await access(this.resolveStoragePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async readDocument(storageKey: string): Promise<Buffer> {
    return readFile(this.resolveStoragePath(storageKey));
  }

  async saveDerivedDocument(
    storageKey: string,
    buffer: Buffer,
  ): Promise<void> {
    const absolutePath = this.resolveStoragePath(storageKey);

    await mkdir(dirname(absolutePath), {
      recursive: true,
    });

    await writeFile(absolutePath, buffer);
  }

  async deleteStudyPackDocuments(studyPackId: string): Promise<void> {
    const studyPackDirectory = this.resolveStoragePath(
      join('documents', studyPackId),
    );

    await rm(studyPackDirectory, {
      recursive: true,
      force: true,
    });
  }

  async delete(storageKey: string) {
    await Promise.allSettled([
      rm(this.resolveStoragePath(storageKey), {
        force: true,
      }),
      rm(this.resolveStoragePath(this.previewStorageKey(storageKey)), {
        force: true,
      }),
    ]);
  }
}
