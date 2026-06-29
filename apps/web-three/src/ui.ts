import type { GameEngine } from '@ai-mines/engine';
import { RESOURCES } from '@ai-mines/shared';

type ApplyCmd = (cmd: Parameters<GameEngine['apply']>[0]) => void;

// ---- Setup overlay ----

const overlay = document.createElement('div');
overlay.style.cssText = `
  position:fixed; top:0; left:0; width:100%; height:100%;
  pointer-events:none; font-family:monospace; font-size:12px; color:#ddd;
  display:flex; flex-direction:column; justify-content:space-between;
`;
document.body.appendChild(overlay);

// ---- Cell tooltip ----

const tooltip = document.createElement('div');
tooltip.style.cssText = `
  position:fixed; display:none; background:rgba(10,10,20,0.95);
  border:1px solid #556; padding:6px 10px; pointer-events:none;
  line-height:1.6; white-space:pre; z-index:100;
`;
document.body.appendChild(tooltip);

let tooltipTimer = 0;

export function showCellTooltip(lines: string[], screenX: number, screenY: number): void {
  clearTimeout(tooltipTimer);
  tooltip.textContent = lines.join('\n');
  tooltip.style.left = `${Math.min(screenX + 12, window.innerWidth - 220)}px`;
  tooltip.style.top = `${Math.min(screenY + 12, window.innerHeight - 120)}px`;
  tooltip.style.display = 'block';
  tooltipTimer = window.setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
}

export function hideCellTooltip(): void {
  clearTimeout(tooltipTimer);
  tooltip.style.display = 'none';
}

const topBar = document.createElement('div');
topBar.style.cssText = `
  display:flex; gap:12px; align-items:center; padding:6px 10px;
  background:rgba(0,0,0,0.7); pointer-events:all;
`;
overlay.appendChild(topBar);

const bottomRow = document.createElement('div');
bottomRow.style.cssText = `
  display:flex; gap:8px; padding:6px 10px;
  background:rgba(0,0,0,0.7); pointer-events:all; flex-wrap:wrap;
`;
overlay.appendChild(bottomRow);

function makePanel(title: string): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = `
    background:rgba(20,20,30,0.9); border:1px solid #333; padding:6px 8px;
    min-width:160px; max-height:180px; overflow-y:auto; flex:1;
  `;
  div.dataset['title'] = title;
  bottomRow.appendChild(div);
  return div;
}

const storagePanel = makePanel('Storages');
const workerPanel = makePanel('Workers');
const orderPanel = makePanel('Orders');

// ---- Helpers ----

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = `
    background:#224; border:1px solid #446; color:#ddf; padding:3px 8px;
    cursor:pointer; font-family:monospace; font-size:12px;
  `;
  b.addEventListener('click', onClick);
  return b;
}

function row(text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText = 'padding:2px 0; border-bottom:1px solid #222;';
  d.textContent = text;
  return d;
}

function rebuildPanel(panel: HTMLDivElement, title: string, fill: (frag: DocumentFragment) => void): void {
  panel.innerHTML = `<b style="color:#aaf">${title}</b><hr style="border-color:#333;margin:3px 0">`;
  const frag = document.createDocumentFragment();
  fill(frag);
  panel.appendChild(frag);
}

// ---- Public update ----

export function updateUI(engine: GameEngine, applyCmd: ApplyCmd): void {
  const status = engine.read({ type: 'get_game_status' });
  const state = engine.exportState();

  // Top bar
  topBar.innerHTML = '';
  topBar.appendChild(document.createTextNode(
    `💰 ${Math.floor(state.money)}  |  Shift ${status.currentShift}  Tick ${status.currentTick}  [${status.phase}]  `,
  ));

  if (status.phase === 'shift_planning') {
    topBar.appendChild(btn('▶ Start Shift', () => applyCmd({ type: 'start_next_shift' })));
  } else {
    topBar.appendChild(btn('⏩ Fast Forward', () => applyCmd({ type: 'fast_forward_to_shift_end' })));
  }
  topBar.appendChild(btn('💾 Save', () => applyCmd({ type: 'save_game' })));
  topBar.appendChild(btn('🗑 New Game', () => { localStorage.clear(); location.reload(); }));

  // Storages
  const sqRows = engine.read({ type: 'get_storages' });
  const ownedResourceIds = new Set(sqRows.storages.map((s) => s.resource.id));
  rebuildPanel(storagePanel, 'Storages', (frag) => {
    for (const s of sqRows.storages) {
      frag.appendChild(row(`${s.resource.id}  ${Math.floor(s.storedAmount)}/${s.capacity}  Lv${s.level}`));
      if (status.phase === 'shift_planning') {
        frag.appendChild(btn('↑ Upgrade', () => applyCmd({ type: 'upgrade_storage', storageId: s.id })));
      }
    }
    if (status.phase === 'shift_planning') {
      for (const r of RESOURCES.filter((r) => r.minDepth === 0 && !ownedResourceIds.has(r.id))) {
        frag.appendChild(btn(`+ Buy ${r.name} Storage`, () => applyCmd({ type: 'buy_storage', resourceId: r.id })));
      }
    }
    if (!sqRows.storages.length && status.phase !== 'shift_planning') frag.appendChild(row('— none —'));
  });

  // Workers
  rebuildPanel(workerPanel, 'Workers', (frag) => {
    if (!state.workers.size) {
      frag.appendChild(row('— none —'));
    } else {
      for (const w of state.workers.values()) {
        const loc = w.positionX != null ? ` @(${w.positionX},${w.positionY})` : '';
        frag.appendChild(row(`W${w.id.slice(-4)} Lv${w.level} [${w.state}]${loc}`));
      }
    }
    if (status.phase === 'shift_planning') {
      frag.appendChild(btn('+ Buy Worker', () => applyCmd({ type: 'buy_worker', level: 1 })));
    }
  });

  // Orders
  const oqRows = engine.read({ type: 'get_orders' });
  rebuildPanel(orderPanel, 'Orders', (frag) => {
    if (!oqRows.orders.length) {
      frag.appendChild(row('— none —'));
      return;
    }
    for (const o of oqRows.orders) {
      const reqs = o.requirements.map((r) => `${r.resourceId}×${r.requiredAmount}`).join(', ');
      frag.appendChild(row(`[${o.state}] $${o.rewardMoney} | ${reqs} | exp:${o.expiresAtTick}`));
      if (o.state === 'available') {
        frag.appendChild(btn('Accept', () => applyCmd({ type: 'accept_order', orderId: o.id })));
        frag.appendChild(btn('Decline', () => applyCmd({ type: 'decline_order', orderId: o.id })));
      }
    }
  });
}
