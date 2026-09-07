---
name: ui-designer
description: Activates automatically when modifying GPMapCompV2 frontend layouts, HTML/CSS, modal interfaces, map workspace controls, sidebars, responsive behavior, visual hierarchy, accessibility, spacing, or other UI/UX components.
---

# GPMapCompV2 UI Design & Refactoring Standards

This skill defines the visual, interaction, and implementation standards for the Geoportal Philippines Map Composer V2 (GPMapCompV2).

Use these rules whenever working on frontend UI, layout, styling, responsive behavior, modal design, workspace controls, or visual refinements.

The goal is to preserve a professional, compact, production-quality GIS interface while avoiding unnecessary redesigns and regressions.

---

## 1. Preserve Established Design Before Redesigning

GPMapCompV2 already has an established visual language.

Before changing an existing component:

1. inspect the current implementation;
2. identify existing shared styles/components;
3. preserve approved layout and behavior unless the task explicitly asks for a redesign;
4. make the smallest change that solves the actual problem.

Do not redesign working UI simply because an alternative layout is possible.

If the user has explicitly approved a layout or component, treat it as frozen unless a later request changes it.

Avoid endless cosmetic iteration.

---

## 2. Overall Workspace Architecture

Preserve the established application structure:

- dark application navbar at the top;
- Layers workspace on the left;
- main OpenLayers map canvas in the center;
- Tools & Properties workspace on the right;
- map controls positioned inside the map workspace;
- contextual Smart Help in the right workspace;
- status information positioned unobtrusively around the map;
- modal workflows for focused tasks.

Do not change this architecture without explicit instruction.

The map must remain the dominant workspace.

Sidebars, cards, controls, and dialogs should support the map rather than visually compete with it.

---

## 3. Visual Style

The intended visual character is:

- professional;
- compact;
- modern;
- restrained;
- GIS-oriented;
- readable;
- consistent;
- production-ready.

Avoid:

- excessive decorative cards;
- unnecessary gradients;
- overly large controls;
- oversized modal previews;
- excessive shadows;
- excessive border treatments;
- unnecessary animations;
- playful visual treatments inappropriate for a professional government GIS application.

Use visual emphasis only where it communicates hierarchy or state.

---

## 4. Typography

GPMapCompV2 uses Inter as its primary interface font.

Preserve the established typography hierarchy.

General guidance:

- modal/page titles should be immediately recognizable;
- section headings should be clear but compact;
- field labels should be readable without dominating the interface;
- helper text should remain visually secondary;
- acronyms such as WMS, CRS, PNG, JPEG, PDF, NAMRIA, and GIS must retain their correct capitalization.

Use title case or sentence case consistently with the existing application.

Do not arbitrarily introduce all-uppercase interface text unless it already belongs to the established design.

Avoid unusual font weights unless required by the current design.

---

## 5. Spacing System

Prefer the existing spacing variables and established spacing scale.

Use consistent spacing between:

- section headings;
- controls;
- cards;
- modal sections;
- buttons;
- labels and inputs.

Raw pixel values are acceptable when they solve a legitimate component-specific requirement, such as:

- modal width;
- sidebar width;
- map-preview geometry;
- control dimensions;
- icon sizing;
- responsive breakpoints.

Do not use arbitrary values merely to visually force an element into position.

When a raw value is required, keep it intentional and easy to understand.

---

## 6. Layout Rules

Prefer:

- CSS Grid for structured multi-column layouts;
- Flexbox for linear alignment;
- normal document flow for general vertical layouts.

Use `position: absolute` when the component architecture legitimately requires it, such as:

- overlays;
- preview placeholders;
- map targets filling a positioned shell;
- icons positioned inside controls.

Do not use absolute positioning as a random workaround for incorrect parent layout.

Avoid:

- negative-margin hacks;
- arbitrary `top`/`left` offsets;
- overlapping content caused by fixed positioning;
- layout fixes that only work at one viewport size.

Fix the responsible container whenever practical.

---

## 7. Component Consistency

Reuse existing GPMapCompV2 components and styles before creating new ones.

Examples include:

- buttons;
- form inputs;
- select controls;
- disclaimer boxes;
- modal headers/footers;
- cards;
- tool headers;
- sidebar sections;
- toast notifications.

Do not create slightly different versions of an existing component unless there is a clear functional reason.

Maintain consistent:

- border radius;
- input height;
- padding;
- icon scale;
- button hierarchy;
- focus treatment;
- border color;
- shadow strength.

---

## 8. Buttons and Actions

Use clear action hierarchy.

Primary actions:
- perform the main task;
- use the established primary styling.

Secondary actions:
- Cancel;
- Close;
- non-destructive alternatives.

Destructive actions:
- use established destructive styling;
- require confirmation where appropriate.

Do not use visual color solely for decoration.

Button labels should describe actions clearly.

Examples:

- Download
- Send
- Upload
- Save
- Cancel
- Remove
- Delete Selected

Avoid vague labels when a more specific action is available.

---

## 9. Forms

Form layouts should be compact and easy to scan.

Each field should have:

- a visible label;
- appropriate input type;
- clear focus state;
- validation where required;
- helper text only when useful.

Prefer horizontal use of available space when it improves readability.

For example:

Recipient Email | Share Format

may be preferable to stacking both fields when the modal has sufficient width.

Do not stretch short controls unnecessarily.

Select controls should have:

- consistent custom or native chevron treatment;
- sufficient right padding;
- no duplicate arrows;
- vertically centered indicators.

---

## 10. Tool Identity Colors

GPMapCompV2 uses restrained contextual color identity for tool groups.

Preserve established semantic identities where present, including:

- Annotation: amber
- Drawing: teal
- Measurement: orange
- Feature Saving: blue
- Layer Information: cyan
- Advanced Layers: indigo/violet
- Map Settings: rose

Use these colors as subtle accents.

Do not turn entire interfaces into large saturated color blocks.

---

## 11. Cards and Elevation

Avoid excessive “cardiness.”

Use cards when they represent meaningful grouping.

Prefer:

- subtle borders;
- restrained shadow;
- clean separation through spacing.

Avoid:

- a card around every individual field;
- unnecessary nested cards;
- large hover elevation;
- aggressive translate effects.

Desktop utility controls generally should not jump noticeably on hover.

Use hover effects to communicate interactivity, not movement.

---

## 12. Modal Architecture

Use the standard modal structure:

modal
- header
- body
- footer

The footer must remain structurally inside the modal.

Never position primary modal actions outside the normal modal flow.

Modal requirements:

- responsive width;
- viewport-safe height;
- accessible close control;
- predictable footer placement;
- clear content hierarchy;
- no horizontal overflow.

When content becomes tall:

- allow controlled body scrolling;
- keep important actions reachable.

Do not solve modal overflow with arbitrary absolute positioning.

---

## 13. Export and Share Modal Consistency

Export Map and Share Map are related workflows and should feel visually related.

Use the established compact 4:3 map-preview geometry.

Preferred preview pattern:

- centered;
- smaller than the full map workspace;
- approximately 4:3;
- visually used as confirmation, not as a second interactive workspace.

The preview should answer:

> “Is this the map composition I am about to export/share?”

It should not dominate the entire modal.

Share and Export may differ in their controls, but preview treatment should remain consistent.

---

## 14. Map Preview Critical Rules

Map Preview rendering is sensitive and must not be redesigned casually.

Before modifying preview behavior:

1. inspect the currently working Export/Share implementation;
2. preserve proven OpenLayers rendering logic;
3. distinguish display geometry from actual map-rendering geometry;
4. confirm map target dimensions are positive before changing rendering code.

Do not rewrite map rendering merely to solve a CSS sizing problem.

Known important lesson:

A visible preview shell does not guarantee that the OpenLayers target inside it has a usable height.

Always verify:

- shell dimensions;
- map target dimensions;
- `map.getSize()`;
- target ownership;
- placeholder state.

If Export preview works and Share preview does not, compare their exact DOM geometry and rendering lifecycle before introducing another architecture.

Prefer adapting a proven implementation over creating a parallel renderer.

---

## 15. Map Rendering vs UI Styling

Keep a strong separation between:

- modal/display sizing;
- OpenLayers map rendering;
- high-resolution export rendering.

Changing preview dimensions must not accidentally change:

- export resolution;
- map center;
- zoom;
- projection;
- tile resolution;
- final PNG/JPEG/PDF dimensions.

Never change the application's default map zoom simply to hide a preview-rendering problem.

---

## 16. Informational Disclaimers

Use the established `.disclaimer-box` visual treatment for informational notices.

The standardized style should remain:

- visually restrained;
- orange/cream informational tone;
- rounded border;
- info icon;
- readable dark text.

Use this treatment for appropriate informational notices such as:

- Upload
- WMS
- Export
- Share

Do not reuse the disclaimer box for:

- errors;
- destructive confirmations;
- toasts;
- validation messages;
- Smart Help;
- empty states.

---

## 17. Toast Notifications

Use the centralized GPMapCompV2 toast system.

Toasts should remain:

- top-center of the map workspace;
- compact;
- non-blocking;
- limited in quantity;
- short-lived.

Do not create ad hoc notification banners when the toast system already satisfies the use case.

Avoid duplicate notifications for the same action.

---

## 18. Smart Help

Smart Help should describe the user's current context.

Keep language:

- short;
- task-oriented;
- accurate to current functionality.

Do not describe planned backend features as already available.

Do not describe obsolete workflows.

When a feature changes significantly, update its Smart Help context.

---

## 19. Responsive Behavior

Desktop is the primary GPMapCompV2 workspace, but layouts must remain usable at smaller widths.

When designing responsive behavior:

- preserve map usability;
- avoid horizontal overflow;
- allow modal controls to stack;
- keep footer actions reachable;
- keep preview aspect ratios intact;
- avoid shrinking controls below practical interaction sizes.

Test important UI changes at minimum around:

- 1366 × 768
- 1440 × 900
- 1920 × 1080

For narrow screens, prefer intentional stacking rather than compressed desktop grids.

---

## 20. Accessibility

All interactive controls must be keyboard-accessible.

Requirements include:

- semantic buttons where appropriate;
- visible focus state;
- labels associated with form controls;
- meaningful `aria-label` where visible labels are unavailable;
- `aria-expanded` for expandable controls;
- `aria-live` for asynchronous status messages where appropriate;
- correct disabled and pending states.

Do not rely on color alone to communicate state.

Decorative icons should not create unnecessary screen-reader noise.

---

## 21. Interaction States

Interactive elements should support appropriate states:

- default;
- hover;
- focus;
- active;
- selected;
- disabled;
- loading/pending where applicable.

Transitions should remain subtle.

Prefer transitions on specific properties such as:

- opacity;
- transform;
- background-color;
- border-color;
- color.

Avoid `transition: all` unless there is a clear reason.

Avoid exaggerated motion.

---

## 22. Destructive Actions

Actions such as:

- Remove Layer
- Delete Selected
- Clear All
- destructive resets

must use established safeguards.

Use:

- clear destructive styling;
- confirmation where data loss is possible;
- specific confirmation text.

Do not accidentally style ordinary Cancel buttons as destructive actions.

---

## 23. GIS-Specific UI Considerations

GPMapCompV2 is a map-composition tool.

UI decisions must respect GIS workflows.

Prioritize:

- layer visibility;
- map composition;
- current extent;
- annotations;
- drawings;
- measurements;
- map settings;
- export/share confidence.

Do not hide important GIS controls merely to achieve visual minimalism.

Do not sacrifice map usability for decorative layout symmetry.

---

## 24. Debugging UI Problems

When a UI problem occurs:

1. reproduce it;
2. inspect the actual DOM;
3. measure the affected elements;
4. identify the first failing step;
5. compare against a known-working component;
6. fix the root cause;
7. verify regressions.

Do not repeatedly apply speculative CSS changes.

For rendering/layout problems, inspect:

- `getBoundingClientRect()`;
- computed styles;
- parent dimensions;
- child dimensions;
- display/visibility;
- overflow;
- positioning;
- map target dimensions where relevant.

If a known-working sibling component exists, use it as the reference implementation.

---

## 25. Avoid Unnecessary Refactoring

Do not combine unrelated cleanup with a focused UI task.

For example, when fixing:

- Share preview sizing

do not simultaneously refactor:

- Export rendering;
- sidebar architecture;
- map controls;
- unrelated CSS.

Keep changes easy to review and easy to revert.

---

## 26. Existing Functionality Must Be Preserved

Before finalizing UI changes, verify that unrelated workflows still function.

Depending on the task, regression checks may include:

- map rendering;
- basemap switching;
- layer visibility;
- annotations;
- drawings;
- measurements;
- Feature Saving;
- Add Geospatial Data;
- Export;
- Share;
- sidebar collapse behavior.

Do not claim functionality works unless it was actually verified or the claim is clearly identified as unverified.

---

## 27. Build Validation

After frontend changes, run:

`npm run build`

Report the build result.

If the build fails, do not hide the failure.

If the build succeeds with warnings, distinguish warnings from errors.

---

## 28. UI Review Standard

Before considering a UI task complete, ask:

- Is the hierarchy clear?
- Is the map still dominant?
- Is spacing consistent?
- Are controls appropriately sized?
- Does the component match existing GPMapCompV2 patterns?
- Is any space being filled with unnecessary UI?
- Did the change introduce visual clutter?
- Does it work at laptop viewport sizes?
- Is accessibility preserved?
- Did unrelated functionality remain intact?

If the UI already looks balanced and satisfies the task, stop modifying it.

---

## 29. Final Principle

Prefer:

**proven component → minimal adaptation → verification**

over:

**new architecture → speculative styling → repeated fixes**

GPMapCompV2 should evolve through deliberate, maintainable changes rather than continuous visual reinvention.