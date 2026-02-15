import type {
  Difficulty, GridSize, Orientation, ObstacleType, Position,
  RawPuzzle, RawVehicle, RawObstacle, VehicleColor, PuzzleMove,
} from '../types/puzzle';
import { hydratePuzzle, rotatePuzzle90CW, getAllPuzzles, savePuzzle } from '../data/puzzles/index';
import { GameEngine } from '../core/GameEngine';

type EditorTool = 'player' | 'vehicle' | 'obstacle';

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
  private editId: string | null = null;

  // Editor state
  private activeTool: EditorTool = 'player';
  private vehicleLength = 2;
  private vehicleOrientation: Orientation = 'horizontal';
  private vehicleColor: VehicleColor = 'blue';
  private obstacleType: ObstacleType = 'tree';
  private playerOrientation: Orientation = 'horizontal';
  private exitSide: 'left' | 'right' | 'up' | 'down' = 'right';
  private cellSize = 0;
  private padding = 8;
  private gap = 4;

  // Selection & drag state
  private selectedEntity: { type: 'player' | 'vehicle' | 'obstacle'; index: number } | null = null;
  private editorDragState: {
    entityType: 'player' | 'vehicle' | 'obstacle';
    entityIndex: number;
    origRow: number;
    origCol: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
    el: HTMLElement;
    isOutside: boolean;
  } | null = null;

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
      this.editId = editPuzzle.id ?? null;
      if (this.playerCar) {
        this.playerOrientation = this.playerCar.orientation;
      }
      if (this.exit) {
        const dir = this.deduceDirection(this.exit);
        this.exitSide = dir as typeof this.exitSide;
      }
    }

    this.render();
  }

  // ==================== Main Editor Render ====================

  private render(): void {
    if (this.testMode) {
      this.renderTestMode();
      return;
    }

    const tools: Array<{ id: EditorTool; icon: string; label: string }> = [
      { id: 'player', icon: '\u{1F697}', label: 'Player' },
      { id: 'vehicle', icon: '\u{1F699}', label: 'Vehicle' },
      { id: 'obstacle', icon: '\u{1F332}', label: 'Obstacle' },
    ];

    this.container.innerHTML = `
      <div class="editor-screen">
        <div class="editor-row editor-name-row">
          <button class="btn back-btn" style="padding:0.4rem 0.8rem;">\u2190</button>
          <input class="editor-input editor-name-input" type="text" value="${this.escapeHtml(this.name)}" placeholder="Puzzle name">
        </div>

        <div class="editor-row editor-settings-row">
          <select class="editor-input" data-field="difficulty">
            ${DIFFICULTIES.map(d => `<option value="${d}" ${d === this.difficulty ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <select class="editor-input" data-field="rows">
            ${[3,4,5,6,7,8].map(n => `<option value="${n}" ${n === this.gridSize.rows ? 'selected' : ''}>${n} rows</option>`).join('')}
          </select>
          <select class="editor-input" data-field="cols">
            ${[3,4,5,6,7,8].map(n => `<option value="${n}" ${n === this.gridSize.cols ? 'selected' : ''}>${n} cols</option>`).join('')}
          </select>
          <button class="btn action-btn rotate-btn" title="Rotate 90\u00B0 CW">\u21BB</button>
          <div class="editor-settings-spacer"></div>
          <button class="btn action-btn test-btn" ${this.canTest() ? '' : 'disabled'}>Test</button>
          <button class="btn action-btn save-btn" ${this.canSave() ? '' : 'disabled'}>Save</button>
          <button class="btn action-btn download-btn" ${this.canSave() ? '' : 'disabled'}>DL</button>
          <button class="btn action-btn load-btn">Load</button>
          <label class="btn action-btn import-label">
            Imp <input type="file" accept=".json" style="display:none;" class="import-input">
          </label>
        </div>

        <div class="editor-tabs" data-role="tabs">
          ${tools.map(t => `
            <button class="editor-tab ${this.activeTool === t.id ? 'active' : ''}" data-tool="${t.id}">
              <span class="tab-icon">${t.icon}</span>
              <span class="tab-label">${t.label}</span>
            </button>
          `).join('')}
        </div>

        <div class="editor-options-tray" data-role="options">
          ${this.renderOptionsContent()}
        </div>

        <div class="editor-canvas">
          <div class="editor-grid"></div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.layoutGrid();
  }

  private renderOptionsContent(): string {
    if (this.activeTool === 'player') {
      const ori = this.playerOrientation;
      const exitOptions = ori === 'horizontal'
        ? ['left', 'right'] as const
        : ['up', 'down'] as const;
      return `
        <span class="opt-label">Dir:</span>
        <button class="opt-btn ${ori === 'horizontal' ? 'active' : ''}" data-pori="horizontal">\u2194</button>
        <button class="opt-btn ${ori === 'vertical' ? 'active' : ''}" data-pori="vertical">\u2195</button>
        <span class="opt-label">Exit:</span>
        ${exitOptions.map(s => `<button class="opt-btn ${this.exitSide === s ? 'active' : ''}" data-exitside="${s}">${s}</button>`).join('')}
      `;
    }
    if (this.activeTool === 'vehicle') {
      return `
        <span class="opt-label">Len:</span>
        <button class="opt-btn ${this.vehicleLength === 2 ? 'active' : ''}" data-vlen="2">2</button>
        <button class="opt-btn ${this.vehicleLength === 3 ? 'active' : ''}" data-vlen="3">3</button>
        <span class="opt-label">Dir:</span>
        <button class="opt-btn ${this.vehicleOrientation === 'horizontal' ? 'active' : ''}" data-vori="horizontal">\u2194</button>
        <button class="opt-btn ${this.vehicleOrientation === 'vertical' ? 'active' : ''}" data-vori="vertical">\u2195</button>
        <div class="color-picker">
          ${VEHICLE_COLORS.map(c => `<div class="color-swatch ${c} ${c === this.vehicleColor ? 'selected' : ''}" data-color="${c}"></div>`).join('')}
        </div>
      `;
    }
    if (this.activeTool === 'obstacle') {
      return OBSTACLE_TYPES.map(t =>
        `<button class="opt-btn ${t === this.obstacleType ? 'active' : ''}" data-obstype="${t}">${OBSTACLE_EMOJI[t]} ${t}</button>`
      ).join('');
    }
    return '';
  }

  private refreshToolbar(): void {
    this.container.querySelectorAll('.editor-tab').forEach(btn => {
      const tool = (btn as HTMLElement).dataset.tool as EditorTool;
      btn.classList.toggle('active', tool === this.activeTool);
    });

    const optionsContainer = this.container.querySelector('[data-role="options"]') as HTMLElement;
    if (optionsContainer) {
      optionsContainer.innerHTML = this.renderOptionsContent();
      this.bindOptionEvents(optionsContainer);
    }
  }

  private bindOptionEvents(container: Element): void {
    container.querySelectorAll('[data-pori]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newOri = (btn as HTMLElement).dataset.pori as Orientation;
        if (newOri === this.playerOrientation) return;
        this.playerOrientation = newOri;
        this.exitSide = newOri === 'horizontal' ? 'right' : 'down';
        if (this.selectedEntity?.type === 'player' && this.playerCar) {
          if (this.fitsInGrid(this.playerCar.row, this.playerCar.col, this.playerCar.length, newOri) &&
              !this.isOccupied(this.playerCar.row, this.playerCar.col, this.playerCar.length, newOri, -1, true)) {
            this.playerCar.orientation = newOri;
            this.autoPlaceExit();
            this.validation = null;
            this.renderGridEntities();
          } else {
            this.showToast('Cannot change orientation — collision or out of bounds');
          }
        }
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-exitside]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.exitSide = (btn as HTMLElement).dataset.exitside as typeof this.exitSide;
        if (this.playerCar) {
          this.autoPlaceExit();
          this.validation = null;
          this.renderGridEntities();
          this.updateActionButtons();
        }
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-vlen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newLen = Number((btn as HTMLElement).dataset.vlen);
        this.vehicleLength = newLen;
        if (this.selectedEntity?.type === 'vehicle') {
          const v = this.vehicles[this.selectedEntity.index];
          if (v && newLen !== v.length) {
            if (this.fitsInGrid(v.row, v.col, newLen, v.orientation) &&
                !this.isOccupied(v.row, v.col, newLen, v.orientation, this.selectedEntity.index)) {
              v.length = newLen;
              this.validation = null;
              this.renderGridEntities();
            } else {
              this.showToast('Cannot change length — collision or out of bounds');
            }
          }
        }
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-vori]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newOri = (btn as HTMLElement).dataset.vori as Orientation;
        this.vehicleOrientation = newOri;
        if (this.selectedEntity?.type === 'vehicle') {
          const v = this.vehicles[this.selectedEntity.index];
          if (v && newOri !== v.orientation) {
            if (this.fitsInGrid(v.row, v.col, v.length, newOri) &&
                !this.isOccupied(v.row, v.col, v.length, newOri, this.selectedEntity.index)) {
              v.orientation = newOri;
              this.validation = null;
              this.renderGridEntities();
            } else {
              this.showToast('Cannot change orientation — collision or out of bounds');
            }
          }
        }
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-color]').forEach(el => {
      el.addEventListener('click', () => {
        const newColor = (el as HTMLElement).dataset.color as VehicleColor;
        this.vehicleColor = newColor;
        if (this.selectedEntity?.type === 'vehicle') {
          const v = this.vehicles[this.selectedEntity.index];
          if (v) {
            v.color = newColor;
            this.renderGridEntities();
          }
        }
        this.refreshToolbar();
      });
    });
    container.querySelectorAll('[data-obstype]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newType = (btn as HTMLElement).dataset.obstype as ObstacleType;
        this.obstacleType = newType;
        if (this.selectedEntity?.type === 'obstacle') {
          const o = this.obstacles[this.selectedEntity.index];
          if (o) {
            o.type = newType;
            this.validation = null;
            this.renderGridEntities();
          }
        }
        this.refreshToolbar();
      });
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

    const nameInput = this.container.querySelector('.editor-name-input') as HTMLInputElement;
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

    // Tab buttons
    this.container.querySelectorAll('.editor-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedEntity = null;
        this.activeTool = (btn as HTMLElement).dataset.tool as EditorTool;
        this.refreshToolbar();
        this.renderGridEntities();
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
    this.container.querySelector('.rotate-btn')?.addEventListener('click', () => this.rotatePuzzle());
    this.container.querySelector('.load-btn')?.addEventListener('click', () => this.showLoadDialog());
  }

  // ==================== Grid Layout & Rendering ====================

  private layoutGrid(): void {
    const grid = this.container.querySelector('.editor-grid') as HTMLElement;
    if (!grid) return;

    grid.innerHTML = '';

    requestAnimationFrame(() => {
      const canvas = this.container.querySelector('.editor-canvas') as HTMLElement;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const availW = canvasRect.width - 32;
      const availH = canvasRect.height - 16;

      const { rows, cols } = this.gridSize;
      const gridPadding = this.padding * 2;
      const gapTotal = (val: number, count: number) => (count - 1) * val;

      const gapEst = 4;
      const cellW = (availW - gridPadding - gapTotal(gapEst, cols)) / cols;
      const cellH = (availH - gridPadding - gapTotal(gapEst, rows)) / rows;
      const computedCellSize = Math.max(24, Math.min(100, Math.floor(Math.min(cellW, cellH))));

      grid.style.gridTemplateRows = `repeat(${rows}, ${computedCellSize}px)`;
      grid.style.gridTemplateColumns = `repeat(${cols}, ${computedCellSize}px)`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('div');
          cell.className = 'editor-cell';
          cell.style.width = `${computedCellSize}px`;
          cell.style.height = `${computedCellSize}px`;
          cell.dataset.row = String(r);
          cell.dataset.col = String(c);

          cell.addEventListener('click', () => this.onCellClick(r, c));
          grid.appendChild(cell);
        }
      }

      const firstCell = grid.querySelector('.editor-cell') as HTMLElement;
      if (firstCell) {
        this.cellSize = firstCell.offsetWidth;
        this.gap = parseFloat(getComputedStyle(grid).gap) || 4;
        this.padding = parseFloat(getComputedStyle(grid).paddingLeft) || 8;
      }

      // Bind editor drag events
      grid.removeEventListener('pointerdown', this.onEditorPointerDown);
      grid.removeEventListener('pointermove', this.onEditorPointerMove);
      grid.removeEventListener('pointerup', this.onEditorPointerUp);
      grid.removeEventListener('pointercancel', this.onEditorPointerUp);
      grid.addEventListener('pointerdown', this.onEditorPointerDown);
      grid.addEventListener('pointermove', this.onEditorPointerMove);
      grid.addEventListener('pointerup', this.onEditorPointerUp);
      grid.addEventListener('pointercancel', this.onEditorPointerUp);
      grid.style.touchAction = 'none';

      this.renderEntities(grid);
    });
  }

  private cellToPixel(index: number): number {
    return this.padding + index * (this.cellSize + this.gap);
  }

  private renderEntities(grid: HTMLElement): void {
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
      el.classList.add('player', 'interactive');
      el.dataset.entityType = 'player';
      el.dataset.entityIndex = '0';
      el.textContent = '\u{1F440}';
      if (this.selectedEntity?.type === 'player') el.classList.add('selected');
      grid.appendChild(el);
    }

    // Vehicles
    this.vehicles.forEach((v, i) => {
      const el = this.createEntityEl(`vehicle-${i}`, v.row, v.col, v.length, v.orientation);
      el.classList.add(`color-${v.color ?? 'blue'}`, 'interactive');
      el.dataset.entityType = 'vehicle';
      el.dataset.entityIndex = String(i);
      if (this.selectedEntity?.type === 'vehicle' && this.selectedEntity.index === i) el.classList.add('selected');
      grid.appendChild(el);
    });

    // Obstacles
    this.obstacles.forEach((o, i) => {
      const el = document.createElement('div');
      el.className = 'editor-entity obstacle interactive';
      el.style.left = `${this.cellToPixel(o.col)}px`;
      el.style.top = `${this.cellToPixel(o.row)}px`;
      el.style.width = `${this.cellSize}px`;
      el.style.height = `${this.cellSize}px`;
      el.textContent = OBSTACLE_EMOJI[o.type] ?? '\u{1F6A7}';
      el.dataset.entityType = 'obstacle';
      el.dataset.entityIndex = String(i);
      if (this.selectedEntity?.type === 'obstacle' && this.selectedEntity.index === i) el.classList.add('selected');
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

  // ==================== Editor Drag & Selection ====================

  private isPointerOutsideGrid(clientX: number, clientY: number): boolean {
    const grid = this.container.querySelector('.editor-grid') as HTMLElement;
    if (!grid) return true;
    const rect = grid.getBoundingClientRect();
    const margin = 20;
    return clientX < rect.left - margin || clientX > rect.right + margin ||
           clientY < rect.top - margin || clientY > rect.bottom + margin;
  }

  private onEditorPointerDown = (e: PointerEvent): void => {
    if (this.testMode) return;
    const target = (e.target as HTMLElement).closest('.editor-entity.interactive') as HTMLElement | null;
    if (!target) return;

    const entityType = target.dataset.entityType as 'player' | 'vehicle' | 'obstacle';
    const entityIndex = Number(target.dataset.entityIndex);

    let origRow: number, origCol: number;
    if (entityType === 'player' && this.playerCar) {
      origRow = this.playerCar.row;
      origCol = this.playerCar.col;
    } else if (entityType === 'vehicle') {
      origRow = this.vehicles[entityIndex].row;
      origCol = this.vehicles[entityIndex].col;
    } else if (entityType === 'obstacle') {
      origRow = this.obstacles[entityIndex].row;
      origCol = this.obstacles[entityIndex].col;
    } else {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    target.setPointerCapture(e.pointerId);

    this.editorDragState = {
      entityType,
      entityIndex,
      origRow,
      origCol,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      el: target,
      isOutside: false,
    };

    target.classList.add('dragging');
  };

  private onEditorPointerMove = (e: PointerEvent): void => {
    const ds = this.editorDragState;
    if (!ds) return;
    e.preventDefault();

    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (!ds.hasMoved && dist < 5) return;
    ds.hasMoved = true;

    const outside = this.isPointerOutsideGrid(e.clientX, e.clientY);
    ds.isOutside = outside;

    if (outside) {
      ds.el.classList.add('delete-preview');
      ds.el.classList.remove('invalid-drop');
      const step = this.cellSize + this.gap;
      ds.el.style.left = `${this.cellToPixel(ds.origCol + Math.round(dx / step))}px`;
      ds.el.style.top = `${this.cellToPixel(ds.origRow + Math.round(dy / step))}px`;
      return;
    }

    ds.el.classList.remove('delete-preview');

    const step = this.cellSize + this.gap;
    const cellDx = Math.round(dx / step);
    const cellDy = Math.round(dy / step);
    const newRow = ds.origRow + cellDy;
    const newCol = ds.origCol + cellDx;

    const valid = this.isValidEntityPosition(ds.entityType, ds.entityIndex, newRow, newCol);

    ds.el.style.left = `${this.cellToPixel(newCol)}px`;
    ds.el.style.top = `${this.cellToPixel(newRow)}px`;

    ds.el.classList.toggle('invalid-drop', !valid);
  };

  private onEditorPointerUp = (e: PointerEvent): void => {
    const ds = this.editorDragState;
    if (!ds) return;

    ds.el.classList.remove('dragging', 'invalid-drop', 'delete-preview');
    this.editorDragState = null;

    if (!ds.hasMoved) {
      this.selectEntity(ds.entityType, ds.entityIndex);
      return;
    }

    if (ds.isOutside) {
      this.deleteEntity(ds.entityType, ds.entityIndex);
      return;
    }

    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    const step = this.cellSize + this.gap;
    const newRow = ds.origRow + Math.round(dy / step);
    const newCol = ds.origCol + Math.round(dx / step);

    if (this.isValidEntityPosition(ds.entityType, ds.entityIndex, newRow, newCol)) {
      if (ds.entityType === 'player' && this.playerCar) {
        this.playerCar.row = newRow;
        this.playerCar.col = newCol;
        this.autoPlaceExit();
      } else if (ds.entityType === 'vehicle') {
        this.vehicles[ds.entityIndex].row = newRow;
        this.vehicles[ds.entityIndex].col = newCol;
      } else if (ds.entityType === 'obstacle') {
        this.obstacles[ds.entityIndex].row = newRow;
        this.obstacles[ds.entityIndex].col = newCol;
      }
      this.validation = null;
    }
    this.renderGridEntities();
    this.updateActionButtons();
  };

  private deleteEntity(entityType: string, entityIndex: number): void {
    if (entityType === 'player') {
      this.playerCar = null;
      this.exit = null;
    } else if (entityType === 'vehicle') {
      this.vehicles.splice(entityIndex, 1);
      if (this.selectedEntity?.type === 'vehicle') {
        if (this.selectedEntity.index === entityIndex) {
          this.selectedEntity = null;
        } else if (this.selectedEntity.index > entityIndex) {
          this.selectedEntity.index--;
        }
      }
    } else if (entityType === 'obstacle') {
      this.obstacles.splice(entityIndex, 1);
      if (this.selectedEntity?.type === 'obstacle') {
        if (this.selectedEntity.index === entityIndex) {
          this.selectedEntity = null;
        } else if (this.selectedEntity.index > entityIndex) {
          this.selectedEntity.index--;
        }
      }
    }
    this.validation = null;
    this.renderGridEntities();
    this.updateActionButtons();
    this.showToast('Deleted');
  }

  private isValidEntityPosition(entityType: string, entityIndex: number, row: number, col: number): boolean {
    if (entityType === 'player' && this.playerCar) {
      return this.fitsInGrid(row, col, this.playerCar.length, this.playerCar.orientation) &&
        !this.isOccupied(row, col, this.playerCar.length, this.playerCar.orientation, -1, true);
    } else if (entityType === 'vehicle') {
      const v = this.vehicles[entityIndex];
      return this.fitsInGrid(row, col, v.length, v.orientation) &&
        !this.isOccupied(row, col, v.length, v.orientation, entityIndex);
    } else if (entityType === 'obstacle') {
      return row >= 0 && row < this.gridSize.rows && col >= 0 && col < this.gridSize.cols &&
        !this.isOccupied(row, col, 1, 'horizontal', -1, false, entityIndex);
    }
    return false;
  }

  private selectEntity(type: 'player' | 'vehicle' | 'obstacle', index: number): void {
    if (this.selectedEntity?.type === type && this.selectedEntity.index === index) {
      this.selectedEntity = null;
      this.refreshToolbar();
      this.renderGridEntities();
      return;
    }

    this.selectedEntity = { type, index };

    if (type === 'player') {
      this.activeTool = 'player';
      if (this.playerCar) {
        this.playerOrientation = this.playerCar.orientation;
        if (this.exit) {
          const dir = this.deduceDirection(this.exit);
          this.exitSide = dir as typeof this.exitSide;
        }
      }
    } else if (type === 'vehicle') {
      this.activeTool = 'vehicle';
      const v = this.vehicles[index];
      if (v) {
        this.vehicleLength = v.length;
        this.vehicleOrientation = v.orientation;
        this.vehicleColor = v.color ?? 'blue';
      }
    } else if (type === 'obstacle') {
      this.activeTool = 'obstacle';
      const o = this.obstacles[index];
      if (o) {
        this.obstacleType = o.type;
      }
    }

    this.refreshToolbar();
    this.renderGridEntities();
  }

  private autoPlaceExit(): void {
    if (!this.playerCar) return;
    const { row, col, orientation } = this.playerCar;
    if (orientation === 'horizontal') {
      if (this.exitSide === 'right') {
        this.exit = { row, col: this.gridSize.cols - 1 };
      } else {
        this.exit = { row, col: 0 };
      }
    } else {
      if (this.exitSide === 'down') {
        this.exit = { row: this.gridSize.rows - 1, col };
      } else {
        this.exit = { row: 0, col };
      }
    }
  }

  private showToast(message: string): void {
    document.querySelectorAll('.editor-toast').forEach(el => el.remove());
    const toast = document.createElement('div');
    toast.className = 'editor-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // ==================== Cell Click Handlers ====================

  private onCellClick(row: number, col: number): void {
    if (this.selectedEntity) {
      this.selectedEntity = null;
      this.refreshToolbar();
      this.renderGridEntities();
      return;
    }
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
    }
  }

  private placePlayer(row: number, col: number): void {
    const ori = this.playerOrientation;
    if (!this.fitsInGrid(row, col, 2, ori)) return;
    if (this.isOccupied(row, col, 2, ori, -1, true)) return;
    this.playerCar = { row, col, length: 2, orientation: ori };
    this.autoPlaceExit();
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

  private isOccupied(row: number, col: number, length: number, orientation: Orientation, skipVehicleIdx = -1, skipPlayer = false, skipObstacleIdx = -1): boolean {
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
    this.obstacles.forEach((o, i) => {
      if (i === skipObstacleIdx) return;
      occupied.add(`${o.row},${o.col}`);
    });

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

  // ==================== Rotation ====================

  private rotatePuzzle(): void {
    if (!this.playerCar || !this.exit) {
      this.showToast('Place a player car first');
      return;
    }

    const raw = this.buildPuzzle();
    const rotated = rotatePuzzle90CW(raw);

    this.name = rotated.name;
    this.difficulty = rotated.difficulty;
    this.gridSize = { ...rotated.gridSize };
    this.exit = { ...rotated.exit };
    this.playerCar = { ...rotated.playerCar };
    this.vehicles = rotated.vehicles.map(v => ({ ...v }));
    this.obstacles = rotated.obstacles.map(o => ({ ...o }));
    this.validation = rotated.validation ? [...rotated.validation] : null;

    if (this.playerCar) {
      this.playerOrientation = this.playerCar.orientation;
    }
    if (this.exit) {
      this.exitSide = this.deduceDirection(this.exit) as typeof this.exitSide;
    }

    this.selectedEntity = null;
    this.render();
    this.showToast('Rotated 90\u00B0 CW');
  }

  // ==================== Load Dialog ====================

  private showLoadDialog(): void {
    const puzzles = getAllPuzzles();
    if (puzzles.length === 0) {
      this.showToast('No puzzles available');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'load-dialog-overlay';
    overlay.innerHTML = `
      <div class="load-dialog">
        <h3>Load Puzzle</h3>
        <div class="load-dialog-list"></div>
        <button class="btn" style="background:var(--text-light);">Cancel</button>
      </div>
    `;

    const list = overlay.querySelector('.load-dialog-list')!;
    for (const p of puzzles) {
      const item = document.createElement('button');
      item.className = 'load-dialog-item';
      item.textContent = `${p.name} (${p.gridSize.rows}\u00D7${p.gridSize.cols} \u2022 ${p.difficulty})`;
      item.addEventListener('click', () => {
        this.loadPuzzleById(p);
        overlay.remove();
      });
      list.appendChild(item);
    }

    overlay.querySelector('.btn')!.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  private loadPuzzleById(puzzle: { id: string; name: string; difficulty: Difficulty; gridSize: GridSize; exit: { row: number; col: number; direction: string }; playerCar: { id: string; row: number; col: number; length: number; orientation: Orientation }; vehicles: Array<{ id: string; row: number; col: number; length: number; orientation: Orientation; color?: VehicleColor }>; obstacles: Array<{ id: string; row: number; col: number; type: ObstacleType }>; validation?: PuzzleMove[] }): void {
    this.name = puzzle.name;
    this.difficulty = puzzle.difficulty;
    this.gridSize = { ...puzzle.gridSize };
    this.exit = { row: puzzle.exit.row, col: puzzle.exit.col };
    this.playerCar = { row: puzzle.playerCar.row, col: puzzle.playerCar.col, length: puzzle.playerCar.length, orientation: puzzle.playerCar.orientation };
    this.vehicles = puzzle.vehicles.map(v => ({ row: v.row, col: v.col, length: v.length, orientation: v.orientation, color: v.color }));
    this.obstacles = puzzle.obstacles.map(o => ({ row: o.row, col: o.col, type: o.type }));
    this.validation = puzzle.validation ? [...puzzle.validation] : null;
    this.editId = null; // Loading creates a new puzzle
    if (this.playerCar) {
      this.playerOrientation = this.playerCar.orientation;
    }
    if (this.exit) {
      this.exitSide = this.deduceDirection(this.exit) as typeof this.exitSide;
    }
    this.selectedEntity = null;
    this.render();
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
        <div class="editor-row editor-name-row">
          <button class="btn stop-test-btn" style="padding:0.4rem 0.8rem;background:var(--primary);">Stop Test</button>
          <span class="move-counter">Moves: 0</span>
          <button class="btn reset-test-btn" style="padding:0.4rem 0.8rem;">\u21BB</button>
        </div>
        <div class="editor-canvas">
          <div class="board"></div>
        </div>
        <div class="editor-row" style="justify-content:center;">
          <button class="btn save-validation-btn" disabled style="background:var(--vehicle-green);">Save as Validation</button>
        </div>
      </div>
    `;

    const board = this.container.querySelector('.board') as HTMLElement;
    board.style.touchAction = 'none';

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
      const computedCellSize = Math.max(24, Math.min(100, Math.floor(Math.min(cellW, cellH))));

      board.style.gridTemplateRows = `repeat(${rows}, ${computedCellSize}px)`;
      board.style.gridTemplateColumns = `repeat(${cols}, ${computedCellSize}px)`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.style.width = `${computedCellSize}px`;
          cell.style.height = `${computedCellSize}px`;
          board.appendChild(cell);
        }
      }

      const exit = puzzle.exit;
      const marker = document.createElement('div');
      marker.className = `exit-marker ${exit.direction}`;
      marker.dataset.row = String(exit.row);
      marker.dataset.col = String(exit.col);
      board.appendChild(marker);

      for (const obs of puzzle.obstacles) {
        const el = document.createElement('div');
        el.className = 'obstacle';
        el.textContent = OBSTACLE_EMOJI[obs.type as ObstacleType] ?? '\u{1F6A7}';
        el.dataset.row = String(obs.row);
        el.dataset.col = String(obs.col);
        board.appendChild(el);
      }

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

      const firstCell = board.querySelector('.cell') as HTMLElement;
      if (firstCell) {
        this.cellSize = firstCell.offsetWidth;
        this.gap = parseFloat(getComputedStyle(board).gap) || 4;
        this.padding = parseFloat(getComputedStyle(board).paddingLeft) || 8;
      }
      this.updateTestPositions(board);
    });

    board.addEventListener('pointerdown', this.onTestPointerDown);
    board.addEventListener('pointermove', this.onTestPointerMove);
    board.addEventListener('pointerup', this.onTestPointerUp);
    board.addEventListener('pointercancel', this.onTestPointerUp);

    this.testEngine.subscribe(() => {
      const b = this.container.querySelector('.board') as HTMLElement;
      if (b) this.updateTestPositions(b);
    });

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

    board.querySelectorAll('.obstacle').forEach(el => {
      const obsEl = el as HTMLElement;
      obsEl.style.left = `${this.cellToPixel(Number(obsEl.dataset.col))}px`;
      obsEl.style.top = `${this.cellToPixel(Number(obsEl.dataset.row))}px`;
      obsEl.style.width = `${this.cellSize}px`;
      obsEl.style.height = `${this.cellSize}px`;
    });

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

  private generateId(): string {
    const slug = this.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `saved-${slug || 'untitled'}`;
  }

  private generateFilename(): string {
    const slug = this.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `puzzle-${slug || 'untitled'}.json`;
  }

  private async save(): Promise<void> {
    if (!this.canSave()) return;

    const puzzle = this.buildPuzzle();
    const id = this.editId ?? this.generateId();

    savePuzzle(id, puzzle);
    this.editId = id;
    this.showToast('Saved!');
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
        this.editId = null;
        if (this.playerCar) {
          this.playerOrientation = this.playerCar.orientation;
        }
        if (this.exit) {
          this.exitSide = this.deduceDirection(this.exit) as typeof this.exitSide;
        }
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
