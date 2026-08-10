import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService();
  });

  it('returns one chunk for short text', () => {
    const result = service.chunkText(
      '# Introduction\n\nThis is a short paragraph about machine learning.',
    );

    expect(result).toHaveLength(1);

    expect(result[0].chunkIndex).toBe(0);

    expect(result[0].text).toContain('# Introduction');

    expect(result[0].metadata.headings).toContain('Introduction');
  });

  it('preserves markdown blocks', () => {
    const text = [
      '## Feature Extraction',
      '',
      'Feature extraction converts retinal images into useful representations.',
      '',
      '- Blood vessels',
      '- Texture',
      '- Optic disc',
    ].join('\n');

    const result = service.chunkText(text);

    expect(result).toHaveLength(1);

    expect(result[0].text).toContain('## Feature Extraction');

    expect(result[0].text).toContain('- Blood vessels');
  });

  it('splits long content into multiple chunks', () => {
    const paragraphs = Array.from(
      {
        length: 12,
      },
      (_, index) =>
        `Paragraph ${index + 1}. ${'retinal image analysis '.repeat(30)}`,
    ).join('\n\n');

    const result = service.chunkText(paragraphs);

    expect(result.length).toBeGreaterThan(1);

    for (const chunk of result) {
      expect(chunk.wordCount).toBeGreaterThan(0);

      expect(chunk.metadata.strategy).toBe('markdown-structure-aware-v1');
    }
  });

  it('is deterministic', () => {
    const text =
      '# Topic\n\n' +
      'Neural networks learn useful representations. '.repeat(100);

    const first = service.chunkText(text);

    const second = service.chunkText(text);

    expect(first).toEqual(second);
  });

  it('handles empty text', () => {
    expect(service.chunkText('   ')).toEqual([]);
  });
});
