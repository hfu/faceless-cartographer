import { defineConfig } from 'vite';

// Emits to the repo root `docs/` folder so GitHub Pages can serve this
// directly (Settings -> Pages -> Deploy from a branch -> /docs), matching
// hfu/layers-martin and hfu/attachbar's examples/mgrs-pmtiles. See
// DECISIONS.md D18.
export default defineConfig({
  // Relative asset paths -- GitHub project pages serve from
  // https://<user>.github.io/<repo>/, not the domain root.
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'docs',
    emptyOutDir: true
  }
});
