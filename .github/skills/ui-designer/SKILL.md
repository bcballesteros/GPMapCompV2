---
name: ui-designer
description: Activates automatically when modifying frontend layouts, writing HTML/CSS/Tailwind classes, refactoring UI components, fixing broken designs, or adjusting spacing.
---

# UI Design Guardrails & Refactoring Standards
When implementing frontend fixes or layout components during vibe coding, strictly adhere to these visual principles.

## 1. Visual Spacing & Layout Integrity
* **Enforce Strict Grid Systems:** Do not use random padding or margins. Use structured multi-column grid utilities or explicit Flexbox layouts (`display: flex`).
* **Consistency:** Adhere strictly to uniform spatial scales (e.g., if using Tailwind, use standardized `gap-4`, `p-6`, `space-y-4`). Never inject arbitrary raw pixel values.
* **Component Uniformity:** Cards and boxes must display matching container border-radii, consistent internal breathing room, and predictable depth drop-shadows.

## 2. Structural Integrity Over Quick Patches
* **Root-Cause Alignment:** If a layout breaks or looks bad, never attempt to hide the symptom using temporary patches like `position: absolute`, negative margins, or hardcoded alignment offsets (`top: 34px`).
* **Modern Refactoring:** Fix layout bugs by correcting the parent container wrapper. Transition messy layout structures into explicit CSS Grids or Flex containers to let child items align natively.

## 3. Aesthetic Boundaries & Design Constraints
* **Frictionless Hierarchies:** Maintain strong, intentional typographic contrast. Keep headings distinct and bolded to ensure clean, readable structural sections.
* **Functional States:** Interactive triggers (hover, active, focus) must include smooth styling transitions (`transition-all duration-200`) and distinct visual feedback.
* **Do Not Hallucinate Layouts:** If a layout instruction is structurally vague, stop and ask the user to clarify the desired layout dimensions before generating blind UI changes.
