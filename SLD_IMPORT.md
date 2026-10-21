# Optional vector SLD import (Phase 2C)

Upload a point, line or polygon dataset as usual, expand its Layers panel controls, and choose
**Import SLD**. The local `.sld` file is optional; Single Color and automatic
Categorized styling continue to work without one. No server connection or new
package is required. Point/MultiPoint, LineString/MultiLineString and
Polygon/MultiPolygon families are eligible, including datasets mixing single
and multi geometries within one family. Mixed families, GeometryCollections and
WMS layers do not offer SLD import. The dataset upload workflow, backend and
database are unchanged. Earlier Phase 2B reports below are historical; this
Phase 2C section supersedes their point/line exclusions.

## Point and line subset (Phase 2C)

| Element/property | Supported behavior |
| --- | --- |
| PointSymbolizer / Graphic / Mark | One native mark per graphic; ordered multiple PointSymbolizers per rule |
| WellKnownName | `circle`, `square`, `triangle`, `star`; omitted name defaults to square |
| Size | Literal 1–128 px, default 6; circle diameter and square side equal Size; triangle/star outer diameter equals Size |
| Rotation | Literal -360–360 degrees, clockwise, default 0; anchored at the point with no view-relative rotation |
| Graphic Opacity | 0–1, default 1; multiplies layer opacity on the native marker image |
| Mark Fill | Hex fill color and fill-opacity; omitted Fill disables fill, empty Fill uses gray and opacity 1 |
| Mark Stroke | Hex stroke, stroke-opacity, width 0–16 px, caps, joins and bounded dash arrays; omitted/zero-width Stroke disables outline |
| LineSymbolizer / Stroke | Ordered multiple LineSymbolizers per rule; Stroke required |
| Line stroke paints | Hex color, width 0–100 px, opacity 0–1; omitted properties use black, 1 px and opacity 1 |
| stroke-dasharray | 1–32 space-separated nonnegative lengths, each ≤1024 px; effective period 0.1–4096 px; odd arrays repeat twice |
| stroke-linecap | `butt` (default), `round`, `square` |
| stroke-linejoin | `mitre` or `miter` (native miter, default), `round`, `bevel`; miter limit 10 |

Explicit stroke parameter names are retained as `specified` metadata; omitted
cap/join/dash properties stay omitted in the parsed configuration and resolve
to their SLD defaults during compilation. Unsupported parameters fail import
rather than becoming an application default blue stroke. Dash lengths are CSS
pixel lengths independent of stroke width, zoom and map resolution.

Cross and x are rejected explicitly: their filled SLD outlines cannot be
represented faithfully by OpenLayers' native four-ray RegularShape. Other
marks, ExternalGraphic, remote/local images, GraphicStroke, point GraphicFill,
dash offsets, expressions, geometry transforms and vendor options are outside
this subset. Existing manual marker presets (including diamond) and custom SVG
markers retain their previous behavior. This is not full OGC/GeoServer support;
native triangle/star normalization and browser antialiasing may differ from
GeoTools rendering. Supported property semantics were checked against the
[GeoServer PointSymbolizer reference](https://docs.geoserver.org/3.0.x/en/user/styling/sld/reference/pointsymbolizer/)
and [LineSymbolizer reference](https://docs.geoserver.org/main/en/user/styling/sld/reference/linesymbolizer/).

Both point and line imports reuse the polygon equality subset below: one
unfiltered uniform rule, or nonoverlapping equality rules sharing one existing
classification attribute. Exact strings and homogeneous numeric/boolean types
are supported. Missing attributes, ambiguous mixed types, duplicate equality
values, all-null fields and zero matching features fail transactionally.
Complex/nested filters, ElseFilter, case-insensitive comparisons and scales are
rejected. With a partial match, missing/unmatched features receive no symbol
paint, and counts and unused-rule counts are reported; existing separate feature
labels can still appear. Unused rules remain in their original legend order.

The document selection policy remains strict: exactly one NamedLayer/UserLayer,
one UserStyle and one FeatureTypeStyle. Mixed symbolizer geometries anywhere
in the style are rejected; no unrelated rules are selected or discarded.
The selected style must match the uploaded geometry family, even though full
GeoServer supports some cross-geometry symbolizer applications.

Point/line **Styling** offers **Manual** and **Imported SLD**. A successful
import activates Imported SLD, refreshes the map and legend immediately, and
disables conflicting manual color/size/width/marker/SVG/stroke controls inside
a native disabled fieldset. The hint explains that opacity remains editable.
Choosing Manual restores those controls and the saved manual values; choosing
Imported SLD restores the latest import. A replacement import changes the
saved imported configuration without changing manual settings. Failed imports
preserve the configuration, cached map styles and legend. In-flight file reads
check record identity and DOM attachment before applying, including after
layer removal or replacement. The legend stays directly after opacity and
before Remove.

`symbology-common.js` now owns the existing typed keys, one-pass category
preparation, category lookup, on-demand match inspection and WeakMap runtime.
Polygon public APIs remain compatible wrappers/exports. Point/line records use
the same version-1 `record.symbology` model, adding `geometryType`, with ordered
categories/symbolizers, missing/unmapped entries, mode and provenance. Only
plain serializable data enters the authoritative configuration. Runtime caches
hold category Maps and native style arrays; no XML parsing or feature scans
occur during map interactions. Import, replacement, mode switches, managed
updates (including opacity) and layer removal invalidate the runtime.
Feature-specific labels are created separately from cached symbol arrays.

`vector-sld-style.js` compiles native Circle/RegularShape markers and Stroke
styles. Point fill and stroke opacities are independent; graphic × layer alpha
is applied once to the composed image. Line stroke alpha multiplies layer
opacity. Ordered symbolizers compose source-over. Universal legend descriptors
use the same resolver. Point previews draw the same native marker images,
including rotation and alpha, into a local canvas; markers larger than the
compact viewport scale down together. Line previews use the resolved ordered
strokes, widths, caps, joins, alpha and dashes in SVG, clipped at the swatch
edges. No separate legend symbol/color mapping or generic blue fallback exists.

The same file/XML limits and untrusted-input protections below apply. A
conservative combined **4,194,304-pixel** budget for unique point definitions
includes stroke/miter padding before any marker raster is allocated. Point
size, rotation, opacity, stroke width and line dash bounds are validated before
layer mutation. No imported resource URLs are fetched. Labels/status remain
textContent. XML DOM and runtime styles never enter serialized configuration.
No dependencies, backend/database changes, WMS legends, new style formats or
Export/Share legend composition were added.

Phase 2C file inventory (relative to the existing local Phase 2B worktree):

| Files | Change |
| --- | --- |
| `src/map/sld-importer.js` | Extend shared parser with point/line translation, geometry selection and bounds |
| `src/map/symbology-common.js` (new) | Extract shared category matching, diagnostics and runtime |
| `src/map/polygon-symbology.js` | Delegate common behavior while preserving polygon APIs and paints |
| `src/map/vector-sld-symbology.js` (new) | Point/line import activation, modes, resolved symbols and legend descriptors |
| `src/map/vector-sld-style.js` (new) | Shared native point/line compiler |
| `src/map/style-factory.js`, `src/map/layer-manager.js` | Managed compilation, cache invalidation, descriptors and removal cleanup |
| `src/ui/sld-controls.js` (new), `src/ui/polygon-controls.js` | Share file-import lifecycle and restrict polygon update listener to polygon controls |
| `src/ui/vector-sld-controls.js` (new), `src/ui/layers-panel.js` | Optional imports, mode switching and protected manual controls |
| `src/ui/vector-sld-legend-symbol.js` (new), `src/ui/vector-legend.js` | Ordered imported native point and line previews |
| `src/styles/components.css` | Preserve layout and indicate disabled manual controls |
| `tests/fixtures/categorized-point.sld`, `tests/fixtures/categorized-line.sld` (new) | Small synthetic categorized fixtures |
| `tests/vector-sld-symbology.test.js`, `tests/vector-sld.browser.js` (new) | Focused model, parser, UI, native map/legend and lifecycle coverage |
| `tests/sld-import.browser.html`, `tests/sld-import.browser.test.js` | Run point/line coverage with existing polygon/fidelity browser checks |
| `SLD_IMPORT.md` | Current supported subset, implementation and verification |

Phase 2C verification (2026-10-20): **50/50 tests passed, none skipped**, with
all five opt-in Chrome suites enabled. This includes the new eight unit tests
and point/line browser checks, existing polygon basic/advanced/fidelity checks,
manual controls/custom SVGs, universal legends, color pickers, static
PNG/JPEG/PDF Export/Share and recipient controls. The new browser checks cover
Point/MultiPoint and LineString/MultiLineString, real File imports, immediate
legend rendering, actual map canvas paint, point legend alpha, all four native
marks, layered symbols, dash/cap/join properties, parser/security bounds,
partial matches, transactional failure/replacement, manual switching, opacity,
labels, highlight compilation, cache reuse and removal/pending-import cleanup.
`npm run build` passes with the existing large-chunk advisory.
`git diff --check` passes; additional no-index whitespace checks pass for all
29 untracked files, including the preexisting Phase 2B artifacts.

Run the complete regression suite in PowerShell:

```powershell
$env:TEST_SLD_BROWSER='1'
$env:TEST_POLYGON_BROWSER='1'
$env:TEST_COLOR_BROWSER='1'
$env:TEST_EXPORT_BROWSER='1'
$env:TEST_RECIPIENT_BROWSER='1'
node --test --test-concurrency=1 tests/*.test.js
npm run build
git diff --check
```

The official external Camiguin SLD/dataset was not supplied for this phase;
existing synthetic polygon and pattern-fidelity regressions passed, while the
earlier Phase 2B official-reference evidence below remains historical. Before
Phase 3, review representative user point/line SLDs and compact swatch legibility
on additional browser engines/displays; decide whether filled cross/x or broader
filter support warrants a separate phase. Keep Export/Share legend composition
in Phase 3. No backend/database or Share wording changed; no commit or push.

## Existing polygon subset and common rules

The importer requires SLD **1.0.0** with the OGC SLD namespace
`http://www.opengis.net/sld` and OGC filter namespace
`http://www.opengis.net/ogc`. Prefixes can differ or SLD can use the default
namespace. One NamedLayer or applicable UserLayer, one UserStyle and one
FeatureTypeStyle are supported. UserLayer inline data and source constraints
are outside this subset.

- StyledLayerDescriptor, NamedLayer/UserLayer, UserStyle, FeatureTypeStyle, Rule.
- Name, Title and descriptive Abstract metadata; IsDefault is accepted metadata
  because there is only one style to select.
- Filter containing one PropertyIsEqualTo with PropertyName and Literal.
- Ordered PolygonSymbolizer arrays per rule, with optional Fill and Stroke.
- GraphicFill containing one Graphic and one Mark. Supported WellKnownName
  values are `hatch`, `times`, and `shape://times`. Names remain distinct:
  `shape://times` draws crossed strokes; unresolved bare `times` adds no paint,
  following the standard GeoTools mark factories and the reference server.
  Literal Size, Rotation and Opacity are supported, as are independent Mark
  Fill and Stroke paints. Size defaults to 16 pixels, rotation to 0 degrees,
  and graphic opacity to 1. No external assets are fetched.
- Optional generic `FeatureTypeName` equal to `Feature`, as emitted by
  GeoServer. Concrete feature-type constraints are rejected because they
  cannot be mapped reliably to arbitrary uploaded datasets.
- Literal CssParameter values: fill, fill-opacity, stroke, stroke-width,
  stroke-opacity. Colors accept #RRGGBB and #RGB; opacities must be 0–1;
  stroke widths must be 0–100 pixels. Missing paint parameters use SLD defaults
  (gray fill, black stroke, opacity 1, stroke width 1).
- An absent Stroke draws no outline; an absent Fill draws no fill. A zero-width
  stroke draws no outline. At least one paint element is required.
- One unfiltered rule can style the whole layer without a classification field.

Equality rules must reference exactly the same existing scalar attribute.
String values match exactly, including case and whitespace. Numeric and boolean
fields convert XML literal text to the corresponding dataset type (booleans
accept true/false/1/0). Numeric formatting differences such as 1 and 1.0 therefore
match numeric data. Mixed scalar types, all-null attributes, object values and
incompatible literals produce errors rather than guessing an attribute/type.
Case-insensitive equality and overlapping duplicate equality values are rejected.

Rule order is retained. Legend labels prefer Title, then Name, then the literal
value (or a numbered rule label). Display labels are independent of values.
Rules without matching features remain in the legend with zero counts. If no
rule matches any feature, import fails. Otherwise missing/unmatched features
have no imported symbol paint, as they have no matching SLD rule; the import status
reports their count. Existing application feature labels remain enabled.

## Application behavior and shared configuration

Import validates the complete relevant XML tree and dataset compatibility before
changing the target record. For polygons, success activates **Imported SLD** in the existing
Styling selector and displays its Attribute. The import status shows the style
title, rule count, matched feature count and any unmatched counts. The file input
resets so the same file or another SLD can be imported again. A later successful
import replaces the saved imported style; a failure preserves the current style.

The importer produces plain data in `record.symbology`: typed category IDs and
values, ordered categories, labels, rule names, ordered symbolizer arrays, paint
properties and provenance (file name, SLD version, style title, unmatched counts).
There is no XML DOM, OpenLayers Style instance or separate SLD color lookup in
this configuration. Existing runtime Maps, cached OpenLayers styles and managed
layer update/cache invalidation handle the result.

The existing category color pickers, layer Opacity and Show Stroke remain usable.
Fill/stroke opacity multiplies the existing layer opacity. Imported Show Stroke
has its own master switch; turning it back on respects rules with absent strokes.
This switch affects polygon boundaries only: hatch/times mark strokes remain.
Category color editing changes the first enabled solid base fill and leaves
all pattern overlays, outline-only symbolizers and other fills intact. Swatches
without a solid fill have a disabled color picker. The picker tooltip describes
the base-fill behavior.
Global stroke color/width controls and the Attribute selector are disabled while
the imported style is active, because the SLD defines these per rule. Outline-only
rule swatches are not editable with a fill picker.

Choose **Categorized** to restore generated categories and edit their attribute,
or **Single Color** to use the existing single fill/global stroke settings.
Choose **Imported SLD** to restore the latest imported categories, color edits and
stroke switch. Generated and imported categories are stored as serializable
snapshots; switches and replacement imports retain the other configuration.
Single/global stroke settings, layer opacity, feature labels, visibility and
ordering are preserved. Import affects only the selected layer, including if it
is renamed while its file is being read; a removed layer is not updated.

The existing polygon legend uses the same resolved symbol arrays as map rendering,
including absent paint, rule order and independent paint opacities. It remains
after Opacity. Existing point/line legend modules and Export/Share composition
are unchanged. This phase does not add legends to exported/shared documents.

## Ordered rendering, patterns and caches

The backward-compatible data extension is optional `symbolizer.fill.pattern`:

```js
{ mark: 'hatch', size: 15, rotation: 0, opacity: 1,
  fill: { enabled: true, color: '#808080', opacity: 1 },
  stroke: { enabled: true, color: '#000000', opacity: 1, width: 0.4 } }
```

Ordinary generated categories require no new fields. Absent Fill/Stroke elements
retain `enabled: false`; explicitly empty elements retain enabled SLD defaults.
An SLD GraphicFill replaces the solid paint of its own Fill. The enclosing fill
color is retained as data, but is not painted behind the pattern. Use an earlier
solid PolygonSymbolizer for a base/background. This prevents opaque overlay
colors from erasing base fills. Each symbolizer compiles to an OpenLayers Style
in source order; existing feature labels follow the polygon styles.

`resolvePolygonSymbols` supplies the same ordered symbols to map compilation
and legend descriptors. The older singular resolver/descriptor remains available
for existing simple-symbol consumers. No XML, canvas or OpenLayers object enters
authoritative symbology or its mode snapshots.

`polygon-patterns.js` generates transparent repeating CanvasPattern tiles.
Hatch is a narrow diagonal band with corner fragments: its mark fill and
stroke both matter. The source path remains open for stroking and uses square
stroke caps, as in GeoTools. `shape://times` is an open X: only its stroke has
area, so its optional fill is retained but has no visible effect. Bare `times`
is unresolved and its tile is transparent. Positive rotation is clockwise.
Neighboring mark copies wrap across tile boundaries, including rotated strokes.
The tile lattice stays square while individual marks rotate, following GeoTools'
graphic-fill approach. Non-integral sizes are sampled at two pixels per CSS
pixel, with the pattern transform restoring the configured logical dimensions.
For map rendering a cached native OpenLayers pattern descriptor wraps this same
raster in a local SVG image with logical pixel dimensions. This lets OL scale
the pattern using each renderer's pixel ratio, including preview maps with
`pixelRatio: 1`. A raw CanvasPattern bypasses that scaling in OL 10.6 and makes
patterns too dense on high-DPR maps. No imported SVG or external resource is
loaded. Native OpenLayers polygon fills clip tiles to Polygon/MultiPolygon rings
and holes. There is no geometry-specific custom renderer or GeoServer dependency.
Native image loading is asynchronous; OL schedules redraws when ready. Code
using OL's immediate context must await `style.getFill().ready()` before drawing.
Native image dimensions round fractional tile sizes to integer pixels; exact
GeoTools fractional-size mark positioning is not claimed.

Mark fill/stroke opacity is applied independently during tile generation;
graphic opacity, enclosing fill opacity and application layer opacity multiply
the composited tile once. Polygon outlines have their own stroke opacity. The
application's existing per-paint layer-opacity behavior is preserved: overlapping
symbolizers composite source-over rather than applying opacity to an offscreen
layer group. This can differ from a renderer using group opacity.

The existing per-record runtime caches compiled style arrays. Style edits,
replacement import and mode switches invalidate those arrays through the
existing layer update path. Pattern resources use a shared **128-entry LRU**
keyed by the complete pattern and effective opacity; numerically equivalent
alpha products are rounded to eight decimal places. Repeated features and
categories reuse tiles, and base-color/outline changes reuse unchanged pattern
resources. Evicted resources become collectible when no compiled style holds
them. No XML parsing or pattern generation occurs on cache hits during feature
evaluation, and no extra feature-attribute scans were introduced.

Legend SVGs paint ordered polygon shapes with the same raster tiles embedded as
local PNG data URLs. Tiles retain their logical dimensions in 32 x 24 swatches;
there is no separate spacing adjustment for legends. Layer alpha multiplies
fill and stroke independently, matching map composition where paints overlap.
Swatches clip extreme strokes to their viewport. Labels remain textContent.

## Validation and limitations

Files must be nonempty `.sld` files, no larger than **1 MiB**. Limits are **500
rules**, **20,000 elements** and **24 element levels**. Browser DOMParser parses
the XML inertly. Malformed XML, DOCTYPE/entity declarations, processing
instructions and unsupported namespaces/elements/attributes are rejected. XML
schema locations are accepted only as metadata and never fetched. External
entities, images, scripts and other referenced resources are never loaded.
Rule/status text uses textContent; no imported XML/HTML enters the page. Typed
category keys and runtime Maps avoid category-name object indexing, and unsafe
classification names (__proto__, constructor, prototype) are rejected.

Additional limits: **8 polygon symbolizers per rule**, **2,000 per file**,
pattern Size **1–128 pixels**, Rotation **-360–360 degrees**, pattern mark stroke
width **0–16 pixels**, and all opacity values **0–1**. Polygon boundary stroke
width retains its existing **0–100** bound. Canvas dimensions never exceed
**256 x 256**. Unique parsed pattern definitions have a combined **4,194,304
sample-pixel** budget. These checks precede layer mutation. Runtime validation
also rejects malformed pattern numbers/colors before allocating canvases.

The importer rejects the entire style at its first error, identifying the
construct or incompatible field. It does not approximate unsupported appearance.
Unsupported constructs include other pattern marks, nested GraphicFill, multiple
Marks/graphics, complex filters/expressions, ElseFilter, scale-dependent rules, external graphics,
text symbolizers, unsupported point marks/graphics, geometry transformations, vendor options, extra
paint parameters, multiple layers/styles/FeatureTypeStyles, SLD 1.1 and other
style formats. This is a strict supported subset, not general SLD compatibility.
The complete official reference passes Phase 2B parsing/import; see the visual
qualification below.

## Files and verification

Implementation: `src/map/sld-importer.js`, `src/map/polygon-symbology.js`,
`src/map/style-factory.js`, `src/ui/polygon-controls.js`,
`src/map/polygon-patterns.js`, `src/ui/polygon-legend-symbol.js`,
`src/styles/components.css`. The existing layer manager, store, Layers panel and
legend modules provide the integration points without requiring new changes.

Added verification: `tests/sld-symbology.test.js`,
`tests/sld-import.browser.test.js`, `tests/sld-import.browser.html`,
`tests/fixtures/basic-polygon.sld`, `tests/fixtures/patterned-polygon.sld`.
Phase 2B adds `tests/fixtures/layered-polygon.sld` and
`tests/sld-patterns.browser.js`, extending the existing unit/browser tests.
The older patterned fixture deliberately uses an unsupported slash mark and
continues to test transactional rejection.
The fixtures are small synthetic styles and polygon features are generated in tests.

```powershell
node --test tests/*.test.js
$env:TEST_SLD_BROWSER='1'; node --test tests/sld-import.browser.test.js
$env:TEST_POLYGON_BROWSER='1'; $env:TEST_COLOR_BROWSER='1'; $env:TEST_EXPORT_BROWSER='1'; node --test --test-concurrency=1 tests/polygon-symbology.browser.test.js tests/vector-color-picker.browser.test.js tests/static-map-output.browser.test.js
npm run build
git diff --check
```

Chrome is required for opt-in browser tests (`CHROME_PATH` can override its
location). Parser validation, real local File imports, Polygon/MultiPolygon OL
rendering, legend updates, failed imports, replacement imports, mode switches,
safe labels and point/line controls are exercised in headless Chrome. Unit tests
cover typed matching, paint, opacity, snapshots, category customization and file
limits. Existing browser tests cover automatic categories, point/line legends,
color controls and Export/Share behavior.

To test a separately downloaded official file without adding it to the repo:

```powershell
$env:TEST_SLD_BROWSER='1'
$env:SLD_REFERENCE_PATH='C:\path\to\reference.sld'
$env:SLD_SCREENSHOT_PATH=Join-Path $env:TEMP 'gp-phase2b-browser.png'
node --test tests/sld-import.browser.test.js
```

## Official reference and fidelity qualification

On 2026-10-19 the public read-only
[Geoportal GetStyles endpoint](https://geoserver.geoportal.gov.ph/geoserver/geoportal/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetStyles&LAYERS=geoportal%3Aelum2025_cgn_reg10),
[JSON legend](https://geoserver.geoportal.gov.ph/geoserver/wms?SERVICE=WMS&VERSION=1.1.0&REQUEST=GetLegendGraphic&LAYER=geoportal%3Aelum2025_cgn_reg10&STYLE=elum2025_cgn_reg10&FORMAT=application/json)
and PNG legend were retrieved into temporary files. No protected endpoint or
credentials were used. The reference contains **55 rules, 70 polygon
symbolizers, 14 hatch overlays and one bare times overlay**, classified by
`sub_elu`. All 55 rules imported against synthetic matching features, with all
70 symbolizers compiled, zero unmatched features and zero unmatched rules.
No official dataset or complete reference SLD was added to the repository.

The JSON legend confirms 15-pixel marks, default gray mark fill, black 0.4-pixel
mark strokes, and distinct polygon boundary strokes. In particular the red
enclosing Fill on one overlay does not recolor its black mark stroke. The
implementation preserves this distinction. Hatch geometry was checked against
[GeoTools WellKnownMarkFactory](https://github.com/geotools/geotools/blob/main/modules/library/render/src/main/java/org/geotools/renderer/style/WellKnownMarkFactory.java),
and repeating/rotation behavior against
[SLDStyleFactory](https://github.com/geotools/geotools/blob/main/modules/library/render/src/main/java/org/geotools/renderer/style/SLDStyleFactory.java).

Browser captures of representative hatch swatches were visually compared with
the official PNG legend. The official server renders its bare `times` rule as
plain yellow with an outline, despite identifying the mark in its JSON legend.
The fidelity review below corrects the original Phase 2B alias interpretation:
only [`shape://times`](https://docs.geoserver.org/stable/en/user/styling/sld/extensions/pointsymbols/)
draws crossed strokes; bare `times` now contributes no pattern paint.
Full-file structural/import compatibility is verified; exact visual equivalence
to the official server is **not** claimed. Anti-aliasing, tile origin, fractional
sizes, view rotation, group opacity and small-swatch scaling can also differ.
Unrecognized marks fail import rather than falling back to unrelated symbols.

## Phase 2B verification results and remaining work

Phase 2B file inventory (the worktree already contained the Phase 2A files):

| File | Change in this phase |
| --- | --- |
| `src/map/sld-importer.js` | Ordered symbolizer parsing, GraphicFill/Mark subset, numeric and resource bounds |
| `src/map/polygon-symbology.js` | Ordered shared resolution, legend arrays and base-fill editing |
| `src/map/style-factory.js` | Cached ordered OpenLayers polygon styles |
| `src/map/polygon-patterns.js` | New shared bounded tile/CanvasPattern resource renderer |
| `src/ui/polygon-controls.js` | Layered legend synchronization and base-fill picker behavior |
| `src/ui/polygon-legend-symbol.js` | New shared pattern swatch renderer |
| `src/styles/components.css` | Clip compact swatches to their viewport |
| `tests/fixtures/layered-polygon.sld` | New small synthetic hatch/times fixture |
| `tests/sld-patterns.browser.js` | New advanced browser/parser/raster/cache checks |
| `tests/sld-import.browser.html` | Retain simple-import checks and run advanced checks |
| `tests/sld-import.browser.test.js` | Optional external reference validation and capture |
| `tests/sld-symbology.test.js` | Ordered style and non-destructive base-edit regression tests |
| `SLD_IMPORT.md` | Updated supported subset, implementation notes and verification report |

- `node --test tests/*.test.js`: **36 passed, 5 opt-in browser tests skipped**.
- SLD Chrome test with the full official reference: **passed**. It exercises
  existing simple import, advanced parser/security bounds, ordered paints,
  hatch/times raster output, size/rotation/mark paints and alpha, real managed
  map pixels, Polygon/MultiPolygon holes, ordered legend swatches, labels,
  base-color edits, outline toggles, opacity, mode switching, failed-import
  preservation, replacement, bounded cache reuse/eviction and preview styles.
- Existing categorized polygon, vector color picker, static Export/Share and
  recipient-chip Chrome suites: **all four passed**, including initial point
  and line legends and PNG/JPEG/PDF output paths.
- `npm run build`: **passed**, with the existing large-chunk advisory.
- `git diff --check`: **passed**.

The following fidelity review supersedes the original bare `times` decision
and small-swatch scaling. Before Phase 2C, decide whether exact tile-origin
parity is needed and review swatch legibility on additional displays/browser engines.
Keep broader filters, additional marks, point/line importing, other formats and
Export/Share legend composition separately scoped. No commit or push was made.

## Phase 2B fidelity review (2026-10-19)

This review uses freshly retrieved public SLD/JSON legend responses and a
64 x 64 PNG legend for the bare-times rule, plus the standard GeoTools sources.
The uploaded 12,377-feature dataset is absent from this workspace, including
ignored files. Official reference responses and browser captures remain in
temporary files; no official dataset was downloaded or inferred.

### Verified causes and refinements

| Finding | Evidence and resulting behavior |
| --- | --- |
| Bare `times` was incorrectly aliased to `shape://times` | [ShapeMarkFactory](https://github.com/geotools/geotools/blob/main/modules/library/render/src/main/java/org/geotools/renderer/style/ShapeMarkFactory.java) requires the prefix. WellKnownMarkFactory has no bare `times`; SLDStyleFactory returns no texture when no factory resolves a mark. The public server's bare-times PNG is solid yellow with outlines. Preserve the literal name and emit a transparent tile for bare `times`; retain all other symbolizers and boundary strokes. |
| DPR changed map hatch density | Installed OL 10.6.1 `render/canvas/Builder.js` scales native image pattern descriptors by renderer pixel ratio, but uses 1 for raw CanvasPatterns. Use a cached native descriptor around the existing raster. Real maps now repeat every 15 CSS pixels at DPR 1 and 2 at both tested resolutions. |
| Legend hatch spacing was deliberately compressed | The previous swatch used `Math.min(12, size)`. Keep the same logical tile dimensions as map patterns; the official 15px example stays 15px. Large patterns may therefore show only part of a mark in the compact swatch. |
| Legend alpha grouped fill and boundary together | Map paints already multiply layer alpha into each paint. SVG `opacity` grouped the polygon paints and disagreed at overlaps. Use independent effective fill-opacity/stroke-opacity. Pixel tests verify the overlapping boundary agrees with the map. |
| Minor hatch stroke-path mismatch | GeoTools' hatch subpaths are open, with the two corner fragments returning to their start, and its stroke cap default is square. Stop closing the main band for stroke; retain implicit closure for fill and square caps. No mark coordinates, colors, tile-spacing constants or rule order were tuned. |

Hatch assessment: the official Size 15, gray default Mark Fill and black 0.4px
Mark Stroke are preserved independently from polygon fill/boundary paints.
Rotation is clockwise around each tile center; the repetition lattice remains
square. Graphic size controls tile spacing, mark width controls ink coverage,
and zoom changes polygon footprint without scaling these pixel units. The
shared 128-entry LRU still keys complete pattern data and effective alpha;
native descriptors are lazy additions to those resources. Polygon, MultiPolygon
islands and holes continue through native OL clipping. Pattern origin follows
OL's map-origin alignment and is not asserted identical to GeoServer's output
image origin. Full pixel-for-pixel server fidelity is not claimed.

Times assessment: this resolves the reference discrepancy as an unresolved
mark-name behavior, rather than a special legend-only convention. Explicit
`shape://times` remains an open stroked X with no fill area. A GeoServer instance
with a custom MarkFactory could define bare `times` differently; such custom
extensions are outside this subset. JSON legend output describes style data,
so the presence of a mark name there does not prove that it resolves to paint.

### Unmatched features

The fresh official SLD has 55 equality rules on `sub_elu`, **zero ElseFilter
rules and zero unfiltered rules**. There is no applicable fallback. The existing
matcher uses exact string keys, including case and whitespace; null/absent
values receive no imported polygon paint. Numeric and boolean literals still
convert only for homogeneous typed fields. Rule counts include unused rules,
which remain valid legend entries in original order.

The reported 12,373 matches + 4 unmatched = 12,377 features and 18 unused rules
are consistent with this matcher and a dataset containing only some SLD values.
They are not independently verified against the actual dataset, and no real
unmatched attribute values can be identified here. A synthetic regression
reproduces those totals with 37 used and 18 unused rules, testing whitespace,
case, null and absent fields; its example values are not claims about Camiguin.

With the actual layer loaded and **Imported SLD** active under `npm run dev`,
paste this into the browser developer console:

```js
const { getUploadedLayers } = await import('/src/state/store.js');
const { inspectImportedPolygonMatches } = await import('/src/map/polygon-symbology.js');
for (const [name, record] of Object.entries(getUploadedLayers())) {
    const report = inspectImportedPolygonMatches(record);
    if (!report) continue;
    console.log(name, report);
    console.table(report.unmatchedValues.map(row => ({
        ...row, value: row.type === 'string' ? JSON.stringify(row.value) : row.value
    })));
    console.table(report.unusedRules);
}
```

The helper scans current feature data on demand using the same category
resolver as rendering. `present: false` identifies absent fields; `type: 'null'`
identifies explicit nulls. Counts are grouped without trimming or recoding
values. Inspection neither changes style nor replaces the import-time report.
No automatic fallback colors were added.

### Synchronization, scope and verification

Map, category previews and Layers legend retain `resolvePolygonSymbols` and
the shared tile renderer. Ordered base fills, overlay fills, separate boundary
and Mark strokes, rule labels/order, Show Stroke and category editing retain
their existing paths. Legend position and layout are unchanged. The fixture now
uses explicit `shape://times` when testing a visible cross hatch; separate tests
exercise unresolved bare `times`. Existing imported snapshots containing bare
`times` adopt the corrected interpretation; reimport an original prefixed SLD
if a prior snapshot normalized away that prefix.

Files refined in this review:

- `src/map/polygon-patterns.js`: source path/caps, distinct mark behavior, native descriptor.
- `src/map/sld-importer.js`: retain the literal supported mark name.
- `src/map/style-factory.js`: use the shared native pattern descriptor.
- `src/map/polygon-symbology.js`: optional current-feature diagnostics helper.
- `src/ui/polygon-legend-symbol.js`: logical tile spacing and per-paint alpha.
- `tests/sld-pattern-fidelity.browser.js`: new raster/DPR/resolution/legend-alpha checks.
- `tests/sld-patterns.browser.js`: descriptor readiness/cache checks and distinct times names.
- `tests/fixtures/layered-polygon.sld`: explicit cross-hatch mark.
- `tests/sld-import.browser.html`, `tests/polygon-symbology.browser.html`: effective opacity assertions.
- `tests/sld-symbology.test.js`: unmatched inspection and synthetic reported-count regression.
- `SLD_IMPORT.md`: current semantics, diagnostics instructions and findings.

Validation: **42/42 tests passed with all five opt-in Chrome suites enabled**,
including the full official reference against synthetic matching features
(55 rules, 70 compiled symbolizers). Coverage includes pattern size/repetition,
mark color/width/rotation/alpha, bounded cache reuse/eviction, DPR 1/2 at two map
resolutions, Polygon/MultiPolygon holes, shared legend tiles and pixel alpha,
typed classification, missing fallback, imports/mode switching, generated
categories, point/line and custom SVG controls, Export/Share and recipients.
`npm run build` passed with the existing large-chunk advisory. `git diff --check`
passed; an additional no-index whitespace check covered every changed untracked
source, fixture, test and this report.

Remaining limits: browser/Java2D anti-aliasing, fractional-size rasterization,
tile phase on pan/view rotation, group opacity between symbolizers, large-mark
legibility in a 32 x 24 swatch, and untested browser engines/display settings.
The supported semantic corrections and numeric browser checks are verified;
the actual reference dataset/map has not been available for a matched viewport
and scale comparison. No backend, database, new formats, point/line SLD support,
or Export/Share legend composition were introduced. No commit or push.
