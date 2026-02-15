# Gridlocked — Web Puzzle Game

A mobile-first sliding-block puzzle game served as a static site.

## Tech Stack

- **Vite + TypeScript** (vanilla, no framework)
- **HTML/CSS rendering** — CSS Grid for the board, absolute-positioned divs for vehicles, CSS transitions for animations
- **Zero runtime dependencies**

## Project Structure

```
src/
  main.ts                     # Entry point — screen routing, localStorage for progress
  types/puzzle.ts             # Core types: Puzzle, RawPuzzle, Vehicle, VehicleColor, PuzzleMove, etc.
  types/game.ts               # GameState and GameSession types
  core/GameEngine.ts          # All game logic: state, move validation, win detection, slide range, validation replay
  ui/GameRenderer.ts          # Renders board + handles pointer drag (touch + mouse)
  ui/PuzzleEditor.ts          # Puzzle editor screen (create, edit, test, save/download/import)
  ui/CarSelector.ts           # Car skin picker screen
  ui/LevelSelector.ts         # Level list screen (shows par/unvalidated status)
  ui/WinScreen.ts             # Win overlay
  data/puzzles/builtin/       # Built-in puzzle JSON files (auto-discovered via glob)
  data/puzzles/saved/         # Saved puzzles (dev mode; prod uses localStorage)
  data/puzzles/index.ts       # Hydration, glob import, saved puzzle CRUD, rotation utility
  styles/main.css             # All styles (imports variables.css)
  styles/variables.css        # CSS custom properties (colors, sizes, shadows)
```

## Key Architecture Decisions

- **GameEngine** (src/core/GameEngine.ts) is the single source of truth. It owns state, validates moves, computes slide ranges, checks win conditions, and validates puzzles via `GameEngine.validatePuzzle()`.
- **Puzzle hydration** (src/data/puzzles/index.ts) converts simplified JSON (`RawPuzzle`) to runtime `Puzzle` objects — auto-generating IDs, deducing exit direction, and assigning vehicle colors. Built-in puzzles are auto-discovered via `import.meta.glob('./builtin/*.json')`. Saved puzzles are stored in localStorage (`saved-puzzles` key).
- **Rendering uses absolute positioning** within a CSS Grid board. Vehicles are positioned via `left`/`top` pixel values computed from grid coordinates. During drag, CSS transitions are disabled; on release, they animate the snap.
- **Pointer Events API** handles both touch and mouse via `pointerdown`/`pointermove`/`pointerup`.
- **No router** — screens are swapped by replacing `#app` innerHTML. Simple functions per screen.
- **Vite dev plugin** (vite.config.ts) provides `/__api/puzzles` endpoint for saving puzzles from the editor in dev mode.

## Puzzle JSON Format (Simplified)

Puzzles use a simplified JSON format where redundant fields are auto-generated:

```json
{
  "name": "Puzzle Name",
  "difficulty": "easy",
  "gridSize": { "rows": 4, "cols": 4 },
  "exit": { "row": 1, "col": 3 },
  "playerCar": { "row": 1, "col": 0, "length": 2, "orientation": "horizontal" },
  "vehicles": [
    { "row": 0, "col": 2, "length": 2, "orientation": "vertical", "color": "blue" }
  ],
  "obstacles": [
    { "row": 3, "col": 0, "type": "tree" }
  ],
  "validation": [
    { "vehicleId": "vehicle-0", "row": 2, "col": 2 },
    { "vehicleId": "player", "row": 1, "col": 2 }
  ]
}
```

**Auto-generated fields:**
- `id` — derived from filename (e.g. `puzzle-03.json` → `"puzzle-03"`)
- `exit.direction` — deduced from exit position on grid periphery
- `playerCar.id` — always `"player"`
- Vehicle IDs — `"vehicle-0"`, `"vehicle-1"`, etc. (by array index)
- Obstacle IDs — `"obstacle-0"`, `"obstacle-1"`, etc.
- Vehicle `color` — auto-assigned from palette if not specified (`blue`, `green`, `yellow`, `purple`)

**Validation field:** optional array of moves that solve the puzzle. If present and valid, shows "par N" on the level card. If absent, shows "unvalidated" in orange. If present but invalid, shows "invalid" in red.

## Adding a New Puzzle

1. Create `src/data/puzzles/builtin/puzzle-NN.json` following the simplified format above. It will be auto-discovered via glob import — no manual registration needed.
2. Alternatively, use the built-in Puzzle Editor (accessible from the level selector) to create, test, and save puzzles. Saved puzzles are stored in localStorage.

**Coordinate system:** `row` 0 is top, `col` 0 is left. Vehicles occupy cells from their position extending `length` cells in their `orientation` direction.

**Obstacle types:** `tree`, `sidewalk`, `barrier` — rendered as emoji, occupy 1 cell, immovable.

**Exit direction:** deduced from position on grid edge. The win condition checks that the player car's front edge reaches the exit cell.

## Puzzle Editor

Accessible via the "Create Puzzle" button on the level selector. Features:
- Grid size, name, and difficulty configuration
- Tab-based tool palette: Player Car (with orientation/exit side), Vehicle (length/orientation/color), Obstacle (type)
- **Drag-to-move**: entities can be dragged to reposition; drag outside the grid to delete (shows trash overlay)
- **Click-to-select**: clicking an entity selects it (gold outline), populates toolbar with its params for editing
- **Exit auto-placed**: exit is automatically positioned based on player orientation and exit side setting
- **Test mode**: play the puzzle to verify solvability, records moves for validation
- **Rotate**: Rotate the entire puzzle 90° clockwise (grid dimensions swap, vehicles/obstacles transform)
- **Save**: Saves to localStorage (appears in level list immediately). Download button exports as JSON file.
- **Load**: Pick any existing puzzle (builtin or saved) to load into the editor
- **Import**: Load a puzzle JSON file from disk into the editor

## Commands

- `npm run dev` — Start dev server (includes puzzle editor save API)
- `npm run build` — Type-check + production build (outputs to `dist/`)
- `npm run preview` — Preview production build locally

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`. Deploys on push to `main`. The Vite `base` is set to `/rush-hour/` in `vite.config.ts` — update this if the repo name changes.

## Conventions

- No framework — vanilla TS with DOM manipulation
- Styles live in `src/styles/`, using CSS custom properties from `variables.css`
- Game logic stays in `src/core/`, UI in `src/ui/`, types in `src/types/`
- Puzzles are JSON data — keep game logic decoupled from puzzle definitions
- Vehicle colors use CSS classes (`color-blue`, `color-green`, `color-yellow`, `color-purple`)

IMPORTANT: any changes that affects the veracity of this agent file should be applied here as well to keep
it in sync with the project.
