---
name: Coquerythmo
description: The free bande rythmo editor, presented from inside its own window.
colors:
  topbar: "#1c1c21"
  tabbar: "#17171c"
  video: "#0f0f12"
  toolbar: "#1a1a1f"
  band: "#050508"
  panel: "#17171c"
  page: "#0b0b0e"
  btn: "#2e2e36"
  btn-hover: "#383842"
  btn-press: "#24242b"
  btn-text: "#dcdce6"
  accent: "#7366d9"
  accent-strong: "#8c80ff"
  accent-bg: "#29263f"
  accent-bg-hover: "#3b3361"
  accent-text: "#d2cdf5"
  slider-fill: "#5952bf"
  slider-track: "#33333d"
  tab-active: "#2b2b36"
  tab-underline: "#6b8cff"
  focus: "#6194f5"
  icon: "#bfbfcc"
  text: "#e0e0e0"
  text-dim: "#a3a3b3"
  text-faint: "#8a8a99"
  playhead: "#ff050d"
  boucle: "rgb(230 38 38 / 0.9)"
  out: "rgb(217 115 115 / 0.7)"
  scene: "rgb(230 230 240 / 0.78)"
  tick: "rgb(100 100 115 / 0.5)"
  line-border: "rgb(128 128 140 / 0.3)"
  line-bg: "rgb(20 20 26 / 0.3)"
  read-word: "#ffe14d"
  ambiance: "#338cff"
  c-red: "#ff4d4d"
  c-green: "#4dff4d"
  c-blue: "#4d80ff"
  c-yellow: "#ffff4d"
  c-orange: "#ff8033"
  c-purple: "#cc4dff"
  c-cyan: "#33cccc"
  paper: "#dddddd"
  ink: "#344c66"
typography:
  display:
    fontFamily: "Archivo Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(26px, 6.1cqw, 76px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 88"
  headline:
    fontFamily: "Archivo Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.2rem + 2vw, 3rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 82"
  title:
    fontFamily: "Archivo Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.05rem + 0.6vw, 1.5rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  lede:
    fontFamily: "Archivo Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 0.95rem + 0.4vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Archivo Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1
  character-label:
    fontFamily: "Archivo Variable, Segoe UI, system-ui, sans-serif"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
rounded:
  line: "2px"
  sm: "4px"
  dropdown: "6px"
  md: "8px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
  gutter: "clamp(16px, 4vw, 48px)"
components:
  text-button:
    backgroundColor: "{colors.btn}"
    textColor: "{colors.btn-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "24px"
  text-button-hover:
    backgroundColor: "{colors.btn-hover}"
  text-button-press:
    backgroundColor: "{colors.btn-press}"
  text-button-accent:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.sm}"
  text-button-accent-hover:
    backgroundColor: "{colors.accent-bg-hover}"
  text-button-lg:
    padding: "0 16px"
    height: "36px"
  icon-button:
    textColor: "{colors.icon}"
    rounded: "{rounded.sm}"
    size: "32px"
  tab:
    textColor: "{colors.text-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    width: "164px"
    height: "36px"
  tab-active:
    backgroundColor: "{colors.tab-active}"
    textColor: "#ffffff"
  dropdown:
    backgroundColor: "{colors.btn-press}"
    textColor: "{colors.text}"
    rounded: "{rounded.dropdown}"
    padding: "4px"
    width: "240px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
  line-box:
    backgroundColor: "{colors.line-bg}"
    rounded: "{rounded.line}"
    padding: "0.12em 0.45em"
  chapter-strip:
    backgroundColor: "{colors.band}"
    padding: "32px clamp(16px, 4vw, 48px) 16px"
  work-copy:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
---

# Design System: Coquerythmo

## Overview

**Creative North Star: "La fenêtre Coquerythmo"**

The site doesn't take its visual language from web marketing. It borrows the desktop app's own chrome. The page is the Coquerythmo window: a 32px menubar, a 36px tab bar, a video zone holding a light-grey work copy, a 76px two-row toolbar, and a near-black bande rythmo under a fixed red reading bar. Every value comes from the app's wgpu theme (`src/ui/theme.rs` and the widget sources) and is converted from 0–1 floats. Only the names are web-side. Below the window, each chapter opens with a slim band strip, and the numbered boucle marker on that strip marks the chapter.

The density is app-dense in the chrome (13px UI labels, 24–32px controls, 4px gaps) and editorial in the chapters (17px body, 62–65ch measures, 48–96px vertical rhythm). The surface is dark and neutral with a slight blue-violet cast. Colour comes from the band itself: character colours, the red playhead, markers, and one violet accent for actions and selection.

The motion grammar has two speeds. Anything on the band moves as linear time from right to left. Chrome state changes are near-instant (80ms). The band is also a real control: dialogue lines are buttons, and the download links are dialogue lines parked on the reading bar.

**Key Characteristics:**
- Dark tonal zones stacked like the app window: topbar, tabs, video, toolbar, band.
- A single violet accent (#7366d9 family) for actions, selection and slider fill. Blue (#6194f5) is reserved for focus.
- Archivo Variable is the only family. Its width axis (`wdth` 82–110) carries hierarchy and dialogue stretch.
- Character labels in bold italic uppercase, double-underlined in the character colour.
- Band elements (lines, labels, markers, reading bar) serve as buttons and presentation devices.
- Chrome changes state instantly. Band time is linear.

## Colors

The neutrals are dark and faintly cool, with the app's violet on actions and a saturated band vocabulary (playhead red, marker reds, eight brush-preset character colours).

### Primary
- **App Violet** (accent): Accent TextButton border, selected tool outlines, checkbox checked border (via accent-strong), action-line borders on the band. It means "you can act here" or "this is selected."
- **Violet Well** (accent-bg, accent-bg-hover): The fill behind accent buttons such as the topbar "Télécharger." Violet stays a tinted well with light violet text (accent-text). It is never a solid slab.
- **Slider Violet** (slider-fill): Slider progress and checked checkboxes.
- **Selection Veil** (`rgb(77 69 191 / 0.3)`, 0.5 on hover): Pressed icon buttons, checked dropdown items, `::selection`.

### Secondary
- **Focus Blue** (focus): Every focus ring. On the band canvas it is also the 2px frame drawn around a focused line. It never marks selection.
- **Tab Blue** (tab-underline): Only the 2px underline under the active tab. It is a separate value from Focus Blue.

### Tertiary (the band vocabulary)
- **Reading Bar Red** (playhead): The fixed 3px reading bar with a 10px red glow (`rgb(255 0 8 / 0.55)`). The page has exactly one of these per band.
- **Boucle Red** (boucle), **Out Rose** (out), **Scene White** (scene): Marker lines. The boucle red also colours the chapter-strip boucle number.
- **Karaoke Yellow** (read-word): The word currently under the reading bar.
- **Ambiance Blue** (ambiance, with ambiance text `#f21f29`): Ambiance labels and lines.
- **Character presets** (c-red, c-green, c-blue, c-yellow, c-orange, c-purple, c-cyan, plus white): The app's brush presets, used as the demo cast's colours. Orange is the default label colour.

### Neutral
- **Topbar Slate** (topbar), **Tab Rail** (tabbar), **Video Black** (video), **Toolbar Graphite** (toolbar), **Band Black** (band), **Page Ink** (page): Each app zone keeps its own value. Chapters sit on Page Ink, which is between Video and Band.
- **Panel Graphite** (panel) with a `rgb(46 46 56 / 0.6)` border: Dialogs, settings, export centre, warnings.
- **Button Graphite** (btn / btn-hover / btn-press) with a `rgb(89 89 107 / 0.6)` border: TextButton states.
- **Text** (text), **Dim** (text-dim), **Faint** (text-faint): Primary copy, ledes and prose, then hints and metadata.
- **Work-copy Paper and Ink** (paper, ink; soft ink `#4d627a`): The light-grey frame inside the video zone and its blue-grey drawing ink. This is the only light surface in the system.

### Named Rules
**The Violet Means Action Rule.** Violet marks something you can act on or something selected. Focus is always Focus Blue. Neither colour stands in for the other.

**The One Reading Bar Rule.** Red at playhead intensity with a glow belongs only to the reading bar. Marker reds are translucent and have no glow.

## Typography

**Display Font:** Archivo Variable (with Segoe UI, system-ui, sans-serif), self-hosted from `@fontsource-variable/archivo` with both the upright and italic width-axis files.
**Body Font:** Archivo Variable
**Label Font:** Archivo Variable. The canvas band uses the same stack (500 for dialogue, italic 700 for labels).

**Character:** One grotesque does everything. Hierarchy comes from width and weight, not from a second family. Condensed widths read as broadcast and dubbing slate. The body stays at `wdth` 100.

### Hierarchy
- **Display** (800, clamp(26px, 6.1cqw, 76px), lh 0.98, `wdth` 88): Only the H1 inside the work copy, sized to the frame's container. On mobile it becomes clamp(34px, 11cqw, 48px).
- **Headline** (strip line 500 at `wdth` 82, lh 1.05; container title 400): Chapter-strip titles. The label before the headline is a character label at 0.62em. Below 720px the headline is clamp(1.5rem, 7vw, 2rem).
- **Title** (700, clamp(1.25rem → 1.5rem), lh 1.15, -0.01em): Sub-heads inside chapters.
- **Lede** (400, clamp(1.0625rem → 1.25rem), lh 1.5, max 62ch, Dim): The opening paragraph of a chapter. Strong words switch to Text at 600.
- **Body** (400, 1.0625rem, lh 1.55, max 65ch in prose): Chapter copy.
- **Label** (500, 0.8125rem, lh 1): Menus, tabs, buttons, dropdown items, tooltips. Hints and timecodes use 0.75rem.
- **Character label** (italic 700, uppercase, +0.01em, lh 1): Speaker names on the band, in strips and in dropdown codes.

### Named Rules
**The Width Axis Rule.** Condense to signal voice. Use `wdth` 82 for strip lines, 86–90 for workspace and export titles, 88 for the display H1, and 110 only for spread syllable legends. Body copy stays at 100.

**The Stretched Line Rule.** On the band, dialogue text is scaled horizontally across its duration (scale 0.2–3.2). Download and action lines cap at 1.9 so they stay readable at a glance.

## Layout

The first viewport is the window: a sticky 32px topbar, then a grid of a 36px tab bar and the active workspace. The window height is `100svh` minus the topbar, clamped to 620–1080px. The workspace is a three-row grid: a video zone that flexes, the toolbar, and the band. The video zone is a size container. The work copy inside it is the largest 16:9 box that fits (`min(100cqw, 100cqh * 16/9)`), split 1.18fr : 1fr between H1 and lips drawing.

Chapters below the window use one shared frame: a 1240px max-width, `gutter` side padding (clamp 16–48px), 48px top padding and 96px bottom padding. Each chapter opens with a full-bleed chapter strip. Spacing follows a 4px base (s1–s9). Chrome gaps are 2–4px. Chapter gaps are 24–64px.

**Responsive.** The window folds, but the band stays a band.
- **Below 1100px:** the centred filename and toolbar hint hide.
- **Below 900px:** the menubar collapses into a "Menus" button that opens a dropdown-styled list, with submenus inlined.
- **Below 720px:**
  - the topbar grows to 44px;
  - the window height becomes auto;
  - tabs size to content and scroll horizontally;
  - the work copy stacks to one column with no fixed aspect ratio;
  - the toolbar scrolls horizontally at max-content;
  - strip titles keep the label and line on the same row.

The canonical breakpoints are 1100, 900 and 720px.

**The Window First Rule.** The first screen is app chrome at app dimensions (32 / 36 / 76px). It is never a centred marketing hero.

## Elevation & Depth

Depth comes mostly from tonal zones: each app region has its own near-black value, and 1px borders or a 1px topbar shadow line separate them. Real shadows appear only on things that float above the window, such as menus, tooltips, toasts, dialogs and the work copy. Each of those shadows is soft, black and non-directional in hue.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 4px 12px rgb(0 0 0 / 0.5)`): Dropdowns, tooltips, the collapsed menubar list.
- **Toast** (`box-shadow: 0 8px 24px rgb(0 0 0 / 0.5)`): The welcome toast.
- **Panel** (`box-shadow: 0 1px 0 rgb(255 255 255 / 0.03) inset, 0 12px 32px rgb(0 0 0 / 0.45)`): Dialogs and export or settings panels.
- **Work copy** (`box-shadow: 0 16px 40px rgb(0 0 0 / 0.5)`): The paper frame in the video zone.
- **Reading bar glow** (canvas `shadowBlur` 10, `rgb(255 0 8 / 0.55)`): Only the playhead.
- **Pressed ring** (`box-shadow: inset 0 0 0 1px rgb(115 102 217 / 0.6)`): Pressed icon buttons and the checked brush size.

### Named Rules
**The Zones Not Shadows Rule.** Surfaces in the window are separated by tone and 1px lines. A shadow means the element floats above the window.

## Shapes

Corners are small and app-true. Controls use 4px. Panels, toasts and warnings use 8px. Dropdown panels use 6px. Dialogue line boxes and band hit targets are almost square at 2px. The slider thumb is the one circle (14px). Workspace and section transcriptions keep the radius of their own Rust source, so some app modal cards are rounder (the microphone modal is 14px). Those radii stay with the surface they came from. Borders are always 1px and translucent grey (`rgb(89 89 107 / 0.6)` on buttons, `rgb(77 77 92 / 0.6)` on floats, `rgb(46 46 56 / 0.6)` on panels). The band's ruler draws alternating 12px and 6px ticks every 12px. The chapter strip repeats that ruler in CSS, and page scroll drives its offset.

## Components

### Buttons
The buttons are the app's TextButton and IconButton, taken literally.
- **Shape:** gently squared (4px).
- **TextButton:** Button Graphite fill with a 1px translucent grey border and Label type. The standard height is 24px with 12px side padding. The large variant is 36px with 16px padding at 0.875rem.
- **Accent TextButton:** Violet Well fill, a 90% violet border and light violet text. Hover deepens the well and brightens the border to accent-strong. Only one or two appear per screen: "Télécharger" in the topbar and the download actions.
- **Hover / Press:** background and border step to the hover or press values in 80ms. Disabled buttons drop to 45% opacity.
- **IconButton:** 32px (28px in the topbar), transparent, with the app's black-filled SVG icons tinted through a mask (20px). On hover it gets an 8% white veil and the icon turns white. When pressed, the Selection Veil appears with a violet inset ring.

### Tabs
- 164px wide in a 36px rail with 4px radius and Dim text. Hover gives #26262e and Text colour. The selected tab gets Tab Active fill, white text and a 2px Tab Blue underline inset 8px from each side. Below 720px, tabs size to their content.

### Dropdown and Tooltip
- **Dropdown:** a two-stop vertical gradient (`#262629` → `#1f1f24`), a 1px border, 6px radius, the Float shadow, 4px padding and a 240px minimum width. Items are 30px tall with 4px radius. Hover gives a 7% white veil. Checked or current items get the Selection Veil. A focused item gets an inset 1px Focus Blue line. Right-aligned hints are Faint at 0.75rem.
- **Tooltip:** a translucent gradient (97% opacity), 4px radius, 6px × 12px padding and Label type. It rises 2px as it appears (80ms). Keyboard shortcuts show in `kbd` chips with a 2px bottom border.

### Inputs / Fields
- **Slider:** 100px wide, with a 4px track (slider-track) filled in Slider Violet up to the value. The 14px thumb is `#d9d9e6` and turns white on hover.
- **Checkbox:** an 18px box on `#13131a` with a 4px radius and a hover-grey border. When checked it fills with Slider Violet and gets an accent-strong border, and the white tick scales in over 80ms.

### Panels
- Panel Graphite with a panel border, 8px radius and the Panel shadow. The header row is 40px with 600-weight Label and a bottom border. The body has 16px padding. Panels are used for settings, dialogs and inline warnings.

### Character Label
- Bold italic uppercase in the character colour. Two 0.07em underlines sit at the bottom and 0.16em above it, both in the same colour. This is the site's signature type device. It appears on the band, in chapter strips and in the work-copy "gratuite" (in the paper world, that word is set in `#c01f2a` with thinner 0.055em rules).

### Line Box
- A 1px `line-border` box on `line-bg` with a 2px radius and 0.12em × 0.45em padding. It is the DOM twin of a band dialogue line and shows dialogue quoted in prose.

### Chapter Strip
- A full-bleed Band Black bar with 1px `#16161c` rules above and below. The ruler ticks along its top edge scroll with the page. The left column holds a boucle marker: a 2px Boucle Red vertical line with the SVG cross and the chapter number. The right column holds a character label and the chapter headline. On entrance the boucle line drops through the ruler (520ms) and the title arrives from 40px to the right (640ms), both on `--ease-out`. Reduced motion skips both.

### The Band (signature)
- A canvas renderer at 24 fps on Band Black with up to 4 tracks, a ruler, a fixed 3px Reading Bar and markers. Dialogue is set in 500-weight Archivo and stretched over its duration. The label sits before the line, and the gap is max(8px, 4 frames).
- **Interaction:**
  - drag to scrub (cursor `grab`);
  - Space plays;
  - Numpad and the toolbar add markers;
  - clicking a line selects it and shows 6px handles;
  - a focused line gets a 2px Focus Blue frame drawn on the canvas.
- **Accessibility:** the host is a `group` with `aria-roledescription="bande rythmo"`.
- **Band-as-button pattern:** action lines (downloads, links) draw a violet body (`rgb(115 102 217 / 0.16)`, 0.3 on hover) with a 55% accent-strong border and white text. Each one is mirrored by a real `<a>` hit target over the canvas that carries the href, an `aria-label` and a description. Focusing a hit target seeks the band so the line is on screen. The hero band parks with the OS download lines on the Reading Bar, and the visitor's OS comes first.

### Work Copy
- A light-grey paper frame with Ink text inside the video zone. A burned timecode sits top-left: black chip, white 600 text, +0.04em. A small italic tag bottom-right says the project is a fictional demo. The hand-drawn lips come from the app. The frame is the only place dark-on-light type appears.

### Navigation
- The topbar is the navigation: sticky, 32px, Topbar Slate with a 1px shadow line. It holds a bold italic brand wordmark, transparent 26px menu buttons with a veil on hover or when open, and a dropdown panel for each menu. Discord, "Télécharger" and settings sit on the right. Below 900px the menus fold into one "Menus" button.

## Do's and Don'ts

### Do:
- **Do** take every new colour, radius and size from the app's theme sources and convert the floats exactly. Name it web-side, but keep the value.
- **Do** build new controls from TextButton, IconButton, dropdown, tab, slider, checkbox and panel before inventing a shape.
- **Do** open every chapter with a chapter strip. Its boucle number is the chapter index and its headline is a character label plus a line.
- **Do** make band elements real controls. Pair any clickable canvas line with a positioned `<a>` or `role="button"` that has a meaningful `aria-label`.
- **Do** keep chrome transitions at 80ms (`--t-fast`) or 180ms (`--t-med`). Keep band motion linear from right to left, and honour both `prefers-reduced-motion` and the in-page `reduce-motion` setting.
- **Do** use Focus Blue (2px outline, 2px offset) for every focus ring, including the ones drawn on the canvas.

### Don't:
- **Don't** put a centred marketing hero with a screenshot and pill buttons above the window. The first screen is the window.
- **Don't** use violet for focus or blue for selection.
- **Don't** add a second typeface. Use Archivo's width axis instead.
- **Don't** give anything except the reading bar a saturated red glow.
- **Don't** fill a light surface anywhere except the work copy.
- **Don't** round shared controls (buttons, tabs, fields, dropdowns, panels) beyond the chrome scale of 2, 4, 6 and 8px, and don't add pill shapes the app doesn't draw. Larger corners are allowed only when you transcribe a specific app surface whose source uses them, such as the microphone modal card at 14px in `microphone_modal.rs`.
