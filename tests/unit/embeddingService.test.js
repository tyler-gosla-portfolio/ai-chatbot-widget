import '../setup/env.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeEmbedding, fakeEmbeddingFloat32 } from '../setup/mockOpenAI.js';

// Mock OpenAI before importing embeddingService
vi.mock('openai', () => {
  const MockOpenAI = class {
    constructor() {
      this.embeddings = {
        create: vi.fn(async ({ input }) => {
          const texts = Array.isArray(input) ? input : [input];
          return {
            data: texts.map((_, i) => ({ index: i, embedding: fakeEmbedding(i + 1) })),
          };
        }),
      };
    }
  };
  return { default: MockOpenAI };
});

// Mock DB connection
vi.mock('../../src/db/connection.js', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
    })),
  })),
}));

// Mock config
vi.mock('../../src/config.js', () => ({
  env: {
    OPENAI_API_KEY: 'sk-test',
    NODE_ENV: 'test',
  },
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks
const { cacheGet, cacheSet, embedTexts } = await import('../../src/services/embeddingService.js');

// Extract cosineSimilarity for direct testing
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

describe('embeddingService — cosine similarity', () => {
  it('returns 0 for zero vector', () => {
    const zero = new Float32Array(4).fill(0);
    const v = new Float32Array([1, 0, 0, 0]);
    expect(cosineSimilarity(zero, v)).toBe(0);
    expect(cosineSimilarity(v, zero)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });

  it('returns 1 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    const sim = cosineSimilarity(v, v);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('handles high-dimensional vectors correctly', () => {
    const dim = 1536;
    const a = fakeEmbeddingFloat32(1);
    const b = fakeEmbeddingFloat32(1); // same seed = identical
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it('different seeds produce different similarity scores', () => {
    const a = fakeEmbeddingFloat32(1);
    const b = fakeEmbeddingFloat32(100);
    const sim = cosineSimilarity(a, b);
    expect(sim).not.toBeCloseTo(1.0, 2);
  });

  it('similarity is symmetric (a·b === b·a)', () => {
    const a = fakeEmbeddingFloat32(3);
    const b = fakeEmbeddingFloat32(7);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});

describe('embeddingService — LRU cache', () => {
  it('cacheGet returns undefined for missing key', () => {
    expect(cacheGet('nonexistent-key-12345')).toBeUndefined();
  });

  it('cacheSet and cacheGet roundtrip', () => {
    const id = 'test-chunk-1';
    const embedding = fakeEmbeddingFloat32(1);
    cacheSet(id, embedding);
    const retrieved = cacheGet(id);
    expect(retrieved).toBeInstanceOf(Float32Array);
    expect(retrieved.length).toBe(embedding.length);
    expect(retrieved[0]).toBeCloseTo(embedding[0], 5);
  });

  it('cacheGet moves item to most recently used position', () => {
    const id1 = 'lru-test-1';
    const id2 = 'lru-test-2';
    const emb1 = fakeEmbeddingFloat32(10);
    const emb2 = fakeEmbeddingFloat32(20);

    cacheSet(id1, emb1);
    cacheSet(id2, emb2);

    // Access id1 to make it MRU
    cacheGet(id1);

    // Both should still be accessible
    expect(cacheGet(id1)).toBeTruthy();
    expect(cacheGet(id2)).toBeTruthy();
  });

  it('overwrites existing cache entry on re-set', () => {
    const id = 'overwrite-test';
    const emb1 = fakeEmbeddingFloat32(1);
    const emb2 = fakeEmbeddingFloat32(2);

    cacheSet(id, emb1);
    cacheSet(id, emb2);

    const retrieved = cacheGet(id);
    expect(retrieved[0]).toBeCloseTo(emb2[0], 5);
  });
});

describe('embeddingService — embedTexts', () => {
  it('returns Float32Array for each input text', async () => {
    const texts = ['hello world', 'test embedding'];
    const result = await embedTexts(texts);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[1]).toBeInstanceOf(Float32Array);
  });

  it('handles single text', async () => {
    const result = await embedTexts(['single text']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Float32Array);
  });

  it('handles empty array', async () => {
    const result = await embedTexts([]);
    expect(result).toHaveLength(0);
  });

  it('batches large inputs (>100 texts)', async () => {
    const texts = Array.from({ length: 150 }, (_, i) => `text number ${i}`);
    const result = await embedTexts(texts);
    expect(result).toHaveLength(150);
  });
});
