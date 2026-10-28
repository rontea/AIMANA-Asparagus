
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, path.resolve('.'), '');
  
  const FRONTEND_PORT = parseInt(env.FRONTEND_PORT || '3000');
  const BACKEND_PORT = parseInt(env.PORT || env.BACKEND_PORT || '3001');

  // Only expose values that are intentionally public in browser code.
  // Provider credentials and server settings must never be copied into the bundle.
  const browserEnvKeys = ['GOOGLE_CLIENT_ID', 'GOOGLE_API_KEY'] as const;
  const browserEnvDefines = browserEnvKeys.reduce<Record<string, string>>((prev, key) => {
    prev[`process.env.${key}`] = JSON.stringify(env[key] || '');
    return prev;
  }, {});

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
    define: browserEnvDefines,
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      css: true,
      include: ['**/*.{test,spec}.{ts,tsx}'],
      exclude: ['server/**', 'node_modules/**', 'dist/**', '.tmp/**']
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            utils: ['uuid', 'otpauth', 'qrcode', 'lucide-react', '@google/genai']
          }
        }
      }
    },
    server: {
      port: FRONTEND_PORT,
      open: env.VITE_OPEN === 'false' ? false : true,
      watch: {
        ignored: [
          '**/storage/**',
          '**/.codex-logs/**',
          '**/dist/**'
        ]
      },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${BACKEND_PORT}`,
          changeOrigin: true,
          secure: false,
          timeout: 0,
          proxyTimeout: 0,
        },
        '/storage': {
          target: `http://127.0.0.1:${BACKEND_PORT}`,
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: `http://127.0.0.1:${BACKEND_PORT}`,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});
