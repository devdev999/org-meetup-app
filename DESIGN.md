---
name: Organisation Meetups / Atrium
description: Warm stone framing, ivory panels, Manrope and broad Activity photography.
colors:
  ink: "#292723"
  ink-hover: "#48463e"
  paper: "#fffefa"
  panel: "#f4f3ed"
  ground: "#b4ab9c"
  muted: "#68665e"
  line: "#dfddd4"
  selected: "#e5e0d0"
  focus: "#74633c"
  control-border: "#9b978a"
  placeholder: "#777368"
  warning: "#93431f"
  error-background: "#fbf0e6"
  error-border: "#d9bdaa"
  success-background: "#eaf0e4"
  success-ink: "#39532d"
  status-background: "#e7eee5"
  status-ink: "#355032"
  warning-background: "#f3e8c8"
  warning-ink: "#66501e"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.6
  action:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.6
  metadata:
    fontFamily: "Manrope, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.6
  status:
    fontFamily: "Manrope, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.6
rounded:
  status: "4px"
  interest: "5px"
  control: "6px"
  table: "8px"
  photograph: "10px"
  panel: "12px"
  frame: "16px"
spacing:
  compact: "8px"
  control-gap: "12px"
  text-gap: "16px"
  form-gap: "18px"
  mobile-inset: "20px"
  panel-inset: "24px"
  content-inset: "26px"
  section-gap: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-secondary-hover:
    backgroundColor: "{colors.selected}"
  input-text:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  navigation-primary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  navigation-section:
    textColor: "{colors.muted}"
    padding: "8px 0 15px"
  chip-interest:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    typography: "{typography.metadata}"
    rounded: "{rounded.interest}"
    padding: "5px 10px"
  status-membership:
    backgroundColor: "{colors.status-background}"
    textColor: "{colors.status-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.status}"
    padding: "4px 8px"
  status-warning:
    backgroundColor: "{colors.warning-background}"
    textColor: "{colors.warning-ink}"
  card-member:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "23px"
  notice:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
  alert:
    backgroundColor: "{colors.error-background}"
    textColor: "{colors.warning}"
    rounded: "{rounded.control}"
    padding: "12px 15px"
  success-message:
    backgroundColor: "{colors.success-background}"
    textColor: "{colors.success-ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  report-table:
    textColor: "{colors.ink}"
    rounded: "{rounded.table}"
---

# Design system: Organisation Meetups / Atrium

## Overview

Atrium places the staff Meetup application inside a warm stone frame. Ivory paper, charcoal controls and untinted Activity photographs give discovery, personal pages and administration one visual identity.

The user selected Atrium from the interactive prototypes. This document records the production implementation in [globals.css](src/app/globals.css) and [layout.tsx](src/app/layout.tsx). [PRODUCT.md](PRODUCT.md) records the selection; [the implementation record](docs/atrium-ui.md) links its preview evidence.

- Warm stone surrounds ivory paper and pale panels.
- Manrope carries headings, body text and controls.
- Broad photographs illustrate Activities.
- Horizontal navigation and compact tables carry the administrative workflows.

## Colors

### Primary

Ink provides text, primary actions and selected navigation marks. Ink hover lightens primary buttons. Paper supplies their text. In CSS, `--accent` aliases the ink value and `--accent-ink` aliases paper.

### Neutral

Ground is the outer stone frame. Paper fills the application; panel distinguishes the header, notices, form guidance and table headings. Muted text and line dividers separate supporting facts. Selected adds a muted olive tone to Interest chips, availability notes and secondary-button hover.

Focus outlines use the focus token. Control border belongs to secondary buttons; line belongs to input borders. Placeholder remains separate from muted body text.

### States

Error messages use warning text, error background and error border. Success messages use the success pair. Membership badges use the status pair; cancelled badges use the warning pair. Status text supplies the meaning alongside color.

Use the same ground, paper, panel and ink tokens across Member and administrative pages.

The sidecar's eight-step tonal ramps are synthesized preview metadata. They do not add production colors.

## Typography

Manrope is the display and body family, with a sans-serif fallback. The local variable font supports weights 200 through 800 and loads with `font-display: swap`. Its files are [manrope.ttf](public/atrium/manrope.ttf) and [OFL.txt](public/atrium/OFL.txt).

| Role | Use |
| --- | --- |
| Display | Page titles; mobile titles reduce to 29px with a 1.22 line height. |
| Headline | Section headings; mobile defaults reduce to 20px. |
| Title | Subsections and form groups. |
| Body | Reading text. Introductory paragraphs stop at 72ch; page descriptions at 68ch. |
| Label | Form labels. |
| Action | Buttons and prominent text links. |
| Metadata | Supporting facts and compact navigation context. |
| Status | Membership badges. |

Photographic feature titles use 27px, reducing to 25px on mobile. Meetup card titles use 18px on desktop and 22px in the mobile single-column list.

Use Manrope for headings, body text and controls, with tabular numerals for dates and counts.

## Layout

The desktop application frame has a maximum width of 1440px, 14px of inner padding and 28px of outer stone. Standard main content stops at 1000px. Discovery, browsing, details, the Member directory and administration use the available frame width. Main padding is 38px vertically at the top, 26px horizontally and 48px at the bottom.

Forms use an 18px row gap. Longer forms pair the editable column with a 280px guidance panel. Details pair their content with a 330px facts panel, sticky 24px below the viewport top. The layout uses local spacing adjustments.

| Maximum viewport width | Change |
| --- | --- |
| 1180px | Outer padding becomes 20px. Meetup cards reduce from four columns to three; supporting columns narrow. |
| 960px | Primary navigation moves below the brand. Meetup and Member grids use two columns. Form guidance hides, detail facts return to normal flow, and tables retain a 650px minimum width inside their scroll region. |
| 700px | The frame fills the viewport with no outer padding or frame rounding. Main content has 20px horizontal padding. Discovery, cards, profiles and details stack. Section navigation scrolls horizontally. Sign-in places its form before its photograph. Fields use 16px text, except the compact browse select and table controls. |

## Elevation & Depth

Atrium has no box shadows. Paper against stone, pale panels, clipped photography and thin dividers establish separation. Focus outlines communicate interaction without changing panel elevation.

Use tone, whitespace and thin dividers to separate content; panels have no shadows.

## Shapes

The frame has the broadest corners. Panels use the panel radius; photographs and the header use the photograph radius. Controls use the control radius, with smaller corners for Interest chips and status badges. Tables have their own intermediate radius.

Avatars and icon links are circles. The brand mark uses three rounded vertical bars. [ui.tsx](src/app/_components/ui.tsx) supplies inline SVG icons with a 24-unit view box, rounded strokes and a 1.6-unit stroke width. The default icon size is 20px.

## Components

### Buttons and fields

Buttons have a minimum height of 44px. Primary actions use ink and paper; secondary actions have a transparent background and the control border. Hover changes background color over 160ms with `ease-out`. Disabled submit buttons use 0.6 opacity and a wait cursor. [ActionForm](src/app/_components/action-form.tsx) changes the submit label to "Saving..." and exposes errors with `role="alert"` and confirmations with `role="status"`.

Fields use paper, a one-pixel line border and a minimum height of 44px. Textareas resize vertically and start at 110px. Search wraps its icon and input in one outlined control. Native checkboxes and radio buttons use ink and measure 18px.

Keyboard focus uses a two-pixel focus outline with a four-pixel offset. Search uses a two-pixel offset around the whole control. The skip link appears on focus. Reduced-motion preference removes transitions and resets scroll behavior to auto.

### Navigation

[AppNavigation](src/app/_components/navigation.tsx) places the brand, primary routes and identity actions in the pale header. The current primary route has a two-pixel ink underline. Member shortcuts sit in a separate compact row. Section navigation uses muted labels and an ink underline with heavier text for the current page.

[Organisation Admin](src/app/admin/layout.tsx) and [Platform Admin](src/app/platform/layout.tsx) reuse the shell, page heading and section navigation. Their compact navigation scrolls on mobile while the page itself remains within the viewport.

### Cards, chips and notices

[OccurrenceCard](src/app/_components/occurrence-card.tsx) places a photograph above unboxed text and a divided participation footer. The image crop is 1.55 on desktop and 1.6 on mobile. Activity or Event labels sit on paper inside the photograph. Member cards use a one-pixel border and paper background.

[InterestGroups](src/app/_components/interest-groups.tsx) displays an Interest and its Shares or Seeks text in a small olive chip. Editable Interests become divided rows with their Stance form. Membership badges show participation through text and color. Notices and empty states use pale panels with readable copy and an available action where applicable.

### Tables

[ReportTables](src/app/_components/report-tables.tsx) keeps report headings, basis text and CSV export links above each table. Tables use pale headers, one-pixel row dividers and panel-colored row hover. Body text is 12px; headings are 11px. Cells have 14px vertical and 16px horizontal padding. The named scroll region accepts keyboard focus. Inline table actions use a compact 36px minimum height.

### Photography

[activityPhoto](src/app/_components/ui.tsx) maps coffee, tea and lunch to coffee; walks and outdoor activities to forest; games and quizzes to board games; and other Activities to workshop. Discovery and [Meetup details](src/app/meetups/occurrence-detail.tsx) disclose that photography is illustrative. Images crop with `object-fit: cover` and keep their original color.

| Asset | Provenance |
| --- | --- |
| [coffee.webp](public/atrium/coffee.webp) | [Recorded Unsplash origin](public/atrium/coffee.webp.json) |
| [walk.webp](public/atrium/walk.webp) | [Recorded Unsplash origin](public/atrium/walk.webp.json) |
| [games.webp](public/atrium/games.webp) | [Recorded Unsplash origin](public/atrium/games.webp.json) |
| [workshop.webp](public/atrium/workshop.webp) | [Recorded Unsplash origin](public/atrium/workshop.webp.json) |

## Do's and Don'ts

### Do

- Do reuse the shared shell and palette for Member, Organisation Admin and Platform Admin pages.
- Do keep Activity, time, Place and participation facts readable beside illustrative photography.
- Do retain visible keyboard focus, pending feedback and labeled horizontal table scrolling.
- Do use the existing Manrope hierarchy, modest corners and flat panels.

### Don't

- Don't mix the Studio or Fieldwork prototype styles into Atrium.
- Don't tint Activity photographs or present stock images as actual Sites, Hosts or Participants.
- Don't shrink mobile report text to fit every column; retain the scroll region.
- Don't add shadows to the flat panel system.
