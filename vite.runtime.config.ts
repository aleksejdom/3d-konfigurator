import { defineConfig, type Plugin } from 'vite';

/**
 * Der DRACOLoader von Three.js verweist auf seine mitgelieferten Decoder-Dateien. Beim Bau einer einzelnen
 * Datei würden sie als Text eingebettet (rund 1,5 MB). Die Seite lädt den Decoder stattdessen bei Bedarf
 * aus dem Ordner draco/, deshalb fallen die Verweise hier weg.
 */
export const stripDracoDefaults: Plugin = {
  name: 'strip-draco-defaults',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('loaders/DRACOLoader.js')) return null;
    return code.replace(/new URL\(\s*'[^']+',\s*import\.meta\.url\s*\)\.toString\(\)/g, "''");
  },
};

// Baut die Laufzeit des HTML/CSS/JavaScript-Exports: Three.js, GSAP und src/core in einer Datei.
// Der Editor legt sie als runtime/player.js in jeden Export, damit die Seite ohne Installation läuft.
export default defineConfig({
  publicDir: false,
  plugins: [stripDracoDefaults],
  build: {
    outDir: 'public/runtime',
    emptyOutDir: false,
    target: 'es2020',
    minify: true,
    lib: { entry: 'src/core/main.js', formats: ['iife'], name: 'Scene3D', fileName: () => 'player.js' },
  },
});
