# 01 — Design System: "Grading Suite"

NOVA's visual language borrows from the place where a film is finished: the colour-grading suite. A dark, neutral room so the image reads true; instruments with precise numbers; small, bright indicator lights that mean something. The interface stays quiet so that the work — production stills, the pipeline, the signals — carries the colour.

Brand cues taken from Neon Minds' site (inspiration, not copying): "cinematic grit with technical precision", the slate/timecode overlay ("SCENE 01 / TAKE 24 / ROLL A"), "Beyond Ordinary Visuals".

## Principles

1. **Signal, not decoration.** Neon colour is reserved for state: live, active, needs attention, critical, AI. A screen in a healthy state is mostly neutral.
2. **Precision typography.** Numbers, codes, dates and timecodes are set in a monospaced face with tabular figures, like a timecode display.
3. **Images are the colour.** Production stills provide warmth; surfaces around them stay neutral.
4. **One surface, few borders.** Hierarchy comes from tone steps and spacing, not boxes inside boxes. No glassmorphism, no glow everywhere.
5. **Every element is an instrument.** If something is on screen, it reports a real value or does something.

## Colour tokens

Defined as CSS variables in `apps/web/src/styles/tokens.css`. Components use only tokens.

### Neutrals (dark — default)

| Token           | Value     | Use                                                |
| --------------- | --------- | -------------------------------------------------- |
| `--bg`          | `#0a0b0b` | App background                                     |
| `--surface-1`   | `#111312` | Panels                                             |
| `--surface-2`   | `#171a19` | Raised elements, inputs                            |
| `--surface-3`   | `#1f2321` | Hover, selected rows                               |
| `--line`        | `#262b29` | Hairline dividers                                  |
| `--line-strong` | `#343a37` | Input borders, focus-adjacent                      |
| `--text`        | `#ecefed` | Primary text                                       |
| `--text-2`      | `#a3aba7` | Secondary text                                     |
| `--text-3`      | `#848d88` | Tertiary, captions (≥ 4.5:1 on every dark surface) |

Neutrals carry a faint green bias (graded, not grey) to sit with the signal colour.

### Signals

| Token         | Dark      | Light     | Meaning                                      |
| ------------- | --------- | --------- | -------------------------------------------- |
| `--signal`    | `#3ef0a1` | `#087a4b` | Live, active stage, primary action, on track |
| `--attention` | `#f2b53c` | `#8a5b00` | Needs attention, at risk, pending            |
| `--critical`  | `#ff5d5d` | `#d12f2f` | Critical, blocked, conflict, overdue         |
| `--info`      | `#7aa7ff` | `#2f62d1` | Planned, informational, scheduled            |
| `--ai`        | `#b79cff` | `#6c4bd6` | NOVA AI: suggestions, proposals, assistant   |

Each signal has `-soft` (12% alpha fill) and `-line` (35% alpha border) variants for badges and highlights.

### Light theme ("Daylight review")

A secondary theme for daylight review sessions: `--bg #f6f7f6`, `--surface-1 #ffffff`, `--surface-2 #f0f2f1`, `--text #0f1211`. It is a full token swap; no component contains theme-specific colours.

### Categorical data colours

For charts that compare categories: `--cat-1 … --cat-4` in fixed order — blue `#3987e5`, orange `#d95926`, violet `#9085e9`, magenta `#d55181` in dark; `#2a78d6`, `#eb6834`, `#6250d6`, `#e87ba4` in light. They avoid the signal, attention and critical hues so a series is never read as a status. Validated with a palette checker for lightness band, chroma, colour-vision-deficiency separation (worst adjacent ΔE 16 dark / 19.9 light) and contrast; in light mode magenta is below 3:1 on white, so every chart also offers a table view and direct labels. `--cat-5/6` are avatar tones only.

## Typography

| Role                             | Face                 | Notes                                                                                                    |
| -------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| UI and body                      | **Geist**            | Neutral, technical, legible at 12–14 px                                                                  |
| Numbers, codes, timecodes, dates | **Geist Mono**       | Tabular figures; project codes `NM-25-014`, timecodes `00:00:12:08`                                      |
| Display (sparingly)              | **Instrument Serif** | Only for the workspace title, lens titles and empty-state headlines — a single cinematic, editorial note |

Scale (px / line height): `11/16` caption · `12/18` meta · `13/20` body · `14/22` body-strong · `16/24` title-sm · `20/28` title · `28/32` display-sm · `40/44` display. Letter-spacing: `+0.08em` uppercase eyebrow labels (slate style), `-0.01em` for display.

## Spacing, radius, elevation

- 4 px base grid: 4, 8, 12, 16, 20, 24, 32, 40, 56.
- Radius: `--r-sm 6px` (badges, inputs), `--r-md 10px` (cards), `--r-lg 14px` (drawers, dialogs). Production stills use `--r-md`.
- Elevation through tone: surface-1 → surface-2 → surface-3. Shadows only for floating layers (palette, dialogs, toasts): one soft shadow token.

## Motion

| Token      | Duration | Easing                   | Use                               |
| ---------- | -------- | ------------------------ | --------------------------------- |
| `--m-fast` | 120 ms   | ease-out                 | Hover, press, toggle              |
| `--m-base` | 200 ms   | cubic-bezier(.2,.8,.2,1) | Panels, lens change, list reorder |
| `--m-slow` | 320 ms   | cubic-bezier(.2,.8,.2,1) | Inspector drawer, palette         |

- Motion explains change: a task moving stages slides along the Spine; a resolved attention item collapses.
- One ambient motion only: the "live" pulse dot on the active stage and the SSE indicator.
- `prefers-reduced-motion`: transforms are removed; opacity fades remain at 120 ms.

## Layout

```
Desktop ≥ 1280                                           Tablet 768–1279         Mobile < 768
┌──┬────────────────────────────────────┬─────────────┐  ┌────────────────────┐  ┌──────────────┐
│R │ Command bar                        │             │  │ Command bar        │  │ Bar          │
│a ├────────────────────────────────────┤  Context    │  ├────────────────────┤  ├──────────────┤
│i │ Pipeline Spine                     │  column     │  │ Spine (scrolls)    │  │ Spine chips  │
│l ├────────────────────────────────────┤  (Inspector │  ├────────────────────┤  ├──────────────┤
│  │ Lens canvas (12-col grid)          │   / NOVA)   │  │ Lens canvas        │  │ Canvas (1col)│
│  │                                    │  400–440 px │  │ Context = overlay  │  │ Context=sheet│
└──┴────────────────────────────────────┴─────────────┘  └────────────────────┘  ├──────────────┤
                                                                                 │ Lens tab bar │
                                                                                 └──────────────┘
```

- **Rail** (64 px): lens icons with labels in tooltips; keyboard `1–7` switches lens.
- **Context column**: one column with two modes — _Inspector_ (when an entity is open) and _NOVA_ (assistant). Opening an entity switches to Inspector; references in NOVA answers open the Inspector with a "Back to NOVA" control. Docked on wide screens, overlay below 1280 px, full-height sheet on mobile.
- **Lens canvas**: 12-column grid, 16 px gutters, max content width unbounded (the workspace uses the screen).

## Component patterns

| Pattern                | Spec                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eyebrow label**      | 11 px uppercase, `--text-3`, +0.08em — slate-style section labels ("PRODUCTION · EDIT")                                                        |
| **Status badge**       | Dot + label, signal `-soft` fill, `-line` border, 11/16                                                                                        |
| **Metric**             | Mono value 20–28 px + caption + optional delta and sparkline                                                                                   |
| **Health meter**       | Thin 4 px bar with band colour; numeric score in mono beside it; hover lists deductions                                                        |
| **Production card**    | 16:9 still with bottom scrim, code + stage badge overlaid, title, client, due date (mono), progress bar, assignee avatars                      |
| **Attention item**     | Severity bar on the left edge, title, "why" line in `--text-2`, one primary action button                                                      |
| **Timeline row**       | Label column + time grid; bookings as rounded bars; conflicts hatched in `--critical`                                                          |
| **Panel**              | `--surface-1`, `--r-md`, 16–20 px padding, header row with eyebrow + title + one optional action                                               |
| **PanelState**         | Loading: skeleton matching layout. Empty: Instrument Serif headline + one-line explanation + primary action. Error: message, request ID, Retry |
| **Proposal card (AI)** | `--ai-line` border, "Proposed action" eyebrow, before/after table, Confirm / Cancel; after confirm shows result + link to activity             |
| **Toast**              | Bottom-right, surface-2, signal icon, auto-dismiss 4 s, action link optional                                                                   |

## Accessibility

- Text contrast ≥ 4.5:1 against its surface (checked for both themes); signal colours on dark surfaces checked at their badge sizes.
- Status colours are also used as text on their own tint (badges, alerts). In the light theme they are `#11613c` signal, `#834504` attention, `#9b2b19` critical, `#264fa9` info and `#5b3fb4` AI over a 10% tint (`--tint`): the lightest shades that keep 4.5:1 there. Avatars deepen the series colours (`--avatar-depth`) for the same reason, and state such as "cancelled" is never shown by lowering opacity. `tests/e2e/a11y.spec.ts` runs axe on all thirteen lenses in both themes.
- Status is never colour-only: every signal has an icon or text label.
- Full keyboard paths: rail (`1–7`), palette (`Ctrl/⌘ K`), assistant (`Ctrl/⌘ J`), close layers (`Esc`), list navigation with arrow keys, visible focus ring (`--signal` 2 px outline, 2 px offset).
- Dialogs and drawers trap focus and restore it on close (Radix primitives).
- Live regions announce toasts and assistant replies.
- Hit targets ≥ 32 px on desktop, ≥ 44 px on touch layouts.
