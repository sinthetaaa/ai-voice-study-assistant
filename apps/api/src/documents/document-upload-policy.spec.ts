import {
  MAX_DOCUMENT_FILE_BYTES,
  partitionDocumentUploads,
} from './document-upload-policy';

function uploadMetadata(originalname: string, mimetype: string, size: number) {
  return {
    originalname,
    mimetype,
    size,
  };
}

describe('document upload policy', () => {
  it('accepts a supported file within the product limit', () => {
    const file = uploadMetadata('notes.pdf', 'application/pdf', 1024);

    expect(partitionDocumentUploads([file])).toEqual({
      acceptedFiles: [file],
      rejected: [],
    });
  });

  it('rejects an unsupported file without rejecting a valid sibling', () => {
    const valid = uploadMetadata('notes.pdf', 'application/pdf', 1024);

    const unsupported = uploadMetadata(
      'program.exe',
      'application/octet-stream',
      2048,
    );

    expect(partitionDocumentUploads([valid, unsupported])).toEqual({
      acceptedFiles: [valid],
      rejected: [
        {
          originalName: 'program.exe',
          mimeType: 'application/octet-stream',
          sizeBytes: 2048,
          reason: 'UNSUPPORTED_TYPE',
        },
      ],
    });
  });

  it('rejects an oversized file without rejecting a valid sibling', () => {
    const oversized = uploadMetadata(
      'huge.pdf',
      'application/pdf',
      MAX_DOCUMENT_FILE_BYTES + 1,
    );

    const valid = uploadMetadata('notes.txt', 'text/plain', 1024);

    expect(partitionDocumentUploads([oversized, valid])).toEqual({
      acceptedFiles: [valid],
      rejected: [
        {
          originalName: 'huge.pdf',
          mimeType: 'application/pdf',
          sizeBytes: MAX_DOCUMENT_FILE_BYTES + 1,
          reason: 'FILE_TOO_LARGE',
        },
      ],
    });
  });
});
