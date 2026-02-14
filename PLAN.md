# Gridlocked — Implementation Plan

## Context
Building a mobile-first sliding-block puzzle game ("Gridlocked") as a static site. The player slides vehicles on a grid to navigate their car to the exit. V1 includes 3 puzzles with growing grid sizes, immovable obstacles, and car skin selection.

## Tech Stack
- **Vite + TypeScript**, zero runtime dependencies
- **HTML/CSS DOM rendering** with CSS Grid for the board and CSS transitions for animations
- **Cartoon/playful style** — rounded shapes, bright colors, shadows

## Project Structure
```
src/
  main.ts                  # Entry point, screen flow
  types/puzzle.ts          # Puzzle, Vehicle, Obstacle types
  types/game.ts            # GameState types
  core/GameState.ts        # State management with subscriber pattern
  core/MoveValidator.ts    # Bounds + collision checking
  core/WinDetector.ts      # Win condition (player car reaches exit)
  ui/GameRenderer.ts       # Renders board as CSS Grid + vehicles as divs
  ui/TouchHandler.ts       # Touch drag + mouse fallback
  ui/CarSelector.ts        # Pick car skin screen
  ui/LevelSelector.ts      # Level list screen
  ui/WinScreen.ts          # Celebration overlay
  data/puzzles/            # JSON puzzle files
  styles/                  # CSS files (variables, board, vehicle, ui)
public/
  cars/                    # 3 car skin SVGs
  obstacles/               # Tree, sidewalk SVGs
```

## Puzzle JSON Format
```json
{
  "id": "puzzle-01",
  "name": "Tutorial: First Move",
  "difficulty": "tutorial",
  "gridSize": { "rows": 3, "cols": 3 },
  "exit": { "row": 1, "col": 2, "direction": "right" },
  "playerCar": { "id": "player", "row": 1, "col": 0, "length": 2, "orientation": "horizontal" },
  "vehicles": [],
  "obstacles": []
}
```

## 3 Puzzles
1. **Tutorial (3x3)** — Player car alone, slide right to exit
2. **Easy (4x4)** — 2 blocking vehicles + 1 obstacle, ~3 moves
3. **Medium (5x5)** — 4 vehicles + 2 obstacles, ~8-10 moves

## UI Flow
Car Selection → Level Select → Game Board → Win Screen → Next Level

## Key Design Decisions
- **CSS Grid** for board layout — vehicles span cells via `grid-column`/`grid-row`
- **Touch drag** constrained to vehicle orientation axis, snaps to grid
- **Simple class-based state** with event listeners (no framework needed for v1)
- **localStorage** for car skin choice and completed levels
- **Responsive cell sizing**: `--cell-size: min(15vw, 80px)`

## Implementation Order
1. Scaffold Vite + TS project
2. Define types (puzzle.ts, game.ts)
3. Build core logic (GameState, MoveValidator, WinDetector)
4. Create puzzle JSON files
5. Build GameRenderer (CSS Grid board)
6. Build TouchHandler (drag interaction)
7. Build screen flows (CarSelector, LevelSelector, WinScreen)
8. Create SVG assets (cars, obstacles)
9. Style everything (cartoon/playful CSS)
10. Wire up main.ts entry point
11. Add GitHub Pages deploy workflow

## Deployment — GitHub Pages
- Add `.github/workflows/deploy.yml` using the `actions/deploy-pages` approach
- Vite config: set `base` to repo name for correct asset paths
- Workflow: on push to main → install → build → deploy artifact to Pages

## Puzzle Authoring
The JSON format is deliberately simple so new puzzles can be added by:
1. Creating a new JSON file in `src/data/puzzles/`
2. Registering it in a `puzzles/index.ts` barrel file that exports the full list
This keeps the puzzle list easy to extend without touching game logic.

## Verification
- `npm run dev` and test all 3 puzzles in Chrome DevTools mobile emulator
- Verify: vehicles only move along their orientation, collisions block movement, win triggers on exit
- Test touch drag on actual mobile device
- `npm run build` succeeds with no errors
- Push to main and confirm GitHub Pages deploy succeeds
