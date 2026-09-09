import { TILE_SIZE, MAP_COLS, MAP_ROWS, mapGrid, BLOCKING, INTERACTIVE } from './data.js';
import { tileKey } from './state.js';
import { drawAvatar } from './sprites.js';

const TILE_COLORS = {
  grass: '#2f6b3a',
  tree: '#173d1d',
  water: '#2b5f8a',
  path: '#6b5638',
  npc: '#8bd450',
  rubble: '#8a7a5a',
  gate: '#7a2f8f',
  campfire: '#c76b2b'
};

const ICONS = { npc: '!', rubble: '≡', gate: '☠', campfire: '+' };

export function renderMap(ctx, state) {
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      const tile = mapGrid[y][x];
      const resolved = state.resolved.has(tileKey(x, y));
      const color = INTERACTIVE.has(tile) && resolved
        ? (tile === 'gate' ? TILE_COLORS.path : TILE_COLORS.grass)
        : TILE_COLORS[tile];

      ctx.fillStyle = color;
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      if (tile === 'grass' && (x + y) % 3 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 6, 4, 4);
      }

      if (INTERACTIVE.has(tile) && !resolved) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '16px monospace';
        ctx.fillText(ICONS[tile] || '?', x * TILE_SIZE + 11, y * TILE_SIZE + 22);
      }
    }
  }
  drawAvatar(ctx, 'knight', state.x * TILE_SIZE, state.y * TILE_SIZE, TILE_SIZE);
}

// Returns { moved } on a normal step, or { moved:false, encounter, tx, ty }
// when the target tile is an unresolved interactive tile.
export function attemptMove(state, dx, dy) {
  const nx = state.x + dx;
  const ny = state.y + dy;
  if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) return { moved: false };

  const tile = mapGrid[ny][nx];
  if (BLOCKING.has(tile)) return { moved: false };

  if (INTERACTIVE.has(tile) && !state.resolved.has(tileKey(nx, ny))) {
    return { moved: false, encounter: tile, tx: nx, ty: ny };
  }

  state.x = nx;
  state.y = ny;
  if (dx > 0) state.facing = 'right';
  else if (dx < 0) state.facing = 'left';
  else if (dy > 0) state.facing = 'down';
  else if (dy < 0) state.facing = 'up';
  return { moved: true };
}
