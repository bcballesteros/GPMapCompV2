import { defineConfig } from 'vite';

export default defineConfig({
    base: '/GPMapCompV2/',
    server: {
        open: false,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
});
