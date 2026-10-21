import { writeFile } from 'node:fs/promises';
import { makeGeoPackage, point, line, polygon } from './geopackage-fixture.js';

await writeFile(new URL('../fixtures/vector-multitable.gpkg', import.meta.url), makeGeoPackage([
    { name: 'facilities', geometry: point },
    { name: 'roads', geometry: line },
    { name: 'land_use', geometry: polygon }
]));
