import { PLAYER_START } from './data.js';

export function createState() {
  return {
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    facing: 'down',
    stats: { str: 3, dex: 2, cha: 1 },
    hp: 12,
    maxHp: 12,
    gold: 0,
    inventory: [],
    resolved: new Set(), // "x,y" keys of interactive tiles already handled
    mode: 'map' // 'map' | 'dialogue' | 'combat' | 'ending'
  };
}

export function tileKey(x, y) {
  return `${x},${y}`;
}
