import type { Puzzle, RawPuzzle, Direction, Position, GridSize, VehicleColor, PuzzleMove, Orientation } from '../../types/puzzle';
import { GameEngine } from '../../core/GameEngine';

const VEHICLE_COLORS: VehicleColor[] = ['blue', 'green', 'yellow', 'purple'];

const SAVED_PUZZLES_KEY = 'saved-puzzles';

// ==================== Hydration ====================

export function deduceExitDirection(exit: Position, gridSize: GridSize): Direction {
  if (exit.col >= gridSize.cols - 1) return 'right';
  if (exit.col <= 0) return 'left';
  if (exit.row >= gridSize.rows - 1) return 'down';
  if (exit.row <= 0) return 'up';
  throw new Error(`Exit at (${exit.row},${exit.col}) is not on the grid periphery`);
}

export function hydratePuzzle(raw: RawPuzzle, id: string): Puzzle {
  const direction = deduceExitDirection(raw.exit, raw.gridSize);

  const usedColors = new Set<VehicleColor>();
  for (const v of raw.vehicles) {
    if (v.color) usedColors.add(v.color);
  }

  let colorIndex = 0;
  function nextColor(): VehicleColor {
    for (let i = 0; i < VEHICLE_COLORS.length; i++) {
      const candidate = VEHICLE_COLORS[(colorIndex + i) % VEHICLE_COLORS.length];
      if (!usedColors.has(candidate)) {
        colorIndex = (colorIndex + i + 1) % VEHICLE_COLORS.length;
        usedColors.add(candidate);
        return candidate;
      }
    }
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

// ==================== Builtin puzzles (glob import) ====================

const builtinModules = import.meta.glob('./builtin/*.json', { eager: true }) as Record<string, { default: RawPuzzle }>;

function loadBuiltinPuzzles(): Puzzle[] {
  const entries = Object.entries(builtinModules)
    .map(([path, mod]) => {
      const filename = path.split('/').pop()!.replace('.json', '');
      const raw = (mod.default ?? mod) as RawPuzzle;
      return { id: filename, raw };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return entries.map(({ id, raw }) => {
    const puzzle = hydratePuzzle(raw, id);
    if (puzzle.validation) {
      puzzle.validationResult = GameEngine.validatePuzzle(puzzle);
    }
    return puzzle;
  });
}

export const builtinPuzzles: Puzzle[] = loadBuiltinPuzzles();

// ==================== Saved puzzles (localStorage / dev API) ====================

export function getSavedPuzzlesRaw(): Record<string, RawPuzzle> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_PUZZLES_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getSavedPuzzles(): Puzzle[] {
  const raw = getSavedPuzzlesRaw();
  return Object.entries(raw)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, r]) => {
      const puzzle = hydratePuzzle(r, id);
      if (puzzle.validation) {
        puzzle.validationResult = GameEngine.validatePuzzle(puzzle);
      }
      return puzzle;
    });
}

export function savePuzzle(id: string, raw: RawPuzzle): void {
  const saved = getSavedPuzzlesRaw();
  saved[id] = raw;
  localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(saved));
}

export function deleteSavedPuzzle(id: string): void {
  const saved = getSavedPuzzlesRaw();
  delete saved[id];
  localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(saved));
}

/** Get all puzzles: builtin first, then saved */
export function getAllPuzzles(): Puzzle[] {
  return [...builtinPuzzles, ...getSavedPuzzles()];
}

// Legacy export for compatibility
export const puzzles: Puzzle[] = builtinPuzzles;

// ==================== Rotation utility ====================

export function rotatePuzzle90CW(raw: RawPuzzle): RawPuzzle {
  const R = raw.gridSize.rows;
  const newGridSize: GridSize = { rows: raw.gridSize.cols, cols: R };

  const rotatePos = (r: number, c: number): Position => ({ row: c, col: R - 1 - r });

  function rotateVehicle(v: { row: number; col: number; length: number; orientation: Orientation }): { row: number; col: number; length: number; orientation: Orientation } {
    if (v.orientation === 'horizontal') {
      // Horizontal → vertical: anchor at (row, col), rightmost cell is (row, col+len-1)
      // Rotated anchor of first cell: (col, R-1-row)
      // As vertical, it extends downward from anchor, so anchor = rotated position of (row, col)
      const p = rotatePos(v.row, v.col);
      return { row: p.row, col: p.col, length: v.length, orientation: 'vertical' };
    } else {
      // Vertical → horizontal: anchor at (row, col), bottommost cell is (row+len-1, col)
      // Rotated: bottom cell maps to (col, R-1-(row+len-1))
      // As horizontal, extends right from leftmost col
      const bottomRow = v.row + v.length - 1;
      const p = rotatePos(bottomRow, v.col);
      return { row: p.row, col: p.col, length: v.length, orientation: 'horizontal' };
    }
  }

  const newPlayerCar = rotateVehicle(raw.playerCar);
  const newVehicles = raw.vehicles.map(v => {
    const rv = rotateVehicle(v);
    return { ...rv, color: v.color, type: v.type };
  });
  const newObstacles = raw.obstacles.map(o => {
    const p = rotatePos(o.row, o.col);
    return { row: p.row, col: p.col, type: o.type };
  });

  // Exit: rotate position
  const newExit = rotatePos(raw.exit.row, raw.exit.col);

  // Validation: rotate moves
  let newValidation: PuzzleMove[] | undefined;
  if (raw.validation) {
    newValidation = raw.validation.map(m => {
      // Find which vehicle this move refers to, to know its orientation at that point
      // Since validation transforms positions the same way, we just rotate the position
      // But we need to know if it's the player or a vehicle to get proper anchor transform
      // Actually, validation moves store the final position of the vehicle anchor after the move.
      // We need to transform that anchor the same way we transform the vehicle.
      // The vehicle's orientation doesn't change during gameplay (only position changes along its axis).
      // So we can look up the vehicle's original orientation.
      let ori: Orientation;
      if (m.vehicleId === 'player') {
        ori = raw.playerCar.orientation;
      } else {
        const idx = parseInt(m.vehicleId.replace('vehicle-', ''));
        ori = raw.vehicles[idx]?.orientation ?? 'horizontal';
      }
      let len: number;
      if (m.vehicleId === 'player') {
        len = raw.playerCar.length;
      } else {
        const idx = parseInt(m.vehicleId.replace('vehicle-', ''));
        len = raw.vehicles[idx]?.length ?? 2;
      }

      const rv = rotateVehicle({ row: m.row, col: m.col, length: len, orientation: ori });
      return { vehicleId: m.vehicleId, row: rv.row, col: rv.col };
    });
  }

  return {
    name: raw.name,
    difficulty: raw.difficulty,
    gridSize: newGridSize,
    exit: newExit,
    playerCar: newPlayerCar,
    vehicles: newVehicles,
    obstacles: newObstacles,
    validation: newValidation,
  };
}
