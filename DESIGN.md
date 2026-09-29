---
version: alpha
name: Assidua
description: >
  Gerenciador de medicamentos para pacientes crônicos, idosos e seus
  cuidadores. A identidade visual se subordina à legibilidade do usuário
  mais frágil.

colors:
  primary: "#4f46e5"
  primary-hover: "#4338ca"
  primary-active: "#3730a3"
  on-primary: "#ffffff"
  primary-soft: "#eef2ff"
  primary-edge: "#c7d2fe"

  background: "#f8fafc"
  surface: "#ffffff"
  surface-alt: "#f1f5f9"
  border: "#e2e8f0"

  text: "#1e293b"
  text-secondary: "#64748b"
  text-muted: "#8190a6"

  success: "#15803d"
  on-success: "#ffffff"
  warning: "#b45309"
  delayed: "#a16207"
  error: "#c81e1e"

typography:
  display:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 700
  metric:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: 700
  home-header:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 700
  heading:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 700
  section:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 700
  critical:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 700
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
  label:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 600
  caption:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
  micro:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
  micro-tight:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600

rounded:
  sm: 8
  md: 12
  lg: 16
  xl: 20
  xxl: 28
  full: 9999

spacing:
  none: 0
  xxs: 2
  xs: 4
  sm: 8
  md: 12
  lg: 16
  xl: 20
  xxl: 24
  xxxl: 32
  huge: 40

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-destructive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  chip:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.micro}"
    rounded: "{rounded.full}"
  badge:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.micro}"
    rounded: "{rounded.full}"
  dose-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  toast:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
---

## Overview

Assidua is a medication management app for people with chronic conditions and
the caregivers who support them. The primary user is an older adult, often with
reduced vision or reduced fine motor control. **Legibility outranks
aesthetics, always.**

The interface should feel calm, plainspoken, and unhurried. It is a tool
someone opens several times a day to confirm their body is being cared for. It
never scolds, never scores, never congratulates performatively.

**This product deliberately does not use the Design Narniano visual
identity.** That system's ornaments — capitals, ornamental frames, signature
italics — reduce legibility precisely for the user who most needs clarity. It
is a recorded decision, not an omission, and it is the same principle that
forbids paywalling the patient's own history and that requires safety warnings
to sit outside the plan barrier. Aesthetics are subordinate to clarity.

The emotional target is *reassurance*, not motivation. A person who already
has a chronic condition does not need to be inspired. They need to be told
what is true, and not told what they did wrong.

**This file is documentation, not the source of truth.** `app/constants/theme.ts`
holds the colors and `app/constants/tokens.ts` holds the geometry; both are
enforced by tests (`color-contrast`, `design-tokens`, `typography`). If this
document and the code disagree, the code is right and this file is stale.

## Colors

A single violet accent over cool slate neutrals. The accent is reserved for
one primary action per screen and for the header. It is never decorative.

> **Hue lock — do not re-derive the accent.** The primary is a deep violet,
> not indigo, not blue. Hue ≈ 262°, high saturation, and it must not shift
> toward the blue side. Deriving a variant is permitted only by changing
> lightness. Do not substitute `#6366f1`, `#3b82f6`, or any Tailwind
> `blue-*` value.

The app ships **four palettes**, all in `theme.ts`: `lightColors`,
`darkColors`, `highContrastLightColors`, `highContrastDarkColors`. This
document's `colors` block describes the light theme; the dark variants are
calibrated independently, not mechanically inverted.

- **Primary (#4f46e5):** Buttons, active tab, Home header. Corrected from
  `#6366f1` on 2026-08-14, which measured 4.47:1 on white — below the 4.5:1
  floor for normal text, and it was also the header background, so the one
  change fixed both.
- **Success (#15803d) · Warning (#b45309) · Delayed (#a16207):** Three
  distinct dose states that must be tellable apart at a glance, not only by
  reading. Warning is genuinely overdue past 24h; Delayed is 30min–24h. They
  are different colors on purpose.
- **Error (#c81e1e), corrected 2026-09-28** from `#ef4444`, which measured
  3.76:1 on white and 3.89:1 on dark surfaces. It had no test coverage at all
  and shipped for the app's whole life. Reserved for destructive actions and
  validation errors.
- **on-success:** a distinct token, added 2026-09-28. The success Toast paints
  its whole container green; white text on the dark theme's light green measured
  2.28:1, the worst contrast in the app, and the suite never tested a
  background color. Same pattern as the existing `on-brand`.

### Compliance target

**WCAG 2.2 AA** for the normal themes: 4.5:1 for normal text, 3:1 for large
text and UI components. Not AAA, and not APCA — APCA is not normative and is
not this product's criterion.

**WCAG 2.2 AAA (7:1)** is the target of the Alto Contraste mode alone
(v1.3, approved 2026-09-02), for people with genuinely low vision rather
than a preference. It has no exceptions — not even the muted text level.

`text-muted` (#8190a6, 3.24:1) is the one documented exception in the normal
themes: the lightest of the three text levels, for captions and icons, never
for small body copy. Small text that must sit there uses `text-secondary`.

## Typography

One family throughout: **Inter**, chosen for a tall x-height that stays
legible at small sizes. Weight carries hierarchy; no screen mixes more than
two weights.

**Hierarchy is by function, not by raw size.** The single most important
thing on a dose card — the medication name and time — is `critical` (17px
semibold), while screen titles are `display` (28px). Titles are *bigger* than
the clinical data and still matter *less*: reading the next dose must never
require hunting. The inversion is deliberate and is the most consequential
decision in this scale.

**Floor: 13px.** The app shipped `fontSize: 10` and `11` in eight places;
those were raised to 13 on 2026-09-28. `micro-tight` (12px) survives as a
documented exception for tight badges — it is 1px under the floor and was
kept on purpose, because rewriting 27 call sites for 1px is a large diff for
no legibility gain. The typography test enforces the illegible range (below
12) and ignores test fixtures.

An in-app text size control (normal / large / extra large, up to 1.3×) exists
because the audience does not find the OS setting. Every layout must survive
it, which is why line heights are unitless multipliers.

## Layout

Mobile-first, 4px grid. Screen margin 16px, card padding 16px, related items
8px apart, unrelated groups 24px. A section break is made of space, not a
divider line.

Content caps at 960px. Above 768px the bottom tab bar becomes a top nav bar
— it is the navigation, not the width, that makes something read as a website.

`AppText` owns font size so the scale control can multiply it; raw `Text` with
a hardcoded size breaks the feature. A test enforces the floor.

## Elevation & Depth

Hierarchy comes from **surface tone and a single hairline border**, not
shadow. Cards sit on white over an off-white background, and the small
difference in tone does the separating.

Only two shadow levels exist in normal use: toasts and dialogs. A resting card
has none. Heavy shadow on static content is a mistake — it adds weight to
something that is not meant to be emphasized.

## Shapes

Gently rounded. `rounded.md` (12) is the default for buttons and inputs, `lg`
(16) for cards, `sm` (8) for compact fields, `full` only where an element is
genuinely a pill or circle — avatars, badges, and the FAB.

The app previously had 20 distinct `borderRadius` values, all hardcoded per
file (5, 6, 7, 9, 14, 15, 18, 19, 22, 32, 36…). That, not color, is why two
screens of the same app looked like different products. The scale is now 6
values and the `design-tokens` test fails on any new magic number.

## Components

- **Buttons:** one primary per screen, full width when it is the only action.
  Destructive actions are text buttons, isolated at the bottom, with
  two-step confirmation. **Every touch target is at least 48×48.** An icon
  alone in a tight row gets an expanded tap area without growing its visual
  box, and neighbors are spaced so tap areas cannot overlap.
- **Dose card:** time and medication name at `critical` on the first line,
  dosage at `caption` below. Actions underneath: a wide "Tomei" button,
  "Outro horário" as plain text with no box, a discreet skip. A recorded
  dose becomes a green check with the recorded time — **the card never turns
  red.**
- **Inputs:** visible label above; the placeholder is never the label. Errors
  appear on blur, in the field.
- **State is never carried by color alone.** Every colored state ships a word
  with it.

## Do's and Don'ts

- Do show the next dose and how many remain. Do not show a percentage of
  adherence as a headline; a day in progress is not a grade.
- Do ask what happened with an unmarked dose. Do not mark it missed
  automatically — the person probably took it and forgot to tap.
- Do say "nothing was erased — just try again." Never "error 500".
- Do keep a network error visually distinct from an empty list.
- Do label buttons with verb plus object: "Cadastrar remédio", not "Criar".
- Do let people read and export their own history on any plan. Never put a
  safety warning behind a plan barrier.
- Do measure contrast. Do not estimate it.
- Do pull geometry from `tokens.ts`. If the value you need isn't there, the
  value is wrong, not the scale.
- Don't render text below 13px (12px is a badge-only exception).
- Don't use red as punishment for an unmarked dose or as a card background.
- Don't add urgency, countdowns, scarcity, streaks as pressure, or
  congratulatory copy. A chronic patient is not a marketing funnel.
- Don't add ornament, texture, gradients, illustration, or emoji.
- Don't build gamification, points, or ranking. Decided and closed.
- Don't transmit information by color alone.
