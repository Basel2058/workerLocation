import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// A static site: `npm run build` writes plain files to dist/ (hosted on Cloudflare Pages).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
});
