export type Orientation = 'horizontal' | 'vertical';
export type VehicleType = 'car' | 'truck';
export type ObstacleType = 'tree' | 'sidewalk' | 'barrier';
export type Difficulty = 'tutorial' | 'easy' | 'medium' | 'hard';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type VehicleColor = 'blue' | 'green' | 'yellow' | 'purple';

export interface Position {
  row: number;
  col: number;
}

export interface GridSize {
  rows: number;
  cols: number;
}

export interface Exit extends Position {
  direction: Direction;
}

export interface Vehicle {
  id: string;
  row: number;
  col: number;
  length: number;
  orientation: Orientation;
  type?: VehicleType;
  color?: VehicleColor;
}

export interface Obstacle {
  id: string;
  row: number;
  col: number;
  type: ObstacleType;
}

export interface PuzzleMove {
  vehicleId: string;
  row: number;
  col: number;
}

export interface ValidationResult {
  isValid: boolean;
  par?: number;
  error?: string;
}

export interface Puzzle {
  id: string;
  name: string;
  difficulty: Difficulty;
  gridSize: GridSize;
  exit: Exit;
  playerCar: Vehicle;
  vehicles: Vehicle[];
  obstacles: Obstacle[];
  validation?: PuzzleMove[];
  validationResult?: ValidationResult;
}

// Raw types matching the simplified JSON format

export interface RawVehicle {
  row: number;
  col: number;
  length: number;
  orientation: Orientation;
  type?: VehicleType;
  color?: VehicleColor;
}

export interface RawObstacle {
  row: number;
  col: number;
  type: ObstacleType;
}

export interface RawPuzzle {
  name: string;
  difficulty: Difficulty;
  gridSize: GridSize;
  exit: Position;
  playerCar: {
    row: number;
    col: number;
    length: number;
    orientation: Orientation;
  };
  vehicles: RawVehicle[];
  obstacles: RawObstacle[];
  validation?: PuzzleMove[];
}
