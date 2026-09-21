---
name: "Organisation Meetups prototype comparison"
description: "Provisional tokens for /prototype/ui only. No production visual direction is approved."
colors:
  atrium-ink: "#292723"
  atrium-muted: "#68665e"
  atrium-ground: "#b4ab9c"
  atrium-paper: "#fffefa"
  atrium-panel: "#f4f3ed"
  atrium-line: "#dfddd4"
  atrium-selected: "#e5e0d0"
  atrium-focus: "#74633c"
  fieldwork-ink: "#243d32"
  fieldwork-muted: "#586e5e"
  fieldwork-ground: "#edf1e9"
  fieldwork-paper: "#f7f9f3"
  fieldwork-panel: "#e8eee2"
  fieldwork-line: "#d5ded0"
  fieldwork-accent: "#294c3b"
  fieldwork-selected: "#dce7ca"
  fieldwork-focus: "#2d6950"
  studio-ink: "#342e41"
  studio-muted: "#6b6575"
  studio-ground: "#ece9f2"
  studio-paper: "#fdfcfb"
  studio-panel: "#f2f0f5"
  studio-line: "#ddd8e5"
  studio-accent: "#51405f"
  studio-accent-ink: "#fff"
  studio-selected: "#ddd3f0"
  studio-focus: "#7558a0"
  status-good-background: "#e7eee5"
  status-good-ink: "#355032"
  status-pending-background: "#f3e8c8"
  status-pending-ink: "#66501e"
  comparison-background: "#292a29"
  comparison-ink: "#f9faf7"
typography:
  atrium-display:
    fontFamily: '"Manrope preview", sans-serif'
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  fieldwork-display:
    fontFamily: '"Manrope preview", sans-serif'
    fontSize: "37px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  studio-display:
    fontFamily: '"Manrope preview", sans-serif'
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '"Manrope preview", sans-serif'
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Manrope preview", sans-serif'
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: '"Manrope preview", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  button-label:
    fontFamily: '"Manrope preview", sans-serif'
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.55
rounded:
  control: "6px"
  panel: "12px"
  studio: "3px"
  table: "8px"
  status: "4px"
  comparison: "13px"
spacing:
  control-inline: "18px"
  panel: "25px"
  section: "30px"
  mobile-gutter: "20px"
  form-gap: "21px"
components:
  atrium-button-primary:
    backgroundColor: "{colors.atrium-ink}"
    textColor: "{colors.atrium-paper}"
    typography: "{typography.button-label}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  fieldwork-button-primary:
    backgroundColor: "{colors.fieldwork-accent}"
    textColor: "{colors.fieldwork-paper}"
    typography: "{typography.button-label}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  studio-button-primary:
    backgroundColor: "{colors.studio-accent}"
    textColor: "{colors.studio-accent-ink}"
    typography: "{typography.button-label}"
    rounded: "{rounded.studio}"
    padding: "11px 18px"
  atrium-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.atrium-ink}"
    typography: "{typography.button-label}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  atrium-field:
    backgroundColor: "{colors.atrium-paper}"
    textColor: "{colors.atrium-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
    width: "100%"
  studio-navigation-active:
    backgroundColor: "#dcd2ed"
    textColor: "#443354"
    rounded: "{rounded.studio}"
    padding: "12px 10px"
    width: "100%"
  status-good:
    backgroundColor: "{colors.status-good-background}"
    textColor: "{colors.status-good-ink}"
    rounded: "{rounded.status}"
    padding: "4px 9px"
  atrium-join-panel:
    backgroundColor: "{colors.atrium-panel}"
    textColor: "{colors.atrium-ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  studio-table:
    backgroundColor: "{colors.studio-paper}"
    textColor: "{colors.studio-ink}"
    rounded: "{rounded.table}"
    width: "100%"
  comparison-toggle:
    backgroundColor: "{colors.comparison-background}"
    textColor: "{colors.comparison-ink}"
    rounded: "{rounded.comparison}"
    padding: "0 16px"
---

# Design system: Organisation Meetups prototype comparison

## Overview

**Creative North Star: "Atrium, Fieldwork, and Studio, provisional prototypes"**

This document records the three interactive styles at `/prototype/ui`, including Member screens, Organisation Admin screens, and Platform Admin screens. No production direction has been approved. Outside this route, the existing application styles in `src/app/globals.css` remain authoritative. The frontmatter is normative only for the prototype rules recorded here.

Atrium follows the supplied warm architectural references. Fieldwork puts dates and times first. Studio uses a compact directory with violet panels. The user requested alternatives to the usual Meetup and Luma styling. These are comparison candidates, not a combined production identity.

**The Prototype Scope Rule.** Apply these tokens only within `/prototype/ui` until the user chooses a production direction.

**Key Characteristics:**

- Atrium combines warm stone, ivory, and charcoal with horizontal navigation and broad photographs.
- Fieldwork combines forest green and sage with a narrow navigation rail and a date-led schedule.
- Studio combines violet, white, and aubergine with a compact directory and rectangular panels.
- All three styles share Manrope controls, explicit statuses, and the same sample actions.

Source evidence is `src/app/prototype/ui/prototype.css`, `prototype.tsx`, `components.tsx`, and the discovery, Member, and administration screen components. The route is disabled in production builds. This record describes the code at `a57c7ac` and does not select a winner.

## Colors

Each prefix in the frontmatter names one complete prototype palette. Colors are extracted from the route's custom properties. Atrium uses its ink as its accent and its paper as accent text. Fieldwork also uses paper as accent text. Studio has a separate white accent-text token.

### Primary

| Style     | Action and selection colors               | Use                                                               |
| --------- | ----------------------------------------- | ----------------------------------------------------------------- |
| Atrium    | Charcoal ink and warm selected fill       | Primary actions, selected calendar dates, and Availability panels |
| Fieldwork | Forest accent and sage selected fill      | Primary actions, the navigation rail, and selected dates          |
| Studio    | Aubergine accent and violet selected fill | Primary actions, profile panels, and the introduction panel       |

### Neutral

Each style has ground, paper, panel, ink, muted, and line colors. Ground frames the app, paper holds the main content, and panel separates supporting content. Muted text identifies metadata. Lines divide rows and outline fields.

Good and pending statuses use the shared green and ochre pairs. Neutral statuses inherit the active panel and muted text. The dark comparison toolbar has its own palette and stays visually separate from all three candidates. Exact navigation hover colors remain in the sidecar snippets because they are component states, not an additional palette scale.

## Typography

The prototype loads the local variable Manrope font from `/prototype-ui/manrope.ttf`, with a sans-serif fallback. Its declared weight range is 200 to 800; the recurring text roles use 400, 500, 600, and 700. No second font or mathematical type scale is defined.

The display tokens describe desktop page headings. Section headings use `headline`, item headings use `title`, and body text uses `body`. Buttons use `button-label`. At 960px and below, general page headings become 31px. At 700px and below, they become 30px with a 1.22 line height. Detail and profile headings have local overrides.

Times and other numbers use tabular figures. Body descriptions have a 68ch limit where the prose component applies. Compact metadata has local sizes rather than a separate global scale. Mobile form fields use 16px text.

## Layout

| Style     | Desktop structure                                           | Repeated content                                                                        |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Atrium    | A centred app up to 1440px wide, with horizontal navigation | A broad photographic feature beside an agenda; four Meetup columns                      |
| Fieldwork | An app up to 1600px wide, with a 96px navigation rail       | A time column, thumbnail, description, and action per schedule row; a supporting agenda |
| Studio    | An app up to 1500px wide, with a 215px directory rail       | A violet introduction beside an untinted photo; two columns of compact Meetup rows      |

The CSS adjusts density at 1180px, 960px, and 700px. At 960px, detail and administration overview layouts stack, Atrium's Meetup grid has two columns, and Studio's Meetup index has one. Fieldwork's agenda is hidden at this width. Tables keep a 630px minimum width inside their scroll region.

At 700px, all shells become full-width and both rails become navigation rows above the content. The main content has 20px side gutters. Discovery, Member cards, and profile layouts stack. Fieldwork hides schedule thumbnails while preserving the time column. The shared form uses a 21px row gap; paired fields remain paired where the source defines them.

The comparison toolbar initially opens above 700px and initially collapses to a 44px-tall Compare styles button on smaller screens. Users can collapse or expand it at either size. Its state survives screen and style changes during the current demo session. The prototype reserves bottom space for the toolbar; it is preview tooling, not a production navigation pattern.

## Elevation & Depth

Content uses flat paper, panel fills, and one-pixel dividers. Cards do not have elevation shadows. The fixed comparison toolbar uses the single recorded shadow in the sidecar. Focus uses a two-pixel outline with a four-pixel offset; the search wrapper uses a two-pixel offset. Each style supplies its own focus color.

Buttons transition background and text colors over 160ms with ease-out. Primary buttons brighten on hover; secondary buttons gain the selected fill. The reduced-motion media query removes transitions and restores automatic scrolling.

## Shapes

Atrium and Fieldwork use the shared panel radius; Studio uses its smaller panel radius. Atrium's outer shell has 16px corners. Fieldwork's shell is square, and Studio's shell follows the Studio radius. All shells become square on mobile.

Controls have the shared control radius except Studio buttons, which use the Studio radius. Tables retain their shared table radius in every style. Avatars and directional action buttons are circular. Preserve these component exceptions rather than applying one radius to every element.

## Components

**The Shared Controls Rule.** Use the active style's palette for buttons, fields, panels, and tables. Keep their labels and actions consistent when the style changes.

- Primary buttons use the active accent pair, a one-pixel accent border, and a minimum height of 44px. Secondary buttons use transparent backgrounds and the active line color. Disabled buttons have reduced opacity and a default cursor.
- Search fields group an SVG search icon with the input. The wrapper owns the focus outline. Standard fields use the paper fill, line border, and a minimum height of 44px.
- Atrium navigation marks the current page with an underline. Fieldwork selects a sage tile inside its green rail. Studio selects a violet row with heavier text. Personal and administration tabs use an underline in all styles.
- Status chips use visible words and compact fills. Interest chips use the active panel fill. Neither is a substitute for a field label or a section heading.
- Join panels, Member cards, and supporting form panels share the active panel fill and panel radius. The sidecar includes the join panel as the shared card example.
- Administration tables use muted header text on the panel fill, one-pixel row dividers, and a panel-colored row hover state. Captions and scroll regions remain labelled.
- The comparison control includes a persistent expand/collapse button. Expanded controls expose all three style names, previous/next controls, a screen selector, and Reset demo.

**The Visible Status Rule.** Keep the status text alongside its color, including Pending, Active, and Suspended states.

The version 2 sidecar contains ten self-contained component samples. Their colors are resolved locally because the source properties belong to the prototype wrapper, not the document root. Its synthesized tonal ramps are swatch previews only; the application does not use them.

Not canonized as production rules: the comparison toolbar, compact preview metadata, fixed sample content, and illustrative photographs. This extraction adds no production components or visual approval.

## Do's and Don'ts

### Do:

- Do preserve the three named styles as separate comparison candidates.
- Do retain the current screen and sample state when switching styles.
- Do keep visible keyboard focus, labelled fields, and text status labels.
- Do keep administration tables in labelled, keyboard-focusable horizontal scroll regions when space is limited.

### Don't:

- Don't apply these provisional tokens to production routes before a direction is approved.
- Don't treat preview-only comparison controls or fictional photographs as production brand commitments.
- Don't replace SVG icons with text glyphs or use color alone to communicate status.
