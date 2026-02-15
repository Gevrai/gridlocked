import './styles/main.css';
import { getAllPuzzles } from './data/puzzles/index';
import { renderCarSelector } from './ui/CarSelector';
import { renderLevelSelector } from './ui/LevelSelector';
import { GameRenderer } from './ui/GameRenderer';
import { showWinScreen } from './ui/WinScreen';
import { PuzzleEditor } from './ui/PuzzleEditor';
import type { RawPuzzle } from './types/puzzle';

const app = document.getElementById('app')!;

function getCompleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem('completed') ?? '[]');
  } catch {
    return [];
  }
}

function markCompleted(id: string): void {
  const completed = getCompleted();
  if (!completed.includes(id)) {
    completed.push(id);
    localStorage.setItem('completed', JSON.stringify(completed));
  }
}

// --- Navigation with History API ---

type Screen = { type: 'car-selector' } | { type: 'levels' } | { type: 'game'; puzzleId: string } | { type: 'editor'; puzzleId?: string } | { type: 'win'; puzzleId: string; moveCount: number };

/** Navigate to a screen, pushing it onto the history stack. */
function navigate(screen: Screen): void {
  history.pushState(screen, '');
  renderScreen(screen);
}

/** Render a screen without touching history. */
function renderScreen(screen: Screen): void {
  switch (screen.type) {
    case 'car-selector':
      renderCarSelector(app, () => navigate({ type: 'levels' }));
      break;
    case 'levels':
      showLevels();
      break;
    case 'game':
      startGame(screen.puzzleId);
      break;
    case 'editor':
      showEditor(screen.puzzleId);
      break;
    case 'win':
      // On back from win, go to levels (handled by popstate)
      navigate({ type: 'levels' });
      break;
  }
}

function showLevels(): void {
  const puzzles = getAllPuzzles();
  renderLevelSelector(
    app,
    puzzles,
    getCompleted(),
    (puzzle) => navigate({ type: 'game', puzzleId: puzzle.id }),
    () => navigate({ type: 'editor' }),
    (puzzle) => navigate({ type: 'editor', puzzleId: puzzle.id }),
  );
}

function startGame(puzzleId: string): void {
  const puzzles = getAllPuzzles();
  const puzzle = puzzles.find(p => p.id === puzzleId);
  if (!puzzle) { navigate({ type: 'levels' }); return; }
  const idx = puzzles.indexOf(puzzle);

  new GameRenderer(
    app,
    puzzle,
    (moveCount) => {
      markCompleted(puzzle.id);
      const hasNext = idx >= 0 && idx < puzzles.length - 1;
      showWinScreen(
        app,
        moveCount,
        hasNext,
        () => navigate({ type: 'game', puzzleId: puzzles[idx + 1].id }),
        () => navigate({ type: 'levels' }),
      );
    },
    () => navigate({ type: 'levels' }),
  );
}

function showEditor(puzzleId?: string): void {
  let editPuzzle: (RawPuzzle & { id?: string }) | undefined;
  if (puzzleId) {
    const puzzles = getAllPuzzles();
    const found = puzzles.find(p => p.id === puzzleId);
    if (found) editPuzzle = found as any;
  }
  new PuzzleEditor(app, () => navigate({ type: 'levels' }), editPuzzle);
}

window.addEventListener('popstate', (e) => {
  const screen = e.state as Screen | null;
  if (screen) {
    renderScreen(screen);
  } else {
    // No state — go to levels (initial entry)
    showLevels();
  }
});

// Boot
const initialScreen: Screen = localStorage.getItem('car-skin')
  ? { type: 'levels' }
  : { type: 'car-selector' };

// Replace current history entry with initial screen
history.replaceState(initialScreen, '');
renderScreen(initialScreen);
