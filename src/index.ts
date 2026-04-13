import { bytesToUuid, EntropyPool, HEX2 } from './utils.js';

/**
 * Branded type for UUIDv7 strings.
 * Provides compile-time safety to distinguish UUIDv7 values from plain strings.
 */
export type UUIDv7 = string & { readonly __brand: 'UUIDv7' };

/**
 * UUIDv7 object representation with access to raw bytes and extracted timestamp.
 */
export interface UUIDv7Object {
  /** The UUIDv7 as a branded string in canonical 8-4-4-4-12 format */
  readonly value: UUIDv7;
  /** The raw 16-byte representation */
  readonly bytes: Uint8Array;
  /** The embedded Unix timestamp in milliseconds */
  readonly timestamp: number;
}

// ============================================================
// V7Generator: class-based generator for optimal V8 JIT.
//
// V8 optimizes class instances with stable hidden classes far
// better than module-scope let variables. All mutable state is
// kept as instance properties.
// ============================================================

class V7Generator {
  private lastMs = 0;
  private seq = 0;         // 12-bit monotonic counter (rand_a)
  private readonly b = new Uint8Array(16);
  private readonly dv: DataView;
  private readonly pool = new EntropyPool();

  constructor() {
    this.dv = new DataView(this.b.buffer);
  }

  /**
   * Cold path: initialize state for a new millisecond.
   * Writes timestamp, fills random bytes, seeds counter.
   * Separated from generate() so V8 can optimize the hot path independently.
   */
  private newMs(now: number): void {
    this.lastMs = now;
    this.pool.fill10(this.b, 6); // rand_a seed + rand_b
    this.seq = ((this.b[6] & 0x0f) << 8) | this.b[7];

    // Set variant (10xx) once per ms — hot path skips this
    this.b[8] = (this.b[8] & 0x3f) | 0x80;

    // Write 48-bit timestamp
    const b = this.b;
    b[0] = (now / 0x0000_0100_0000_0000) & 0xff;
    b[1] = (now / 0x0000_0001_0000_0000) & 0xff;
    b[2] = (now / 0x0000_0000_0100_0000) & 0xff;
    b[3] = (now / 0x0000_0000_0001_0000) & 0xff;
    b[4] = (now / 0x0000_0000_0000_0100) & 0xff;
    b[5] = now & 0xff;
  }

  /**
   * Handle 12-bit counter overflow.
   * Increments the synthetic timestamp by 1ms and reseeds.
   * This matches RFC 9562 Section 6.2 guidance and avoids spin-waiting,
   * which would cause V8 JIT deoptimization of the entire generate() method.
   */
  private handleOverflow(): void {
    this.lastMs++;
    this.newMs(this.lastMs);
  }

  generate(): UUIDv7 {
    const now = Date.now();

    if (now > this.lastMs) {
      this.newMs(now);
    } else if (++this.seq > 0xfff) {
      this.handleOverflow();
    }

    // Hot path: only write version + counter (timestamp & variant unchanged)
    const b = this.b;
    b[6] = 0x70 | ((this.seq >>> 8) & 0x0f);
    b[7] = this.seq & 0xff;

    // Build UUID string via byte-pair HEX2 table (8 lookups + 11 concats)
    const dv = this.dv;
    return (
      HEX2[dv.getUint16(0)] + HEX2[dv.getUint16(2)] + '-' +
      HEX2[dv.getUint16(4)] + '-' +
      HEX2[dv.getUint16(6)] + '-' +
      HEX2[dv.getUint16(8)] + '-' +
      HEX2[dv.getUint16(10)] + HEX2[dv.getUint16(12)] + HEX2[dv.getUint16(14)]
    ) as UUIDv7;
  }

  generateObj(): UUIDv7Object {
    const value = this.generate();
    const bytes = new Uint8Array(this.b);
    const b = this.b;
    const timestamp =
      b[0] * 0x0000_0100_0000_0000 +
      b[1] * 0x0000_0001_0000_0000 +
      b[2] * 0x0000_0000_0100_0000 +
      b[3] * 0x0000_0000_0001_0000 +
      b[4] * 0x0000_0000_0000_0100 +
      b[5];
    return { value, bytes, timestamp };
  }
}

const _gen = new V7Generator();

/**
 * Generate a UUIDv7 string.
 *
 * Returns a time-ordered, RFC 9562 compliant UUID with:
 * - 48-bit millisecond timestamp
 * - 4-bit version (0111)
 * - 12-bit monotonic counter (rand_a)
 * - 2-bit variant (10)
 * - 62-bit random data (rand_b)
 *
 * Monotonicity is guaranteed within the same millisecond via counter increment.
 */
export function uuidv7(): UUIDv7 {
  return _gen.generate();
}

/**
 * Generate a UUIDv7 and return it as a rich object with the raw bytes and timestamp.
 */
export function uuidv7obj(): UUIDv7Object {
  return _gen.generateObj();
}

/**
 * Validate whether a string is a valid UUIDv7.
 *
 * Checks:
 * - Canonical 8-4-4-4-12 hex format
 * - Version nibble is 7
 * - Variant bits are 10xx
 */
export function isValid(uuid: string): uuid is UUIDv7 {
  if (uuid.length !== 36) return false;

  if (
    uuid[8] !== '-' ||
    uuid[13] !== '-' ||
    uuid[18] !== '-' ||
    uuid[23] !== '-'
  ) {
    return false;
  }

  if (uuid[14] !== '7') return false;

  const v = uuid[19];
  if (v !== '8' && v !== '9' && v !== 'a' && v !== 'b') return false;

  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) continue;
    const c = uuid.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 97 && c <= 102))) return false;
  }

  return true;
}

/**
 * Extract the millisecond timestamp from a UUIDv7 string or byte array.
 * Returns -1 for invalid input.
 */
export function extractTimestamp(input: UUIDv7 | Uint8Array): number {
  if (input instanceof Uint8Array) {
    if (input.length < 6) return -1;
    return (
      input[0] * 0x0000_0100_0000_0000 +
      input[1] * 0x0000_0001_0000_0000 +
      input[2] * 0x0000_0000_0100_0000 +
      input[3] * 0x0000_0000_0001_0000 +
      input[4] * 0x0000_0000_0000_0100 +
      input[5]
    );
  }

  if (!isValid(input)) return -1;
  const hex = input.slice(0, 8) + input.slice(9, 13);
  return parseInt(hex, 16);
}
