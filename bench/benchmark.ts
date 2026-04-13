import { performance } from 'node:perf_hooks';
import { uuidv7, uuidv7obj } from '../src/index.js';

// Manual timing loop with DCE prevention for accurate results.
// tinybench can report inflated numbers when V8 eliminates unused return values.
let sink: unknown = '';

function measure(
  name: string,
  fn: () => unknown,
  iterations = 5_000_000,
): { name: string; nsPerOp: number; opsPerSec: number } {
  // Warmup
  for (let i = 0; i < 200_000; i++) sink = fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) sink = fn();
  const elapsed = performance.now() - start;

  const nsPerOp = (elapsed * 1_000_000) / iterations;
  const opsPerSec = Math.round(1_000_000_000 / nsPerOp);
  return { name, nsPerOp, opsPerSec };
}

async function main() {
  console.log('=== @kstawinski/uuidv7 Benchmark ===\n');

  const results: ReturnType<typeof measure>[] = [];

  // Our library
  results.push(measure('@kstawinski/uuidv7', () => uuidv7()));
  results.push(measure('@kstawinski/uuidv7 (obj)', () => uuidv7obj()));

  // Competitors (loaded dynamically)
  try {
    const m = await import('uuid');
    results.push(measure('uuid (v7)', () => m.v7()));
  } catch {
    console.log('  "uuid" not installed — skipping');
  }

  try {
    const { nanoid } = await import('nanoid');
    results.push(measure('nanoid', () => nanoid()));
  } catch {
    console.log('  "nanoid" not installed — skipping');
  }

  try {
    const m = await import('uuidv7');
    results.push(measure('uuidv7 (npm)', () => m.uuidv7()));
  } catch {
    console.log('  "uuidv7" not installed — skipping');
  }

  // Print table
  console.log(
    '| Implementation'.padEnd(35) +
      '| ops/sec'.padEnd(18) +
      '| avg (ns) |',
  );
  console.log('|' + '-'.repeat(34) + '|' + '-'.repeat(17) + '|----------|');

  for (const r of results) {
    const ops = r.opsPerSec.toLocaleString();
    const ns = r.nsPerOp.toFixed(1);
    console.log(
      `| ${r.name.padEnd(33)}| ${ops.padStart(15)} | ${ns.padStart(8)} |`,
    );
  }

  // Prevent DCE
  if (typeof sink === 'undefined') console.log('never');
}

main().catch(console.error);
