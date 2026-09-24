import { TRACKS } from './tracks.js';
import * as Stats from './stats.js';
import { formatTime } from './hud.js';

const el = (id) => document.getElementById(id);

// The home screen: mode, circuit, rival board and career totals.
export class Menu {
  constructor({ onStart, parLapFor }) {
    this.onStart = onStart;
    this.parLapFor = parLapFor;
    this.mode = 'trial';
    this.trackId = TRACKS[0].id;
    this.boardId = TRACKS[0].id;

    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }
    for (const m of document.querySelectorAll('.mode')) {
      m.addEventListener('click', () => {
        this.mode = m.dataset.mode;
        for (const o of document.querySelectorAll('.mode')) o.classList.toggle('is-on', o === m);
        this.renderTracks();
      });
    }
    el('start-btn').addEventListener('click', () => this.onStart(this.mode, this.trackId));
    el('wipe-btn').addEventListener('click', () => {
      Stats.clearAll();
      this.render();
    });

    this.renderBoardChips();
    this.render();
  }

  showTab(name) {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-on', t.dataset.tab === name);
    for (const id of ['race', 'board', 'stats']) {
      el(`tab-${id}`).classList.toggle('hidden', id !== name);
    }
    if (name === 'board') this.renderBoard();
    if (name === 'stats') this.renderStats();
  }

  render() {
    this.renderTracks();
    this.renderBoard();
    this.renderStats();
  }

  renderTracks() {
    const host = el('track-list');
    host.textContent = '';
    for (const def of TRACKS) {
      const rec = Stats.trackRecord(def.id);
      const card = document.createElement('button');
      card.className = 'track-card' + (def.id === this.trackId ? ' is-on' : '');
      card.innerHTML = `
        <span class="tname"></span>
        <span class="tblurb"></span>
        <span class="tmeta">
          <span class="tdiff"></span>
          <span class="tbest"></span>
        </span>`;
      card.querySelector('.tname').textContent = def.name;
      card.querySelector('.tblurb').textContent = def.blurb;
      card.querySelector('.tdiff').textContent =
        this.mode === 'race' ? `${def.difficulty} · ${def.laps} laps` : def.difficulty;
      card.querySelector('.tbest').textContent =
        rec.best != null ? `best ${formatTime(rec.best)}` : 'no time set';
      card.addEventListener('click', () => {
        this.trackId = def.id;
        this.renderTracks();
      });
      host.appendChild(card);
    }
  }

  renderBoardChips() {
    const host = el('board-tracks');
    host.textContent = '';
    for (const def of TRACKS) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (def.id === this.boardId ? ' is-on' : '');
      chip.textContent = def.name;
      chip.addEventListener('click', () => {
        this.boardId = def.id;
        this.renderBoardChips();
        this.renderBoard();
      });
      host.appendChild(chip);
    }
  }

  renderBoard() {
    const def = TRACKS.find((t) => t.id === this.boardId);
    const par = this.parLapFor(def);
    const board = Stats.rivalBoard({ length: par * 17.2 }, def);
    const { rows } = Stats.standingWith(board, Stats.trackRecord(def.id).best);
    const body = el('board-rows');
    body.textContent = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      if (r.you) tr.className = 'you';
      const pos = document.createElement('td');
      pos.textContent = r.pos;
      const name = document.createElement('td');
      name.textContent = r.name;
      const time = document.createElement('td');
      time.textContent = formatTime(r.time);
      tr.append(pos, name, time);
      body.appendChild(tr);
    }
  }

  renderStats() {
    const c = Stats.career();
    const tiles = [
      ['RACES', c.races],
      ['WINS', c.wins],
      ['PODIUMS', c.podiums],
      ['LAPS', c.laps],
      ['DISTANCE', `${(c.distance / 1000).toFixed(1)} km`],
      ['TOP SPEED', `${Math.round(c.topSpeed * 3.6)} km/h`],
    ];
    const host = el('stat-grid');
    host.textContent = '';
    for (const [k, v] of tiles) {
      const tile = document.createElement('div');
      tile.className = 'stat-tile';
      const key = document.createElement('span');
      key.className = 'k';
      key.textContent = k;
      const val = document.createElement('span');
      val.className = 'v';
      val.textContent = v;
      tile.append(key, val);
      host.appendChild(tile);
    }
  }

  show() {
    el('title-screen').classList.remove('hidden');
    this.render();
  }

  hide() { el('title-screen').classList.add('hidden'); }
}
