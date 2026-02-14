import './styles/main.css';
import { puzzles } from './data/puzzles/index';
import { renderCarSelector } from './ui/CarSelector';
import { renderLevelSelector } from './ui/LevelSelector';
import { GameRenderer } from './ui/GameRenderer';
import { showWinScreen } from './ui/WinScreen';
import { PuzzleEditor } from './ui/PuzzleEditor';
import type { Puzzle } from './types/puzzle';

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

function showCarSelector(): void {
  renderCarSelector(app, () => showLevels());
}

function showLevels(): void {
  renderLevelSelector(
    app,
    puzzles,
    getCompleted(),
    (puzzle) => startGame(puzzle),
    () => showEditor(),
  );
}

function startGame(puzzle: Puzzle): void {
  const idx = puzzles.indexOf(puzzle);

  new GameRenderer(
    app,
    puzzle,
    (moveCount) => {
      markCompleted(puzzle.id);
      const hasNext = idx < puzzles.length - 1;
      showWinScreen(
        app,
        moveCount,
        hasNext,
        () => startGame(puzzles[idx + 1]),
        () => showLevels(),
      );
    },
    () => showLevels(),
  );
}

function showEditor(): void {
  new PuzzleEditor(app, () => showLevels());
}

// Boot
if (localStorage.getItem('car-skin')) {
  showLevels();
} else {
  showCarSelector();
}
