import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Root is the project directory (where index.html lives)
  root: '.',

  // Base path for assets — './' allows loading via file:// in Electron and http:// in web
  base: './',

  // Dev server config
  server: {
    port: 5173,
    strictPort: true,
    open: false
  },

  plugins: [
    {
      name: 'copy-static-assets',
      closeBundle() {
        const { cpSync, existsSync } = require('fs');
        const { resolve } = require('path');
        const root = resolve(__dirname);
        const dist = resolve(__dirname, 'dist');

        if (existsSync(resolve(root, 'js'))) {
          cpSync(resolve(root, 'js'), resolve(dist, 'js'), { recursive: true });
        }
        if (existsSync(resolve(root, 'assets'))) {
          cpSync(resolve(root, 'assets'), resolve(dist, 'assets'), { recursive: true });
        }
        if (existsSync(resolve(root, 'auth.html'))) {
          const { copyFileSync } = require('fs');
          copyFileSync(resolve(root, 'auth.html'), resolve(dist, 'auth.html'));
        }
        for (const file of ['app.html', 'downloads.js', 'landing.js']) {
          if (!existsSync(resolve(root, file))) continue;
          const { copyFileSync } = require('fs');
          copyFileSync(resolve(root, file), resolve(dist, file));
        }
        console.log('[vite-copy] Copied app assets, auth callback, and landing scripts to dist/.');
      }
    }
  ],

  // Build config
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Keep asset filenames stable for Electron
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        download: resolve(__dirname, 'download/index.html')
      }
    },
    // Don't hash asset filenames (needed for Electron static loading)
    assetsDir: 'assets',
    // Copy public assets
    copyPublicDir: true
  },

  // Public directory (copied as-is to dist)
  publicDir: false, // We handle assets manually since they're already in the root

  // Resolve aliases
  resolve: {
    alias: {
      '@': resolve(__dirname, 'js'),
      '@components': resolve(__dirname, 'js/components'),
      '@views': resolve(__dirname, 'js/views'),
      '@api': resolve(__dirname, 'js/api'),
      '@utils': resolve(__dirname, 'js/utils')
    }
  }
});
