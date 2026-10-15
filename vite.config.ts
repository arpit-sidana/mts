import { defineConfig } from 'vite';

// Relative assets work on both user.github.io and user.github.io/mts/.
export default defineConfig({ base: './', build: { target: 'es2022', chunkSizeWarningLimit: 1800 } });
