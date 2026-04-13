// Nibble-to-hex character lookup string.
// V8 optimizes bracket access on short constant strings to a direct load.
export const DIGITS = '0123456789abcdef';

/**
 * Convert a 16-byte Uint8Array to a UUID-formatted string.
 * Fully unrolled — eliminates the loop overhead and hyphen-position branches
 * that the for-loop version pays on every iteration.
 */
export function bytesToUuid(b: Uint8Array): string {
  const d = DIGITS;
  return (
    d[b[0] >>> 4] + d[b[0] & 0xf] +
    d[b[1] >>> 4] + d[b[1] & 0xf] +
    d[b[2] >>> 4] + d[b[2] & 0xf] +
    d[b[3] >>> 4] + d[b[3] & 0xf] + '-' +
    d[b[4] >>> 4] + d[b[4] & 0xf] +
    d[b[5] >>> 4] + d[b[5] & 0xf] + '-' +
    d[b[6] >>> 4] + d[b[6] & 0xf] +
    d[b[7] >>> 4] + d[b[7] & 0xf] + '-' +
    d[b[8] >>> 4] + d[b[8] & 0xf] +
    d[b[9] >>> 4] + d[b[9] & 0xf] + '-' +
    d[b[10] >>> 4] + d[b[10] & 0xf] +
    d[b[11] >>> 4] + d[b[11] & 0xf] +
    d[b[12] >>> 4] + d[b[12] & 0xf] +
    d[b[13] >>> 4] + d[b[13] & 0xf] +
    d[b[14] >>> 4] + d[b[14] & 0xf] +
    d[b[15] >>> 4] + d[b[15] & 0xf]
  );
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
