const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const maxInput = document.getElementById('maxItems');

/** @type {string[]} */
let latestItems = [];

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
}

function render(items) {
  latestItems = items;
  listEl.innerHTML = '';
  if (!items.length) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  items.forEach((text, i) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.title = 'Click to put on clipboard, then paste in your app';

    const idx = document.createElement('span');
    idx.className = 'item-index';
    idx.textContent = String(i + 1);
    idx.setAttribute('aria-hidden', 'true');

    const body = document.createElement('span');
    body.className = 'item-text';
    body.textContent = text;

    li.appendChild(idx);
    li.appendChild(body);

    li.addEventListener('click', async () => {
      await window.clipy.selectItem(text);
    });
    listEl.appendChild(li);
  });
}

function isTypingInField(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function selectBySlot(slot) {
  const i = slot - 1;
  if (i < 0 || i >= latestItems.length) return;
  const text = latestItems[i];
  window.clipy.selectItem(text);
}

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (isTypingInField(e.target)) return;

  const k = e.key;
  if (k >= '1' && k <= '9') {
    e.preventDefault();
    selectBySlot(parseInt(k, 10));
    return;
  }
  if (k === '0') {
    e.preventDefault();
    selectBySlot(10);
  }
});

async function init() {
  const theme = await window.clipy.getTheme();
  applyTheme(theme);

  const max = await window.clipy.getMaxItems();
  maxInput.value = String(max);

  const items = await window.clipy.getHistory();
  render(items);

  window.clipy.onHistory((next) => render(next));
  window.clipy.onTheme((t) => applyTheme(t));

  let maxDebounce = null;
  maxInput.addEventListener('change', async () => {
    clearTimeout(maxDebounce);
    maxDebounce = setTimeout(async () => {
      const v = Number(maxInput.value);
      const applied = await window.clipy.setMaxItems(v);
      maxInput.value = String(applied);
    }, 150);
  });
}

init().catch(console.error);
