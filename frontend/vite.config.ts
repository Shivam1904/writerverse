import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { extensionAliases } from './extensions.config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // @writerverse/extensions + @wv (extensions.config.ts)
  resolve: { alias: extensionAliases },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  build: {
    // Pages are lazy-loaded (React.lazy), so the JS splits per page. CSS stays
    // ONE file on purpose: page CSS files were written when everything loaded
    // at once, and splitting it would apply a page's styles only after that
    // page is first opened, which can change how other pages look.
    cssCodeSplit: false,
  },
  server: {
    // Fixed port 5555 via `make dev --app-port` / PORT. strictPort fails loudly
    // instead of silently drifting when the port is taken.
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 5555,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY || 'http://127.0.0.1:8555',
        changeOrigin: true,
        secure: false,
      },
      // Django serves generated portraits at /media/ — forward to the same host.
      '/media': {
        target: process.env.VITE_DEV_API_PROXY || 'http://127.0.0.1:8555',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
