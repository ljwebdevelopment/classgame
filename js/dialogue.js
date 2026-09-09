import { ENCOUNTERS } from './data.js';
import { rollD20 } from './dice.js';
import { drawAvatar } from './sprites.js';

const overlay = document.getElementById('overlay');
const portraitCanvas = document.getElementById('portrait-canvas');
const portraitCtx = portraitCanvas.getContext('2d');
const textEl = document.getElementById('overlay-text');
const dieEl = document.getElementById('overlay-die');
const dieValueEl = document.getElementById('die-value');
const choicesEl = document.getElementById('overlay-choices');

function clearChoices() {
  choicesEl.innerHTML = '';
}

function addButton(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'choice-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  choicesEl.appendChild(btn);
  return btn;
}

// key: 'npc' | 'rubble' | 'campfire'
export function showDialogue(key, state, onResolved) {
  const encounter = ENCOUNTERS[key];
  state.mode = 'dialogue';
  overlay.classList.remove('hidden');
  dieEl.classList.add('hidden');

  if (encounter.portrait) {
    portraitCanvas.classList.remove('hidden');
    portraitCtx.clearRect(0, 0, portraitCanvas.width, portraitCanvas.height);
    drawAvatar(portraitCtx, encounter.portrait, 0, 0, portraitCanvas.width);
  } else {
    portraitCanvas.classList.add('hidden');
  }

  textEl.textContent = encounter.intro;
  clearChoices();

  encounter.choices.forEach((choice) => {
    addButton(choice.label, () => {
      if (choice.type === 'check') {
        runCheck(choice, state, onResolved);
      } else {
        choice.apply(state);
        if (choice.text) {
          finish(choice.text, state, onResolved);
        } else {
          close(state, onResolved);
        }
      }
    });
  });
}

function runCheck(choice, state, onResolved) {
  clearChoices();
  dieEl.classList.remove('hidden');
  dieValueEl.textContent = '?';
  dieEl.classList.remove('die-settled');
  textEl.textContent = `Rolling a d20 + ${choice.stat.toUpperCase()}...`;

  const roll = rollD20();
  const modifier = state.stats[choice.stat];
  const total = roll + modifier;

  let ticks = 0;
  const interval = setInterval(() => {
    ticks += 1;
    if (ticks >= 10) {
      clearInterval(interval);
      dieValueEl.textContent = roll;
      dieEl.classList.add('die-settled');
      const outcome = total >= choice.dc ? choice.success : choice.fail;
      textEl.textContent = `d20 (${roll}) + ${modifier} = ${total} vs DC ${choice.dc} — ${total >= choice.dc ? 'Success!' : 'Failed.'}`;
      outcome.apply(state);
      setTimeout(() => finish(outcome.text, state, onResolved), 900);
      return;
    }
    dieValueEl.textContent = 1 + Math.floor(Math.random() * 20);
  }, 60);
}

function finish(resultText, state, onResolved) {
  dieEl.classList.add('hidden');
  clearChoices();
  if (resultText) textEl.textContent = resultText;
  addButton('Continue', () => close(state, onResolved));
}

function close(state, onResolved) {
  overlay.classList.add('hidden');
  state.mode = 'map';
  onResolved();
}
