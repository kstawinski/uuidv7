import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { uuidv7, uuidv7obj } from '../src/index.js';

/**
 * Fair benchmark methodology:
 *
 * 1. --isolated: each library runs in its own child process with --expose-gc
 *    to avoid GC/JIT/thermal cross-contamination.
 * 2. Dead-code elimination prevented by writing results to `sink`.
 * 3. Generous warmup (500k iters) for V8 steady-state JIT.
 * 4. 5 rounds with median selection for stable results.
 */

let sink: unknown = '';

function measureInProcess(
  fn: () => unknown,
  iterations = 5_000_000,
  rounds = 5,
): number {
  for (let i = 0; i < 500_000; i++) sink = fn();
  if (typeof globalThis.gc === 'function') globalThis.gc();

  const timings: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) sink = fn();
    timings.push((performance.now() - start) * 1_000_000 / iterations);
    if (typeof globalThis.gc === 'function') globalThis.gc();
  }

  timings.sort((a, b) => a - b);
  return timings[Math.floor(timings.length / 2)];
}

interface BenchResult {
  name: string;
  nsPerOp: number;
  opsPerSec: number;
}

function measureIsolated(name: string, importCode: string): BenchResult | null {
  const script = `
import { performance } from 'node:perf_hooks';
let sink = '';
function measure(fn, iterations = 5000000, rounds = 5) {
  for (let i = 0; i < 500000; i++) sink = fn();
  if (typeof globalThis.gc === 'function') globalThis.gc();
  const timings = [];
  for (let r = 0; r < rounds; r++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) sink = fn();
    timings.push((performance.now() - start) * 1000000 / iterations);
    if (typeof globalThis.gc === 'function') globalThis.gc();
  }
  timings.sort((a, b) => a - b);
  return timings[Math.floor(timings.length / 2)];
}
${importCode}
if (typeof sink === 'undefined') console.log('never');
`;

  const tmpFile = join(process.cwd(), `.bench-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  try {
    writeFileSync(tmpFile, script);
    const output = execSync(
      `node --expose-gc ${tmpFile}`,
      { encoding: 'utf-8', timeout: 120_000, cwd: process.cwd() },
    ).trim();
    const nsPerOp = parseFloat(output);
    if (isNaN(nsPerOp)) return null;
    return { name, nsPerOp, opsPerSec: Math.round(1_000_000_000 / nsPerOp) };
  } catch {
    return null;
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

async function main() {
  const isolated = process.argv.includes('--isolated');

  console.log('=== @kstawinski/uuidv7 Benchmark ===');
  console.log(`Mode: ${isolated ? 'isolated (child process per lib, --expose-gc)' : 'in-process (5 rounds, median)'}`);
  if (!isolated) console.log('Tip: run with --isolated for fairer cross-library comparison');
  console.log();

  const results: BenchResult[] = [];

  if (isolated) {
    const libs: [string, string][] = [
      ['@kstawinski/uuidv7',
       `import { uuidv7 } from './dist/index.js';\nconsole.log(measure(() => uuidv7()));`],
      ['@kstawinski/uuidv7 (obj)',
       `import { uuidv7obj } from './dist/index.js';\nconsole.log(measure(() => uuidv7obj()));`],
      ['uuid (v7)',
       `import { v7 } from 'uuid';\nconsole.log(measure(() => v7()));`],
      ['nanoid',
       `import { nanoid } from 'nanoid';\nconsole.log(measure(() => nanoid()));`],
      ['uuidv7 (npm)',
       `import { uuidv7 } from 'uuidv7';\nconsole.log(measure(() => uuidv7()));`],
    ];

    for (const [name, code] of libs) {
      const r = measureIsolated(name, code);
      if (r) results.push(r);
      else console.log(`  "${name}" not installed — skipping`);
    }
  } else {
    const add = (name: string, ns: number) =>
      results.push({ name, nsPerOp: ns, opsPerSec: Math.round(1e9 / ns) });

    add('@kstawinski/uuidv7', measureInProcess(() => uuidv7()));
    add('@kstawinski/uuidv7 (obj)', measureInProcess(() => uuidv7obj()));

    try { const m = await import('uuid');
      add('uuid (v7)', measureInProcess(() => m.v7()));
    } catch { console.log('  "uuid" not installed — skipping'); }

    try { const { nanoid } = await import('nanoid');
      add('nanoid', measureInProcess(() => nanoid()));
    } catch { console.log('  "nanoid" not installed — skipping'); }

    try { const m = await import('uuidv7');
      add('uuidv7 (npm)', measureInProcess(() => m.uuidv7()));
    } catch { console.log('  "uuidv7" not installed — skipping'); }
  }

  console.log(
    '| Implementation'.padEnd(35) + '| ops/sec'.padEnd(18) + '| avg (ns) |',
  );
  console.log('|' + '-'.repeat(34) + '|' + '-'.repeat(17) + '|----------|');

  for (const r of results) {
    console.log(
      `| ${r.name.padEnd(33)}| ${r.opsPerSec.toLocaleString().padStart(15)} | ${r.nsPerOp.toFixed(1).padStart(8)} |`,
    );
  }

  if (!isolated && typeof sink === 'undefined') console.log('never');
}

main().catch(console.error);
