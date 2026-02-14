import type { Puzzle, RawPuzzle, Direction, Position, GridSize, VehicleColor } from '../../types/puzzle';
import { GameEngine } from '../../core/GameEngine';

import rawPuzzle01 from './puzzle-01.json';
import rawPuzzle02 from './puzzle-02.json';
import rawPuzzle03 from './puzzle-03.json';

const VEHICLE_COLORS: VehicleColor[] = ['blue', 'green', 'yellow', 'purple'];

export function deduceExitDirection(exit: Position, gridSize: GridSize): Direction {
  if (exit.col >= gridSize.cols - 1) return 'right';
  if (exit.col <= 0) return 'left';
  if (exit.row >= gridSize.rows - 1) return 'down';
  if (exit.row <= 0) return 'up';
  throw new Error(`Exit at (${exit.row},${exit.col}) is not on the grid periphery`);
}

export function hydratePuzzle(raw: RawPuzzle, id: string): Puzzle {
  // Deduce exit direction
  const direction = deduceExitDirection(raw.exit, raw.gridSize);

  // Track used colors for auto-assignment
  const usedColors = new Set<VehicleColor>();
  for (const v of raw.vehicles) {
    if (v.color) usedColors.add(v.color);
  }

  let colorIndex = 0;
  function nextColor(): VehicleColor {
    // Find next unused color
    for (let i = 0; i < VEHICLE_COLORS.length; i++) {
      const candidate = VEHICLE_COLORS[(colorIndex + i) % VEHICLE_COLORS.length];
      if (!usedColors.has(candidate)) {
        colorIndex = (colorIndex + i + 1) % VEHICLE_COLORS.length;
        usedColors.add(candidate);
        return candidate;
      }
    }
    // All colors used, cycle through
    const color = VEHICLE_COLORS[colorIndex % VEHICLE_COLORS.length];
    colorIndex++;
    return color;
  }

  const vehicles = raw.vehicles.map((v, i) => ({
    id: `vehicle-${i}`,
    row: v.row,
    col: v.col,
    length: v.length,
    orientation: v.orientation,
    type: v.type,
    color: v.color ?? nextColor(),
  }));

  const obstacles = raw.obstacles.map((o, i) => ({
    id: `obstacle-${i}`,
    row: o.row,
    col: o.col,
    type: o.type,
  }));

  return {
    id,
    name: raw.name,
    difficulty: raw.difficulty,
    gridSize: raw.gridSize,
    exit: { ...raw.exit, direction },
    playerCar: {
      id: 'player',
      row: raw.playerCar.row,
      col: raw.playerCar.col,
      length: raw.playerCar.length,
      orientation: raw.playerCar.orientation,
    },
    vehicles,
    obstacles,
    validation: raw.validation,
  };
}

// Hydrate all puzzles
const rawPuzzles: Array<{ raw: RawPuzzle; id: string }> = [
  { raw: rawPuzzle01 as RawPuzzle, id: 'puzzle-01' },
  { raw: rawPuzzle02 as RawPuzzle, id: 'puzzle-02' },
  { raw: rawPuzzle03 as RawPuzzle, id: 'puzzle-03' },
];

export const puzzles: Puzzle[] = rawPuzzles.map(({ raw, id }) => {
  const puzzle = hydratePuzzle(raw, id);
  if (puzzle.validation) {
    puzzle.validationResult = GameEngine.validatePuzzle(puzzle);
  }
  return puzzle;
});
