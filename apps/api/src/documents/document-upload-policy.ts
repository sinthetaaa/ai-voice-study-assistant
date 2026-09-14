import { isSupportedDocument } from './supported-document-types';

export const MAX_DOCUMENT_FILE_BYTES = 50 * 1024 * 1024;

export const DOCUMENT_UPLOAD_HARD_FILE_BYTES = 100 * 1024 * 1024;

export const MAX_DOCUMENT_FILES_PER_REQUEST = 10;

export type DocumentUploadRejectionReason =
  'UNSUPPORTED_TYPE' | 'FILE_TOO_LARGE';

type DocumentUploadFileMetadata = {
  originalname: string;
  mimetype: string;
  size: number;
};

export type RejectedDocumentUpload = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  reason: DocumentUploadRejectionReason;
};

export function getDocumentUploadRejectionReason(
  file: DocumentUploadFileMetadata,
): DocumentUploadRejectionReason | null {
  if (!isSupportedDocument(file)) {
    return 'UNSUPPORTED_TYPE';
  }

  if (file.size > MAX_DOCUMENT_FILE_BYTES) {
    return 'FILE_TOO_LARGE';
  }

  return null;
}

export function partitionDocumentUploads<T extends DocumentUploadFileMetadata>(
  files: readonly T[],
): {
  acceptedFiles: T[];
  rejected: RejectedDocumentUpload[];
} {
  const acceptedFiles: T[] = [];
  const rejected: RejectedDocumentUpload[] = [];

  for (const file of files) {
    const reason = getDocumentUploadRejectionReason(file);

    if (!reason) {
      acceptedFiles.push(file);
      continue;
    }

    rejected.push({
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      reason,
    });
  }

  return {
    acceptedFiles,
    rejected,
  };
}
