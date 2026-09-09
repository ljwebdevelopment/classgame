// Knight's Journey — a small branching arcade story game.
// All game data lives in `scenes`; the engine below just walks it.

const START_SCENE = 'start';
const MAX_HP = 10;

const scenes = {
  start: {
    art: '⚔️',
    text: "A shadow has fallen over Emberfall. Beyond the hills, the Blackwood stirs, and livestock vanish in the night. You are Sir Rowan, the village's last knight. It's time to ride out.",
    choices: [
      { label: 'Set out for the Blackwood', next: 'crossroads' }
    ]
  },

  crossroads: {
    art: '🌳',
    text: "The road forks. One path winds through sunlit woods — longer, but safer. The other cuts through an old mine shaft — a dangerous shortcut, but faster.",
    choices: [
      { label: 'Take the forest path', next: 'forestPath' },
      { label: 'Take the mine shortcut', next: 'minePath' }
    ]
  },

  forestPath: {
    art: '🌲',
    text: 'Sunlight filters through the trees. Ahead, a wounded traveler slumps against a stone, clutching a bleeding arm.',
    choices: [
      {
        label: 'Stop and help them',
        apply: (s) => { s.items.push('Silver Token'); },
        next: 'campfire'
      },
      { label: 'Hurry past — time is short', next: 'campfire' }
    ]
  },

  minePath: {
    art: '⛏️',
    text: 'The mine shaft is dark and unstable. Halfway through, the ceiling groans and rubble crashes down, blocking part of the passage.',
    choices: [
      {
        label: 'Push through the rubble',
        apply: (s) => { s.hp -= 3; s.gold += 5; },
        next: 'campfire'
      },
      { label: 'Turn back and take the forest path', next: 'forestPath' }
    ]
  },

  campfire: {
    art: '🔥',
    text: 'Night falls. You make camp within sight of the Blackwood, its trees black against the stars. At dawn, the gate to the forest waits.',
    choices: [
      { label: 'Approach the Blackwood Gate', next: 'gate' }
    ]
  },

  gate: {
    art: '🏰',
    text: 'Twisted iron gates mark the edge of the Blackwood. Something huge moves in the dark beyond them. How will you face it?',
    choices: [
      {
        label: 'Charge in, sword first!',
        apply: (s) => { s.hp -= 5; },
        next: (s) => (s.hp > 0 ? 'victoryEnding' : 'defeatEnding')
      },
      {
        label: 'Sneak around for a weak point',
        apply: (s) => { s.hp -= 2; },
        next: (s) => (s.hp > 0 ? 'neutralEnding' : 'defeatEnding')
      },
      {
        label: 'Present the Silver Token and try to parley',
        requires: (s) => s.items.includes('Silver Token'),
        next: 'victoryEnding'
      }
    ]
  },

  victoryEnding: {
    art: '🏆',
    ending: true,
    text: 'The beast falls still, and the Blackwood grows quiet. You return to Emberfall as a hero, the curse lifted for good. THE END.',
    choices: []
  },

  neutralEnding: {
    art: '🌙',
    ending: true,
    text: 'Wounded and wary, the beast flees deeper into the Blackwood. The village is safe for now — but something still lurks out there. THE END.',
    choices: []
  },

  defeatEnding: {
    art: '💀',
    ending: true,
    text: 'Your strength fails you at the worst moment. Sir Rowan falls, and the Blackwood keeps its secrets a while longer. GAME OVER.',
    choices: []
  }
};

let state;

function newState() {
  return { scene: START_SCENE, hp: MAX_HP, gold: 0, items: [] };
}

function resolveNext(choice) {
  return typeof choice.next === 'function' ? choice.next(state) : choice.next;
}

function selectChoice(choice) {
  if (choice.apply) choice.apply(state);
  state.hp = Math.max(0, Math.min(MAX_HP, state.hp));
  state.scene = resolveNext(choice);
  renderScene();
}

function renderStats() {
  document.getElementById('stat-hp').textContent = state.hp;
  document.getElementById('stat-gold').textContent = state.gold;
  document.getElementById('stat-items').textContent =
    state.items.length ? state.items.join(', ') : 'none';
}

function renderScene() {
  const scene = scenes[state.scene];
  document.getElementById('scene-art').textContent = scene.art || '';
  document.getElementById('scene-text').textContent = scene.text;
  renderStats();

  const choicesEl = document.getElementById('choices');
  choicesEl.innerHTML = '';

  const restartBtn = document.getElementById('restart-btn');

  if (scene.ending) {
    restartBtn.classList.remove('hidden');
    return;
  }
  restartBtn.classList.add('hidden');

  scene.choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = choice.label;
    const allowed = choice.requires ? choice.requires(state) : true;
    if (!allowed) {
      btn.disabled = true;
      btn.title = 'You need something to try this...';
    } else {
      btn.addEventListener('click', () => selectChoice(choice));
    }
    choicesEl.appendChild(btn);
  });
}

function restartGame() {
  state = newState();
  renderScene();
}

document.getElementById('restart-btn').addEventListener('click', restartGame);

restartGame();
