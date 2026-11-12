import { defineConfig } from 'vitest/config';

// tsconfig.json has `jsx: preserve` because Next.js compiles JSX itself. Vitest
// reads that setting too and then cannot parse any .tsx a test imports, so tell
// it to compile JSX the way React 19 expects.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node' },
});
