import { BOSS } from './data.js';
import { rollD20, rollDie } from './dice.js';
import { drawAvatar } from './sprites.js';

const overlay = document.getElementById('combat-overlay');
const portraitCanvas = document.getElementById('enemy-portrait');
const portraitCtx = portraitCanvas.getContext('2d');
const nameEl = document.getElementById('enemy-name');
const hpFillEl = document.getElementById('enemy-hp-fill');
const hpTextEl = document.getElementById('enemy-hp-text');
const logEl = document.getElementById('combat-log');
const dieEl = document.getElementById('combat-die');
const dieValueEl = document.getElementById('combat-die-value');
const actionsEl = document.getElementById('combat-actions');

function log(text) {
  logEl.textContent = text;
}

function setEnemyHp(hp, maxHp) {
  hpFillEl.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
  hpTextEl.textContent = `${Math.max(0, hp)} / ${maxHp}`;
}

function clearActions() {
  actionsEl.innerHTML = '';
}

function addAction(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'choice-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  actionsEl.appendChild(btn);
  return btn;
}

function showDie(value, onDone) {
  dieEl.classList.remove('hidden');
  dieEl.classList.remove('die-settled');
  let ticks = 0;
  const interval = setInterval(() => {
    ticks += 1;
    if (ticks >= 8) {
      clearInterval(interval);
      dieValueEl.textContent = value;
      dieEl.classList.add('die-settled');
      setTimeout(onDone, 500);
      return;
    }
    dieValueEl.textContent = 1 + Math.floor(Math.random() * 20);
  }, 55);
}

// onEnding receives 'victoryCombat' | 'victoryPeace' | 'defeat', or null for a flee.
export function showCombat(state, updateHud, onEnding) {
  state.mode = 'combat';
  overlay.classList.remove('hidden');
  portraitCtx.clearRect(0, 0, portraitCanvas.width, portraitCanvas.height);
  drawAvatar(portraitCtx, BOSS.portrait, 0, 0, portraitCanvas.width);
  nameEl.textContent = BOSS.name;

  const enemy = { hp: BOSS.maxHp };
  setEnemyHp(enemy.hp, BOSS.maxHp);
  log(BOSS.intro);

  let defending = false;

  function endCombat(result) {
    dieEl.classList.add('hidden');
    clearActions();
    overlay.classList.add('hidden');
    state.mode = 'map';
    onEnding(result);
  }

  function enemyTurn(afterText) {
    const roll = rollD20();
    const playerDefense = 10 + state.stats.dex;
    const total = roll + BOSS.attackBonus;
    showDie(roll, () => {
      if (total >= playerDefense) {
        let damage = rollDie(BOSS.damageDie);
        if (defending) damage = Math.floor(damage / 2);
        state.hp = Math.max(0, state.hp - damage);
        updateHud();
        log(`${afterText}The Beast strikes back for ${damage} damage! (rolled ${roll}+${BOSS.attackBonus}=${total} vs your ${playerDefense})`);
      } else {
        log(`${afterText}The Beast attacks but misses! (rolled ${roll}+${BOSS.attackBonus}=${total} vs your ${playerDefense})`);
      }
      defending = false;
      dieEl.classList.add('hidden');
      if (state.hp <= 0) {
        endCombat('defeat');
      } else {
        renderActions();
      }
    });
  }

  function playerAttack() {
    clearActions();
    const roll = rollD20();
    const total = roll + state.stats.str;
    showDie(roll, () => {
      let text;
      if (total >= BOSS.defense) {
        const damage = rollDie(8) + state.stats.str;
        enemy.hp = Math.max(0, enemy.hp - damage);
        setEnemyHp(enemy.hp, BOSS.maxHp);
        text = `You strike true for ${damage} damage! (rolled ${roll}+${state.stats.str}=${total} vs ${BOSS.defense}) `;
      } else {
        text = `Your attack misses! (rolled ${roll}+${state.stats.str}=${total} vs ${BOSS.defense}) `;
      }
      dieEl.classList.add('hidden');
      if (enemy.hp <= 0) {
        log(`${text}The Beast collapses before you.`);
        endCombat('victoryCombat');
      } else {
        enemyTurn(text);
      }
    });
  }

  function playerDefend() {
    clearActions();
    defending = true;
    log('You brace yourself, ready to absorb the next blow.');
    enemyTurn('');
  }

  function playerFlee() {
    clearActions();
    const roll = rollD20();
    const total = roll + state.stats.dex;
    showDie(roll, () => {
      dieEl.classList.add('hidden');
      if (total >= 10) {
        log('You break away and retreat safely.');
        setTimeout(() => endCombat(null), 700);
      } else {
        log(`You fail to escape! (rolled ${roll}+${state.stats.dex}=${total} vs 10)`);
        enemyTurn('');
      }
    });
  }

  function playerParley() {
    clearActions();
    log('You raise the Silver Token. The Beast pauses, then lowers its head and melts back into the trees.');
    setTimeout(() => endCombat('victoryPeace'), 900);
  }

  function renderActions() {
    clearActions();
    addAction('Attack', playerAttack);
    addAction('Defend', playerDefend);
    addAction('Flee', playerFlee);
    if (state.inventory.includes('Silver Token')) {
      addAction('Present Silver Token', playerParley);
    }
  }

  renderActions();
}
