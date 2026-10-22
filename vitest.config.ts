import { defineConfig } from 'vitest/config';
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test'), __BUILD_ID__: JSON.stringify('test-build') },
  test: { include: ['src/**/*.test.ts'] },
});
