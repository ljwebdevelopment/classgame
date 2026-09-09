export const TILE_SIZE = 32;
export const MAP_COLS = 15;
export const MAP_ROWS = 10;

export const TILE = {
  GRASS: 'grass',
  TREE: 'tree',
  WATER: 'water',
  PATH: 'path',
  NPC: 'npc',
  RUBBLE: 'rubble',
  GATE: 'gate',
  CAMPFIRE: 'campfire'
};

export const BLOCKING = new Set([TILE.TREE, TILE.WATER]);
export const INTERACTIVE = new Set([TILE.NPC, TILE.RUBBLE, TILE.GATE, TILE.CAMPFIRE]);

export const PLAYER_START = { x: 2, y: 7 };

function buildMap() {
  const grid = [];
  for (let y = 0; y < MAP_ROWS; y++) {
    const row = [];
    for (let x = 0; x < MAP_COLS; x++) {
      const border = x === 0 || y === 0 || x === MAP_COLS - 1 || y === MAP_ROWS - 1;
      row.push(border ? TILE.TREE : TILE.GRASS);
    }
    grid.push(row);
  }

  const set = (x, y, tile) => { grid[y][x] = tile; };

  // decorative pond
  set(6, 6, TILE.WATER); set(7, 6, TILE.WATER);
  set(6, 7, TILE.WATER); set(7, 7, TILE.WATER);

  // scattered trees for texture
  [[5, 3], [9, 3], [4, 6], [10, 6], [3, 5], [11, 4]].forEach(([x, y]) => set(x, y, TILE.TREE));

  // a hint of path near the village
  [[2, 8], [2, 7], [2, 6]].forEach(([x, y]) => set(x, y, TILE.PATH));

  set(3, 2, TILE.NPC);
  set(12, 2, TILE.RUBBLE);
  set(7, 4, TILE.CAMPFIRE);
  set(7, 1, TILE.GATE);

  return grid;
}

export const mapGrid = buildMap();

export const ENCOUNTERS = {
  npc: {
    portrait: 'traveler',
    intro: "A wounded traveler sits against a stone, clutching a bleeding arm. “Please... help me, and I'll repay your kindness,” they say.",
    choices: [
      {
        label: 'Bandage their wound (DEX check, DC 10)',
        type: 'check',
        stat: 'dex',
        dc: 10,
        success: {
          text: "Your steady hands stop the bleeding. Grateful, the traveler presses a Silver Token into your palm. “Show this to the beast — it may listen.”",
          apply: (s) => { if (!s.inventory.includes('Silver Token')) s.inventory.push('Silver Token'); }
        },
        fail: {
          text: 'Your bandage slips loose, but the traveler thanks you for trying and hands you a few coins for the effort.',
          apply: (s) => { s.gold += 3; }
        }
      },
      {
        label: 'Offer a kind word and move on',
        type: 'plain',
        text: 'You offer what comfort you can and continue on your way.',
        apply: () => {}
      }
    ]
  },

  rubble: {
    portrait: 'rubble',
    intro: 'The old mine shaft is choked with fallen rock. You could force your way through, or carefully squeeze past the gap.',
    choices: [
      {
        label: 'Force through the rubble (STR check, DC 12)',
        type: 'check',
        stat: 'str',
        dc: 12,
        success: {
          text: 'You heave the rocks aside and find a stash of old coins buried in the rubble!',
          apply: (s) => { s.gold += 8; }
        },
        fail: {
          text: 'The rubble shifts and catches you with a glancing blow.',
          apply: (s) => { s.hp = Math.max(0, s.hp - 3); }
        }
      },
      {
        label: 'Squeeze through the gap (DEX check, DC 10)',
        type: 'check',
        stat: 'dex',
        dc: 10,
        success: {
          text: 'You slip through without a scratch.',
          apply: () => {}
        },
        fail: {
          text: 'You scrape through, but not without a few cuts.',
          apply: (s) => { s.hp = Math.max(0, s.hp - 1); }
        }
      }
    ]
  },

  campfire: {
    portrait: null,
    intro: 'You rest a moment by the warm campfire, and feel a little of your strength return.',
    choices: [
      {
        label: 'Continue on',
        type: 'plain',
        text: '',
        apply: (s) => { s.hp = Math.min(s.maxHp, s.hp + 3); }
      }
    ]
  }
};

export const BOSS = {
  name: 'Blackwood Beast',
  portrait: 'beast',
  maxHp: 18,
  attackBonus: 3,
  damageDie: 6,
  defense: 12,
  intro: 'Twisted iron gates mark the edge of the Blackwood. The Beast rises from the shadows to meet you.'
};
