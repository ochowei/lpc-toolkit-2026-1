import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  define: { __LPC_CLI_VERSION__: JSON.stringify('0.2.0') },
  resolve: {
    alias: {
      // Match vite.config.ts so tests read core's source directly.
      '@lpc-toolkit/core': fileURLToPath(
        new URL('../core/src/index.ts', import.meta.url),
      ),
      '@lpc-toolkit/presets': fileURLToPath(
        new URL('../presets/src/index.ts', import.meta.url),
      ),
      '@lpc-toolkit/asset-pack-format': fileURLToPath(
        new URL('../asset-pack-format/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
