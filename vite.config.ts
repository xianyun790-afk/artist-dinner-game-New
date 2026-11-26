import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const localRecognition = 'http://127.0.0.1:4893';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      '^/api/local-asr/(status|transcribe)$': {
        target: localRecognition,
        changeOrigin: true,
        headers: { Origin: localRecognition },
        proxyTimeout: 25_000,
        bypass(request) {
          const { host, origin } = request.headers;
          // Only forward requests from this loopback game's own page.
          if (!host || !/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/i.test(host)) return false;
          if (origin && origin !== 'http://' + host) return false;
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        cafe: fileURLToPath(new URL('./cafe.html', import.meta.url)),
      },
    },
  },
});
