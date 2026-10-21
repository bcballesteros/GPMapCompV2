import runtimeUrl from '@ngageoint/geopackage/dist/geopackage.min.js?url';
import wasmUrl from '@ngageoint/geopackage/dist/sql-wasm.wasm?url';
import { inspectGeoPackage, readGeoPackageTables, validateGeoPackageFile, validateGeoPackageHeader } from './geopackage-reader.js';

let adapter;
let inspection;
let runtime;

self.onmessage = async ({ data: { id, operation, file, tables } }) => {
    try {
        let result;
        if (operation === 'open') {
            validateGeoPackageFile(file);
            const bytes = new Uint8Array(await file.arrayBuffer());
            validateGeoPackageHeader(bytes);
            await import(/* @vite-ignore */ runtimeUrl);
            runtime = self.GeoPackage;
            runtime.setSqljsWasmLocateFile(() => wasmUrl);
            adapter = new runtime.SqljsAdapter(bytes);
            await adapter.initialize();
            inspection = inspectGeoPackage(adapter.getDBConnection());
            result = { ...inspection, tables: inspection.tables.map(({ projection, columns, ...table }) => table) };
        } else if (operation === 'read') {
            if (!adapter || !inspection) throw new Error('Select the GeoPackage again to reopen it.');
            result = readGeoPackageTables(adapter.getDBConnection(), inspection, tables, runtime.GeometryData);
            adapter.close();
            adapter = null;
            inspection = null;
        } else throw new Error('Unsupported GeoPackage operation.');
        self.postMessage({ id, result });
    } catch (error) {
        try { adapter?.close(); } catch { /* Worker termination also frees WASM memory. */ }
        adapter = null;
        inspection = null;
        self.postMessage({ id, error: error.message || 'GeoPackage could not be read. Try exporting it again from a GIS.' });
    }
};
