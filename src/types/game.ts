import type { Puzzle, Position } from './puzzle';

export interface GameState {
  puzzle: Puzzle;
  vehiclePositions: Map<string, Position>;
  moveCount: number;
  isComplete: boolean;
}

export interface GameSession {
  selectedCarSkin: string;
  completedPuzzles: string[];
}
