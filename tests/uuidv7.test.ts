import { describe, it, expect } from 'vitest';
import { uuidv7, uuidv7obj, isValid, extractTimestamp, type UUIDv7 } from '../src/index.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7()', () => {
  it('should return a valid UUIDv7 string', () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_REGEX);
    expect(id.length).toBe(36);
  });

  it('should have version 7', () => {
    const id = uuidv7();
    expect(id[14]).toBe('7');
  });

  it('should have variant bits 10xx', () => {
    const id = uuidv7();
    const variant = id[19];
    expect(['8', '9', 'a', 'b']).toContain(variant);
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(uuidv7());
    }
    expect(ids.size).toBe(10_000);
  });

  it('should always produce lowercase hex', () => {
    for (let i = 0; i < 100; i++) {
      const id = uuidv7();
      expect(id).toBe(id.toLowerCase());
    }
  });
});

describe('sortability', () => {
  it('should be lexicographically sortable (IDs generated later sort after earlier ones)', () => {
    const ids: string[] = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(uuidv7());
    }
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('should sort correctly across millisecond boundaries', async () => {
    const id1 = uuidv7();
    await new Promise((r) => setTimeout(r, 5));
    const id2 = uuidv7();
    expect(id1 < id2).toBe(true);
  });
});

describe('monotonicity', () => {
  it('should produce strictly increasing IDs within the same millisecond', () => {
    // Generate a burst of IDs as fast as possible
    const ids: string[] = [];
    for (let i = 0; i < 5000; i++) {
      ids.push(uuidv7());
    }
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i] > ids[i - 1]).toBe(true);
    }
  });

  it('should handle counter rollover gracefully', () => {
    // Generate many IDs in a tight loop - this tests that even if counter
    // overflows, IDs remain unique and ordered
    const ids: string[] = [];
    for (let i = 0; i < 50_000; i++) {
      ids.push(uuidv7());
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(50_000);

    // Verify ordering
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i] > ids[i - 1]).toBe(true);
    }
  });
});

describe('uuidv7obj()', () => {
  it('should return an object with value, bytes, and timestamp', () => {
    const obj = uuidv7obj();
    expect(typeof obj.value).toBe('string');
    expect(obj.bytes).toBeInstanceOf(Uint8Array);
    expect(obj.bytes.length).toBe(16);
    expect(typeof obj.timestamp).toBe('number');
  });

  it('should have a valid UUIDv7 value', () => {
    const obj = uuidv7obj();
    expect(obj.value).toMatch(UUID_REGEX);
    expect(isValid(obj.value)).toBe(true);
  });

  it('should have a timestamp close to Date.now()', () => {
    const before = Date.now();
    const obj = uuidv7obj();
    const after = Date.now();
    // performance.now() fast-path may delay Date.now() sync by up to 1ms
    expect(obj.timestamp).toBeGreaterThanOrEqual(before - 1);
    expect(obj.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('isValid()', () => {
  it('should validate correct UUIDv7 strings', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValid(uuidv7())).toBe(true);
    }
  });

  it('should reject strings with wrong length', () => {
    expect(isValid('too-short')).toBe(false);
    expect(isValid('')).toBe(false);
  });

  it('should reject non-v7 UUIDs', () => {
    // UUIDv4 (version = 4)
    expect(isValid('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('should reject strings with wrong variant', () => {
    // variant bits not 10xx (position 19 = '0')
    expect(isValid('01912345-6789-7abc-0def-0123456789ab')).toBe(false);
  });

  it('should reject strings with invalid hex characters', () => {
    expect(isValid('01912345-6789-7abc-8def-01234567XXXX')).toBe(false);
  });

  it('should reject strings with misplaced hyphens', () => {
    expect(isValid('019123456789-7abc-8def-0123456789ab')).toBe(false);
  });
});

describe('extractTimestamp()', () => {
  it('should extract the correct timestamp from a UUIDv7 string', () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const ts = extractTimestamp(id);
    // performance.now() fast-path may delay Date.now() sync by up to 1ms
    expect(ts).toBeGreaterThanOrEqual(before - 1);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('should extract the correct timestamp from bytes', () => {
    const obj = uuidv7obj();
    const ts = extractTimestamp(obj.bytes);
    expect(ts).toBe(obj.timestamp);
  });

  it('should return -1 for invalid input', () => {
    expect(extractTimestamp('invalid' as UUIDv7)).toBe(-1);
  });
});

describe('collision resistance under high concurrency simulation', () => {
  it('should produce no duplicates across 100k rapid-fire generations', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100_000; i++) {
      set.add(uuidv7());
    }
    expect(set.size).toBe(100_000);
  });
});
