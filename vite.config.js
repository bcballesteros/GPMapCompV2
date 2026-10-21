import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Keep upstream license notices beside the locally emitted reader/runtime assets.
const geoPackageNotices = {
    name: 'geopackage-notices',
    generateBundle() {
        const root = new URL('./node_modules/', import.meta.url);
        const notices = [
            '@ngageoint/geopackage/LICENSE',
            '@ngageoint/geopackage/dist/geopackage.min.js.LICENSE.txt',
            'rtree-sql.js/LICENSE',
            'proj4/LICENSE.md',
            'wkx/LICENSE.txt'
        ].map(path => `${path}\n\n${readFileSync(new URL(path, root), 'utf8')}`).join('\n\n');
        this.emitFile({ type: 'asset', fileName: 'assets/geopackage-NOTICES.txt', source: notices });
        this.emitFile({ type: 'asset', fileName: 'assets/geopackage.min.js.LICENSE.txt', source: readFileSync(new URL('@ngageoint/geopackage/dist/geopackage.min.js.LICENSE.txt', root), 'utf8') });
    }
};

export default defineConfig({
    base: '/GPMapCompV2/',
    plugins: [geoPackageNotices],
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
