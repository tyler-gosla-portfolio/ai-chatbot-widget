import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../../src/services/chunkService.js';

const CHUNK_SIZE_CHARS = 500 * 4; // 2000 chars

describe('chunkService — boundary cases', () => {
  it('returns empty array for empty string', () => {
    const result = chunkDocument({ type: 'text', text: '' }, { filename: 'empty.txt' });
    expect(result).toEqual([]);
  });

  it('returns empty array for single character', () => {
    const result = chunkDocument({ type: 'text', text: 'x' }, { filename: 'single.txt' });
    expect(result).toEqual([]);
  });

  it('returns empty array for text just below minimum length (49 chars)', () => {
    const text = 'a'.repeat(49);
    const result = chunkDocument({ type: 'text', text }, { filename: 'short.txt' });
    expect(result).toEqual([]);
  });

  it('handles text exactly at minimum chunk threshold (50 chars)', () => {
    // 50 chars exactly — should produce one chunk
    const text = 'a'.repeat(50);
    const result = chunkDocument({ type: 'text', text }, { filename: 'exact.txt' });
    expect(result.length).toBe(1);
    expect(result[0].content).toBe(text);
  });

  it('handles text exactly at chunk size boundary', () => {
    const text = 'word '.repeat(CHUNK_SIZE_CHARS / 5); // fills exactly to chunk size
    const result = chunkDocument({ type: 'text', text }, { filename: 'boundary.txt' });
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const chunk of result) {
      expect(chunk.content.length).toBeGreaterThanOrEqual(50);
      expect(typeof chunk.chunk_index).toBe('number');
      expect(typeof chunk.token_count).toBe('number');
    }
  });

  it('handles very long document (100K chars)', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(2500);
    const result = chunkDocument({ type: 'text', text }, { filename: 'long.txt' });
    expect(result.length).toBeGreaterThan(5);
    // Chunk indices should be sequential
    result.forEach((chunk, i) => {
      expect(chunk.chunk_index).toBe(i);
    });
  });

  it('handles Unicode text correctly', () => {
    const text = ('日本語のテキストです。これはテストです。').repeat(100);
    const result = chunkDocument({ type: 'text', text }, { filename: 'unicode.txt' });
    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });

  it('handles text with only whitespace', () => {
    const text = ' '.repeat(500);
    const result = chunkDocument({ type: 'text', text }, { filename: 'spaces.txt' });
    expect(result).toEqual([]);
  });

  it('handles text with mixed separators', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.\n\n' + 'More text. '.repeat(50);
    const result = chunkDocument({ type: 'text', text }, { filename: 'mixed.txt' });
    expect(result.length).toBeGreaterThan(0);
  });

  it('assigns correct metadata to each chunk', () => {
    const text = 'Content. '.repeat(500);
    const result = chunkDocument({ type: 'text', text }, { filename: 'meta.txt', extra: 'value' });
    for (const chunk of result) {
      const meta = JSON.parse(chunk.metadata);
      expect(meta.source_file).toBe('meta.txt');
    }
  });

  it('token_count is a positive integer approximating content length / 4', () => {
    // Note: token_count is computed from the raw (pre-trim) content length in chunkService
    const text = 'a'.repeat(400); // clean text, no trailing whitespace
    const result = chunkDocument({ type: 'text', text }, { filename: 'tokens.txt' });
    if (result.length > 0) {
      const chunk = result[0];
      expect(typeof chunk.token_count).toBe('number');
      expect(chunk.token_count).toBeGreaterThan(0);
      // token_count should be within ~50% of content.length / 4
      const approx = chunk.content.length / 4;
      expect(chunk.token_count).toBeGreaterThan(approx * 0.5);
      expect(chunk.token_count).toBeLessThan(approx * 2);
    }
  });
});

describe('chunkService — markdown', () => {
  it('splits at heading boundaries', () => {
    const text = [
      '# Heading One',
      '',
      'Content under heading one. '.repeat(30),
      '',
      '## Heading Two',
      '',
      'Content under heading two. '.repeat(30),
      '',
      '### Heading Three',
      '',
      'Content under heading three. '.repeat(30),
    ].join('\n');
    const result = chunkDocument({ type: 'markdown', text }, { filename: 'doc.md' });
    expect(result.length).toBeGreaterThan(1);
    // Check section_title metadata
    const metas = result.map(c => JSON.parse(c.metadata));
    expect(metas.some(m => m.section_title === 'Heading One')).toBe(true);
  });

  it('handles markdown with no headings', () => {
    const text = 'Plain markdown content without any headings. '.repeat(50);
    const result = chunkDocument({ type: 'markdown', text }, { filename: 'noheadings.md' });
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles empty markdown', () => {
    const result = chunkDocument({ type: 'markdown', text: '' }, { filename: 'empty.md' });
    expect(result).toEqual([]);
  });
});

describe('chunkService — PDF', () => {
  it('handles empty pages array', () => {
    const result = chunkDocument(
      { type: 'pdf', pages: [] },
      { filename: 'empty.pdf' }
    );
    expect(result).toEqual([]);
  });

  it('includes page_number in metadata', () => {
    const pages = [
      { pageNumber: 5, text: 'Page five content. '.repeat(30) },
    ];
    const result = chunkDocument({ type: 'pdf', pages }, { filename: 'paged.pdf' });
    expect(result.length).toBeGreaterThan(0);
    const meta = JSON.parse(result[0].metadata);
    expect(meta.page_number).toBe(5);
    expect(meta.source_file).toBe('paged.pdf');
  });

  it('skips pages with too-short text', () => {
    const pages = [
      { pageNumber: 1, text: 'Short' },
      { pageNumber: 2, text: 'Also short' },
    ];
    const result = chunkDocument({ type: 'pdf', pages }, { filename: 'short.pdf' });
    expect(result).toEqual([]);
  });

  it('handles multi-page documents', () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Page ${i + 1} content. `.repeat(60),
    }));
    const result = chunkDocument({ type: 'pdf', pages }, { filename: 'multipage.pdf' });
    expect(result.length).toBeGreaterThan(5);
    // chunk_index should be sequential across all pages
    result.forEach((chunk, i) => {
      expect(chunk.chunk_index).toBe(i);
    });
  });
});
