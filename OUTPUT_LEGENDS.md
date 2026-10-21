# Phase 3: automatic Export and Share legends

PNG, JPEG and PDF automatically include a measured legend panel to the right of
the map when at least one eligible uploaded vector layer is visible. Export,
Share and both modal previews use the same complete composition. There is no
legend visibility control.

## Inclusion and ordering

- Supported homogeneous geometry families: Point/MultiPoint,
  LineString/MultiLineString, Polygon/MultiPolygon.
- Eligibility comes from managed vector legend descriptors and the captured
  OpenLayers layer visibility at the live view, including resolution/zoom gates.
  Visibility is captured before the output resolution increases.
- Hidden layers, WMS legends, annotations and unsupported mixed geometry
  collections have no legend groups. Visible WMS content stays in the map.
- Groups follow ascending configured z-index, preserving map collection order
  for ties. Renaming and reordering are reflected on the next generation.
- Each layer has its own heading. Entries retain descriptor order: configured
  category order or imported SLD rule order, including unused/out-of-view rules.
  Generated polygon categories retain their Missing value and Other / unmapped
  entries. Categories from separate layers are never merged.
- With no eligible groups, the original map and footer dimensions are retained;
  no empty panel or Legend heading is created.

## Shared rendering architecture

`src/tools/export-share.js` retains the existing detached OpenLayers output map,
tile readiness observer, bounded retry, viewport canvas capture, encoding,
downloads and Share submission. It captures the view, effective per-feature
native styles, cloned features, layer options, tile source parameters, CRS/date
and plain legend descriptors synchronously before asynchronous rendering.
Native style clones are shared within each snapshot rather than duplicated per
feature. Visibility and style changes during loading do not change that output.
Temporary maps, targets, layers and owned sources are disposed on success/failure;
live sources stay owned by the application.

`src/services/output-legend.js` obtains its data through
`getManagedLayerLegendDescriptors`, the same source as the Layers panel. It does
not parse SLD or create category/color assignments. It reuses
`renderPolygonLegendSymbol` and `renderImportedVectorLegendSymbol`, including
their shared polygon raster pattern tiles and native OpenLayers point compiler.
Runtime images/canvases are separate from the captured descriptor data. Embedded
SVGs are decoded as isolated images, never inserted as executable HTML. External
marker URLs are not loaded. Unavailable manual marker previews display
“Unavailable” next to the preserved category label.

- Polygons: ordered solid fills and pattern overlays, fill/layer/paint opacity,
  hatch and times tiles, boundary color/width, and Show Stroke. Disabling the
  boundary does not disable interior pattern-mark strokes.
- Lines: ordered casings, effective color/opacity, dash arrays and cap/join
  settings. Extremely wide strokes are fitted together to the sample viewport
  with relative widths preserved; manual sample widths are bounded for readability.
- Points: default circles, presets and embedded custom SVGs; native imported
  marks retain layered fills/strokes, rotation and graphic opacity. Samples fit a
  consistent viewport and preserve their image aspect ratios. Map marker sizes
  and map stroke widths are unchanged.
- Separate OpenLayers layer opacity is applied to the assembled sample in
  addition to the effective symbol opacity already present in descriptors.

## Layout, resolution and limits

`src/services/output-legend-layout.js` measures headings and labels before
allocating the composed output. Column widths adapt to the map width within
340–440 output pixels. Labels wrap, including unbroken words and Unicode text.
Entry text stays at 18px, layer headings at 20px and the Legend heading at 26px.
Symbols have their own 48 × 34px viewport and cannot overlap text.

Entries flow downward through up to three columns to the right of the unchanged
map area. A group heading repeats only when that group continues into another
column. If three columns are insufficient, the composition gains height at the
same font size; the space beneath the map remains neutral white. Entries and
labels are never silently truncated. Limits are 8,192 pixels per dimension and
24 million pixels for the complete composition. Exceeding these limits gives an
actionable error in Export, Share and previews: hide some layers or shorten
category labels. These bounds limit raster allocation, not total process memory;
large feature snapshots and browser raster copies still consume additional RAM.

The map keeps its existing 2,560px long-edge target and aspect ratio; the legend
does not reduce map resolution or stretch its geography. Center, resolution and
rotation are captured together; output resolution scales uniformly. The north
arrow remains inside the map area. The existing CRS/date footer spans the final
composition beneath both map and legend.

Two existing rotation issues were corrected within output composition: fitting
an already rotated extent caused an extra zoom-out, and multiplying OpenLayers'
canvas transform by its rotated bounding-box dimensions distorted geographic
positions. The renderer now uses the captured center/resolution and OpenLayers'
pixel transform directly. A browser landmark check verifies rotated positions
and unchanged live extent; a resolution-gated layer check verifies eligibility.

PNG remains lossless; JPEG retains existing quality settings. PDF retains the
existing single-page raster PDF encoder and uses the full composed dimensions.
**PDF continuation pages are not implemented**: PDF uses the same columns,
additional height and explicit resource limits as PNG/JPEG.

## Previews and asynchronous behavior

Both existing preview containers display the complete output canvas, fitted
without clipping. Preview refreshes track map movement, layer changes,
add/remove, styling and managed record changes such as rename. Multiple pending
refreshes coalesce; obsolete results cannot replace the current preview. Hidden
modals do not trigger background refreshes. Small previews may require opening
the generated artifact to inspect a very long legend at full size.

Tile/image readiness still uses render events and confirmed completed frames,
with the existing bounded retry on rendering errors. Legend images complete
loading before encoding. A loading deadline reports failure or an unavailable
manual marker; fixed sleeps are not used to establish rendering readiness.

## Share email refinement

Only these phrases changed in both HTML and plain text:

- “A map output has been shared…” → “A map has been shared…”
- “Shared maps are static snapshots…” → “Shared maps are snapshots…”

Branding, logo, action button, disclaimer remainder, footer, recipient-specific
secure links, delivery handling, API and database schema remain unchanged.

## Verification and scope

Before output implementation, the existing Phase 2C browser fixture and vector
unit tests passed (13 tests). Small synthetic Point/MultiPoint and
LineString/MultiLineString features exercised the managed upload result,
local SLD file-input import, native map paint, initial Layers panel legends,
manual/imported switching, opacity, unsupported-construct rejection and failed
import preservation. Polygon import/pattern checks also passed. No Phase 2C
defect required correction. These fixtures do not certify every real-world SLD
or every dataset file-upload format.

The new browser fixture verifies each supported geometry, hidden/WMS exclusion,
WMS map pixels, mixed layers, unused rule preservation, ordered symbolizers,
patterns, stroke disabling, presets, custom SVG, asynchronous state changes,
all Export/Share formats, both previews, rename/reorder, 155 wrapped entries,
resource-limit UI errors and temporary target cleanup. Share HTTP responses are
mocked; no production email is sent. Existing server tests cover actual local
SMTP capture, email branding/wording, recipient records and secure links.

The full regression run completed with **89 passing tests, zero failures and one
skipped optional live Share retrieval test** (requires `TEST_SHARE_SERVER_PORT`).
All six browser test suites were enabled. `npm run build` and `git diff --check`
passed; Vite reported its existing large-bundle advisory. The mixed-layer PNG
was also inspected visually for grouped symbols, patterns, north arrow and footer.

PowerShell verification commands:

```powershell
$env:TEST_SLD_BROWSER='1'
$env:TEST_POLYGON_BROWSER='1'
$env:TEST_COLOR_BROWSER='1'
$env:TEST_EXPORT_BROWSER='1'
$env:TEST_RECIPIENT_BROWSER='1'
$env:TEST_LEGEND_BROWSER='1'
node --test --test-concurrency=1 tests/*.test.js server/tests/*.test.js
npm run build
git diff --check
```

Optional: set `LEGEND_SCREENSHOT_PATH` to save the browser fixture's mixed-layer
composition as a PNG for inspection. Fixtures are synthetic and small.

## Visual fidelity limits and Phase 4 recommendations

Legend glyphs normalize display size; they are representative samples rather
than map-scale measurements. Very thick lines are fitted into their viewport.
Line joins are retained in the symbol properties but a straight sample does not
exhibit corner joins. Browser/font rasterization and JPEG/PDF compression may
produce small visual differences; PDF text is rasterized. Custom SVG whitespace
inside its own viewBox remains part of that marker. WMS legend generation,
additional external style formats and GeoServer runtime dependencies are absent.

For Phase 4, inspect representative real SLDs (including the 55-rule Camiguin
reference), real upload formats, large feature counts, extreme aspect ratios,
rotation, high-DPI displays, supported browsers and PDF viewers/printing. Test
real CORS/network behavior and approved end-to-end multi-recipient delivery
against a staging backend, including attachments near the unchanged 32MiB Share
file limit. Review small modal previews and near-limit legends on lower-memory
devices. No commits or pushes are part of Phase 3.

## Integration verification (2026-10-20)

The subsequent integration review is recorded in
[INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md). The existing column
placement algorithm passed the focused boundary/overflow cases and was retained.
The only application correction was in `src/services/export-service.js`: an
extra cross-reference entry pointed to a nonexistent PDF object. The encoder
now indexes its five actual objects; raster composition and single-page output
remain unchanged.

### Exact column placement

- Measurement uses the final Arial fonts before allocating the composition.
  Each column starts at y=76 and reserves 24px at the bottom. Heading height is
  wrapped lines x 28 + 16px; entry height is max(42px, wrapped lines x 26 + 12px).
  The group gap is 20px.
- A new layer starts immediately below the previous group in the current column
  if its complete heading and first entry fit. Otherwise it starts the next
  column. Groups are not kept indivisible: later entries can continue in another
  column, with the heading repeated there and kept with the first continued entry.
  The heading text is unchanged; the internal `continued` flag adds no visible suffix.
- After a continued layer finishes, the next layer can reuse that column's
  remaining space. Placement proceeds forward; it does not backfill older
  columns, rebalance columns, merge groups or reorder categories.
- The planner initially uses max(map height, 240px). If a fourth column would be
  needed, or a heading/entry pair cannot fit, it adds max(240px, round(map height
  x 0.25)) and lays out everything again. The returned layout has at most three
  columns. Height growth can reduce the final column count.
- Every candidate composition includes the footer in its size check. The
  complete canvas must be <=8192px in each dimension and <=24,000,000 pixels.
  These bounds are inclusive. No entry or label is dropped and fonts never
  shrink to meet a bound. A layout that exceeds the permitted growth fails with
  the existing actionable OutputSizeError.

Deterministic tests cover A-I from the integration request, including exact
column fill, continuation, subsequent-layer reuse, three-column growth, wrapped
headings/labels, oversized indivisible content, and independent dimension/area
boundaries. A real browser composition with 435 short categories rendered all
entries at 3790 x 6288 (23,831,520 pixels); the corresponding 436-entry layout
exceeds the next allowed height step and fails explicitly. These counts are
fixture-specific, not category limits.

### PDF and preview qualification

PDF preserves the complete image aspect ratio and derives its orientation from
that composition. MediaBox dimensions use raster dimensions as PDF points;
there is no A4/Letter normalization or pagination. Legend text is rasterized.
Large legends can be readable at native digital scale while becoming very small
when the entire page is fitted to ordinary paper. This review checks PDF
structure, page/image dimensions, image placement and decoded raster content;
physical printing and individual PDF viewers remain unverified.

Both previews retain the complete bitmap and fit it proportionally using the
existing styles. Their gray surrounding gradient belongs to the preview shell;
it is not embedded as margins in the output. The pale legend panel and footer
are intentional parts of the composition. Preview zoom, pan, fullscreen and
fit-to-window controls, along with margin/legibility refinements, remain deferred
to a separate UX task.

The expanded browser coverage checks two projections, four aspect/view cases,
signed rotations and north-arrow direction, SLD replacement during rendering,
byte-identical Export/Share artifacts for single-layer and mixed-layer PNG/JPEG/PDF,
complete 155-rule outputs/previews, independent visibility changes, repeated
modal opening, and recovery after size-limit/encoder failures. Temporary targets
are removed; render-readiness tests check listener/frame cleanup. This is not a
heap/memory-leak audit. Real Camiguin/Abra/Baseline uploads, staging delivery,
live network/CORS and other browser engines remain outside the available local
fixtures. See the report for the final run results and acceptance qualification.
