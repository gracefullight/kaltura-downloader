# DESIGN.md — Kaltura Downloader Extension Popup

## 1. Overview

A compact popup shown when the extension icon is clicked. Displays extension identity, creator info, and sponsor links. Inherits the existing overlay UI design language (blue pills, system fonts, minimal shadows).

**Target surface**: Chrome extension popup (280px fixed width, auto height)

---

## 2. Design Tokens

### Colors

| Token              | Value                       | Role                        |
|:-------------------|:----------------------------|:----------------------------|
| `--kd-primary`     | `#006efa`                   | Primary actions, brand      |
| `--kd-primary-hover` | `#0058cc`                 | Primary hover state         |
| `--kd-bg`          | `#f9fafb`                   | Popup background            |
| `--kd-surface`     | `#ffffff`                   | Card/button surface         |
| `--kd-text`        | `#333333`                   | Primary text                |
| `--kd-text-muted`  | `#6b7280`                   | Version, captions           |
| `--kd-border`      | `#e5e7eb`                   | Divider lines               |
| `--kd-shadow`      | `0 2px 8px rgba(0,0,0,0.1)` | Card elevation              |
| `--kd-bmc`         | `#ffdd00`                   | Buy Me a Coffee accent      |
| `--kd-bmc-text`    | `#000000`                   | BMC button text             |

### Typography

| Element    | Size  | Weight | Family       |
|:-----------|:------|:-------|:-------------|
| Title      | 14px  | 700    | System stack |
| Body       | 12px  | 400    | System stack |
| Caption    | 11px  | 400    | System stack |
| Button     | 12px  | 600    | System stack |

**System font stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

### Spacing

| Token         | Value |
|:--------------|:------|
| `--kd-gap`    | 12px  |
| `--kd-pad`    | 16px  |
| `--kd-radius` | 20px  |
| `--kd-radius-sm` | 8px |

---

## 3. Layout

```
┌─────────────────────────────┐  280px fixed
│  ↓  Kaltura Downloader      │  header: icon + title
│     v1.0.0                  │  version caption
├─────────────────────────────┤  1px border
│  Made by gracefullight      │  creator (GitHub link)
├─────────────────────────────┤  1px border
│  [♥ Sponsor]  [☕ Buy Me]   │  pill buttons, row
└─────────────────────────────┘
```

- **Structure**: Single column, center-aligned content
- **Sections**: Header / Creator / Actions — separated by `--kd-border` dividers
- **Padding**: `--kd-pad` (16px) all sides
- **Gap**: `--kd-gap` (12px) between sections

---

## 4. Components

### 4.1 Header
- Extension icon: 24x24 inline SVG (download arrow on blue rounded-rect, matching `icon.ts`)
- Title: "Kaltura Downloader" — 14px bold
- Version: "v1.0.0" — 11px muted, read from manifest

### 4.2 Creator Section
- Text: "Made by" — 12px regular
- Link: "gracefullight" — 12px, `--kd-primary` color, underline on hover
- Links to: `https://github.com/gracefullight`

### 4.3 Action Buttons (Sponsor Row)
Two pill buttons side by side, reusing `.kd-pill` design:

**GitHub Sponsors** (primary pill):
- Background: `--kd-primary`
- Text: white, "Sponsor"
- Icon: heart SVG (14px)
- hover: `--kd-primary-hover`, scale(1.04)

**Buy Me a Coffee** (accent pill):
- Background: `--kd-bmc` (#ffdd00)
- Text: `--kd-bmc-text` (#000)
- Icon: coffee cup SVG (14px)
- hover: brightness(0.95), scale(1.04)

---

## 5. Interaction & Motion

| Trigger       | Effect                           | Duration |
|:--------------|:---------------------------------|:---------|
| Pill hover    | scale(1.04) + color shift        | 150ms    |
| Link hover    | underline appears                | instant  |
| Popup open    | none (instant render, no delay)  | —        |

No entrance animations — popup should feel instant and lightweight.

---

## 6. Accessibility (WCAG AA)

- **Contrast**: All text meets 4.5:1 ratio against backgrounds
  - `#333` on `#f9fafb` = 10.5:1
  - `#fff` on `#006efa` = 4.6:1
  - `#000` on `#ffdd00` = 15.4:1
  - `#6b7280` on `#f9fafb` = 5.0:1
- **Focus**: All interactive elements have visible `outline: 2px solid #006efa` on `:focus-visible`
- **Links**: Open in new tab (`target="_blank"`, `rel="noopener"`)
- **Buttons**: Semantic `<a>` elements with `role` inferred, descriptive text
- **Reduced motion**: `prefers-reduced-motion` disables scale transitions
