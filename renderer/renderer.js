'use strict';

const MAX_COUNT = 999999;
// '1'..'9' hit panels 1-9, '0' hits panel 10.
const KEY_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const gridEl = document.getElementById('grid');
const overlayEl = document.getElementById('overlay');
const editListEl = document.getElementById('edit-list');
const timerEl = document.getElementById('timer');

let icons = [];
let counts = {};
const panels = []; // grid order: { id, root, count }
const editRows = []; // one editor row per dress: { id, input }

// Total hunting time. Main owns the real value; the renderer takes it once at
// boot and extrapolates locally so it is not doing IPC every second.
let timerBaseMs = 0;
let timerOrigin = performance.now();

/* ------------------------------------------------------------- helpers -- */

function clamp(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > MAX_COUNT ? MAX_COUNT : n;
}

function save() {
  Promise.resolve(window.api.saveCounts(counts)).catch((err) => {
    console.error('saveCounts failed:', err);
  });
}

function restartAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth; // force reflow so the animation retriggers on fast clicks
  el.classList.add(className);
}

/* --------------------------------------------------------------- timer -- */

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return (
    String(hours).padStart(2, '0') + ':' +
    String(mins).padStart(2, '0') + ':' +
    String(secs).padStart(2, '0')
  );
}

// Recomputed from the origin each tick, so a throttled interval cannot drift.
function tickTimer() {
  timerEl.textContent = formatDuration(timerBaseMs + (performance.now() - timerOrigin));
}

/* -------------------------------------------------------------- counts -- */

function setCount(id, value, options) {
  const panel = panels.find((p) => p.id === id);
  const next = clamp(value);

  counts[id] = next;
  if (panel) {
    panel.count.textContent = String(next);
    if (options && options.pulse) restartAnimation(panel.root, 'pulse');
  }

  save();
}

function bump(id, delta) {
  setCount(id, (counts[id] || 0) + delta, { pulse: delta > 0 });
}

/* -------------------------------------------------------------- render -- */

function renderEmpty() {
  gridEl.classList.add('is-empty');
  const line = document.createElement('div');
  line.className = 'empty';
  line.textContent = 'Dressicons folder is empty.';
  gridEl.appendChild(line);
}

function buildPanel(icon) {
  const root = document.createElement('div');
  root.className = 'panel';

  const img = document.createElement('img');
  img.className = 'panel-img';
  img.src = icon.dataUrl;
  img.alt = icon.label;
  img.draggable = false;

  const count = document.createElement('div');
  count.className = 'panel-count';
  count.textContent = String(counts[icon.id] || 0);

  root.appendChild(img);
  root.appendChild(count);

  // The whole panel is a single target: left-click +1, right-click -1.
  root.addEventListener('click', () => bump(icon.id, 1));
  root.addEventListener('contextmenu', () => bump(icon.id, -1));

  gridEl.appendChild(root);
  panels.push({ id: icon.id, root, count });
}

/* ------------------------------------------------------ import / reset -- */

// One row per dress: icon, name, and an editable count.
function buildEditRow(icon) {
  const row = document.createElement('div');
  row.className = 'edit-row';

  const img = document.createElement('img');
  img.className = 'edit-icon';
  img.src = icon.dataUrl;
  img.alt = '';
  img.draggable = false;

  const label = document.createElement('span');
  label.className = 'edit-label';
  label.textContent = icon.label;
  label.title = icon.label;

  const input = document.createElement('input');
  input.className = 'edit-count';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.spellcheck = false;

  row.appendChild(img);
  row.appendChild(label);
  row.appendChild(input);
  editListEl.appendChild(row);
  editRows.push({ id: icon.id, input });
}

function openImport() {
  // Always open showing what is currently stored, never a stale edit.
  for (const row of editRows) row.input.value = String(counts[row.id] || 0);
  overlayEl.hidden = false;
  if (editRows.length) {
    editRows[0].input.focus();
    editRows[0].input.select();
  }
}

function closeImport() {
  overlayEl.hidden = true;
}

function applyImport() {
  for (const row of editRows) {
    // Non-numeric or negative silently clamps to a valid count. The minus sign
    // is kept so "-42" lands on 0 rather than flipping to 42.
    const parsed = parseInt(row.input.value.replace(/[^0-9-]/g, ''), 10);
    const next = clamp(Number.isNaN(parsed) ? 0 : parsed);

    counts[row.id] = next;
    const panel = panels.find((p) => p.id === row.id);
    if (panel) panel.count.textContent = String(next);
  }

  save();
  closeImport();
}

async function resetCounts() {
  if (!window.confirm('Reset every count and the timer to zero?')) return;
  for (const id of Object.keys(counts)) counts[id] = 0;
  for (const panel of panels) {
    counts[panel.id] = 0;
    panel.count.textContent = '0';
  }
  save();

  // The timer only ever resets here.
  try {
    timerBaseMs = await window.api.resetTimer();
  } catch (err) {
    console.error('resetTimer failed:', err);
    timerBaseMs = 0;
  }
  timerOrigin = performance.now();
  tickTimer();
}

/* -------------------------------------------------------------- wiring -- */

function wire() {
  document.addEventListener('contextmenu', (event) => event.preventDefault());

  document.getElementById('btn-import').addEventListener('click', openImport);
  document.getElementById('btn-reset').addEventListener('click', resetCounts);
  document.getElementById('btn-apply').addEventListener('click', applyImport);
  document.getElementById('btn-cancel').addEventListener('click', closeImport);

  editListEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyImport();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!overlayEl.hidden) {
      if (event.key === 'Escape') closeImport();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const index = KEY_ORDER.indexOf(event.key);
    if (index === -1 || index >= panels.length) return;

    event.preventDefault();
    bump(panels[index].id, 1);
  });
}

async function boot() {
  wire();

  try {
    icons = await window.api.getIcons();
  } catch (err) {
    console.error('getIcons failed:', err);
    icons = [];
  }

  try {
    timerBaseMs = await window.api.getTimer();
  } catch (err) {
    console.error('getTimer failed:', err);
    timerBaseMs = 0;
  }
  timerOrigin = performance.now();
  tickTimer();
  setInterval(tickTimer, 1000);

  try {
    counts = await window.api.loadCounts();
  } catch (err) {
    console.error('loadCounts failed:', err);
    counts = {};
  }
  if (!counts || typeof counts !== 'object') counts = {};

  if (icons.length === 0) {
    renderEmpty();
    return;
  }

  for (const icon of icons) {
    counts[icon.id] = clamp(counts[icon.id]);
    buildPanel(icon);
    buildEditRow(icon);
  }
}

boot();
