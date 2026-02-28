import { describe, it, expect } from 'vitest';
import { newId, newKeyId, newDocId, newChunkId, newSessionId, newMessageId, generateApiKey } from '../../src/utils/ids.js';

describe('ids', () => {
  it('generates id with correct prefix', () => {
    expect(newKeyId()).toMatch(/^key_/);
    expect(newDocId()).toMatch(/^doc_/);
    expect(newChunkId()).toMatch(/^chk_/);
    expect(newSessionId()).toMatch(/^ses_/);
    expect(newMessageId()).toMatch(/^msg_/);
  });

  it('generates unique ids', () => {
    const ids = Array.from({ length: 100 }, () => newSessionId());
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });

  it('generates api keys with pk_live_ prefix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^pk_live_[a-f0-9]{48}$/);
  });

  it('generates unique api keys', () => {
    const keys = Array.from({ length: 10 }, () => generateApiKey());
    const unique = new Set(keys);
    expect(unique.size).toBe(10);
  });
});
