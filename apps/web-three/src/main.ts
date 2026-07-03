import * as THREE from 'three';
import { GameEngineFactory } from '@ai-mines/engine';
import type { GameEngine } from '@ai-mines/engine';
import { MapRenderer, CELL_SIZE } from './MapRenderer.js';
import { WorkerRenderer } from './WorkerRenderer.js';
import { updateUI } from './ui.js';
import { InputHandler } from './InputHandler.js';
import { createSaveAdapter } from './persistence/index.js';

const saveAdapter = createSaveAdapter();

async function createEngine(): Promise<GameEngine> {
  const saved = await saveAdapter.load();
  if (saved) {
    console.log('[mines] Loaded save');
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

async function bootstrap(): Promise<void> {
  const engine = await createEngine();
  const mapRenderer = new MapRenderer(scene);
  const workerRenderer = new WorkerRenderer(scene);

  const initialState = engine.exportState();
  const firstLevel = initialState.levels.values().next().value;
  if (firstLevel) {
    mapRenderer.buildLevel(firstLevel);
    camera.position.set(firstLevel.entryX * CELL_SIZE, -firstLevel.entryY * CELL_SIZE, 10);
  }

  const TICK_INTERVAL_MS = 1000;
  let lastTickTime = performance.now();
  let uiDirty = true;

  const applyCmd = (cmd: Parameters<GameEngine['apply']>[0]): void => {
    const result = engine.apply(cmd);
    if (!result.ok) {
      console.error('[mines] command failed:', result.error);
      return;
    }
    if (cmd.type === 'start_next_shift') lastTickTime = performance.now();
    let needsMapRebuild = false;
    for (const event of result.events) {
      if (event.type === 'autosave_requested') {
        void saveAdapter.save(engine.exportState()).then(() => {
          console.log(`[mines] autosave (${event.reason})`);
        });
      }
      if (event.type === 'shift_completed') needsMapRebuild = true;
    }
    if (needsMapRebuild) {
      const state = engine.exportState();
      const level = state.levels.values().next().value;
      if (level) mapRenderer.buildLevel(level);
    }
    uiDirty = true;
  };

  let lastUITick = -1;

  function gameLoop(now: number): void {
    requestAnimationFrame(gameLoop);

    const status = engine.read({ type: 'get_game_status' });

    if (status.phase === 'shift_running') {
      const elapsed = now - lastTickTime;
      if (elapsed >= TICK_INTERVAL_MS) {
        const ticks = Math.floor(elapsed / TICK_INTERVAL_MS);
        lastTickTime = now - (elapsed % TICK_INTERVAL_MS);
        applyCmd({ type: 'tick', ticksPassed: ticks });
      }
    }

    const state = engine.exportState();
    const level = state.levels.values().next().value;
    if (level) {
      workerRenderer.update(
        level,
        state.workers as Map<string, import('@ai-mines/engine').WorkerData>,
      );
    }

    if (uiDirty || status.currentTick !== lastUITick) {
      updateUI(engine, applyCmd);
      uiDirty = false;
      lastUITick = status.currentTick;
    }

    renderer.render(scene, camera);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const input = new InputHandler(renderer.domElement, camera, engine, applyCmd);

  requestAnimationFrame(gameLoop);

  (window as unknown as Record<string, unknown>).engine = engine;
  (window as unknown as Record<string, unknown>).applyCmd = applyCmd;
}

void bootstrap();
