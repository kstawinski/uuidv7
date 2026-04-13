// Pre-computed byte-to-hex lookup table (256 entries).
const HEX: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX[i] = (i < 16 ? '0' : '') + i.toString(16);
}

// Pre-computed byte-pair to 4-char hex lookup table (65536 entries).
// Trades ~1.5MB of runtime memory for a 33% throughput gain:
// 8 lookups + 11 concats instead of 16 lookups + 20 concats.
// The working set in practice is small (timestamp bytes change slowly,
// version/variant are near-constant) so it stays hot in L2 cache.
export const HEX2: string[] = new Array(65536);
for (let i = 0; i < 65536; i++) {
  HEX2[i] = HEX[(i >>> 8) & 0xff] + HEX[i & 0xff];
}

/**
 * Convert a 16-byte Uint8Array to a UUID-formatted string.
 * Uses byte-pair HEX2 table via DataView — 8 lookups + 11 concats.
 */
export function bytesToUuid(b: Uint8Array, dv: DataView): string {
  return (
    HEX2[dv.getUint16(0)] + HEX2[dv.getUint16(2)] + '-' +
    HEX2[dv.getUint16(4)] + '-' +
    HEX2[dv.getUint16(6)] + '-' +
    HEX2[dv.getUint16(8)] + '-' +
    HEX2[dv.getUint16(10)] + HEX2[dv.getUint16(12)] + HEX2[dv.getUint16(14)]
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
