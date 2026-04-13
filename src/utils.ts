// Nibble-to-hex character lookup string.
// V8 inlines charAt() on a string constant to a direct character access,
// making this faster than an array-based hex table.
export const DIGITS = '0123456789abcdef';

/**
 * Convert a 16-byte Uint8Array to a UUID-formatted string.
 * Uses charAt on a constant string — V8 optimizes this pattern
 * better than array-based lookup tables.
 */
export function bytesToUuid(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < 16; i++) {
    text += DIGITS.charAt(bytes[i] >>> 4);
    text += DIGITS.charAt(bytes[i] & 0xf);
    if (i === 3 || i === 5 || i === 7 || i === 9) {
      text += '-';
    }
  }
  return text;
}

/**
 * Buffered entropy source.
 *
 * Batches crypto.getRandomValues() calls into a 4096-byte pool,
 * amortizing the syscall cost over ~409 UUID generations.
 */
export class EntropyPool {
  private readonly buf = new Uint8Array(4096);
  private pos = 4096; // force initial fill

  private readonly rng: (buf: Uint8Array) => Uint8Array;

  constructor() {
    const c = (typeof globalThis !== 'undefined'
      ? (globalThis as Record<string, unknown>).crypto as
          { getRandomValues(buf: Uint8Array): Uint8Array } | undefined
      : undefined);

    if (c?.getRandomValues) {
      this.rng = (b) => c.getRandomValues(b);
    } else {
      this.rng = () => {
        throw new Error(
          '@kstawinski/uuidv7: No cryptographic random source available. ' +
          'Ensure globalThis.crypto.getRandomValues is present.'
        );
      };
    }
  }

  /**
   * Copy `len` random bytes into `target` starting at `offset`.
   */
  fill(target: Uint8Array, offset: number, len: number): void {
    if (this.pos + len > 4096) {
      this.rng(this.buf);
      this.pos = 0;
    }
    for (let i = 0; i < len; i++) {
      target[offset + i] = this.buf[this.pos++];
    }
  }
}
