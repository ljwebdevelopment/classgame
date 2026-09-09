import { MAP_COLS, MAP_ROWS, TILE_SIZE } from './data.js';
import { createState, tileKey } from './state.js';
import { renderMap, attemptMove } from './map.js';
import { showDialogue } from './dialogue.js';
import { showCombat } from './combat.js';

const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
canvas.width = MAP_COLS * TILE_SIZE;
canvas.height = MAP_ROWS * TILE_SIZE;

const endingOverlay = document.getElementById('ending-overlay');
const endingTitle = document.getElementById('ending-title');
const endingText = document.getElementById('ending-text');
const restartBtn = document.getElementById('restart-btn');

const ENDINGS = {
  victoryCombat: {
    title: 'VICTORY',
    text: 'The Blackwood Beast falls, and the curse over Emberfall lifts. You return home a hero. THE END.'
  },
  victoryPeace: {
    title: 'PEACE',
    text: 'The Beast recognizes the Silver Token and withdraws into the trees. Emberfall is safe, and no blood was spilled. THE END.'
  },
  defeat: {
    title: 'DEFEAT',
    text: 'Your strength fails you at the worst moment. The Blackwood keeps its secrets a while longer. GAME OVER.'
  }
};

let state = createState();

function updateHud() {
  document.getElementById('stat-hp').textContent = `${state.hp}/${state.maxHp}`;
  document.getElementById('stat-gold').textContent = state.gold;
  document.getElementById('stat-items').textContent = state.inventory.length ? state.inventory.join(', ') : 'none';
  document.getElementById('stat-str').textContent = state.stats.str;
  document.getElementById('stat-dex').textContent = state.stats.dex;
  document.getElementById('stat-cha').textContent = state.stats.cha;
}

function render() {
  renderMap(ctx, state);
  updateHud();
}

function showEnding(result) {
  state.mode = 'ending';
  endingTitle.textContent = ENDINGS[result].title;
  endingText.textContent = ENDINGS[result].text;
  endingOverlay.classList.remove('hidden');
}

function handleEncounter(encounter, tx, ty) {
  if (encounter === 'gate') {
    showCombat(state, updateHud, (result) => {
      if (result === null) { render(); return; } // fled back to the map
      state.resolved.add(tileKey(tx, ty));
      render();
      showEnding(result);
    });
  } else {
    showDialogue(encounter, state, () => {
      state.resolved.add(tileKey(tx, ty));
      render();
    });
  }
}

function handleKey(e) {
  if (state.mode !== 'map') return;
  let dx = 0;
  let dy = 0;
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': dy = -1; break;
    case 'ArrowDown': case 's': case 'S': dy = 1; break;
    case 'ArrowLeft': case 'a': case 'A': dx = -1; break;
    case 'ArrowRight': case 'd': case 'D': dx = 1; break;
    default: return;
  }
  e.preventDefault();
  const result = attemptMove(state, dx, dy);
  if (result.encounter) handleEncounter(result.encounter, result.tx, result.ty);
  render();
}

window.addEventListener('keydown', handleKey);

restartBtn.addEventListener('click', () => {
  state = createState();
  endingOverlay.classList.add('hidden');
  render();
});

render();
