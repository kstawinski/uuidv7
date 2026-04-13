# @kstawinski/uuidv7

Ultra-fast, zero-dependency UUIDv7 generator for TypeScript & JavaScript. Fully compliant with [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562).

## Why UUIDv7?

UUIDv7 embeds a Unix millisecond timestamp in the most significant bits, making identifiers:

- **Database-friendly** — naturally ordered IDs reduce B-tree page splits and improve index locality in PostgreSQL, MySQL, SQLite, and every other engine that uses clustered indexes.
- **Lexicographically sortable** — IDs generated later always sort after earlier ones (`ORDER BY id` = `ORDER BY created_at`).
- **RFC 9562 compliant** — the IETF standard successor to RFC 4122, designed to replace UUIDv1/v4 for modern applications.
- **Monotonic** — multiple IDs generated in the same millisecond are guaranteed to be strictly increasing.

## Features

- **Performance first** — 33M+ ops/sec (~30ns/op). Cached string segments, pre-computed counter table, entropy pooling, class-based V8 hidden-class optimization, minimal GC pressure. 3.5x faster than nanoid, 9x faster than uuidv7 npm.
- **Monotonicity guaranteed** — implements RFC 9562 Section 6.2 (fixed-length dedicated counter bits + random).
- **Zero dependencies** — no runtime dependencies, ever.
- **Dual format** — ships ESM and CommonJS builds via `tsup`.
- **Type-safe** — branded `UUIDv7` type prevents mixing with plain strings at compile time.
- **Universal** — works in Node.js 18+, all modern browsers, Cloudflare Workers, Bun, and Deno.

## Installation

```bash
# npm
npm install @kstawinski/uuidv7

# pnpm
pnpm add @kstawinski/uuidv7

# yarn
yarn add @kstawinski/uuidv7

# bun
bun add @kstawinski/uuidv7
```

## Usage

### Generate a UUIDv7 string

```ts
import { uuidv7 } from '@kstawinski/uuidv7';

const id = uuidv7();
// => '019078e5-5c3a-7d1e-8f4a-3b9c0e1d2a5f'
```

### Generate a UUIDv7 object (with raw bytes & timestamp)

```ts
import { uuidv7obj } from '@kstawinski/uuidv7';

const obj = uuidv7obj();
console.log(obj.value);     // '019078e5-5c3a-7d1e-8f4a-3b9c0e1d2a5f'
console.log(obj.bytes);     // Uint8Array(16) [...]
console.log(obj.timestamp); // 1718012345678
```

### Validate a UUIDv7

```ts
import { isValid } from '@kstawinski/uuidv7';

isValid('019078e5-5c3a-7d1e-8f4a-3b9c0e1d2a5f'); // true
isValid('not-a-uuid');                              // false
isValid('550e8400-e29b-41d4-a716-446655440000');    // false (v4, not v7)
```

### Extract the timestamp

```ts
import { uuidv7, extractTimestamp } from '@kstawinski/uuidv7';

const id = uuidv7();
const ms = extractTimestamp(id);
console.log(new Date(ms)); // => 2025-06-10T12:00:00.000Z
```

### Type Safety with Branded Types

```ts
import { uuidv7, isValid, type UUIDv7 } from '@kstawinski/uuidv7';

function getUser(id: UUIDv7) {
  // Only accepts validated UUIDv7 values
}

const id = uuidv7(); // type: UUIDv7 ✅
getUser(id);

const raw = 'some-string';
// getUser(raw); // TS error: string is not assignable to UUIDv7 ❌

if (isValid(raw)) {
  getUser(raw); // Narrowed to UUIDv7 ✅
}
```

## Benchmarks

Run benchmarks locally:

```bash
npm run bench
```

<!-- BENCHMARK_RESULTS_START -->

| Implementation | ops/sec | avg (ns) | Relative |
|---|---|---|---|
| **@kstawinski/uuidv7** | **33,848,789** | **30** | **1.0x (baseline)** |
| nanoid | 9,761,987 | 102 | 0.29x (not a UUID) |
| uuidv7 (npm) | 3,659,555 | 273 | 0.11x |
| uuid v7 | 1,168,160 | 856 | 0.03x |

<!-- BENCHMARK_RESULTS_END -->

> Apple M-series, Node.js v24. Results will vary by hardware. Run `npm run bench` to get numbers for your machine.

## API Reference

### `uuidv7(): UUIDv7`

Generate a UUIDv7 string in canonical `8-4-4-4-12` format. Returns a branded `UUIDv7` type.

### `uuidv7obj(): UUIDv7Object`

Generate a UUIDv7 and return a rich object:

```ts
interface UUIDv7Object {
  value: UUIDv7;        // The UUID string
  bytes: Uint8Array;    // Raw 16-byte representation
  timestamp: number;    // Embedded Unix timestamp (ms)
}
```

### `isValid(uuid: string): uuid is UUIDv7`

Type guard that validates format, version (7), and variant (RFC) bits.

### `extractTimestamp(input: UUIDv7 | Uint8Array): number`

Extract the 48-bit millisecond timestamp. Returns `-1` for invalid input.

### `type UUIDv7 = string & { readonly __brand: 'UUIDv7' }`

Branded type for compile-time safety.

## License

MIT
