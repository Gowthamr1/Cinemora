# CINEMORA — Design System & Visual Tokens

## 1. Aesthetic Family: Editorial Cinematic Noir
- **Design Read**: High-contrast, atmospheric obsidian dark mode with tactile ember accents and rich typography.
- **Color Ratio (60-30-10 Rule)**:
  - **60% Primary Canvas**: `#070A11` / Deep Obsidian `#090D16` (slate-950)
  - **30% Structural Surfaces**: `#101726` / `#162032` (slate-900 / slate-850) with refined borders (`border-slate-800/80`)
  - **10% Focused Accents**:
    - Primary Action / Ember: Crimson Rose (`#E11D48` / `#F43F5E`)
    - Rating & Format Highlights: Warm Amber Gold (`#F59E0B`)
    - Success / Active Live States: Emerald (`#10B981`)

## 2. Typography Hierarchy
- **Display & Headings**: `Outfit`, bold/black weight, tracking-tight, sentence case or purposeful uppercase for badges.
- **Body & Controls**: `Plus Jakarta Sans`, clean modern geometric sans-serif, legible line height (1.5-1.6).
- **Data & Seat Labels**: `JetBrains Mono` / monospace font for seat coordinates (e.g. `B4`, `F12`), ticket references, and currency amounts.

## 3. Interaction & Ergonomics
- **Touch Targets**: Minimum 44px height for interactive buttons, seat tiles, and search inputs.
- **Focus Rings**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`.
- **Transitions**: Smooth micro-interactions (`duration-200` to `duration-300` with cubic bezier), avoiding jarring layout shifts.
- **Auditorium Seat Map**:
  - Available: Deep slate tile with subtle border (`bg-slate-900 border-slate-700/80 text-slate-300`)
  - Selected: Radiant rose fill with crisp contrast (`bg-rose-600 text-white font-bold`)
  - Occupied: Muted disabled state (`bg-slate-800/60 text-slate-600 cursor-not-allowed`)
- **Digital Ticket Pass**: Authentic physical stub proportions, perforated tear-line styling, clean scannable QR display with white quiet zone.
