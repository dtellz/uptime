import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // The complete local WebGL engine is about 132 KB after gzip.
    chunkSizeWarningLimit: 650,
    rollupOptions: { output: { manualChunks: (id) => id.includes('/node_modules/three/') ? 'three' : undefined } },
  },
});
