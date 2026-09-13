import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * One file at a time.
     *
     * Several suites here drive real socket servers, real timers and real
     * network round trips rather than mocks, and they assert that something
     * lands within a deadline. Run in parallel, those files compete for the
     * same cores: a status write that lands in 40ms on its own would sometimes
     * still be pending seconds later, and the suite failed for reasons that had
     * nothing to do with the code under test.
     *
     * The whole suite takes a few seconds either way, so this costs very little
     * and buys a result that can be trusted.
     */
    fileParallelism: false,
    /** Room for a socket test that is genuinely waiting on the network. */
    testTimeout: 20_000,
  },
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json so modules that use it
    // (the socket server and everything it pulls in) are testable.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
