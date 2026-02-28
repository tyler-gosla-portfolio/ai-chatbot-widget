/**
 * Mock fixtures for OpenAI API — embeddings and chat completions.
 * Import and use in tests via vi.mock('openai').
 */

/** Returns a deterministic fake embedding vector (1536-dim) */
export function fakeEmbedding(seed = 1) {
  const arr = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    // Simple deterministic values based on seed
    arr[i] = Math.sin(seed * 0.1 + i * 0.01);
  }
  return arr;
}

export function fakeEmbeddingFloat32(seed = 1) {
  return new Float32Array(fakeEmbedding(seed));
}

/** Mock OpenAI embeddings response */
export function mockEmbeddingsResponse(texts, seed = 1) {
  return {
    data: texts.map((_, i) => ({
      index: i,
      embedding: fakeEmbedding(seed + i),
    })),
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: texts.length * 5, total_tokens: texts.length * 5 },
  };
}

/** Creates an async generator that yields fake SSE tokens */
export async function* mockStreamGenerator(content = 'Hello! I am a test response.') {
  const tokens = content.split(' ');
  for (const token of tokens) {
    yield {
      choices: [{ delta: { content: token + ' ' } }],
    };
  }
  // Final chunk with no content
  yield { choices: [{ delta: {} }] };
}

/** Mock OpenAI class */
export class MockOpenAI {
  constructor() {
    this.embeddings = {
      create: async ({ input }) => {
        const texts = Array.isArray(input) ? input : [input];
        return mockEmbeddingsResponse(texts);
      },
    };
    this.chat = {
      completions: {
        create: async ({ stream }) => {
          if (stream) {
            const gen = mockStreamGenerator('This is a mocked AI response for testing.');
            gen.controller = { abort: () => {} };
            return gen;
          }
          return {
            choices: [{ message: { content: 'Mocked response', role: 'assistant' } }],
            usage: { total_tokens: 10 },
          };
        },
      },
    };
  }
}

export default MockOpenAI;
