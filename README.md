# SHOGIMAN-IOS

Mobile-first iPhone edition of **SHOGI FRONTLINE**.

## Product direction

This repository is intentionally separate from the Web version (`HP486379/SHOGIMAN`). The game rules and useful assets are reused, but the play UI is redesigned for portrait iPhone use rather than shrinking the desktop layout.

### iOS-specific decisions

- Portrait-first play area: `CPU CAPTURED -> 9x9 BOARD -> 1P CAPTURED`
- No permanent SHOGI FRONTLINE title header during battle
- No HYBRID mode
- `MILITARY` is the default display mode; `SHOGI` remains available
- No permanently visible UNIT GUIDE panel
- Selecting a unit opens a compact UNIT GUIDE-style bubble next to the selected piece
- Full UNIT GUIDE lives behind the bottom `GUIDE` button
- Bottom battle tools: `AI / GUIDE / SET`
- SE / RESET move into Settings
- AI advice will appear as short incoming tactical communications over the play area, with history/manual ANALYZE in the AI sheet
- CPU pieces rotate 180 degrees in both MILITARY and SHOGI modes

## Phase 1

The first implementation establishes a playable portrait battle screen and ports the existing shogi engine / CPU behavior. It includes:

- CPU vs 1P game flow
- captures, drops, promotion and check/checkmate logic
- EASY / NORMAL / HARD CPU levels
- MILITARY / SHOGI display modes
- selected-unit mini guide bubble
- compact captured-piece bars
- full guide/settings bottom sheets
- iPhone safe-area aware fixed bottom tools

The remote GPT-5.4 mini advisor connection is intentionally left for the next implementation phase, after the mobile play shell is validated on real iPhone dimensions.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Current stack: React + TypeScript + Vite. Capacitor will be added after the portrait Web shell is stable enough to package as an iOS app.
