import { GameEngine } from '../core/GameEngine';
import type { Puzzle, Vehicle, Position } from '../types/puzzle';

const OBSTACLE_EMOJI: Record<string, string> = {
  tree: '\u{1F332}',
  sidewalk: '\u{1F9F1}',
  barrier: '\u{1F6A7}',
};

export class GameRenderer {
  private boardInner!: HTMLElement;
  private moveCountEl!: HTMLElement;
  private engine: GameEngine;
  private cellSize = 0;
  private padding = 8;
  private gap = 4;

  // Drag state
  private dragId: string | null = null;
  private dragStartPointer = 0;
  private dragStartCellVal = 0;
  private dragRange = { min: 0, max: 0 };
  private dragIsHorizontal = false;

  constructor(
    private container: HTMLElement,
    puzzle: Puzzle,
    private onWin: (moveCount: number) => void,
    private onBack: () => void,
  ) {
    this.engine = new GameEngine(puzzle);
    this.render();
    this.engine.subscribe(() => this.updatePositions());
  }

  private render(): void {
    const { puzzle } = this.engine.getState();
    const { rows, cols } = puzzle.gridSize;

    this.container.innerHTML = `
      <div class="game-screen">
        <div class="game-header">
          <button class="btn back-btn" style="padding: 0.5rem 1rem;">\u2190</button>
          <span class="move-counter">Moves: 0</span>
          <button class="btn reset-btn" style="padding: 0.5rem 1rem;">\u21BB</button>
        </div>
        <div class="game-canvas">
          <div class="board"></div>
        </div>
      </div>
    `;

    this.boardInner = this.container.querySelector('.board')!;
    this.moveCountEl = this.container.querySelector('.move-counter')!;

    this.container.querySelector('.back-btn')!.addEventListener('click', this.onBack);
    this.container.querySelector('.reset-btn')!.addEventListener('click', () => this.engine.reset());

    // Render grid cells (no inline size — will be set dynamically)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        this.boardInner.appendChild(cell);
      }
    }

    // Exit marker
    this.renderExitMarker(puzzle);

    // Obstacles
    for (const obs of puzzle.obstacles) {
      const el = document.createElement('div');
      el.className = 'obstacle';
      el.textContent = OBSTACLE_EMOJI[obs.type] ?? '\u{1F6A7}';
      this.boardInner.appendChild(el);
      el.dataset.row = String(obs.row);
      el.dataset.col = String(obs.col);
    }

    // Vehicles
    this.renderVehicle(puzzle.playerCar, true);
    puzzle.vehicles.forEach((v) => this.renderVehicle(v, false));

    // Compute cell size after layout
    requestAnimationFrame(() => {
      this.computeAndApplyCellSize();
      this.updatePositions();
    });

    // Touch/mouse events on the board
    this.boardInner.addEventListener('pointerdown', this.onPointerDown);
    this.boardInner.addEventListener('pointermove', this.onPointerMove);
    this.boardInner.addEventListener('pointerup', this.onPointerUp);
    this.boardInner.addEventListener('pointercancel', this.onPointerUp);
  }

  private renderExitMarker(puzzle: Puzzle): void {
    const exit = puzzle.exit;
    const marker = document.createElement('div');
    marker.className = `exit-marker ${exit.direction}`;
    this.boardInner.appendChild(marker);
    marker.dataset.row = String(exit.row);
    marker.dataset.col = String(exit.col);
  }

  private renderVehicle(vehicle: Vehicle, isPlayer: boolean): void {
    const el = document.createElement('div');
    el.className = `vehicle ${isPlayer ? 'player' : `color-${vehicle.color ?? 'blue'}`}`;
    el.dataset.id = vehicle.id;

    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = isPlayer ? '\u{1F440}' : '';
    el.appendChild(face);

    this.boardInner.appendChild(el);
  }

  private computeAndApplyCellSize(): void {
    const canvas = this.container.querySelector('.game-canvas') as HTMLElement;
    if (!canvas) return;

    const { puzzle } = this.engine.getState();
    const { rows, cols } = puzzle.gridSize;

    const canvasRect = canvas.getBoundingClientRect();
    const availW = canvasRect.width - 32;
    const availH = canvasRect.height - 16;

    const gapEst = 4;
    const gridPad = this.padding * 2;
    const cellW = (availW - gridPad - (cols - 1) * gapEst) / cols;
    const cellH = (availH - gridPad - (rows - 1) * gapEst) / rows;
    const computedCellSize = Math.max(24, Math.min(100, Math.floor(Math.min(cellW, cellH))));

    this.boardInner.style.gridTemplateRows = `repeat(${rows}, ${computedCellSize}px)`;
    this.boardInner.style.gridTemplateColumns = `repeat(${cols}, ${computedCellSize}px)`;

    // Set cell sizes explicitly
    this.boardInner.querySelectorAll('.cell').forEach(cell => {
      (cell as HTMLElement).style.width = `${computedCellSize}px`;
      (cell as HTMLElement).style.height = `${computedCellSize}px`;
    });

    this.cellSize = computedCellSize;
    this.gap = parseFloat(getComputedStyle(this.boardInner).gap) || 4;
    this.padding = parseFloat(getComputedStyle(this.boardInner).paddingLeft) || 8;
  }

  private cellToPixel(index: number): number {
    return this.padding + index * (this.cellSize + this.gap);
  }

  private updatePositions(): void {
    const state = this.engine.getState();
    const { puzzle, vehiclePositions, moveCount } = state;

    this.moveCountEl.textContent = `Moves: ${moveCount}`;

    // Update vehicle positions
    const allVehicles = [puzzle.playerCar, ...puzzle.vehicles];
    for (const v of allVehicles) {
      const pos = vehiclePositions.get(v.id)!;
      const el = this.boardInner.querySelector(`[data-id="${v.id}"]`) as HTMLElement;
      if (!el) continue;

      const x = this.cellToPixel(pos.col);
      const y = this.cellToPixel(pos.row);
      const w = v.orientation === 'horizontal'
        ? v.length * this.cellSize + (v.length - 1) * this.gap
        : this.cellSize;
      const h = v.orientation === 'vertical'
        ? v.length * this.cellSize + (v.length - 1) * this.gap
        : this.cellSize;

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }

    // Update obstacle positions
    this.boardInner.querySelectorAll('.obstacle').forEach((el) => {
      const obsEl = el as HTMLElement;
      const r = Number(obsEl.dataset.row);
      const c = Number(obsEl.dataset.col);
      obsEl.style.left = `${this.cellToPixel(c)}px`;
      obsEl.style.top = `${this.cellToPixel(r)}px`;
      obsEl.style.width = `${this.cellSize}px`;
      obsEl.style.height = `${this.cellSize}px`;
    });

    // Update exit marker position
    const exitEl = this.boardInner.querySelector('.exit-marker') as HTMLElement;
    if (exitEl) {
      const exit = puzzle.exit;
      exitEl.style.top = `${this.cellToPixel(exit.row)}px`;
      exitEl.style.height = `${this.cellSize}px`;
    }

    if (state.isComplete) {
      setTimeout(() => this.onWin(moveCount), 350);
    }
  }

  // --- Pointer (touch + mouse) handling ---

  private onPointerDown = (e: PointerEvent): void => {
    const target = (e.target as HTMLElement).closest('.vehicle') as HTMLElement | null;
    if (!target) return;

    e.preventDefault();
    target.setPointerCapture(e.pointerId);

    const vehicleId = target.dataset.id!;
    const vehicle = this.engine.getVehicle(vehicleId);
    if (!vehicle) return;

    this.dragId = vehicleId;
    this.dragIsHorizontal = vehicle.orientation === 'horizontal';
    const pos = this.engine.getState().vehiclePositions.get(vehicleId)!;
    this.dragStartCellVal = this.dragIsHorizontal ? pos.col : pos.row;
    this.dragStartPointer = this.dragIsHorizontal ? e.clientX : e.clientY;
    this.dragRange = this.engine.getSlideRange(vehicleId);

    target.classList.add('dragging');
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragId) return;
    e.preventDefault();

    const pointer = this.dragIsHorizontal ? e.clientX : e.clientY;
    const delta = pointer - this.dragStartPointer;
    const cellDelta = Math.round(delta / (this.cellSize + this.gap));
    let newVal = this.dragStartCellVal + cellDelta;

    // Clamp to slide range
    newVal = Math.max(this.dragRange.min, Math.min(this.dragRange.max, newVal));

    // Update visual position directly (skip transition during drag)
    const el = this.boardInner.querySelector(`[data-id="${this.dragId}"]`) as HTMLElement;
    if (!el) return;

    if (this.dragIsHorizontal) {
      el.style.left = `${this.cellToPixel(newVal)}px`;
    } else {
      el.style.top = `${this.cellToPixel(newVal)}px`;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragId) return;

    const el = this.boardInner.querySelector(`[data-id="${this.dragId}"]`) as HTMLElement;
    el?.classList.remove('dragging');

    const pointer = this.dragIsHorizontal ? e.clientX : e.clientY;
    const delta = pointer - this.dragStartPointer;
    const cellDelta = Math.round(delta / (this.cellSize + this.gap));
    let newVal = this.dragStartCellVal + cellDelta;
    newVal = Math.max(this.dragRange.min, Math.min(this.dragRange.max, newVal));

    const currentPos = this.engine.getState().vehiclePositions.get(this.dragId)!;
    const newPos: Position = this.dragIsHorizontal
      ? { row: currentPos.row, col: newVal }
      : { row: newVal, col: currentPos.col };

    this.engine.moveVehicle(this.dragId, newPos);
    // If move failed or same pos, updatePositions will snap back
    this.updatePositions();

    this.dragId = null;
  };
}
