# Unified Map Layers list (Phase 2A)

Eligible overlay cards share one Map Layers list with a Top → Bottom hint.
Vector, WMS and Geoportal labels appear in the secondary metadata row. Vectors
retain the supplied feature count (formatted with thousands separators); services
show Map Service. No counts are invented when a count is unavailable.

## Architecture

Previously, `layers-panel.js` created source groups, appended cards to each group
body, counted cards and delegated group collapse clicks. Those wrappers, counts,
collapse handlers and associated CSS have been removed. Individual card expansion,
menus, styling handlers and tooltip overflow detection remain in place.

Imports call `addVectorLayer` or `addWmsLayer`, then `addLayerItem`. Each vector
GeoPackage table follows the same path. Source classification reads existing
`isGP`, `isWMS`, geometry flags and `geojson` metadata; it also recognizes empty
and mixed-geometry vectors. Dataset metadata and format values are unchanged.

The existing WMS service assigns z-index 100; Geoportal assigns 101. Ordinary
vectors usually have no explicit z-index. Consequently, upload order alone is
not the effective map order. `topToBottomLayers` reads OpenLayers' flattened
`getLayerStatesArray()`, including inherited group z-index, sorts by descending
effective z-index and descending collection position for ties. This reverses the
renderer’s bottom-to-top drawing sequence. Hidden layers remain included.

Only existing cards are placed in this order: the panel does not enumerate map
layers to create new cards. A WeakMap links each card to its record and OpenLayers
layer object, so renaming a record key cannot change its position. Group change
events update the presentation when collection order or z-index changes elsewhere;
the panel never writes either. The group listener is registered once per observed
group, with the previous listener removed if a subsequent add sees another group.
Order synchronization moves existing DOM nodes only when needed. It does not
rebuild cards or rebind their controls. Duplicate adds for the same record are
ignored. Removal deletes the corresponding card and removes empty list areas;
the original empty-state message returns after the last card is removed.

The header remains visibility, name, Expand, three-dot menu. Metadata spans the
available header grid width below the name and actions. The existing two-line
clamp, ellipsis, tooltip overflow utility, sidebar width variables and responsive
breakpoints are unchanged.

## Included and separate layers

- Included: user-imported Shapefile, GeoJSON, KML, CSV and vector GeoPackage
  tables, including mixed and empty vectors; generic WMS; Geoportal services.
- Separate: basemap selector; text annotations and drawings managed by their
  existing tools; measurement layers; selection highlights, sketches and search
  markers. None acquires a card merely by existing in the map or record store.
- Explicit annotation or unclassified cards requested by a caller retain their
  controls in a separate Operational Layers area. This area is absent when empty.

`layer-manager.js`, `map-init.js`, the record store, annotation/drawing/measurement
tools, selection/editing, SVG behavior, output legend composition and Export/Share
code are unchanged. The panel does not modify geometry, projections, view state,
render order, opacity or visibility as a consequence of sorting.

## Verification

`layer-list-layout.test.js` uses real OpenLayers layer groups to verify z-index,
collection ties, inherited priority, hidden layers, classification and statistics.
`layers-panel.browser.test.js` uses small synthetic features and service objects
to exercise the production panel module and CSS: empty/one/multiple/mixed lists,
interleaved order, live priority changes, DOM identity, duplicate prevention,
visibility, opacity, expansion, menus, zoom, rename, long-name tooltips, internal
layer exclusion, separate operational controls, basemap insertion and removal.
It checks layout at 1366px and 1100px viewport widths. Existing responsive CSS hides
the sidebars at 1024px and below; this phase does not change that behavior.

Run the panel browser test in PowerShell:

```powershell
$env:TEST_LAYERS_BROWSER='1'
node --test tests/layers-panel.browser.test.js
```

An optional `LAYERS_SCREENSHOT_PATH` saves a representative panel screenshot.
Service objects are synthetic; the test does not depend on live service uptime.
Existing GeoPackage browser tests also exercise the complete application in dev
and production, including Shapefile, GeoJSON, KML and CSV imports and rendered
PNG/JPEG/PDF output. Share transport is mocked; no emails are sent by these tests.

Validation for this change: production build passed; the combined Node and
applicable browser suite reported 95 passed, zero failed and one skipped
recipient-specific browser test. The panel test also passed after matching the
fixture's surrounding sidebar padding to the application. A representative
expanded mixed-layer screenshot was visually inspected. `git diff --check`
passed. Vite continues to report its large-chunk advisory.

Manual acceptance checks:

1. Add local vectors, a WMS service and a Geoportal layer. Compare the list with
   effective z-index and map collection order, including hidden layers.
2. Rename a layer to a long name. Check two lines, ellipsis and the full hover or
   keyboard-focus tooltip; check Expand remains before the menu at desktop widths.
3. Exercise visibility, active selection, opacity, styling, Rename, Zoom and Remove.
   Verify that other cards retain their positions and styling controls.
4. Use annotation, drawing, measurement and feature editing tools, switch basemaps,
   then review Export and Share previews and PNG/JPEG/PDF output.

Phase 2A is display-only. No drag handle, drag-and-drop, Move Up/Down, Arrange mode
or permanent stacking numbers are implemented. Live service availability and
real Share delivery require normal manual environment checks.
