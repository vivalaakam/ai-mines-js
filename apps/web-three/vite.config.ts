import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['better-sqlite3'],
  },
});
