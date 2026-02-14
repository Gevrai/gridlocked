import type { Puzzle, Position, Vehicle, PuzzleMove, ValidationResult } from '../types/puzzle';
import type { GameState } from '../types/game';

type StateListener = (state: GameState) => void;

export class GameEngine {
  private state: GameState;
  private listeners = new Set<StateListener>();
  private moveHistory: PuzzleMove[] = [];

  constructor(puzzle: Puzzle) {
    this.state = this.initState(puzzle);
  }

  private initState(puzzle: Puzzle): GameState {
    const vehiclePositions = new Map<string, Position>();
    vehiclePositions.set(puzzle.playerCar.id, { row: puzzle.playerCar.row, col: puzzle.playerCar.col });
    for (const v of puzzle.vehicles) {
      vehiclePositions.set(v.id, { row: v.row, col: v.col });
    }
    return { puzzle, vehiclePositions, moveCount: 0, isComplete: false };
  }

  getState(): GameState {
    return this.state;
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  getVehicle(id: string): Vehicle | undefined {
    if (id === this.state.puzzle.playerCar.id) return this.state.puzzle.playerCar;
    return this.state.puzzle.vehicles.find(v => v.id === id);
  }

  /** Returns all cells occupied, as a Map of "row,col" -> entityId */
  getOccupiedCells(excludeId?: string): Map<string, string> {
    const occupied = new Map<string, string>();

    const addVehicleCells = (vehicle: Vehicle, pos: Position) => {
      for (let i = 0; i < vehicle.length; i++) {
        const r = vehicle.orientation === 'vertical' ? pos.row + i : pos.row;
        const c = vehicle.orientation === 'horizontal' ? pos.col + i : pos.col;
        occupied.set(`${r},${c}`, vehicle.id);
      }
    };

    // Player car
    const playerPos = this.state.vehiclePositions.get(this.state.puzzle.playerCar.id)!;
    if (excludeId !== this.state.puzzle.playerCar.id) {
      addVehicleCells(this.state.puzzle.playerCar, playerPos);
    }

    // Other vehicles
    for (const v of this.state.puzzle.vehicles) {
      if (v.id === excludeId) continue;
      const pos = this.state.vehiclePositions.get(v.id)!;
      addVehicleCells(v, pos);
    }

    // Obstacles
    for (const obs of this.state.puzzle.obstacles) {
      occupied.set(`${obs.row},${obs.col}`, obs.id);
    }

    return occupied;
  }

  /** Validate whether a vehicle can move to newPos */
  canMove(vehicleId: string, newPos: Position): boolean {
    const vehicle = this.getVehicle(vehicleId);
    if (!vehicle) return false;

    const currentPos = this.state.vehiclePositions.get(vehicleId)!;

    // Must move along orientation axis only
    if (vehicle.orientation === 'horizontal' && newPos.row !== currentPos.row) return false;
    if (vehicle.orientation === 'vertical' && newPos.col !== currentPos.col) return false;

    const { rows, cols } = this.state.puzzle.gridSize;

    // Check bounds for all cells
    for (let i = 0; i < vehicle.length; i++) {
      const r = vehicle.orientation === 'vertical' ? newPos.row + i : newPos.row;
      const c = vehicle.orientation === 'horizontal' ? newPos.col + i : newPos.col;
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    }

    // Check path is clear (all cells between current and new must be free)
    const occupied = this.getOccupiedCells(vehicleId);
    for (let i = 0; i < vehicle.length; i++) {
      const r = vehicle.orientation === 'vertical' ? newPos.row + i : newPos.row;
      const c = vehicle.orientation === 'horizontal' ? newPos.col + i : newPos.col;
      if (occupied.has(`${r},${c}`)) return false;
    }

    return true;
  }

  /** Get the maximum range a vehicle can slide in both directions */
  getSlideRange(vehicleId: string): { min: number; max: number } {
    const vehicle = this.getVehicle(vehicleId)!;
    const currentPos = this.state.vehiclePositions.get(vehicleId)!;
    const isHorizontal = vehicle.orientation === 'horizontal';
    const currentVal = isHorizontal ? currentPos.col : currentPos.row;

    let min = currentVal;
    let max = currentVal;

    // Slide backward
    while (min > 0) {
      const testPos = isHorizontal
        ? { row: currentPos.row, col: min - 1 }
        : { row: min - 1, col: currentPos.col };
      if (this.canMove(vehicleId, testPos)) {
        min--;
      } else {
        break;
      }
    }

    // Slide forward
    const limit = isHorizontal ? this.state.puzzle.gridSize.cols : this.state.puzzle.gridSize.rows;
    while (max + vehicle.length < limit) {
      const testPos = isHorizontal
        ? { row: currentPos.row, col: max + 1 }
        : { row: max + 1, col: currentPos.col };
      if (this.canMove(vehicleId, testPos)) {
        max++;
      } else {
        break;
      }
    }

    return { min, max };
  }

  /** Move a vehicle. Returns true if the move was applied. */
  moveVehicle(vehicleId: string, newPos: Position): boolean {
    if (!this.canMove(vehicleId, newPos)) return false;

    const currentPos = this.state.vehiclePositions.get(vehicleId)!;
    if (currentPos.row === newPos.row && currentPos.col === newPos.col) return false;

    this.state.vehiclePositions.set(vehicleId, { ...newPos });
    this.state.moveCount++;
    this.moveHistory.push({ vehicleId, row: newPos.row, col: newPos.col });

    if (this.checkWin()) {
      this.state.isComplete = true;
    }

    this.notify();
    return true;
  }

  getMoveHistory(): PuzzleMove[] {
    return [...this.moveHistory];
  }

  private checkWin(): boolean {
    const { exit, playerCar } = this.state.puzzle;
    const pos = this.state.vehiclePositions.get(playerCar.id)!;

    // The front edge of the player car must reach the exit
    if (playerCar.orientation === 'horizontal') {
      if (exit.direction === 'right') {
        return pos.row === exit.row && pos.col + playerCar.length - 1 === exit.col;
      }
      if (exit.direction === 'left') {
        return pos.row === exit.row && pos.col === exit.col;
      }
    } else {
      if (exit.direction === 'down') {
        return pos.col === exit.col && pos.row + playerCar.length - 1 === exit.row;
      }
      if (exit.direction === 'up') {
        return pos.col === exit.col && pos.row === exit.row;
      }
    }
    return false;
  }

  reset(): void {
    this.state = this.initState(this.state.puzzle);
    this.moveHistory = [];
    this.notify();
  }

  /** Validate a puzzle by replaying its validation moves. */
  static validatePuzzle(puzzle: Puzzle): ValidationResult {
    if (!puzzle.validation || puzzle.validation.length === 0) {
      return { isValid: false, error: 'No validation provided' };
    }

    const engine = new GameEngine(puzzle);

    for (let i = 0; i < puzzle.validation.length; i++) {
      const move = puzzle.validation[i];
      const success = engine.moveVehicle(move.vehicleId, { row: move.row, col: move.col });
      if (!success) {
        return { isValid: false, error: `Invalid move at step ${i + 1}` };
      }
    }

    if (!engine.getState().isComplete) {
      return { isValid: false, error: 'Validation does not reach win state' };
    }

    return { isValid: true, par: puzzle.validation.length };
  }
}
