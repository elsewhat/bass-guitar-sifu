Content-first darkness for listening apps: the interface recedes into near-black so that artwork, music and podcasts carry the colour. One functional green accent, pill and circle geometry, compact type, heavy shadows.

## Content fundamentals

- Labels are short and concrete: "Play all", "Follow", "Show all", "What do you want to play?".
- Button labels in `button-upper` are set in uppercase with 1.4px to 2px tracking; all other text is sentence case.
- Address the listener directly ("Made for you", "Your Library"). No emoji in UI chrome.
- Metadata is terse and joined with a middle dot: "Playlist · 42 songs".

## Colour

- Build every view on `bg-base`. Layer depth by shade, not by borders: `bg-surface` and `bg-elevated` for containers and controls, `bg-card` / `bg-card-alt` for elevated cards and hover states.
- `accent` is the only brand colour. Use it for play controls, active states and the single primary CTA in a view, with `on-accent` for the icon or label. Never use it as a background area, decoration or for body text.
- Primary text is `text-base`; secondary text, metadata and inactive navigation use `text-subdued`. `text-bright` and `text-max` are for rare extra emphasis.
- States: `text-negative` for errors, `text-warning` for warnings, `text-announcement` for info. Always pair them with a word or icon.
- `bg-light` with `on-light` is reserved for light pill CTAs on consent and marketing surfaces. Never use a light primary surface.
- Do not add other brand colours. Artwork is the colour source; the UI stays achromatic.

## Typography

- One family in two roles: `title` for `section-title`, `ui` for everything else. The stack starts with Figtree, a substitute for the proprietary font the source uses (see Notes).
- Weight carries hierarchy: 700 for emphasis and active navigation, 400 for body, 600 sparingly (`feature-heading`, `badge`).
- The scale is compact, 10px (`micro`) to 24px (`section-title`). Keep line-heights tight; do not use relaxed leading.
- Card titles: `body-bold`. Metadata: `caption` in `text-subdued`. Navigation: `nav` / `nav-bold`.

## Shape and spacing

- Every button is a pill: `radius-full` for small pills, `radius-pill` for primary buttons and the search input, `radius-large` for large pills. Play, icon and avatar controls use `radius-circle`. Square buttons are not part of this system.
- Cards use `radius-comfortable` (or `radius-standard` for artwork); badges and explicit tags use `radius-minimal`; panels and overlays `radius-medium` to `radius-panel`.
- Spacing is dense on an 8px base (`space-8`), with fine steps from `space-1` to `space-20`. Pack grids, track lists and navigation tightly; the dark ground provides the rest between elements.

## Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | `bg-base` | Page background |
| 1 | `bg-surface` / `bg-elevated` | Cards, sidebar, containers |
| 2 | `shadow-medium` | Dropdowns, hovered cards |
| 3 | `shadow-heavy` | Dialogs, menus, overlays |
| Inset | `shadow-inset` | Input borders |

- Shadows are heavy on purpose: light shadows are invisible on dark grounds.
- Do not draw raw grey borders around surfaces. Use `shadow-inset` for inputs and a 1px inset `border-muted` for outlined pills.

## Interaction states

- Controls scale to 1.04 on hover; cards lighten from `bg-surface` to `bg-card`.
- Keyboard focus on every control is a 2px solid `focus-ring` outline.

## Layout

- Fixed sidebar on the left, a main content area that fills the remaining width, and a full-width now-playing bar at the bottom.
- Card grids run 5 columns above `bp-desktop`, then 3, 2 and 1. The sidebar goes from full to collapsed to hidden, and becomes a bottom bar below `bp-mobile`. The search pill and the now-playing bar stay at every size.

## Iconography

- No icon set ships with this system. Use a single-colour, filled 24px icon set drawn with `fill: currentColor` so icons inherit `text-subdued` / `text-base` / `on-accent`.
- No logo ships with this system; set the product name in plain type or supply your own mark.

## Notes

- Figtree (Google Fonts, loaded by `components/bundle.css`) substitutes for the source's proprietary UI font. Replace the `title` and `ui` families if you have a licensed face.
- `border-strong` measures 2.2:1 on `bg-base` and is kept exact from the source; use it only for decorative edges, never as the sole indicator of a control's boundary.
- `focus-ring` is an addition; the source specified a black focus border, which does not show on dark grounds.
