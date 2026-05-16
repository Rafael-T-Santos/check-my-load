import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api-local': {
        target: 'http://192.168.255.6:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-local/, '')
      }
    }
  },
  plugins: [
    react(),
    // HTTPS só no build de produção (Docker/nginx). Em dev local o localhost
    // já tem permissão de câmera via HTTP e evita erro de mixed-content com a API.
    ...(mode !== 'development' ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));