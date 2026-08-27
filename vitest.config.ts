import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json so modules that use it
    // (the socket server and everything it pulls in) are testable.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
