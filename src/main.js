import * as THREE from "three";
import "./styles.css";
import {
  plantTypes,
  zombieTypes,
  levels,
  difficulties,
  ranks,
  freshProgress,
  sanitizeProgress,
  rankInfo,
  awardVictory,
  waveCount,
  enemyForSpawn,
  upgradeCost,
  plantPower,
} from "./rules.js";
const SAVE_KEY = "garden-defense-campaign-v1";
let progress;
let mapWasPaused = false;
let saveAvailable = true;
try {
  progress = sanitizeProgress(JSON.parse(localStorage.getItem(SAVE_KEY)));
} catch {
  progress = freshProgress();
}
try {
  localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
} catch {
  saveAvailable = false;
}
const texturePaths = {
  board: "assets/lawn-board.png",
  shooter: "assets/sprites/pea-shooter.png",
  sunflower: "assets/sprites/sunflower.png",
  wallnut: "assets/sprites/wallnut.png",
  zombie: "assets/sprites/zombie.png",
};
for (const [type, def] of Object.entries(plantTypes))
  texturePaths[type] = texturePaths[def.sprite];
document.querySelector(".seed-tray").innerHTML = Object.entries(plantTypes)
  .map(
    ([type, def]) =>
      `<button class="seed-card" type="button" data-plant="${type}" title="${def.tip}"><img src="${texturePaths[type]}" alt="" style="filter:${type === "ice" ? "hue-rotate(100deg)" : type === "bomb" ? "hue-rotate(300deg)" : "none"}"/><span>${def.name}<small>${def.icon} · ${def.tip}</small></span><b>${def.cost}</b><em></em></button>`,
  )
  .join("");
document.querySelector("#enemy-guide").innerHTML = Object.values(zombieTypes)
  .map(
    (def) =>
      `<div class="enemy-entry"><strong>${def.mark || "●"} ${def.name}</strong>${def.tip}</div>`,
  )
  .join("");

const canvas = document.querySelector("#game");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15220f);

const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const loader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const ui = {
  sun: document.querySelector("#sun-count"),
  sunMeter: document.querySelector(".sun-meter"),
  wave: document.querySelector("#wave-count"),
  pauseButton: document.querySelector("#pause-button"),
  pauseIcon: document.querySelector("#pause-icon"),
  restartButton: document.querySelector("#restart-button"),
  message: document.querySelector("#message"),
  messageTitle: document.querySelector("#message-title"),
  messageCopy: document.querySelector("#message-copy"),
  messageRestart: document.querySelector("#message-restart"),
  seedCards: [...document.querySelectorAll(".seed-card")],
};

const board = {
  rows: 5,
  cols: 9,
  xMin: -4.82,
  xMax: 5.74,
  yMin: -3.1,
  yMax: 2.82,
  get cellW() {
    return (this.xMax - this.xMin) / this.cols;
  },
  get cellH() {
    return (this.yMax - this.yMin) / this.rows;
  },
};

const state = {
  sun: 550,
  level: 1,
  mode: "plant",
  phase: "preparation",
  phaseTimer: 25,
  spawned: 0,
  totalKilled: 0,
  cardCooldowns: {},
  supportCooldown: 0,
  won: false,
  selected: "shooter",
  wave: 1,
  spawnTimer: 1.8,
  waveTimer: 0,
  backgroundSunTimer: 4.5,
  gameTime: 0,
  paused: false,
  ended: false,
  grid: Array.from({ length: board.rows }, () => Array(board.cols).fill(null)),
  plants: [],
  zombies: [],
  peas: [],
  suns: [],
  mowers: [],
  floatingTexts: [],
  drag: null,
};

const textures = {};
const cellMarkers = [];
const root = new THREE.Group();
scene.add(root);

const groups = {
  board: new THREE.Group(),
  actors: new THREE.Group(),
  effects: new THREE.Group(),
  overlays: new THREE.Group(),
};
root.add(groups.board, groups.actors, groups.effects, groups.overlays);

await loadTextures();
buildBoard();
resetGame();
showMap();
resize();
window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", cancelDrag);

ui.seedCards.forEach((card) => {
  card.addEventListener("pointerdown", onSeedPointerDown);
  card.addEventListener("click", () => {
    if (
      state.ended ||
      state.paused ||
      plantTypes[card.dataset.plant].unlock > progress.unlocked
    )
      return;
    state.mode = "plant";
    state.selected = card.dataset.plant;
    syncUi();
  });
});

ui.pauseButton.addEventListener("click", () => {
  if (state.ended) return;
  cancelDrag();
  state.paused = !state.paused;
  syncUi();
});
ui.restartButton.addEventListener("click", () => resetGame());
ui.messageRestart.addEventListener("click", () => {
  if (state.won && state.level < levels.length) state.level++;
  resetGame();
});
document.querySelector("#map-button").addEventListener("click", showMap);
document.querySelector("#message-map").addEventListener("click", showMap);
document.querySelector("#map-close").addEventListener("click", closeMap);
document.querySelector("#difficulty").value = progress.difficulty;
document.querySelector("#difficulty").addEventListener("change", (event) => {
  progress.difficulty = event.target.value;
  saveProgress();
});
document.querySelectorAll("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    if (state.paused || state.ended) return;
    cancelDrag();
    state.mode =
      state.mode === button.dataset.mode ? "plant" : button.dataset.mode;
    syncUi();
  }),
);
window.addEventListener("keydown", (event) => {
  if (event.target.matches("button, select, input") || event.repeat) return;
  if (event.code === "Space") {
    event.preventDefault();
    ui.pauseButton.click();
  }
  if (event.key === "Escape") {
    cancelDrag();
    state.mode = "plant";
    syncUi();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !state.ended) {
    cancelDrag();
    state.paused = true;
    syncUi();
  }
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!state.paused && !state.ended) {
    update(dt);
  }
  render();
});

async function loadTextures() {
  await Promise.all(
    Object.entries(texturePaths).map(
      ([key, path]) =>
        new Promise((resolve, reject) => {
          loader.load(
            path,
            (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.minFilter = THREE.LinearFilter;
              texture.magFilter = THREE.LinearFilter;
              textures[key] = texture;
              resolve();
            },
            undefined,
            reject,
          );
        }),
    ),
  );
}

function buildBoard() {
  groups.board.clear();
  cellMarkers.length = 0;
  const boardMesh = plane(textures.board, 16, 9, false);
  boardMesh.position.set(0, 0, -2);
  groups.board.add(boardMesh);

  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(board.cellW - 0.04, board.cellH - 0.04),
        new THREE.MeshBasicMaterial({
          color: row % 2 === col % 2 ? 0xf8ffb2 : 0xb8f06a,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
        }),
      );
      const pos = cellToWorld(row, col);
      marker.position.set(pos.x, pos.y, -1.8);
      marker.userData = { row, col, isCell: true };
      cellMarkers.push(marker);
      groups.overlays.add(marker);
    }
  }

  for (let row = 0; row < board.rows; row += 1) {
    const mower = makeMower(row);
    state.mowers.push(mower);
    groups.actors.add(mower.mesh);
  }
}

function resetGame() {
  cancelDrag();
  state.difficulty = progress.difficulty;
  state.rank = rankInfo(progress);
  state.mode = "plant";
  state.phase = "preparation";
  state.phaseTimer = difficulties[state.difficulty].preparation;
  state.spawned = 0;
  state.totalKilled = 0;
  state.cardCooldowns = {};
  state.supportCooldown = 0;
  state.won = false;
  document.querySelector("#campaign").classList.add("hidden");
  clearGroup(groups.actors);
  clearGroup(groups.effects);
  state.sun =
    levels[state.level - 1].sun +
    difficulties[state.difficulty].sun +
    state.rank.bonusSun;
  state.selected = "shooter";
  state.wave = 1;
  state.spawnTimer = 2.2;
  state.waveTimer = 0;
  state.backgroundSunTimer = 3.8;
  state.gameTime = 0;
  state.paused = false;
  state.ended = false;
  state.grid = Array.from({ length: board.rows }, () =>
    Array(board.cols).fill(null),
  );
  state.plants = [];
  state.zombies = [];
  state.peas = [];
  state.suns = [];
  state.mowers = [];
  state.floatingTexts = [];
  state.drag = null;
  clearCellHighlight();

  for (let row = 0; row < board.rows; row += 1) {
    const mower = makeMower(row);
    state.mowers.push(mower);
    groups.actors.add(mower.mesh);
  }

  ui.message.classList.add("hidden");
  syncUi();
}

function update(dt) {
  state.gameTime += dt;
  state.backgroundSunTimer -= dt;
  state.supportCooldown = Math.max(0, state.supportCooldown - dt);
  for (const type in state.cardCooldowns)
    state.cardCooldowns[type] = Math.max(0, state.cardCooldowns[type] - dt);
  if (state.phase === "preparation" || state.phase === "break") {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phase = "combat";
      state.spawnTimer = 0;
    }
  } else if (state.spawned < waveCount(state.level, state.wave)) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnZombie();
      state.spawned++;
      state.spawnTimer = levels[state.level - 1].interval;
    }
  }
  if (state.backgroundSunTimer <= 0) {
    dropSun(-3.7 + Math.random() * 8.3, 3.1, 1.0 - Math.random() * 3.5);
    state.backgroundSunTimer = 5.5;
  }

  updatePlants(dt);
  updatePeas(dt);
  updateZombies(dt);
  updateSuns(dt);
  updateMowers(dt);
  updateFloatingText(dt);

  if (
    !state.ended &&
    state.phase === "combat" &&
    state.spawned >= waveCount(state.level, state.wave) &&
    state.zombies.length === 0
  ) {
    if (state.wave === levels[state.level - 1].waves) endGame(true);
    else {
      state.wave++;
      state.spawned = 0;
      state.phase = "break";
      state.phaseTimer = 12;
      state.sun += 75;
      floatingText("补给 +75", 0, 1, "#ffe071");
    }
  }
  syncUi();
}

function updatePlants(dt) {
  for (const plant of [...state.plants]) {
    const def = plantTypes[plant.type];
    plant.mesh.position.y =
      plant.baseY + Math.sin(state.gameTime * 2.3 + plant.row) * 0.025;
    if (plant.type === "bomb") {
      plant.cooldown -= dt;
      if (plant.cooldown <= 0) {
        for (const zombie of [...state.zombies]) {
          if (
            Math.abs(zombie.row - plant.row) <= 1 &&
            Math.abs(zombie.x - plant.x) <= board.cellW * 1.5
          )
            hurtZombie(zombie, def.damage);
        }
        burst(plant.x, plant.baseY, 0xff8354);
        floatingText("轰！", plant.x, plant.baseY + 0.5, "#ffcc79");
        removePlant(plant);
      }
    } else if (def.damage) {
      plant.cooldown -= dt;
      const targets = state.zombies
        .filter((z) => z.row === plant.row && z.x > plant.x - 0.3 && z.hp > 0)
        .sort((a, b) => a.x - b.x);
      if (plant.cooldown <= 0) {
        if (plant.type === "spike") {
          const nearby = state.zombies.filter(
            (z) => z.row === plant.row && Math.abs(z.x - plant.x) < 0.6,
          );
          nearby.forEach((z) =>
            hurtZombie(
              z,
              def.damage * plantPower(plant) * state.rank.damageMultiplier,
            ),
          );
          if (nearby.length) plant.cooldown = def.cooldown;
        } else if (targets.length) {
          if (def.chain) {
            const first = targets[0];
            const victims = [
              first,
              ...state.zombies.filter(
                (z) =>
                  z !== first &&
                  Math.abs(z.row - first.row) <= 1 &&
                  Math.abs(z.x - first.x) < 2,
              ),
            ].slice(0, def.chain);
            let origin = { x: plant.x, y: plant.baseY };
            victims.forEach((z) => {
              lightningBolt(origin.x, origin.y, z.x, z.baseY);
              origin = { x: z.x, y: z.baseY };
              hurtZombie(
                z,
                def.damage * plantPower(plant) * state.rank.damageMultiplier,
              );
            });
          } else {
            for (let i = 0; i < (def.shots || 1); i++) shootPea(plant, i);
          }
          plant.cooldown = def.cooldown / (1 + (plant.level - 1) * 0.1);
        }
      }
    }
    if (plant.type === "sunflower") {
      plant.sunTimer -= dt;
      if (plant.sunTimer <= 0) {
        dropSun(plant.x + 0.1, plant.baseY + 0.45, plant.baseY - 0.1);
        plant.sunTimer = def.sunInterval / (1 + (plant.level - 1) * 0.3);
      }
    }
    updateHealthBar(plant);
  }
}

function updatePeas(dt) {
  for (const pea of [...state.peas]) {
    pea.x += pea.speed * dt;
    pea.mesh.position.x = pea.x;
    pea.mesh.rotation.z += dt * 6;

    const hit = state.zombies.find(
      (zombie) =>
        zombie.row === pea.row &&
        zombie.hp > 0 &&
        Math.abs(zombie.x - pea.x) < 0.36 &&
        Math.abs(zombie.mesh.position.y - pea.y) < 0.82,
    );

    if (hit) {
      if (pea.slow) hit.slowTimer = pea.slow;
      if (pea.splash) {
        for (const zombie of [...state.zombies]) {
          if (
            Math.abs(zombie.row - hit.row) <= 1 &&
            Math.abs(zombie.x - hit.x) < pea.splash
          )
            hurtZombie(zombie, pea.damage);
        }
      } else hurtZombie(hit, pea.damage);
      burst(pea.x, pea.y, pea.color);
      removeEntity(state.peas, pea, groups.effects);
      continue;
    }

    if (pea.x > 7.2) {
      removeEntity(state.peas, pea, groups.effects);
    }
  }
}

function updateZombies(dt) {
  for (const zombie of [...state.zombies]) {
    if (!state.zombies.includes(zombie)) continue;
    zombie.slowTimer = Math.max(0, zombie.slowTimer - dt);
    if (zombie.type === "healer") {
      zombie.healTimer -= dt;
      if (zombie.healTimer <= 0) {
        for (const friend of state.zombies) {
          if (
            Math.abs(friend.row - zombie.row) <= 1 &&
            Math.abs(friend.x - zombie.x) < 1.8
          ) {
            friend.hp = Math.min(friend.maxHp, friend.hp + 25);
            burst(friend.x, friend.baseY, 0x78ffba);
          }
        }
        zombie.healTimer = 4;
      }
    }
    updateHealthBar(zombie);
    const blocker = state.plants.find(
      (plant) =>
        plant.type !== "spike" &&
        plant.row === zombie.row &&
        Math.abs(plant.x - zombie.x) < 0.44 &&
        plant.hp > 0,
    );

    if (blocker) {
      zombie.eatTimer -= dt;
      zombie.mesh.position.x = zombie.x + Math.sin(state.gameTime * 18) * 0.015;
      if (zombie.eatTimer <= 0) {
        blocker.hp -= zombie.damage;
        zombie.eatTimer = 0.55;
        damageFlash(blocker.mesh);
        if (blocker.hp <= 0) {
          removePlant(blocker);
        }
      }
    } else {
      zombie.x -= zombie.speed * dt * (zombie.slowTimer > 0 ? 0.45 : 1);
      zombie.mesh.position.x = zombie.x;
      zombie.mesh.position.y =
        zombie.baseY + Math.sin(state.gameTime * 5 + zombie.row) * 0.035;
    }

    if (zombie.x < -5.55) {
      const mower = state.mowers.find(
        (item) => item.row === zombie.row && !item.used,
      );
      if (mower) {
        mower.active = true;
        mower.used = true;
      } else if (
        !state.mowers.some(
          (item) =>
            item.row === zombie.row && item.active && item.x < zombie.x + 0.8,
        )
      ) {
        endGame(false);
        return;
      }
    }
  }
}

function updateSuns(dt) {
  for (const sun of [...state.suns]) {
    if (sun.collecting) {
      const target = getSunMeterWorldPosition();
      sun.targetX = target.x;
      sun.targetY = target.y;
      sun.x += (sun.targetX - sun.x) * Math.min(1, dt * 8.5);
      sun.y += (sun.targetY - sun.y) * Math.min(1, dt * 8.5);
      sun.mesh.position.set(sun.x, sun.y, 2.2);
      sun.mesh.rotation.z += dt * 8;
      sun.mesh.scale.setScalar(Math.max(0.35, sun.mesh.scale.x - dt * 1.35));

      if (Math.hypot(sun.targetX - sun.x, sun.targetY - sun.y) < 0.08) {
        state.sun += 25;
        pulseSunMeter();
        removeEntity(state.suns, sun, groups.effects);
        syncUi();
      }
      continue;
    }

    if (sun.y > sun.targetY) {
      sun.y -= dt * 0.65;
      sun.mesh.position.y = Math.max(sun.targetY, sun.y);
    }
    sun.life -= dt;
    sun.mesh.rotation.z += dt * 1.2;
    sun.mesh.scale.setScalar(1 + Math.sin(state.gameTime * 3 + sun.x) * 0.04);
    if (sun.life <= 4) collectSun(sun);
  }
}

function updateMowers(dt) {
  for (const mower of state.mowers) {
    if (!mower.active) continue;
    mower.x += dt * 5.4;
    mower.mesh.position.x = mower.x;
    mower.mesh.rotation.z = Math.sin(state.gameTime * 28) * 0.06;

    for (const zombie of [...state.zombies]) {
      if (zombie.row === mower.row && Math.abs(zombie.x - mower.x) < 0.72) {
        killZombie(zombie);
      }
    }

    if (mower.x > 7.1) {
      mower.active = false;
      groups.actors.remove(mower.mesh);
      disposeMesh(mower.mesh);
    }
  }
}

function updateFloatingText(dt) {
  for (const item of [...state.floatingTexts]) {
    item.life -= dt;
    item.mesh.position.y += dt * (item.vy ?? 0.38);
    item.mesh.position.x += dt * (item.vx ?? 0);
    item.mesh.material.opacity = Math.max(0, item.life / 0.9);
    if (item.life <= 0) {
      removeEntity(state.floatingTexts, item, groups.effects);
    }
  }
}

function onPointerDown(event) {
  if (state.paused || state.ended) return;
  const hit = pickAt(event.clientX, event.clientY);
  const sun = hit.find((item) => item.object.userData.sun)?.object.userData.sun;
  if (sun) {
    collectSun(sun);
    return;
  }

  const cell = hit.find((item) => item.object.userData.isCell)?.object.userData;
  if (!cell) return;
  if (state.mode === "plant") plantAt(cell.row, cell.col);
  else useTool(cell.row, cell.col);
}

function onSeedPointerDown(event) {
  if (state.paused || state.ended || event.button !== 0) return;
  const card = event.currentTarget;
  const type = card.dataset.plant;
  if (plantTypes[type].unlock > progress.unlocked) return;
  cancelDrag();
  state.mode = "plant";
  state.selected = type;
  syncUi();
  // Touch users tap to select, leaving horizontal card scrolling available.
  if (event.pointerType === "touch") return;

  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.innerHTML = `<img src="${texturePaths[type]}" alt="" />`;
  document.body.append(ghost);

  state.drag = {
    type,
    pointerId: event.pointerId,
    ghost,
    sourceCard: card,
    currentCell: null,
  };
  card.classList.add("dragging");
  card.setPointerCapture?.(event.pointerId);
  updateDrag(event.clientX, event.clientY);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  updateDrag(event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  const drag = state.drag;
  updateDrag(event.clientX, event.clientY);
  if (drag.currentCell) {
    plantAt(drag.currentCell.row, drag.currentCell.col, drag.type);
  }
  cancelDrag();
}

function updateDrag(clientX, clientY) {
  const drag = state.drag;
  if (!drag) return;
  drag.ghost.style.left = `${clientX}px`;
  drag.ghost.style.top = `${clientY}px`;

  const cell = pickCellAt(clientX, clientY);
  drag.currentCell = cell;
  const valid = cell && canPlantAt(cell.row, cell.col, drag.type);
  drag.ghost.classList.toggle("invalid", !valid);
  highlightCell(cell, valid);
}

function cancelDrag() {
  if (!state.drag) return;
  state.drag.sourceCard.classList.remove("dragging");
  state.drag.ghost.remove();
  state.drag = null;
  clearCellHighlight();
}

function pickAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(
    [...groups.effects.children, ...groups.overlays.children],
    true,
  );
}

function pickCellAt(clientX, clientY) {
  const topElement = document.elementFromPoint(clientX, clientY);
  if (topElement?.closest(".seed-tray, .topbar, .message")) {
    return null;
  }
  const hit = pickAt(clientX, clientY);
  return (
    hit.find((item) => item.object.userData.isCell)?.object.userData ?? null
  );
}

function canPlantAt(row, col, type) {
  const definition = plantTypes[type];
  return Boolean(
    !state.paused &&
    !state.ended &&
    definition &&
    definition.unlock <= progress.unlocked &&
    !state.grid[row][col] &&
    state.sun >= definition.cost &&
    !(state.cardCooldowns[type] > 0),
  );
}

function highlightCell(cell, valid) {
  clearCellHighlight();
  if (!cell) return;
  const marker = cellMarkers.find(
    (item) => item.userData.row === cell.row && item.userData.col === cell.col,
  );
  if (!marker) return;
  marker.material.opacity = 0.3;
  marker.material.color.set(valid ? 0xffec82 : 0xff6558);
  marker.userData.highlighted = true;
}

function clearCellHighlight() {
  for (const marker of cellMarkers) {
    marker.material.opacity = 0.08;
    marker.material.color.set(
      marker.userData.row % 2 === marker.userData.col % 2 ? 0xf8ffb2 : 0xb8f06a,
    );
    marker.userData.highlighted = false;
  }
}

function plantAt(row, col, type = state.selected) {
  const definition = plantTypes[type];
  if (
    state.paused ||
    state.ended ||
    !definition ||
    definition.unlock > progress.unlocked
  )
    return;
  if (state.grid[row][col]) {
    floatingText(
      "已有植物",
      cellToWorld(row, col).x,
      cellToWorld(row, col).y,
      "#ffe071",
    );
    return;
  }
  if (state.cardCooldowns[type] > 0) {
    floatingText(
      "卡牌冷却中",
      cellToWorld(row, col).x,
      cellToWorld(row, col).y,
      "#ffe071",
    );
    return;
  }
  if (state.sun < definition.cost) {
    const pos = cellToWorld(row, col);
    floatingText("阳光不足", pos.x, pos.y + 0.45, "#ffef9a");
    return;
  }

  state.sun -= definition.cost;
  const pos = cellToWorld(row, col);
  state.cardCooldowns[type] = definition.recharge || 0;
  const mesh = spritePlane(
    textures[type],
    type === "spike" ? 0.95 : 0.86,
    type === "spike" ? 0.3 : 0.86,
  );
  mesh.material.color.set(definition.color);
  decoratePlant(mesh, type);
  mesh.position.set(pos.x, pos.y + 0.05, rowDepth(row));
  addBadge(mesh, definition.icon, "#fff3b6", -0.42);
  mesh.userData.plant = true;
  const plant = {
    type,
    row,
    col,
    x: pos.x,
    baseY: pos.y + 0.05,
    hp: definition.hp,
    maxHp: definition.hp,
    level: 1,
    invested: definition.cost,
    cooldown: type === "bomb" ? 1 : 0.55,
    sunTimer: 4.5 + Math.random() * 2.5,
    mesh,
  };
  addHealthBar(plant, 0.51);
  state.grid[row][col] = plant;
  state.plants.push(plant);
  groups.actors.add(mesh);
  pop(mesh);
  syncUi();
}

function spawnZombie() {
  const level = levels[state.level - 1];
  const row = level.rows[(state.spawned + state.wave - 1) % level.rows.length];
  const type = enemyForSpawn(state.level, state.wave, state.spawned);
  const def = zombieTypes[type];
  const difficulty = difficulties[state.difficulty];
  const pos = cellToWorld(row, board.cols - 1);
  const mesh = spritePlane(
    textures.zombie,
    type === "giant" ? 1.25 : 0.92,
    type === "giant" ? 1.75 : 1.36,
  );
  mesh.material.color.set(def.color);
  decorateZombie(mesh, type);
  const x = 6.5;
  mesh.position.set(x, pos.y + 0.12, rowDepth(row) + 0.04);
  if (def.mark)
    addBadge(
      mesh,
      def.mark,
      "#" + def.color.toString(16).padStart(6, "0"),
      0.83,
    );
  const hp = def.hp * difficulty.hp;
  const zombie = {
    type,
    row,
    x,
    baseY: pos.y + 0.12,
    hp,
    maxHp: hp,
    speed: def.speed * difficulty.speed,
    damage: def.damage,
    eatTimer: 0.5,
    slowTimer: 0,
    healTimer: 4,
    mesh,
  };
  addHealthBar(zombie, 0.68);
  state.zombies.push(zombie);
  groups.actors.add(mesh);
  if (type === "giant") floatingText("巨人来袭！", 4.5, 2.8, "#ecb6ff");
}

function shootPea(plant, shot = 0) {
  const def = plantTypes[plant.type];
  const color =
    plant.type === "ice"
      ? 0x8be5ff
      : plant.type === "cannon"
        ? 0xffbf5e
        : 0x93d72e;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(def.splash ? 0.21 : 0.115, 24),
    new THREE.MeshBasicMaterial({ color }),
  );
  const pea = {
    row: plant.row,
    x: plant.x + 0.44 - shot * 0.26,
    y: plant.baseY + 0.18 + shot * 0.09,
    speed: 4,
    damage: def.damage * plantPower(plant) * state.rank.damageMultiplier,
    slow: def.slow,
    splash: def.splash,
    color,
    mesh,
  };
  mesh.position.set(pea.x, pea.y, rowDepth(plant.row) + 0.14);
  groups.effects.add(mesh);
  state.peas.push(pea);
}

function dropSun(x, y, targetY) {
  const mesh = makeSunMesh();
  mesh.position.set(x, y, 1.2);
  const sun = { x, y, targetY, life: 8.5, collecting: false, mesh };
  mesh.traverse((child) => {
    child.userData.sun = sun;
  });
  groups.effects.add(mesh);
  state.suns.push(sun);
}

function collectSun(sun) {
  if (sun.collecting) return;
  sun.collecting = true;
  sun.life = 1.2;
  sun.mesh.traverse((child) => {
    child.userData.sun = null;
  });
  const target = getSunMeterWorldPosition();
  sun.targetX = target.x;
  sun.targetY = target.y;
  sun.mesh.position.z = 2.2;
}

function makeSunMesh() {
  const group = new THREE.Group();
  const rays = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffa51d,
      transparent: true,
      opacity: 0.82,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 32),
    new THREE.MeshBasicMaterial({ color: 0xffdf58 }),
  );
  rays.rotation.z = Math.PI / 12;
  group.add(rays, core);
  group.userData.sunHit = true;
  return group;
}

function makeMower(row) {
  const pos = cellToWorld(row, 0);
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.26, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xd94b38 }),
  );
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.48, 0.03),
    new THREE.MeshBasicMaterial({ color: 0x403427 }),
  );
  const wheelMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1a17 });
  const wheelA = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 18),
    wheelMaterial,
  );
  const wheelB = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 18),
    wheelMaterial,
  );
  handle.position.set(-0.16, 0.24, 0.01);
  handle.rotation.z = -0.45;
  wheelA.position.set(-0.15, -0.17, 0.02);
  wheelB.position.set(0.15, -0.17, 0.02);
  group.add(body, handle, wheelA, wheelB);
  group.position.set(board.xMin - 0.56, pos.y - 0.28, rowDepth(row) + 0.2);
  return { row, x: group.position.x, active: false, used: false, mesh: group };
}

function killZombie(zombie) {
  if (!state.zombies.includes(zombie)) return;
  state.totalKilled++;
  state.sun += zombieTypes[zombie.type].reward;
  burst(zombie.x, zombie.mesh.position.y, 0xb9d2a3);
  removeEntity(state.zombies, zombie, groups.actors);
}

function removePlant(plant) {
  state.grid[plant.row][plant.col] = null;
  removeEntity(state.plants, plant, groups.actors);
  burst(plant.x, plant.baseY, 0xd7a44d);
}

function removeEntity(list, entity, parent) {
  const index = list.indexOf(entity);
  if (index !== -1) list.splice(index, 1);
  parent.remove(entity.mesh);
  disposeMesh(entity.mesh);
}

function burst(x, y, color) {
  for (let i = 0; i < 8; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.035 + Math.random() * 0.035, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }),
    );
    mesh.position.set(x, y, 1.6);
    const angle = Math.random() * Math.PI * 2;
    const item = {
      life: 0.45,
      mesh,
      vx: Math.cos(angle) * (0.35 + Math.random() * 0.4),
      vy: Math.sin(angle) * (0.35 + Math.random() * 0.4),
    };
    groups.effects.add(mesh);
    state.floatingTexts.push(item);
  }
}

function floatingText(text, x, y, color) {
  const texture = textTexture(text, color);
  texture.userData.owned = true;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.32), material);
  mesh.position.set(x, y, 2);
  const item = { life: 0.9, mesh };
  state.floatingTexts.push(item);
  groups.effects.add(mesh);
}

function pulseSunMeter() {
  ui.sunMeter.classList.remove("collecting");
  void ui.sunMeter.offsetWidth;
  ui.sunMeter.classList.add("collecting");
}

function textTexture(text, color) {
  const itemCanvas = document.createElement("canvas");
  itemCanvas.width = 256;
  itemCanvas.height = 96;
  const ctx = itemCanvas.getContext("2d");
  ctx.clearRect(0, 0, itemCanvas.width, itemCanvas.height);
  ctx.font = "700 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(60, 36, 10, 0.95)";
  ctx.strokeText(text, 128, 48);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 48);
  const texture = new THREE.CanvasTexture(itemCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function damageFlash(mesh) {
  const original = mesh.material.color.getHex();
  mesh.material.color.set(0xffa199);
  window.setTimeout(() => {
    if (mesh.parent && mesh.material) mesh.material.color.set(original);
  }, 80);
}

function pop(mesh) {
  mesh.scale.multiplyScalar(0.78);
  const start = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / 140);
    const s = 0.78 + Math.sin(t * Math.PI * 0.5) * 0.22;
    mesh.scale.set(
      mesh.userData.baseScaleX * s,
      mesh.userData.baseScaleY * s,
      1,
    );
    if (t < 1 && mesh.parent) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function endGame(won) {
  if (state.ended) return;
  cancelDrag();
  state.ended = true;
  state.won = won;
  const used = state.mowers.filter((m) => m.used).length;
  const previousRank = rankInfo(progress);
  const previousUnlock = progress.unlocked;
  if (won) {
    progress = awardVictory(progress, state.level, used);
    saveProgress();
  }
  const rank = rankInfo(progress);
  const unlocks = Object.values(plantTypes)
    .filter((p) => p.unlock > previousUnlock && p.unlock <= progress.unlocked)
    .map((p) => p.name);
  ui.messageTitle.textContent = won
    ? state.level === levels.length
      ? "全关卡通关！"
      : "第 " + state.level + " 关完成"
    : "防线被突破";
  const stars = used === 0 ? 3 : used <= 2 ? 2 : 1;
  ui.messageCopy.textContent = won
    ? "★".repeat(stars) +
      "☆".repeat(3 - stars) +
      " · 击退 " +
      state.totalKilled +
      " 名敌人。" +
      (unlocks.length ? " 新卡牌：" + unlocks.join("、") + "。" : "") +
      (rank.rank > previousRank.rank ? " 晋升" + rank.name + "！" : "") +
      " 星级经验 " +
      rank.xp +
      "。" +
      (!saveAvailable ? " 当前无法保存，请勿关闭页面。" : "")
    : "可以切换休闲难度。先种向日花，在预告行布置射手，搭配寒冰与坚果；紧急时使用樱桃或支援轰炸。";
  ui.messageRestart.textContent =
    won && state.level < levels.length ? "进入下一关 →" : "重试本关";
  ui.message.classList.remove("hidden");
  syncUi();
}

function syncUi() {
  ui.sun.textContent = state.sun;
  ui.wave.textContent = state.wave + "/" + levels[state.level - 1].waves;
  ui.pauseIcon.textContent = state.paused ? "▶" : "II";
  ui.pauseButton.title = ui.pauseButton.ariaLabel = state.paused
    ? "继续"
    : "暂停";
  ui.pauseButton.disabled =
    !document.querySelector("#campaign").classList.contains("hidden") ||
    state.ended;
  document.querySelector("#level-label").textContent =
    state.level + " · " + levels[state.level - 1].name;
  document.querySelector("#rank-label").textContent = rankInfo(progress).name;
  const remaining = waveCount(state.level, state.wave) - state.spawned;
  const nextRow =
    levels[state.level - 1].rows[
      (state.spawned + state.wave - 1) % levels[state.level - 1].rows.length
    ] + 1;
  document.querySelector("#battle-status").textContent = state.paused
    ? "已暂停 · 继续后恢复战斗"
    : state.ended
      ? "战斗结束"
      : state.phase !== "combat"
        ? (state.phase === "preparation" ? "准备布阵" : "波间补给 +75") +
          " · " +
          Math.ceil(state.phaseTimer) +
          " 秒后进攻 · 首敌第 " +
          nextRow +
          " 行"
        : remaining > 0
          ? "本波待出场 " +
            remaining +
            " · 场上 " +
            state.zombies.length +
            " · 下个敌人：第 " +
            nextRow +
            " 行"
          : "全部出场 · 剩余 " + state.zombies.length + " 名敌人";
  document.querySelector("#wave-progress").value =
    (state.wave - 1 + state.spawned / waveCount(state.level, state.wave)) /
    levels[state.level - 1].waves;
  ui.seedCards.forEach((card) => {
    const type = card.dataset.plant;
    const def = plantTypes[type];
    const locked = def.unlock > progress.unlocked;
    const cd = Math.ceil(state.cardCooldowns[type] || 0);
    card.classList.toggle(
      "selected",
      type === state.selected && state.mode === "plant",
    );
    card.classList.toggle("disabled", locked || state.sun < def.cost || cd > 0);
    card.disabled = locked;
    card.querySelector("em").textContent = locked
      ? "第 " + def.unlock + " 关解锁"
      : cd
        ? cd + "s 冷却"
        : "";
  });
  document
    .querySelectorAll("[data-mode]")
    .forEach((button) =>
      button.classList.toggle("selected", state.mode === button.dataset.mode),
    );
  document.querySelector("#support-status").textContent =
    state.supportCooldown > 0 ? Math.ceil(state.supportCooldown) + "s" : "50 ☀";
  const help = {
    plant:
      plantTypes[state.selected].name +
      "：" +
      plantTypes[state.selected].tip +
      "。点击空格种植，也可拖放卡牌。",
    upgrade:
      "点击植物升到最高 Lv.3：伤害 +45%/级、攻速提升并回满生命。首次费用为原价的 60%；向日花加速产阳光。",
    shovel: "点击植物移除，返还累计投入阳光的 50%。",
    support:
      "点击任一行，立即对该行敌人造成 180 伤害；消耗 50 阳光，冷却 40 秒。",
  };
  document.querySelector(".hint").textContent = help[state.mode];
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
    saveAvailable = true;
  } catch {
    saveAvailable = false;
  }
}
function showMap() {
  cancelDrag();
  mapWasPaused = state.paused;
  state.paused = true;
  const rank = rankInfo(progress);
  document.querySelector("#campaign-rank").textContent =
    rank.name +
    " · " +
    rank.xp +
    " XP · 开局 +" +
    rank.bonusSun +
    " 阳光 / 伤害 +" +
    rank.rank * 5 +
    "%" +
    (rank.rank < ranks.length - 1
      ? " · 距晋级 " + ((rank.rank + 1) * 160 - rank.xp) + " XP"
      : " · 已达最高段位");
  document.querySelector("#level-grid").innerHTML = levels
    .map((level, i) => {
      const n = i + 1;
      const locked = n > progress.unlocked;
      return `<button class="level-card ${n === state.level ? "current" : ""}" data-level="${n}" ${locked ? "disabled" : ""}><span class="level-number">${String(n).padStart(2, "0")}</span><strong>${level.name}</strong><small>${level.subtitle}</small><span class="level-stars">${locked ? "通关前一关解锁" : "★".repeat(progress.stars[n] || 0) + "☆".repeat(3 - (progress.stars[n] || 0))}</span><small>${level.waves} 波 · ${[...level.types, ...(n === 6 ? ["giant"] : [])].map((t) => zombieTypes[t].name).join(" / ")}</small></button>`;
    })
    .join("");
  document.querySelectorAll("[data-level]").forEach((button) =>
    button.addEventListener("click", () => {
      state.level = Number(button.dataset.level);
      resetGame();
    }),
  );
  document.querySelector("#campaign").classList.remove("hidden");
  document.querySelector("#save-note").textContent = saveAvailable
    ? "自动保存关卡与最佳星级 · 每星 40 XP，重玩仅补差额 · 每 160 XP 晋级"
    : "浏览器禁止存储：进度仅保留在本次页面中";
  syncUi();
}
function closeMap() {
  document.querySelector("#campaign").classList.add("hidden");
  state.paused = mapWasPaused;
  syncUi();
}
function hurtZombie(zombie, damage) {
  if (!state.zombies.includes(zombie)) return;
  zombie.hp -= damage;
  if (zombie.hp <= 0) killZombie(zombie);
  else updateHealthBar(zombie);
}
function useTool(row, col) {
  const pos = cellToWorld(row, col);
  const plant = state.grid[row][col];
  const say = (text) => floatingText(text, pos.x, pos.y + 0.4, "#ffe071");
  if (state.mode === "support") {
    if (state.supportCooldown > 0) return say("支援冷却中");
    if (state.sun < 50) return say("阳光不足");
    if (!state.zombies.some((z) => z.row === row)) return say("本行没有敌人");
    state.sun -= 50;
    state.supportCooldown = 40;
    for (const zombie of [...state.zombies])
      if (zombie.row === row) {
        burst(zombie.x, zombie.baseY, 0xffbb59);
        hurtZombie(zombie, 180);
      }
    say("支援轰炸！");
  } else if (!plant) return say("请点击植物");
  else if (state.mode === "shovel") {
    const refund = Math.floor(plant.invested / 2);
    state.sun += refund;
    removePlant(plant);
    say("返还 +" + refund);
  } else if (state.mode === "upgrade") {
    if (plant.type === "bomb") return say("一次性武器不可升级");
    if (plant.level >= 3) return say("已达 Lv.3");
    const cost = upgradeCost(plant);
    if (state.sun < cost) return say("需要 " + cost + " 阳光");
    state.sun -= cost;
    plant.invested += cost;
    plant.level++;
    plant.maxHp = plantTypes[plant.type].hp * plantPower(plant);
    plant.hp = plant.maxHp;
    if (plant.levelBadge) {
      plant.mesh.remove(plant.levelBadge);
      disposeMesh(plant.levelBadge);
    }
    plant.levelBadge = addBadge(
      plant.mesh,
      "Lv." + plant.level,
      "#ffe071",
      0.76,
    );
    say("升级 -" + cost);
  }
  syncUi();
}
function addBadge(mesh, label, color, y) {
  const texture = textTexture(label, color);
  texture.userData.owned = true;
  const badge = plane(texture, 0.62, 0.25);
  badge.position.set(0, y, 0.12);
  mesh.add(badge);
  return badge;
}
// Small geometric accessories make roles readable without additional raster assets.
function ornament(parent, geometry, color, x, y, z = 0.18) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true }),
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function decoratePlant(mesh, type) {
  if (type === "bomb") {
    mesh.material.opacity = 0;
    for (const x of [-0.18, 0.18]) {
      ornament(mesh, new THREE.CircleGeometry(0.24, 24), 0xe74050, x, -0.06);
      ornament(
        mesh,
        new THREE.CircleGeometry(0.065, 16),
        0xff9d96,
        x - 0.06,
        0.02,
        0.2,
      );
      const stem = ornament(
        mesh,
        new THREE.PlaneGeometry(0.045, 0.34),
        0x6bba47,
        x / 2,
        0.22,
        0.19,
      );
      stem.rotation.z = x < 0 ? -0.5 : 0.5;
    }
  }
  if (type === "spike") {
    mesh.material.opacity = 0;
    ornament(mesh, new THREE.PlaneGeometry(0.9, 0.14), 0x5b666b, 0, -0.15);
    for (let i = 0; i < 5; i++)
      ornament(
        mesh,
        new THREE.CircleGeometry(0.15, 3),
        0xccdfdf,
        (i - 2) * 0.18,
        -0.04,
      ).rotation.z = Math.PI / 2;
  }
  if (type === "cannon") {
    ornament(mesh, new THREE.CircleGeometry(0.25, 24), 0x235f3b, 0.24, 0.13);
    ornament(
      mesh,
      new THREE.CircleGeometry(0.18, 24),
      0x8cca5c,
      0.24,
      0.13,
      0.2,
    );
    ornament(
      mesh,
      new THREE.CircleGeometry(0.11, 24),
      0x203624,
      0.24,
      0.13,
      0.21,
    );
  }
  if (type === "repeater") {
    for (const y of [0.06, 0.26])
      ornament(mesh, new THREE.CircleGeometry(0.1, 16), 0x355e21, 0.32, y);
  }
  if (type === "lightning") {
    const shape = new THREE.Shape();
    shape.moveTo(0.1, 0.42);
    shape.lineTo(-0.16, 0.07);
    shape.lineTo(0, 0.07);
    shape.lineTo(-0.1, -0.22);
    shape.lineTo(0.23, 0.18);
    shape.lineTo(0.05, 0.18);
    shape.closePath();
    ornament(mesh, new THREE.ShapeGeometry(shape), 0xe9c1ff, 0, 0.08);
  }
  if (type === "ice") addBadge(mesh, "❄", "#9deaff", 0.28);
}
function decorateZombie(mesh, type) {
  if (type === "cone") {
    ornament(
      mesh,
      new THREE.CircleGeometry(0.24, 3),
      0xf79b35,
      -0.04,
      0.62,
    ).rotation.z = Math.PI / 2;
    ornament(
      mesh,
      new THREE.PlaneGeometry(0.36, 0.045),
      0xffe6b0,
      -0.04,
      0.57,
      0.2,
    );
  }
  if (type === "bucket") {
    ornament(mesh, new THREE.PlaneGeometry(0.38, 0.28), 0xabbac6, -0.04, 0.58);
    ornament(
      mesh,
      new THREE.PlaneGeometry(0.44, 0.055),
      0xe0e9e9,
      -0.04,
      0.43,
      0.2,
    );
  }
  if (type === "healer") {
    ornament(mesh, new THREE.PlaneGeometry(0.4, 0.18), 0xf2fff6, -0.04, 0.59);
    ornament(
      mesh,
      new THREE.PlaneGeometry(0.12, 0.04),
      0xec5656,
      -0.04,
      0.59,
      0.2,
    );
    ornament(
      mesh,
      new THREE.PlaneGeometry(0.04, 0.12),
      0xec5656,
      -0.04,
      0.59,
      0.21,
    );
  }
  if (type === "runner")
    ornament(mesh, new THREE.PlaneGeometry(0.36, 0.07), 0xff6156, -0.04, 0.48);
  if (type === "giant") {
    const club = ornament(
      mesh,
      new THREE.PlaneGeometry(0.15, 0.9),
      0x8b6952,
      0.42,
      -0.1,
    );
    club.rotation.z = -0.4;
  }
}
function addHealthBar(entity, y) {
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x28352a, depthTest: false }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.61, 0.035),
    new THREE.MeshBasicMaterial({ color: 0x9fea70, depthTest: false }),
  );
  back.position.set(0, y, 0.15);
  fill.position.z = 0.01;
  back.add(fill);
  entity.mesh.add(back);
  entity.healthBar = fill;
}
function updateHealthBar(entity) {
  const ratio = Math.max(0, entity.hp / entity.maxHp);
  entity.healthBar.scale.x = ratio;
  entity.healthBar.position.x = -0.305 * (1 - ratio);
  entity.healthBar.material.color.set(ratio < 0.3 ? 0xff7062 : 0x9fea70);
}
function lightningBolt(x1, y1, x2, y2) {
  const points = [
    new THREE.Vector3(x1, y1, 1.4),
    new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2 + 0.25, 1.4),
    new THREE.Vector3(x2, y2, 1.4),
  ];
  const mesh = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xd8bbff, transparent: true }),
  );
  groups.effects.add(mesh);
  state.floatingTexts.push({ mesh, life: 0.25, vy: 0 });
}

function plane(texture, width, height, transparent = true) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent,
      depthWrite: !transparent,
      alphaTest: transparent ? 0.02 : 0,
    }),
  );
}

function spritePlane(texture, width, height) {
  const mesh = plane(texture, width, height, true);
  mesh.userData.baseScaleX = 1;
  mesh.userData.baseScaleY = 1;
  return mesh;
}

function cellToWorld(row, col) {
  return {
    x: board.xMin + board.cellW * (col + 0.5),
    y: board.yMax - board.cellH * (row + 0.5),
  };
}

function rowDepth(row) {
  return 0.02 + row * 0.08;
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeMesh(child);
  }
}

function disposeMesh(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        if (child.material.map?.userData.owned) child.material.map.dispose();
        child.material.dispose();
      }
    }
  });
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  renderer.setSize(width, height, false);
  const aspect = width / height;
  // Fit the playable lawn, mowers and enemy entrance instead of the decorative
  // 16 × 9 background. Preserve aspect ratio and all planting cells on resize.
  const viewHeight = Math.max(7.2, 13.6 / aspect);
  const viewWidth = viewHeight * aspect;
  camera.left = 0.4 - viewWidth / 2;
  camera.right = 0.4 + viewWidth / 2;
  camera.top = 0.05 + viewHeight / 2;
  camera.bottom = 0.05 - viewHeight / 2;
  camera.updateProjectionMatrix();
}

function getSunMeterWorldPosition() {
  const rect = ui.sunMeter.getBoundingClientRect();
  return screenToWorld(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
    2.2,
  );
}

function screenToWorld(clientX, clientY, z = 0) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  return new THREE.Vector3(ndcX, ndcY, 0).unproject(camera).setZ(z);
}

function render() {
  renderer.render(scene, camera);
}
