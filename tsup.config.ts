import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/v3/index.ts',
  ],
  format: ['esm'],
  target: 'node18',
  shims: true,
  clean: true,
  outDir: 'dist',
  splitting: false,
  dts: true,
  // viem is a peer dependency — do NOT bundle it.
  // The consumer (frontend / backend) provides its own viem instance.
  // This keeps the SDK dist lean (~20-30kB) and avoids bundle duplication.
  external: ['viem'],
});
