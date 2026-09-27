import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync } from 'node:fs';
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

// Dev: /api wird auf den Express-Server (Port 4000) geproxyt.
export default defineConfig({
  plugins: [copyOrtWasm(), react()],
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
