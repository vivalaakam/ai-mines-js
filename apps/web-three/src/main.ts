import * as THREE from 'three';
import { GameEngineFactory } from '@ai-mines/engine';
import type { GameEngine, EngineState } from '@ai-mines/engine';
import { MapRenderer, CELL_SIZE } from './MapRenderer.js';
import { WorkerRenderer } from './WorkerRenderer.js';
import { updateUI } from './ui.js';
import { InputHandler } from './InputHandler.js';


// ---- Persistence (localStorage) ----

const SAVE_KEY = 'ai-mines-save';

function saveState(state: EngineState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state, replacer));
  } catch {
    console.warn('autosave failed');
  }
}

function loadState(): EngineState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw, reviver) as EngineState;
  } catch {
    return null;
  }
}

// JSON serialization helpers for Map
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { __map: true, entries: [...value.entries()] };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).__map === true) {
    return new Map((value as { entries: [unknown, unknown][] }).entries);
  }
  return value;
}

// ---- Engine bootstrap ----

function createEngine(): GameEngine {
  const saved = loadState();
  if (saved) {
    console.log('[mines] Loaded save from localStorage');
    return GameEngineFactory.createFromState(saved);
  }
  console.log('[mines] New game');
  return GameEngineFactory.createNew({
    seedPhrase: `seed-${Date.now()}`,
    startingMoney: 1000,
  });
}

// ---- Three.js setup ----

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.OrthographicCamera(
  -window.innerWidth / 2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  -window.innerHeight / 2,
  0.1,
  1000,
);
camera.position.set(0, 0, 10);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.left = -window.innerWidth / 2;
  camera.right = window.innerWidth / 2;
  camera.top = window.innerHeight / 2;
  camera.bottom = -window.innerHeight / 2;
  camera.updateProjectionMatrix();
});

// ---- Map rendering ----

const engine = createEngine();
const mapRenderer = new MapRenderer(scene);
const workerRenderer = new WorkerRenderer(scene);

// Build map from first level
const initialState = engine.exportState();
const firstLevel = initialState.levels.values().next().value;
if (firstLevel) {
  mapRenderer.buildLevel(firstLevel);
  // Center camera on entry point
  mapRenderer.centerOn(firstLevel.entryX * CELL_SIZE, firstLevel.entryY * CELL_SIZE);
}

// ---- Game loop ----

// Advance one real-time tick every second (1 tick = 1 game second)
const TICK_INTERVAL_MS = 1000;
let lastTickTime = performance.now();

function applyAndHandleEvents(result: ReturnType<GameEngine['apply']>): void {
  if (!result.ok) { console.error('[mines] command failed:', result.error); return; }
  let needsMapRebuild = false;
  for (const event of result.events) {
    if (event.type === 'autosave_requested') {
      saveState(engine.exportState());
      console.log(`[mines] autosave (${event.reason})`);
    }
    if (event.type === 'shift_completed') {
      needsMapRebuild = true;
    }
  }
  if (needsMapRebuild) {
    const state = engine.exportState();
    const level = state.levels.values().next().value;
    if (level) mapRenderer.buildLevel(level);
  }
}

function gameLoop(now: number): void {
  requestAnimationFrame(gameLoop);

  const status = engine.read({ type: 'get_game_status' });

  if (status.phase === 'shift_running') {
    const elapsed = now - lastTickTime;
    if (elapsed >= TICK_INTERVAL_MS) {
      const ticks = Math.floor(elapsed / TICK_INTERVAL_MS);
      lastTickTime = now - (elapsed % TICK_INTERVAL_MS);
      applyAndHandleEvents(engine.apply({ type: 'tick', ticksPassed: ticks }));
    }
  }

  // Update worker dots every frame for smooth progress bars
  const state = engine.exportState();
  const level = state.levels.values().next().value;
  if (level) workerRenderer.update(level, state.workers as Map<string, import('@ai-mines/engine').WorkerData>);

  updateUI(engine, (cmd) => applyAndHandleEvents(engine.apply(cmd)));

  renderer.render(scene, camera);
}

// ---- Input ----
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const input = new InputHandler(
  renderer.domElement,
  camera,
  engine,
  (cmd) => applyAndHandleEvents(engine.apply(cmd)),
);

requestAnimationFrame(gameLoop);

// Expose engine on window for dev console access
(window as unknown as Record<string, unknown>).engine = engine;
(window as unknown as Record<string, unknown>).applyCmd = (cmd: Parameters<GameEngine['apply']>[0]): void =>
  applyAndHandleEvents(engine.apply(cmd));
