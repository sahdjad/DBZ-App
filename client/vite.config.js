import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Die WebAssembly-Laufzeit für die On-Device-Spracherkennung (onnxruntime-web)
// nach public/ort/ kopieren -- sie wird im Worker zur Laufzeit per URL geladen
// (Paket-Exports erlauben keinen direkten Import der .wasm-Datei).
function copyOrtWasm() {
  const copy = () => {
    const from = fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url));
    const dir = fileURLToPath(new URL('./public/ort/', import.meta.url));
    mkdirSync(dir, { recursive: true });
    copyFileSync(from, `${dir}ort-wasm-simd-threaded.wasm`);
  };
  return { name: 'dbz-copy-ort-wasm', config: copy };
}

// Jede Ausgabe bekommt eine eindeutige Versionskennung. Die App vergleicht sie
// mit /api/version und aktualisiert sich selbst (auch als installierte App,
// die sonst nie neu lädt). sw.js erhält dieselbe Kennung -> der Browser
// erkennt den Service Worker als neu und räumt alte Caches auf.
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
function versionFile() {
  return {
    name: 'dbz-version',
    apply: 'build',
    writeBundle(opts) {
      const out = opts.dir || 'dist';
      writeFileSync(join(out, 'version.json'), JSON.stringify({ build: BUILD_ID }));
      const sw = join(out, 'sw.js');
      if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', BUILD_ID));
    },
  };
}

// Dev: /api wird auf den Express-Server (Port 4000) geproxyt.
export default defineConfig({
  plugins: [copyOrtWasm(), react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Geteilte Bibliotheken in einen stabilen, langlebig cachebaren Chunk
        // auslagern (ändert sich selten -> Nutzer laden ihn nur einmal).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
