export function showWinScreen(
  container: HTMLElement,
  moveCount: number,
  hasNext: boolean,
  onNext: () => void,
  onLevels: () => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'win-overlay';
  overlay.innerHTML = `
    <div class="win-card">
      <h2>You did it!</h2>
      <p class="moves">Solved in ${moveCount} move${moveCount === 1 ? '' : 's'}</p>
      <div class="btn-row">
        <button class="btn levels-btn">Levels</button>
        ${hasNext ? '<button class="btn next-btn">Next</button>' : ''}
      </div>
    </div>
  `;

  overlay.querySelector('.levels-btn')!.addEventListener('click', () => {
    overlay.remove();
    onLevels();
  });

  const nextBtn = overlay.querySelector('.next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      overlay.remove();
      onNext();
    });
  }

  container.appendChild(overlay);
}
