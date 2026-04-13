// Pre-computed byte-to-hex lookup table (256 entries).
// Each byte value maps to its two-character hex representation.
// At ~2.5KB this fits comfortably in L1 cache and halves the number
// of lookups compared to a nibble-based approach (16 vs 32).
export const HEX: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX[i] = (i < 16 ? '0' : '') + i.toString(16);
}

/**
 * Convert a 16-byte Uint8Array to a UUID-formatted string.
 * Unrolled with byte-level HEX table — 16 lookups + 20 concats.
 */
export function bytesToUuid(b: Uint8Array): string {
  return (
    HEX[b[0]] + HEX[b[1]] + HEX[b[2]] + HEX[b[3]] + '-' +
    HEX[b[4]] + HEX[b[5]] + '-' +
    HEX[b[6]] + HEX[b[7]] + '-' +
    HEX[b[8]] + HEX[b[9]] + '-' +
    HEX[b[10]] + HEX[b[11]] + HEX[b[12]] + HEX[b[13]] + HEX[b[14]] + HEX[b[15]]
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
   * Copy 10 random bytes into `target` starting at `offset`.
   * Unrolled for the fixed size needed by UUIDv7 (rand_a + rand_b).
   */
  fill10(target: Uint8Array, offset: number): void {
    if (this.pos + 10 > 4096) {
      this.rng(this.buf);
      this.pos = 0;
    }
    const b = this.buf;
    const p = this.pos;
    target[offset] = b[p];
    target[offset + 1] = b[p + 1];
    target[offset + 2] = b[p + 2];
    target[offset + 3] = b[p + 3];
    target[offset + 4] = b[p + 4];
    target[offset + 5] = b[p + 5];
    target[offset + 6] = b[p + 6];
    target[offset + 7] = b[p + 7];
    target[offset + 8] = b[p + 8];
    target[offset + 9] = b[p + 9];
    this.pos = p + 10;
  }
}
