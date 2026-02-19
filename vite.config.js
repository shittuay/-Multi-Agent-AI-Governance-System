import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Restrict dev server to localhost only
    host: 'localhost',
    // Security headers for dev server
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for Vite HMR in dev
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' ws://localhost:3000 wss://localhost:3000 https://*.amazonaws.com",
        "font-src 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable sourcemaps in production (prevents code exposure)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,   // Remove all console.log in production
        drop_debugger: true,  // Remove debugger statements
      },
    },
    rollupOptions: {
      output: {
        // Chunk splitting to avoid large bundles
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['recharts'],
          utils: ['dompurify', 'crypto-js', 'zod', 'date-fns'],
        },
      },
    },
  },
  // Prevent sensitive env vars from being bundled
  // Only VITE_ prefixed vars are exposed to the browser
  envPrefix: 'VITE_',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
