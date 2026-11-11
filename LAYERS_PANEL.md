# Unified Map Layers list (Phases 2A and 2B)

Map Layers shows eligible overlays from top to bottom: the first card renders
above lower eligible overlays. Shapefile, GeoJSON, KML, CSV and vector GeoPackage
tables share the list with WMS and Geoportal services. Source labels, statistics,
two-line names, full-name tooltips and visibility / name / Expand / three-dot
controls remain. Sidebar widths and responsive breakpoints are unchanged.
Metadata stays on one line with a full-text tooltip when space is limited.

## Interaction

Drag the small grip at the right of the metadata row. Only this handle is
draggable. At pickup, the browser drag image is captured from the card, then the
same source node is visually hidden and taken out of list flow. The card's old
space closes while a single blank spacer about its height moves between
neighboring cards to show the proposed position. The spacer has no border, fill,
line, label or shadow. The source node remains mounted, preserving its identity,
controls and expanded state.
Pointer updates are batched to animation frames. Rows displaced by the spacer
settle with a short FLIP animation, and a small midpoint hysteresis avoids
repeated reversals when the pointer sits on a boundary. Reduced-motion settings
disable the row animation while retaining the spacer feedback. The drag image
uses the captured card for the native pointer preview. Auto-scroll keeps
updating the target as the sidebar moves.
Previously, JavaScript marked the target card with `layer-drop-before` or
`layer-drop-after`, whose CSS replaced its shadow with a colored edge line. Those
classes and rules are removed; drag feedback now moves a single empty spacer.
Drop above or below any eligible overlay, including hidden or expanded cards.
The sidebar-main scroll container auto-scrolls near its top and bottom edges.
Pointer movement does not reorder cards, redraw the map or rebuild previews.
A valid drop commits once. Outside drops, Escape, window blur and canceled drags
leave map order unchanged. Dropping in the original position is a no-op.

The handle is excluded from keyboard navigation and has no keyboard reorder
commands or announcements. Other layer controls keep their ordinary keyboard
behavior. No arrangement mode, stacking numbers or Move Up/Down controls are
added.

Native HTML drag/drop is verified in desktop Chrome. Touch dragging is not
claimed. Other desktop browsers and assistive technologies need manual
acceptance. Existing CSS hides sidebars at 1024px and
below; this phase keeps that behavior.

## Authoritative OpenLayers order

Phase 2A links cards to records through a WeakMap. Record/layer object identity
survives renaming. topToBottomLayers() reads flattened OpenLayers states, including
inherited group priority, reversing the renderer's stable z-index/collection sort.
Hidden layers remain included. The group listener moves existing DOM nodes,
preserving controls and expansion rather than recreating cards.

Initially rendering is unchanged: WMS uses 100, Geoportal 101, ordinary vectors
usually inherit zero. Collection-only moves cannot override these priorities.
src/map/overlay-order.js validates a complete requested eligible set by object
identity and normalizes explicit overlay z-index into the bounded interval (-1,0),
with the topmost receiving the highest value. Explicit leaf priorities override
inherited group z-index. No layers are recreated, duplicated, removed or moved
between collections, including nested groups.

At the first changed committed reorder, tagged basemaps receive -1. Operational
graphics keep zero or their explicit higher priority. Annotations, drawings,
measurements, selection/editing graphics, sketches and the search marker (999)
therefore remain above overlays. They are excluded from eligible records.
Explicit annotation or unclassified cards stay in Operational Layers without
handles. Basemap replacement still uses collection position zero; replacement
basemaps receive -1 after ordering is activated. Initialization and tools remain
unchanged.

Z-index is the sole authoritative ordering state. Per-map WeakSets record only
whether ordering is activated and whether a commit is in progress. There is no
parallel rank registry, name key, browser storage or backend persistence. Panel
synchronization skips intermediate assignments and runs once on the final
change:overlayorder map event. The existing group observer handles external
changes. A drag whose layer set or effective order changes before confirmation
is canceled rather than applying a stale snapshot.

After activation, addVectorLayer and addWmsLayer insert every new eligible overlay
at the top, including successive GeoPackage tables and WMS/Geoportal services.
Existing relative order remains; normalization stays bounded. Before activation,
Phase 2A insertion behavior is preserved. Renaming changes metadata only. Removal
leaves remaining priorities intact; no ordering registry retains removed layers.
Visibility, opacity, styling, SVG/SLD settings, selection and expansion do not
change order. Data, geometry, projection and view state are untouched.

## Export, Share and legends

The existing shared composition pipeline clones explicit z-index, visibility,
opacity and vector styles. Layer-change listeners coalesce preview refreshes
into one animation frame. A committed reorder uses that path; pointer feedback
does not trigger it. PNG, JPEG, PDF, Export, Share and enlarged bitmap previews
share the same committed priorities. No format-specific stacking or Share
transport changes are needed.

captureOutputLegend() retains the established bottom-to-top drawing order,
which is the reverse of the panel. Its ascending z-index sort responds to
reordering without reversing categories within a layer. Hidden layers and WMS
retain existing exclusions. Names, one heading per layer, symbols, long labels
and multi-column flow remain. Production imports/output cloning use root-level
layers; the ordering utility additionally tests inherited group priorities
without adding nested-group output support.

## Regression coverage

overlay-order.test.js uses real OpenLayers groups for cross-source moves,
inherited/explicit priorities, repeated bounded reorders, invalid/no-op requests,
hidden layers, object/style/opacity preservation, collection stability, insertion,
removal, identity and basemap/operational protection.

layers-panel.browser.test.js exercises production panel/CSS at 1366px and 1100px:
native Chrome mouse pickup/drop through CDP drag interception, repeated synthetic
drops and cancellation, keyboard input not reordering, empty spatial gap
placement and movement, no old highlight styling, gap cleanup, long-list auto-scroll,
FLIP movement during animation and reduced-motion behavior, tooltip lifecycle,
rename/removal, topmost insertion, basemap switching,
operational exclusion and existing controls. An optional LAYERS_SCREENSHOT_PATH
saves a representative panel screenshot.

output-legend.browser.test.js adds overlapping red/blue vectors and synthetic
WMS/Geoportal tiles. It checks live raster pixels, decoded PNG/JPEG/PDF pixels,
both previews and bottom-first legend order after mixed-source transactions.
Services use synthetic tiles; Share tests mock transport and send no email.

Focused PowerShell checks:

```powershell
$env:TEST_LAYERS_BROWSER='1'
$env:TEST_LEGEND_BROWSER='1'
node --test --test-concurrency=1 tests/overlay-order.test.js tests/layer-list-layout.test.js tests/layers-panel.browser.test.js tests/output-legend.browser.test.js
```

Other opt-in regressions use TEST_GPKG_BROWSER, TEST_SLD_BROWSER,
TEST_SVG_MARKER_BROWSER, TEST_COLOR_BROWSER, TEST_POLYGON_BROWSER,
TEST_EXPORT_BROWSER and TEST_PREVIEW_BROWSER, set to 1.

Validation: the focused Node and browser suite passed seven tests with zero
failures. It covers native pointer dragging, keyboard input that leaves order
unchanged, tooltip cleanup on drag/drop/removal, spatial gap placement/movement,
gap cleanup, FLIP animation progress and reduced-motion behavior, top insertion
for each source, layer styling/visibility preservation, output legends and
rendered map/output order. Production build and git diff --check passed; the
known Vite large-chunk
advisory remains. Normal and insertion-gap panel screenshots were visually
inspected. Browser verification uses desktop Chrome, synthetic service tiles and
mocked Share transport. Live service availability, real delivery, touch dragging
and screen-reader behavior
were not manually verified. Interactive annotation/drawing/measurement and
feature-editing acceptance checks remain recommended below; tests protect their
layer exclusion and relative rendering priority.

## Manual acceptance

1. Import overlapping vectors, WMS and Geoportal. Drag each source to top,
   middle and bottom; compare actual rendered overlap with panel order.
2. Repeat with hidden/expanded cards, long names and a scrollable list. Check
   insertion feedback, outside drops, Escape and both auto-scroll boundaries.
3. Verify the drag handle stays out of keyboard navigation and ordinary checkbox,
   expand/collapse, menu and rename controls keep their keyboard behavior.
4. Rename, remove, import multiple GeoPackage tables, switch basemaps, toggle
   visibility, edit opacity and exercise SVG/SLD styling and menus.
5. Draw, annotate, measure, select and edit. Operational graphics must remain
   usable above overlays and must never become draggable cards.
6. Keep Export/Share open during reordering, reopen both, enlarge previews and
   compare PNG/JPEG/PDF. Expect bottom-to-top legend groups with category order
   intact. Verify live services and real Share delivery in the normal deployment.
