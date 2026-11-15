// Small helpers shared by the seed scripts.

// Output goes through process.stdout, not console.log: it is the script's
// interface, not log noise.
export const say = (message = '') => process.stdout.write(`${message}\n`);
export const warn = (message) => process.stderr.write(`${message}\n`);

// An expected failure (stack down, guard tripped, bad flag): `run` prints just the message.
export class SeedError extends Error {}

export async function run(main) {
  const started = Date.now();
  try {
    await main();
    say(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  } catch (error) {
    if (error instanceof SeedError) {
      warn(`\n${error.message}`);
    } else {
      warn(`\nUnexpected error: ${error?.stack ?? error}`);
    }
    process.exitCode = 1;
  }
}

// Runs fn over items, at most `limit` at a time; results keep input order.
// fn should catch its own errors if the caller wants every result.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// `--flag` and `--name=value` only. Unknown flags are an error, so a misspelled
// option name does not silently run the default.
export function parseArgs(argv, { flags = [], values = [] }) {
  const out = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (!arg.startsWith('--')) throw new SeedError(`Unexpected argument "${arg}".`);
    if (flags.includes(key) && value === undefined) out[key] = true;
    else if (values.includes(key) && value !== undefined) out[key] = value;
    else throw new SeedError(`Unknown or malformed option "${arg}".`);
  }
  return out;
}

// fetch with a timeout and an error that names the host instead of "fetch failed".
export async function http(url, init = {}) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(30000), ...init });
  } catch (error) {
    const reason = error?.cause?.code ?? error?.name ?? error?.message;
    throw new SeedError(
      `Could not reach ${new URL(url).origin} (${reason}). Is the local stack up? Try: npm run all`,
      { cause: error }
    );
  }
}
