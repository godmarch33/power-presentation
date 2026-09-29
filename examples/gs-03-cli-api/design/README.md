# Design hand-off placeholder (synthetic fixture GS-03, `design/`)

Source of the `design-frames` scene ("Composition" table): a static Figma/PNG export shown in `browser-device-stage`
with the "Design preview" disclaimer. The Figma link doubles as a detection signal for class `mocks/design`.
Phase: MVP (minimal form on GS-03; a whole product made of mock-ups is GS-04 in v1).

- Figma file: https://www.figma.com/design/0000000000000000000000/acme-jobs-console — a **well-formed placeholder**
  (all-zero file key, resolves to nothing) so that `scripts/inspect-project.mjs` fires its `figma-link` signal (class
  `mocks/design`) on this fixture. `No public, synthetic Figma file exists for GS-03 yet — replace the key
  when one exists.`
- Static exports go next to this file as `*.png` (not committed in the skeleton; part of the heavy fixture set).
- Figma MCP ingestion of tokens is v1; MVP reads only the static export.

Rules the scene must respect:

- Label every frame "Design preview" (composition table); in `marketing` a tier-C reconstruction carries "Screen images
  simulated" — a design export is not a reconstruction, but it is not a product recording either, so it never
  counts as the tier-A "product does the work" scene.
- Brand tokens, fonts and logo exactly per the preset / brand kit (C5 in the vision critic, QA-14 contrast).
