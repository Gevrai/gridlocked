import type {
  Difficulty, GridSize, Orientation, ObstacleType, Position,
  RawPuzzle, RawVehicle, RawObstacle, VehicleColor, PuzzleMove,
} from '../types/puzzle';
import { hydratePuzzle } from '../data/puzzles/index';
import { GameEngine } from '../core/GameEngine';

type EditorTool = 'player' | 'vehicle' | 'obstacle' | 'exit' | 'eraser';

const VEHICLE_COLORS: VehicleColor[] = ['blue', 'green', 'yellow', 'purple'];
const OBSTACLE_TYPES: ObstacleType[] = ['tree', 'sidewalk', 'barrier'];
const OBSTACLE_EMOJI: Record<ObstacleType, string> = {
  tree: '\u{1F332}',
  sidewalk: '\u{1F9F1}',
  barrier: '\u{1F6A7}',
};
const DIFFICULTIES: Difficulty[] = ['tutorial', 'easy', 'medium', 'hard'];

export class PuzzleEditor {
  private container: HTMLElement;
  private onBack: () => void;

  // Puzzle state
  private name = 'New Puzzle';
  private difficulty: Difficulty = 'easy';
  private gridSize: GridSize = { rows: 4, cols: 4 };
  private exit: Position | null = null;
  private playerCar: { row: number; col: number; length: number; orientation: Orientation } | null = null;
  private vehicles: (RawVehicle & { color?: VehicleColor })[] = [];
  private obstacles: RawObstacle[] = [];
  private validation: PuzzleMove[] | null = null;

  // Editor state
  private activeTool: EditorTool = 'player';
  private vehicleLength = 2;
  private vehicleOrientation: Orientation = 'horizontal';
  private vehicleColor: VehicleColor = 'blue';
  private obstacleType: ObstacleType = 'tree';
  private cellSize = 0;
  private padding = 8;
  private gap = 4;

  // Test mode
  private testEngine: GameEngine | null = null;
  private testMode = false;
  private dragId: string | null = null;
  private dragStartPointer = 0;
  private dragStartCellVal = 0;
  private dragRange = { min: 0, max: 0 };
  private dragIsHorizontal = false;

  constructor(
    container: HTMLElement,
    onBack: () => void,
    editPuzzle?: RawPuzzle & { id?: string },
  ) {
    this.container = container;
    this.onBack = onBack;

    if (editPuzzle) {
      this.name = editPuzzle.name;
      this.difficulty = editPuzzle.difficulty;
      this.gridSize = { ...editPuzzle.gridSize };
      this.exit = { ...editPuzzle.exit };
      this.playerCar = { ...editPuzzle.playerCar };
      this.vehicles = editPuzzle.vehicles.map(v => ({ ...v }));
      this.obstacles = editPuzzle.obstacles.map(o => ({ ...o }));
      this.validation = editPuzzle.validation ? [...editPuzzle.validation] : null;
    }

    this.render();
  }

  // ==================== Main Editor Render ====================

  private render(): void {
    if (this.testMode) {
      this.renderTestMode();
      return;
    }

    this.container.innerHTML = `
      <div class="editor-screen">
        <div class="editor-header">
          <button class="btn back-btn" style="padding:0.4rem 0.8rem;">\u2190</button>
          <input class="editor-input" type="text" value="${this.escapeHtml(this.name)}" placeholder="Puzzle name" style="flex:1;min-width:100px;">
          <select class="editor-input" data-field="difficulty">
            ${DIFFICULTIES.map(d => `<option value="${d}" ${d === this.difficulty ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <select class="editor-input" data-field="rows">
            ${[3,4,5,6,7,8].map(n => `<option value="${n}" ${n === this.gridSize.rows ? 'selected' : ''}>${n} rows</option>`).join('')}
          </select>
          <select class="editor-input" data-field="cols">
            ${[3,4,5,6,7,8].map(n => `<option value="${n}" ${n === this.gridSize.cols ? 'selected' : ''}>${n} cols</option>`).join('')}
          </select>
        </div>

        <div class="editor-toolbar" data-role="tools">
          ${this.renderToolButtons()}
        </div>

        <div class="editor-toolbar" data-role="options" style="${this.activeTool === 'vehicle' || this.activeTool === 'obstacle' ? '' : 'display:none;'}">
          ${this.renderOptionsContent()}
        </div>

        <div class="editor-canvas">
          <div class="editor-grid"></div>
        </div>

        <div class="editor-actions">
          <button class="btn test-btn" ${this.canTest() ? '' : 'disabled'} style="background:var(--secondary);">Test</button>
          <button class="btn save-btn" ${this.canSave() ? '' : 'disabled'}>Save</button>
          <button class="btn download-btn" ${this.canSave() ? '' : 'disabled'} style="background:var(--accent);color:var(--text);">Download</button>
          <label class="btn import-label" style="background:var(--text-light);cursor:pointer;">
            Import <input type="file" accept=".json" style="display:none;" class="import-input">
          </label>
        </div>
      </div>
    `;

    this.bindEvents();
    this.layoutGrid();
  }

  private renderToolButtons(): string {
    const tools: Array<{ id: EditorTool; icon: string; label: string }> = [
      { id: 'player', icon: '\u{1F697}', label: 'Player' },
      { id: 'vehicle', icon: '\u{1F699}', label: 'Vehicle' },
      { id: 'obstacle', icon: '\u{1F332}', label: 'Obstacle' },
      { id: 'exit', icon: '\u{1F6AA}', label: 'Exit' },
      { id: 'eraser', icon: '\u{1F9F9}', label: 'Eraser' },
    ];
    return tools.map(t =>
      `<button class="tool-btn ${this.activeTool === t.id ? 'active' : ''}" data-tool="${t.id}">${t.icon} ${t.label}</button>`
    ).join('');
  }

  private renderOptionsContent(): string {
    if (this.activeTool === 'vehicle') {
      return `
        <span style="font-size:0.85rem;font-weight:600;">Length:</span>
        <button class="tool-btn ${this.vehicleLength === 2 ? 'active' : ''}" data-vlen="2">2</button>
        <button class="tool-btn ${this.vehicleLength === 3 ? 'active' : ''}" data-vlen="3">3</button>
        <span style="font-size:0.85rem;font-weight:600;">Dir:</span>
        <button class="tool-btn ${this.vehicleOrientation === 'horizontal' ? 'active' : ''}" data-vori="horizontal">\u2194</button>
        <button class="tool-btn ${this.vehicleOrientation === 'vertical' ? 'active' : ''}" data-vori="vertical">\u2195</button>
        <div class="color-picker">
          ${VEHICLE_COLORS.map(c => `<div class="color-swatch ${c} ${c === this.vehicleColor ? 'selected' : ''}" data-color="${c}"></div>`).join('')}
        </div>
      `;
    }
    if (this.activeTool === 'obstacle') {
      return OBSTACLE_TYPES.map(t =>
        `<button class="tool-btn ${t === this.obstacleType ? 'active' : ''}" data-obstype="${t}">${OBSTACLE_EMOJI[t]} ${t}</button>`
      ).join('');
    }
    return '';
  }

  /** Refresh only the toolbar and options panel without rebuilding the whole DOM. */
  private refreshToolbar(): void {
    const toolsContainer = this.container.querySelector('[data-role="tools"]');
    if (toolsContainer) {
      toolsContainer.innerHTML = this.renderToolButtons();
      toolsContainer.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.activeTool = (btn as HTMLElement).dataset.tool as EditorTool;
          this.refreshToolbar();
          this.refreshEdgeCells();
          this.updateActionButtons();
        });
      });
    }

    const optionsContainer = this.container.querySelector('[data-role="options"]') as HTMLElement;
    if (optionsContainer) {
      const showOptions = this.activeTool === 'vehicle' || this.activeTool === 'obstacle';
      optionsContainer.style.display = showOptions ? '' : 'none';
      optionsContainer.innerHTML = this.renderOptionsContent();
      this.bindOptionEvents(optionsContainer);
    }
  }

  private bindOptionEvents(container: Element): void {
    container.querySelectorAll('[data-vlen]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.vehicleLength = Number((btn as HTMLElement).dataset.vlen);
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-vori]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.vehicleOrientation = (btn as HTMLElement).dataset.vori as Orientation;
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-color]').forEach(el => {
      el.addEventListener('click', () => {
        this.vehicleColor = (el as HTMLElement).dataset.color as VehicleColor;
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-obstype]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.obstacleType = (btn as HTMLElement).dataset.obstype as ObstacleType;
        this.refreshToolbar();
      });
    });
  }

  private refreshEdgeCells(): void {
    this.container.querySelectorAll('.editor-cell').forEach(el => {
      const cell = el as HTMLElement;
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      const isEdge = r === 0 || r === this.gridSize.rows - 1 || c === 0 || c === this.gridSize.cols - 1;
      cell.classList.toggle('edge-cell', this.activeTool === 'exit' && isEdge);
    });
  }

  private updateActionButtons(): void {
    const testBtn = this.container.querySelector('.test-btn') as HTMLButtonElement;
    const saveBtn = this.container.querySelector('.save-btn') as HTMLButtonElement;
    const dlBtn = this.container.querySelector('.download-btn') as HTMLButtonElement;
    if (testBtn) testBtn.disabled = !this.canTest();
    if (saveBtn) saveBtn.disabled = !this.canSave();
    if (dlBtn) dlBtn.disabled = !this.canSave();
  }

  private bindEvents(): void {
    this.container.querySelector('.back-btn')!.addEventListener('click', this.onBack);

    const nameInput = this.container.querySelector('input[type="text"]') as HTMLInputElement;
    nameInput.addEventListener('input', () => {
      this.name = nameInput.value;
      this.updateActionButtons();
    });

    this.container.querySelector('[data-field="difficulty"]')!.addEventListener('change', (e) => {
      this.difficulty = (e.target as HTMLSelectElement).value as Difficulty;
    });

    this.container.querySelector('[data-field="rows"]')!.addEventListener('change', (e) => {
      this.gridSize.rows = Number((e.target as HTMLSelectElement).value);
      this.clearOutOfBounds();
      this.layoutGrid();
    });

    this.container.querySelector('[data-field="cols"]')!.addEventListener('change', (e) => {
      this.gridSize.cols = Number((e.target as HTMLSelectElement).value);
      this.clearOutOfBounds();
      this.layoutGrid();
    });

    // Tool buttons
    this.container.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTool = (btn as HTMLElement).dataset.tool as EditorTool;
        this.refreshToolbar();
        this.refreshEdgeCells();
        this.updateActionButtons();
      });
    });

    // Options
    const optionsContainer = this.container.querySelector('[data-role="options"]');
    if (optionsContainer) this.bindOptionEvents(optionsContainer);

    // Action buttons
    this.container.querySelector('.test-btn')?.addEventListener('click', () => this.startTest());
    this.container.querySelector('.save-btn')?.addEventListener('click', () => this.save());
    this.container.querySelector('.download-btn')?.addEventListener('click', () => this.download());
    this.container.querySelector('.import-input')?.addEventListener('change', (e) => this.importFile(e));
  }

  // ==================== Grid Layout & Rendering ====================

  /** Rebuild grid cells and compute cell size to fit available space. */
  private layoutGrid(): void {
    const grid = this.container.querySelector('.editor-grid') as HTMLElement;
    if (!grid) return;

    grid.innerHTML = '';

    // Compute available space for the grid
    requestAnimationFrame(() => {
      const canvas = this.container.querySelector('.editor-canvas') as HTMLElement;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const availW = canvasRect.width - 32; // some padding
      const availH = canvasRect.height - 16;

      const { rows, cols } = this.gridSize;
      const gridPadding = this.padding * 2;
      const gapTotal = (val: number, count: number) => (count - 1) * val;

      // Solve: gridPadding + cols * cellSize + (cols-1) * gap <= availW
      // and:   gridPadding + rows * cellSize + (rows-1) * gap <= availH
      // gap ~= cellSize * 0.06 (approx ratio from CSS)
      // Let's try with gap = 4 first, compute cell size, then refine
      const gapEst = 4;
      const cellW = (availW - gridPadding - gapTotal(gapEst, cols)) / cols;
      const cellH = (availH - gridPadding - gapTotal(gapEst, rows)) / rows;
      const computedCellSize = Math.max(24, Math.min(80, Math.floor(Math.min(cellW, cellH))));

      // Apply the computed cell size directly on the grid
      grid.style.gridTemplateRows = `repeat(${rows}, ${computedCellSize}px)`;
      grid.style.gridTemplateColumns = `repeat(${cols}, ${computedCellSize}px)`;

      // Create cells
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('div');
          cell.className = 'editor-cell';
          cell.style.width = `${computedCellSize}px`;
          cell.style.height = `${computedCellSize}px`;
          cell.dataset.row = String(r);
          cell.dataset.col = String(c);

          const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
          if (this.activeTool === 'exit' && isEdge) {
            cell.classList.add('edge-cell');
          }

          cell.addEventListener('click', () => this.onCellClick(r, c));
          grid.appendChild(cell);
        }
      }

      // Read actual cell size
      const firstCell = grid.querySelector('.editor-cell') as HTMLElement;
      if (firstCell) {
        this.cellSize = firstCell.offsetWidth;
        this.gap = parseFloat(getComputedStyle(grid).gap) || 4;
        this.padding = parseFloat(getComputedStyle(grid).paddingLeft) || 8;
      }

      this.renderEntities(grid);
    });
  }

  private cellToPixel(index: number): number {
    return this.padding + index * (this.cellSize + this.gap);
  }

  private renderEntities(grid: HTMLElement): void {
    // Remove old entities
    grid.querySelectorAll('.editor-entity, .editor-exit-marker').forEach(el => el.remove());

    // Exit marker
    if (this.exit) {
      const marker = document.createElement('div');
      marker.className = 'editor-exit-marker';
      const dir = this.deduceDirection(this.exit);
      if (dir === 'right') {
        marker.style.right = '-18px';
        marker.style.top = `${this.cellToPixel(this.exit.row)}px`;
        marker.style.width = '18px';
        marker.style.height = `${this.cellSize}px`;
        marker.style.borderRadius = '0 8px 8px 0';
        marker.textContent = '>';
      } else if (dir === 'left') {
        marker.style.left = '-18px';
        marker.style.top = `${this.cellToPixel(this.exit.row)}px`;
        marker.style.width = '18px';
        marker.style.height = `${this.cellSize}px`;
        marker.style.borderRadius = '8px 0 0 8px';
        marker.textContent = '<';
      } else if (dir === 'down') {
        marker.style.bottom = '-18px';
        marker.style.left = `${this.cellToPixel(this.exit.col)}px`;
        marker.style.width = `${this.cellSize}px`;
        marker.style.height = '18px';
        marker.style.borderRadius = '0 0 8px 8px';
        marker.textContent = 'v';
      } else {
        marker.style.top = '-18px';
        marker.style.left = `${this.cellToPixel(this.exit.col)}px`;
        marker.style.width = `${this.cellSize}px`;
        marker.style.height = '18px';
        marker.style.borderRadius = '8px 8px 0 0';
        marker.textContent = '^';
      }
      grid.appendChild(marker);
    }

    // Player car
    if (this.playerCar) {
      const el = this.createEntityEl('player', this.playerCar.row, this.playerCar.col,
        this.playerCar.length, this.playerCar.orientation);
      el.classList.add('player');
      el.textContent = '\u{1F440}';
      grid.appendChild(el);
    }

    // Vehicles
    this.vehicles.forEach((v, i) => {
      const el = this.createEntityEl(`vehicle-${i}`, v.row, v.col, v.length, v.orientation);
      el.classList.add(`color-${v.color ?? 'blue'}`);
      grid.appendChild(el);
    });

    // Obstacles
    this.obstacles.forEach((o) => {
      const el = document.createElement('div');
      el.className = 'editor-entity obstacle';
      el.style.left = `${this.cellToPixel(o.col)}px`;
      el.style.top = `${this.cellToPixel(o.row)}px`;
      el.style.width = `${this.cellSize}px`;
      el.style.height = `${this.cellSize}px`;
      el.textContent = OBSTACLE_EMOJI[o.type] ?? '\u{1F6A7}';
      grid.appendChild(el);
    });
  }

  private renderGridEntities(): void {
    const grid = this.container.querySelector('.editor-grid') as HTMLElement;
    if (grid) this.renderEntities(grid);
  }

  private createEntityEl(id: string, row: number, col: number, length: number, orientation: Orientation): HTMLElement {
    const el = document.createElement('div');
    el.className = 'editor-entity';
    el.dataset.id = id;
    const w = orientation === 'horizontal' ? length * this.cellSize + (length - 1) * this.gap : this.cellSize;
    const h = orientation === 'vertical' ? length * this.cellSize + (length - 1) * this.gap : this.cellSize;
    el.style.left = `${this.cellToPixel(col)}px`;
    el.style.top = `${this.cellToPixel(row)}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    return el;
  }

  private deduceDirection(exit: Position): string {
    if (exit.col >= this.gridSize.cols - 1) return 'right';
    if (exit.col <= 0) return 'left';
    if (exit.row >= this.gridSize.rows - 1) return 'down';
    return 'up';
  }

  // ==================== Cell Click Handlers ====================

  private onCellClick(row: number, col: number): void {
    switch (this.activeTool) {
      case 'player':
        this.placePlayer(row, col);
        break;
      case 'vehicle':
        this.placeVehicle(row, col);
        break;
      case 'obstacle':
        this.placeObstacle(row, col);
        break;
      case 'exit':
        this.placeExit(row, col);
        break;
      case 'eraser':
        this.eraseAt(row, col);
        break;
    }
  }

  private placePlayer(row: number, col: number): void {
    if (!this.fitsInGrid(row, col, 2, 'horizontal')) return;
    if (this.isOccupied(row, col, 2, 'horizontal', -1, true)) return;
    this.playerCar = { row, col, length: 2, orientation: 'horizontal' };
    this.validation = null;
    this.renderGridEntities();
    this.updateActionButtons();
  }

  private placeVehicle(row: number, col: number): void {
    if (!this.fitsInGrid(row, col, this.vehicleLength, this.vehicleOrientation)) return;
    if (this.isOccupied(row, col, this.vehicleLength, this.vehicleOrientation)) return;
    this.vehicles.push({
      row, col,
      length: this.vehicleLength,
      orientation: this.vehicleOrientation,
      color: this.vehicleColor,
    });
    this.validation = null;
    this.renderGridEntities();
  }

  private placeObstacle(row: number, col: number): void {
    if (this.isOccupied(row, col, 1, 'horizontal')) return;
    this.obstacles.push({ row, col, type: this.obstacleType });
    this.validation = null;
    this.renderGridEntities();
  }

  private placeExit(row: number, col: number): void {
    const isEdge = row === 0 || row === this.gridSize.rows - 1 ||
                   col === 0 || col === this.gridSize.cols - 1;
    if (!isEdge) return;
    this.exit = { row, col };
    this.validation = null;
    this.renderGridEntities();
    this.updateActionButtons();
  }

  private eraseAt(row: number, col: number): void {
    if (this.playerCar && this.occupiesCells(this.playerCar.row, this.playerCar.col, this.playerCar.length, this.playerCar.orientation).some(p => p.row === row && p.col === col)) {
      this.playerCar = null;
      this.validation = null;
      this.renderGridEntities();
      this.updateActionButtons();
      return;
    }
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (this.occupiesCells(v.row, v.col, v.length, v.orientation).some(p => p.row === row && p.col === col)) {
        this.vehicles.splice(i, 1);
        this.validation = null;
        this.renderGridEntities();
        return;
      }
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      if (this.obstacles[i].row === row && this.obstacles[i].col === col) {
        this.obstacles.splice(i, 1);
        this.validation = null;
        this.renderGridEntities();
        return;
      }
    }
    if (this.exit && this.exit.row === row && this.exit.col === col) {
      this.exit = null;
      this.validation = null;
      this.renderGridEntities();
      this.updateActionButtons();
    }
  }

  // ==================== Helpers ====================

  private occupiesCells(row: number, col: number, length: number, orientation: Orientation): Position[] {
    const cells: Position[] = [];
    for (let i = 0; i < length; i++) {
      cells.push({
        row: orientation === 'vertical' ? row + i : row,
        col: orientation === 'horizontal' ? col + i : col,
      });
    }
    return cells;
  }

  private fitsInGrid(row: number, col: number, length: number, orientation: Orientation): boolean {
    const cells = this.occupiesCells(row, col, length, orientation);
    return cells.every(c => c.row >= 0 && c.row < this.gridSize.rows && c.col >= 0 && c.col < this.gridSize.cols);
  }

  private isOccupied(row: number, col: number, length: number, orientation: Orientation, skipVehicleIdx = -1, skipPlayer = false): boolean {
    const cells = this.occupiesCells(row, col, length, orientation);
    const occupied = new Set<string>();

    if (this.playerCar && !skipPlayer) {
      this.occupiesCells(this.playerCar.row, this.playerCar.col, this.playerCar.length, this.playerCar.orientation)
        .forEach(p => occupied.add(`${p.row},${p.col}`));
    }
    this.vehicles.forEach((v, i) => {
      if (i === skipVehicleIdx) return;
      this.occupiesCells(v.row, v.col, v.length, v.orientation)
        .forEach(p => occupied.add(`${p.row},${p.col}`));
    });
    this.obstacles.forEach(o => occupied.add(`${o.row},${o.col}`));

    return cells.some(c => occupied.has(`${c.row},${c.col}`));
  }

  private clearOutOfBounds(): void {
    if (this.playerCar && !this.fitsInGrid(this.playerCar.row, this.playerCar.col, this.playerCar.length, this.playerCar.orientation)) {
      this.playerCar = null;
    }
    this.vehicles = this.vehicles.filter(v => this.fitsInGrid(v.row, v.col, v.length, v.orientation));
    this.obstacles = this.obstacles.filter(o => o.row < this.gridSize.rows && o.col < this.gridSize.cols);
    if (this.exit && (this.exit.row >= this.gridSize.rows || this.exit.col >= this.gridSize.cols)) {
      this.exit = null;
    }
    this.validation = null;
  }

  private canTest(): boolean {
    return !!this.playerCar && !!this.exit;
  }

  private canSave(): boolean {
    return !!this.playerCar && !!this.exit && this.name.trim().length > 0;
  }

  // ==================== Test Mode ====================

  private startTest(): void {
    if (!this.playerCar || !this.exit) return;

    const puzzle = this.buildPuzzle();
    const hydrated = hydratePuzzle(puzzle, 'test');

    this.testEngine = new GameEngine(hydrated);
    this.testMode = true;
    this.renderTestMode();
  }

  private renderTestMode(): void {
    if (!this.testEngine) return;
    const puzzle = this.testEngine.getState().puzzle;
    const { rows, cols } = puzzle.gridSize;

    this.container.innerHTML = `
      <div class="editor-screen">
        <div class="editor-header">
          <button class="btn stop-test-btn" style="padding:0.4rem 0.8rem;background:var(--primary);">Stop Test</button>
          <span class="move-counter">Moves: 0</span>
          <button class="btn reset-test-btn" style="padding:0.4rem 0.8rem;">\u21BB</button>
        </div>
        <div class="editor-canvas">
          <div class="board"></div>
        </div>
        <div class="editor-actions">
          <button class="btn save-validation-btn" disabled style="background:var(--vehicle-green);">Save as Validation</button>
        </div>
      </div>
    `;

    const board = this.container.querySelector('.board') as HTMLElement;
    board.style.touchAction = 'none';

    // Compute cell size to fit
    requestAnimationFrame(() => {
      const canvas = this.container.querySelector('.editor-canvas') as HTMLElement;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const availW = canvasRect.width - 32;
      const availH = canvasRect.height - 16;
      const gapEst = 4;
      const gridPad = 8 * 2;
      const cellW = (availW - gridPad - (cols - 1) * gapEst) / cols;
      const cellH = (availH - gridPad - (rows - 1) * gapEst) / rows;
      const computedCellSize = Math.max(24, Math.min(80, Math.floor(Math.min(cellW, cellH))));

      board.style.gridTemplateRows = `repeat(${rows}, ${computedCellSize}px)`;
      board.style.gridTemplateColumns = `repeat(${cols}, ${computedCellSize}px)`;

      // Render cells
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.style.width = `${computedCellSize}px`;
          cell.style.height = `${computedCellSize}px`;
          board.appendChild(cell);
        }
      }

      // Exit marker
      const exit = puzzle.exit;
      const marker = document.createElement('div');
      marker.className = `exit-marker ${exit.direction}`;
      marker.dataset.row = String(exit.row);
      marker.dataset.col = String(exit.col);
      board.appendChild(marker);

      // Obstacles
      for (const obs of puzzle.obstacles) {
        const el = document.createElement('div');
        el.className = 'obstacle';
        el.textContent = OBSTACLE_EMOJI[obs.type as ObstacleType] ?? '\u{1F6A7}';
        el.dataset.row = String(obs.row);
        el.dataset.col = String(obs.col);
        board.appendChild(el);
      }

      // Vehicles
      const renderVehicle = (v: { id: string; orientation: Orientation; color?: VehicleColor }, isPlayer: boolean) => {
        const el = document.createElement('div');
        el.className = `vehicle ${isPlayer ? 'player' : `color-${v.color ?? 'blue'}`}`;
        el.dataset.id = v.id;
        if (isPlayer) {
          const face = document.createElement('span');
          face.className = 'face';
          face.textContent = '\u{1F440}';
          el.appendChild(face);
        }
        board.appendChild(el);
      };

      renderVehicle(puzzle.playerCar, true);
      puzzle.vehicles.forEach(v => renderVehicle(v, false));

      // Read actual cell size
      const firstCell = board.querySelector('.cell') as HTMLElement;
      if (firstCell) {
        this.cellSize = firstCell.offsetWidth;
        this.gap = parseFloat(getComputedStyle(board).gap) || 4;
        this.padding = parseFloat(getComputedStyle(board).paddingLeft) || 8;
      }
      this.updateTestPositions(board);
    });

    // Pointer events
    board.addEventListener('pointerdown', this.onTestPointerDown);
    board.addEventListener('pointermove', this.onTestPointerMove);
    board.addEventListener('pointerup', this.onTestPointerUp);
    board.addEventListener('pointercancel', this.onTestPointerUp);

    // Subscribe to engine changes
    this.testEngine.subscribe(() => {
      const b = this.container.querySelector('.board') as HTMLElement;
      if (b) this.updateTestPositions(b);
    });

    // Buttons
    this.container.querySelector('.stop-test-btn')!.addEventListener('click', () => {
      this.testMode = false;
      this.testEngine = null;
      this.render();
    });
    this.container.querySelector('.reset-test-btn')!.addEventListener('click', () => {
      this.testEngine!.reset();
      const saveBtn = this.container.querySelector('.save-validation-btn') as HTMLButtonElement;
      if (saveBtn) saveBtn.disabled = true;
    });
    this.container.querySelector('.save-validation-btn')!.addEventListener('click', () => {
      if (this.testEngine) {
        this.validation = this.testEngine.getMoveHistory();
        this.testMode = false;
        this.testEngine = null;
        this.render();
      }
    });
  }

  private updateTestPositions(board: HTMLElement): void {
    if (!this.testEngine) return;
    const state = this.testEngine.getState();
    const { puzzle, vehiclePositions, moveCount } = state;

    const moveEl = this.container.querySelector('.move-counter');
    if (moveEl) moveEl.textContent = `Moves: ${moveCount}`;

    const allVehicles = [puzzle.playerCar, ...puzzle.vehicles];
    for (const v of allVehicles) {
      const pos = vehiclePositions.get(v.id)!;
      const el = board.querySelector(`[data-id="${v.id}"]`) as HTMLElement;
      if (!el) continue;
      el.style.left = `${this.cellToPixel(pos.col)}px`;
      el.style.top = `${this.cellToPixel(pos.row)}px`;
      const w = v.orientation === 'horizontal' ? v.length * this.cellSize + (v.length - 1) * this.gap : this.cellSize;
      const h = v.orientation === 'vertical' ? v.length * this.cellSize + (v.length - 1) * this.gap : this.cellSize;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }

    // Obstacles
    board.querySelectorAll('.obstacle').forEach(el => {
      const obsEl = el as HTMLElement;
      obsEl.style.left = `${this.cellToPixel(Number(obsEl.dataset.col))}px`;
      obsEl.style.top = `${this.cellToPixel(Number(obsEl.dataset.row))}px`;
      obsEl.style.width = `${this.cellSize}px`;
      obsEl.style.height = `${this.cellSize}px`;
    });

    // Exit marker
    const exitEl = board.querySelector('.exit-marker') as HTMLElement;
    if (exitEl) {
      exitEl.style.top = `${this.cellToPixel(puzzle.exit.row)}px`;
      exitEl.style.height = `${this.cellSize}px`;
    }

    if (state.isComplete) {
      const saveBtn = this.container.querySelector('.save-validation-btn') as HTMLButtonElement;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  private onTestPointerDown = (e: PointerEvent): void => {
    if (!this.testEngine) return;
    const target = (e.target as HTMLElement).closest('.vehicle') as HTMLElement | null;
    if (!target) return;

    e.preventDefault();
    target.setPointerCapture(e.pointerId);

    const vehicleId = target.dataset.id!;
    const vehicle = this.testEngine.getVehicle(vehicleId);
    if (!vehicle) return;

    this.dragId = vehicleId;
    this.dragIsHorizontal = vehicle.orientation === 'horizontal';
    const pos = this.testEngine.getState().vehiclePositions.get(vehicleId)!;
    this.dragStartCellVal = this.dragIsHorizontal ? pos.col : pos.row;
    this.dragStartPointer = this.dragIsHorizontal ? e.clientX : e.clientY;
    this.dragRange = this.testEngine.getSlideRange(vehicleId);

    target.classList.add('dragging');
  };

  private onTestPointerMove = (e: PointerEvent): void => {
    if (!this.dragId || !this.testEngine) return;
    e.preventDefault();

    const pointer = this.dragIsHorizontal ? e.clientX : e.clientY;
    const delta = pointer - this.dragStartPointer;
    const cellDelta = Math.round(delta / (this.cellSize + this.gap));
    let newVal = this.dragStartCellVal + cellDelta;
    newVal = Math.max(this.dragRange.min, Math.min(this.dragRange.max, newVal));

    const board = this.container.querySelector('.board') as HTMLElement;
    const el = board?.querySelector(`[data-id="${this.dragId}"]`) as HTMLElement;
    if (!el) return;

    if (this.dragIsHorizontal) {
      el.style.left = `${this.cellToPixel(newVal)}px`;
    } else {
      el.style.top = `${this.cellToPixel(newVal)}px`;
    }
  };

  private onTestPointerUp = (e: PointerEvent): void => {
    if (!this.dragId || !this.testEngine) return;

    const board = this.container.querySelector('.board') as HTMLElement;
    const el = board?.querySelector(`[data-id="${this.dragId}"]`) as HTMLElement;
    el?.classList.remove('dragging');

    const pointer = this.dragIsHorizontal ? e.clientX : e.clientY;
    const delta = pointer - this.dragStartPointer;
    const cellDelta = Math.round(delta / (this.cellSize + this.gap));
    let newVal = this.dragStartCellVal + cellDelta;
    newVal = Math.max(this.dragRange.min, Math.min(this.dragRange.max, newVal));

    const currentPos = this.testEngine.getState().vehiclePositions.get(this.dragId)!;
    const newPos: Position = this.dragIsHorizontal
      ? { row: currentPos.row, col: newVal }
      : { row: newVal, col: currentPos.col };

    this.testEngine.moveVehicle(this.dragId, newPos);
    const b = this.container.querySelector('.board') as HTMLElement;
    if (b) this.updateTestPositions(b);

    this.dragId = null;
  };

  // ==================== Save / Download / Import ====================

  private buildPuzzle(): RawPuzzle {
    const puzzle: RawPuzzle = {
      name: this.name.trim(),
      difficulty: this.difficulty,
      gridSize: { ...this.gridSize },
      exit: { ...this.exit! },
      playerCar: { ...this.playerCar! },
      vehicles: this.vehicles.map(v => ({ ...v })),
      obstacles: this.obstacles.map(o => ({ ...o })),
    };
    if (this.validation) {
      puzzle.validation = [...this.validation];
    }
    return puzzle;
  }

  private generateFilename(): string {
    const slug = this.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `puzzle-${slug || 'untitled'}.json`;
  }

  private async save(): Promise<void> {
    if (!this.canSave()) return;

    const puzzle = this.buildPuzzle();
    const filename = this.generateFilename();

    if (import.meta.env.DEV) {
      try {
        const res = await fetch('/__api/puzzles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, puzzle }),
        });
        const data = await res.json();
        if (data.success) {
          alert(`Saved as ${data.filename}. Add the import to src/data/puzzles/index.ts to include it.`);
        } else {
          alert(`Error: ${data.error}`);
        }
      } catch (err) {
        alert(`Failed to save: ${(err as Error).message}`);
      }
    } else {
      this.download();
    }
  }

  private download(): void {
    if (!this.canSave()) return;
    const puzzle = this.buildPuzzle();
    const json = JSON.stringify(puzzle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.generateFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private importFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string) as RawPuzzle;
        this.name = raw.name;
        this.difficulty = raw.difficulty;
        this.gridSize = { ...raw.gridSize };
        this.exit = { ...raw.exit };
        this.playerCar = { ...raw.playerCar };
        this.vehicles = raw.vehicles.map(v => ({ ...v }));
        this.obstacles = raw.obstacles.map(o => ({ ...o }));
        this.validation = raw.validation ? [...raw.validation] : null;
        this.render();
      } catch {
        alert('Invalid puzzle file.');
      }
    };
    reader.readAsText(file);
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
