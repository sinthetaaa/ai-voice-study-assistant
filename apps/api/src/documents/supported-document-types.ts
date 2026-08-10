import { extname } from 'node:path';

type DocumentFileMetadata = {
  originalname: string;
  mimetype: string;
};

const SUPPORTED_MIME_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],

  '.doc': ['application/msword', 'application/octet-stream'],

  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ],

  '.ppt': ['application/vnd.ms-powerpoint', 'application/octet-stream'],

  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
  ],

  '.txt': ['text/plain', 'application/octet-stream'],

  '.csv': [
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'text/plain',
    'application/octet-stream',
  ],

  '.md': ['text/markdown', 'text/plain', 'application/octet-stream'],

  '.rtf': ['application/rtf', 'text/rtf', 'application/octet-stream'],

  '.xls': ['application/vnd.ms-excel', 'application/octet-stream'],

  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
};

export const SUPPORTED_DOCUMENT_EXTENSIONS = Object.keys(SUPPORTED_MIME_TYPES);

export function getDocumentExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

export function isSupportedDocument(file: DocumentFileMetadata): boolean {
  const extension = getDocumentExtension(file.originalname);

  const allowedMimeTypes = SUPPORTED_MIME_TYPES[extension];

  if (!allowedMimeTypes) {
    return false;
  }

  return allowedMimeTypes.includes(file.mimetype);
}
