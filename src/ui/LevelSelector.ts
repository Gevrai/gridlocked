import type { Puzzle, RawPuzzle } from '../types/puzzle';
import { getSavedPuzzlesRaw, deleteSavedPuzzle, getAllPuzzles } from '../data/puzzles/index';

function getParDisplay(puzzle: Puzzle): string {
  if (puzzle.validationResult?.isValid && puzzle.validationResult.par) {
    return `<span class="par">par ${puzzle.validationResult.par}</span>`;
  }
  if (puzzle.validation && puzzle.validationResult && !puzzle.validationResult.isValid) {
    return `<span class="invalid">invalid</span>`;
  }
  return `<span class="unvalidated">unvalidated</span>`;
}

export function renderLevelSelector(
  container: HTMLElement,
  puzzles: Puzzle[],
  completedIds: string[],
  onSelect: (puzzle: Puzzle) => void,
  onCreatePuzzle?: () => void,
  onEditPuzzle?: (raw: RawPuzzle & { id?: string }) => void,
): void {
  const savedRaw = getSavedPuzzlesRaw();
  const savedIds = new Set(Object.keys(savedRaw));

  container.innerHTML = `
    <div class="screen">
      <h1>Choose a Level</h1>
      <div class="level-grid"></div>
      ${onCreatePuzzle ? '<button class="btn create-btn">+ Create Puzzle</button>' : ''}
    </div>
  `;

  const grid = container.querySelector('.level-grid')!;

  puzzles.forEach((puzzle, i) => {
    const done = completedIds.includes(puzzle.id);
    const isSaved = savedIds.has(puzzle.id);
    const btn = document.createElement('button');
    btn.className = `level-card${done ? ' completed' : ''}`;
    btn.innerHTML = `
      <span class="level-num">${done ? '\u2713' : i + 1}</span>
      <span class="level-info">
        <span class="level-name">${puzzle.name}${isSaved ? ' <span class="saved-badge">saved</span>' : ''}</span>
        <span class="level-meta">${puzzle.gridSize.rows}\u00D7${puzzle.gridSize.cols} \u2022 ${puzzle.difficulty} \u2022 ${getParDisplay(puzzle)}</span>
      </span>
      ${isSaved && onEditPuzzle ? '<span class="level-actions"><span class="level-edit-btn" title="Edit">\u270E</span><span class="level-delete-btn" title="Delete">\u2716</span></span>' : ''}
    `;
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.level-edit-btn') && onEditPuzzle && isSaved) {
        e.stopPropagation();
        onEditPuzzle({ ...savedRaw[puzzle.id], id: puzzle.id });
        return;
      }
      if (target.closest('.level-delete-btn') && isSaved) {
        e.stopPropagation();
        if (confirm(`Delete "${puzzle.name}"?`)) {
          deleteSavedPuzzle(puzzle.id);
          // Re-render
          renderLevelSelector(container, getAllPuzzles(), completedIds, onSelect, onCreatePuzzle, onEditPuzzle);
        }
        return;
      }
      onSelect(puzzle);
    });
    grid.appendChild(btn);
  });

  if (onCreatePuzzle) {
    container.querySelector('.create-btn')!.addEventListener('click', onCreatePuzzle);
  }
}
