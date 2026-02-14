const SKINS = [
  { id: 'red', emoji: '\u{1F697}', label: 'Red' },
  { id: 'blue', emoji: '\u{1F699}', label: 'Blue' },
  { id: 'yellow', emoji: '\u{1F695}', label: 'Yellow' },
];

export function renderCarSelector(
  container: HTMLElement,
  onSelect: (skinId: string) => void,
): void {
  const saved = localStorage.getItem('car-skin');

  container.innerHTML = `
    <div class="screen">
      <h1>Pick Your Ride!</h1>
      <div class="car-options"></div>
      <button class="btn go-btn" ${!saved ? 'disabled' : ''}>Let's Go!</button>
    </div>
  `;

  const options = container.querySelector('.car-options')!;
  const goBtn = container.querySelector('.go-btn') as HTMLButtonElement;
  let selected = saved ?? '';

  for (const skin of SKINS) {
    const btn = document.createElement('button');
    btn.className = `car-option${skin.id === selected ? ' selected' : ''}`;
    btn.dataset.skin = skin.id;
    btn.textContent = skin.emoji;
    btn.addEventListener('click', () => {
      options.querySelectorAll('.car-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selected = skin.id;
      goBtn.disabled = false;
    });
    options.appendChild(btn);
  }

  goBtn.addEventListener('click', () => {
    if (!selected) return;
    localStorage.setItem('car-skin', selected);
    onSelect(selected);
  });
}
