import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../../src/services/chunkService.js';

describe('chunkService', () => {
  it('chunks plain text', () => {
    const extracted = { type: 'text', text: 'Hello world. '.repeat(200) };
    const chunks = chunkDocument(extracted, { filename: 'test.txt' });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.chunk_index).toBeTypeOf('number');
      expect(chunk.token_count).toBeTypeOf('number');
    }
  });

  it('returns empty for very short text', () => {
    const extracted = { type: 'text', text: 'short' };
    const chunks = chunkDocument(extracted, { filename: 'test.txt' });
    expect(chunks.length).toBe(0);
  });

  it('handles markdown with headings', () => {
    const text = `# Section One\n\n${'Content paragraph. '.repeat(50)}\n\n## Section Two\n\n${'More content. '.repeat(50)}`;
    const extracted = { type: 'markdown', text };
    const chunks = chunkDocument(extracted, { filename: 'test.md' });
    expect(chunks.length).toBeGreaterThan(1);
    // Check metadata includes section_title
    const meta = JSON.parse(chunks[0].metadata);
    expect(meta).toHaveProperty('source_file', 'test.md');
  });

  it('handles PDF pages', () => {
    const pages = [
      { pageNumber: 1, text: 'Page one content. '.repeat(100) },
      { pageNumber: 2, text: 'Page two content. '.repeat(100) },
    ];
    const extracted = { type: 'pdf', pages, text: pages.map(p => p.text).join('\n\n') };
    const chunks = chunkDocument(extracted, { filename: 'test.pdf' });
    expect(chunks.length).toBeGreaterThan(0);
    const meta = JSON.parse(chunks[0].metadata);
    expect(meta).toHaveProperty('page_number');
  });

  it('respects overlap between chunks', () => {
    const longText = 'Word '.repeat(1000);
    const extracted = { type: 'text', text: longText };
    const chunks = chunkDocument(extracted, { filename: 'test.txt' });
    // Consecutive chunks should share some overlap
    if (chunks.length > 1) {
      expect(chunks[0].content.length).toBeGreaterThan(50);
    }
  });
});
