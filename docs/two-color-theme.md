# Two-color visual redesign

Changed UI files: src/index.css, src/App.tsx, src/components/OnboardingFlow.tsx, src/components/WarliArt.tsx, src/components/CitizenRecordsAndSettings.tsx, src/context/AppContext.tsx, index.html.

Audit files: two-color-audit-before.json and two-color-audit-after.json contain per-file counts. Scope is authored application source, public SVG/JSON, HTML, and Vite config; dependencies, generated builds, lockfiles, attachments and historical documentation are excluded from source counts. Counts are lexical candidates, not declarations: utility names such as text-body, compatibility aliases and gradient-disabling selectors remain. Generated CSS is also checked for hex values. Raster app icons and rendered browser states were not pixel-audited.

Only active hex colors are #7B1E1A and #FBF6EC. Transparent/currentColor and mixtures of the two are permitted. Existing Tailwind color class names remain mapped to the restricted palette. Shadows and gradients are disabled. There are no UI-library theme packages in the project.

Two exceptions: visible settings labels still say Periwinkle / #898AC4 and Terracotta / #C1785A because existing text must not change. Their rendered swatches use brown and cream; the old literals are not color declarations.

| Component | Background | Text/icons |
|---|---|---|
| Header | Brown | Cream |
| Install button | Cream | Brown |
| Hero | Brown | Cream |
| Suggested card | Cream | Brown |
| Suggested tab / Continue | Brown | Cream |
| Search/input | Cream | Brown |
| Default language card | Cream | Brown |
| Hover language card | Brown | Cream |
| Selected language card | Brown, cream inner outline | Cream |
| Selected card hover | Cream, brown inner outline | Brown |
| Outline button | Cream | Brown |
| Outline button hover | Brown | Cream |
| Primary button | Brown | Cream |
| Primary button hover | Cream | Brown |
| Footer | Brown | Cream |

No decorative art added; prior Warli SVGs removed. No application logic, IDs, names, handlers or API calls changed in this visual task. AppContext changes only browser theme-color literals. All existing text remains. Typography, responsive styles, focus, selection, placeholders and scrollbars use the restricted palette. TypeScript and production build checks run; browser viewport, computed-style and raster icon validation remain outstanding.

Generated-library exception: Tailwind can still emit dormant #fff ring-offset registration defaults and transparent black (#0000), plus black shadow fallback constants. Runtime ring-offset is overridden to cream and all shadows are disabled. These are not a zero-literal result; no claim of a complete library-literal purge is made. Tailwind scanning is scoped to src so historical diffs/documentation cannot generate obsolete palette utilities.
