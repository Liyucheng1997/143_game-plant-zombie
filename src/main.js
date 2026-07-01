import * as THREE from "three";
import "./styles.css";

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

const texturePaths = {
  board: "/assets/lawn-board.png",
  shooter: "/assets/sprites/pea-shooter.png",
  sunflower: "/assets/sprites/sunflower.png",
  wallnut: "/assets/sprites/wallnut.png",
  zombie: "/assets/sprites/zombie.png",
};

const plantTypes = {
  shooter: {
    name: "豌豆射手",
    cost: 100,
    hp: 300,
    cooldown: 1.45,
    damage: 28,
    scale: [0.86, 0.86],
    yOffset: 0.07,
  },
  sunflower: {
    name: "向日花",
    cost: 50,
    hp: 240,
    sunInterval: 8.5,
    scale: [0.8, 0.8],
    yOffset: 0.06,
  },
  wallnut: {
    name: "坚果墙",
    cost: 50,
    hp: 980,
    scale: [0.86, 0.86],
    yOffset: 0.02,
  },
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
  sun: 150,
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
resize();
window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", cancelDrag);

ui.seedCards.forEach((card) => {
  card.addEventListener("pointerdown", onSeedPointerDown);
  card.addEventListener("click", () => {
    if (state.ended) return;
    state.selected = card.dataset.plant;
    syncUi();
  });
});

ui.pauseButton.addEventListener("click", () => {
  if (state.ended) return;
  state.paused = !state.paused;
  syncUi();
});
ui.restartButton.addEventListener("click", resetGame);
ui.messageRestart.addEventListener("click", resetGame);

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
  clearGroup(groups.actors);
  clearGroup(groups.effects);
  state.sun = 150;
  state.selected = "shooter";
  state.wave = 1;
  state.spawnTimer = 2.2;
  state.waveTimer = 0;
  state.backgroundSunTimer = 3.8;
  state.gameTime = 0;
  state.paused = false;
  state.ended = false;
  state.grid = Array.from({ length: board.rows }, () => Array(board.cols).fill(null));
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
  state.waveTimer += dt;
  state.spawnTimer -= dt;
  state.backgroundSunTimer -= dt;

  if (state.waveTimer > 28) {
    state.wave += 1;
    state.waveTimer = 0;
  }

  if (state.spawnTimer <= 0) {
    spawnZombie();
    const pressure = Math.max(0, state.wave - 1) * 0.18;
    state.spawnTimer = Math.max(1.15, 4.1 - pressure - Math.random() * 1.3);
  }

  if (state.backgroundSunTimer <= 0) {
    dropSun(-3.7 + Math.random() * 8.3, 3.1, 1.0 + Math.random() * 4.8);
    state.backgroundSunTimer = 8 + Math.random() * 5;
  }

  updatePlants(dt);
  updatePeas(dt);
  updateZombies(dt);
  updateSuns(dt);
  updateMowers(dt);
  updateFloatingText(dt);

  if (state.wave >= 8 && state.zombies.length === 0 && state.gameTime > 170) {
    endGame(true);
  }
  syncUi();
}

function updatePlants(dt) {
  for (const plant of [...state.plants]) {
    plant.mesh.position.y = plant.baseY + Math.sin(state.gameTime * 2.3 + plant.row) * 0.025;

    if (plant.type === "shooter") {
      plant.cooldown -= dt;
      const target = state.zombies.some(
        (zombie) => zombie.row === plant.row && zombie.x > plant.x && zombie.hp > 0,
      );
      if (target && plant.cooldown <= 0) {
        shootPea(plant);
        plant.cooldown = plantTypes.shooter.cooldown;
      }
    }

    if (plant.type === "sunflower") {
      plant.sunTimer -= dt;
      if (plant.sunTimer <= 0) {
        dropSun(plant.x + 0.1, plant.baseY + 0.45, plant.baseY - 0.1);
        plant.sunTimer = plantTypes.sunflower.sunInterval;
      }
    }
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
      hit.hp -= pea.damage;
      burst(pea.x, pea.y, 0x97e643);
      removeEntity(state.peas, pea, groups.effects);
      if (hit.hp <= 0) {
        killZombie(hit);
      }
      continue;
    }

    if (pea.x > 7.2) {
      removeEntity(state.peas, pea, groups.effects);
    }
  }
}

function updateZombies(dt) {
  for (const zombie of [...state.zombies]) {
    const blocker = state.plants.find(
      (plant) =>
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
      zombie.x -= zombie.speed * dt;
      zombie.mesh.position.x = zombie.x;
      zombie.mesh.position.y = zombie.baseY + Math.sin(state.gameTime * 5 + zombie.row) * 0.035;
    }

    if (zombie.x < -5.55) {
      const mower = state.mowers.find((item) => item.row === zombie.row && !item.used);
      if (mower) {
        mower.active = true;
        mower.used = true;
      } else {
        endGame(false);
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
    if (sun.life <= 0) {
      removeEntity(state.suns, sun, groups.effects);
    }
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
      groups.actors.remove(mower.mesh);
      disposeMesh(mower.mesh);
    }
  }
}

function updateFloatingText(dt) {
  for (const item of [...state.floatingTexts]) {
    item.life -= dt;
    item.mesh.position.y += dt * 0.38;
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
  plantAt(cell.row, cell.col);
}

function onSeedPointerDown(event) {
  if (state.paused || state.ended || event.button !== 0) return;
  const card = event.currentTarget;
  const type = card.dataset.plant;
  state.selected = type;
  syncUi();

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
  return raycaster.intersectObjects([...groups.effects.children, ...groups.overlays.children], true);
}

function pickCellAt(clientX, clientY) {
  const topElement = document.elementFromPoint(clientX, clientY);
  if (topElement?.closest(".seed-tray, .topbar, .message")) {
    return null;
  }
  const hit = pickAt(clientX, clientY);
  return hit.find((item) => item.object.userData.isCell)?.object.userData ?? null;
}

function canPlantAt(row, col, type) {
  const definition = plantTypes[type];
  return Boolean(definition && !state.grid[row][col] && state.sun >= definition.cost);
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
    marker.material.color.set(marker.userData.row % 2 === marker.userData.col % 2 ? 0xf8ffb2 : 0xb8f06a);
    marker.userData.highlighted = false;
  }
}

function plantAt(row, col, type = state.selected) {
  const definition = plantTypes[type];
  if (!definition || state.grid[row][col]) return;
  if (state.sun < definition.cost) {
    const pos = cellToWorld(row, col);
    floatingText("阳光不足", pos.x, pos.y + 0.45, "#ffef9a");
    return;
  }

  state.sun -= definition.cost;
  const pos = cellToWorld(row, col);
  const mesh = spritePlane(textures[type], definition.scale[0], definition.scale[1]);
  mesh.position.set(pos.x, pos.y + definition.yOffset, rowDepth(row));
  mesh.userData.plant = true;
  const plant = {
    type,
    row,
    col,
    x: pos.x,
    baseY: pos.y + definition.yOffset,
    hp: definition.hp,
    cooldown: 0.55,
    sunTimer: 4.5 + Math.random() * 2.5,
    mesh,
  };
  state.grid[row][col] = plant;
  state.plants.push(plant);
  groups.actors.add(mesh);
  pop(mesh);
  syncUi();
}

function spawnZombie() {
  const row = Math.floor(Math.random() * board.rows);
  const pos = cellToWorld(row, board.cols - 1);
  const mesh = spritePlane(textures.zombie, 0.92, 1.36);
  const x = 6.7 + Math.random() * 0.6;
  mesh.position.set(x, pos.y + 0.12, rowDepth(row) + 0.04);
  const zombie = {
    row,
    x,
    baseY: pos.y + 0.12,
    hp: 150 + state.wave * 28,
    speed: 0.19 + state.wave * 0.011 + Math.random() * 0.03,
    damage: 34 + state.wave * 2,
    eatTimer: 0.25,
    mesh,
  };
  state.zombies.push(zombie);
  groups.actors.add(mesh);
}

function shootPea(plant) {
  const geometry = new THREE.CircleGeometry(0.115, 24);
  const material = new THREE.MeshBasicMaterial({ color: 0x93d72e });
  const mesh = new THREE.Mesh(geometry, material);
  const pea = {
    row: plant.row,
    x: plant.x + 0.44,
    y: plant.baseY + 0.18,
    speed: 3.15,
    damage: plantTypes.shooter.damage,
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
    new THREE.MeshBasicMaterial({ color: 0xffa51d, transparent: true, opacity: 0.82 }),
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
  const wheelA = new THREE.Mesh(new THREE.CircleGeometry(0.08, 18), wheelMaterial);
  const wheelB = new THREE.Mesh(new THREE.CircleGeometry(0.08, 18), wheelMaterial);
  handle.position.set(-0.16, 0.24, 0.01);
  handle.rotation.z = -0.45;
  wheelA.position.set(-0.15, -0.17, 0.02);
  wheelB.position.set(0.15, -0.17, 0.02);
  group.add(body, handle, wheelA, wheelB);
  group.position.set(board.xMin - 0.56, pos.y - 0.28, rowDepth(row) + 0.2);
  return { row, x: group.position.x, active: false, used: false, mesh: group };
}

function killZombie(zombie) {
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
  mesh.material.color.set(0xffa199);
  window.setTimeout(() => {
    if (mesh.material) mesh.material.color.set(0xffffff);
  }, 80);
}

function pop(mesh) {
  mesh.scale.multiplyScalar(0.78);
  const start = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / 140);
    const s = 0.78 + Math.sin(t * Math.PI * 0.5) * 0.22;
    mesh.scale.set(mesh.userData.baseScaleX * s, mesh.userData.baseScaleY * s, 1);
    if (t < 1 && mesh.parent) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function endGame(won) {
  state.ended = true;
  ui.messageTitle.textContent = won ? "花园守住了" : "防线被突破";
  ui.messageCopy.textContent = won
    ? "你顶住了最后一波进攻。可以重开挑战更高效率的阵型。"
    : "有敌人越过了草坪。调整前排坚果和射手布局再试一次。";
  ui.message.classList.remove("hidden");
  syncUi();
}

function syncUi() {
  ui.sun.textContent = state.sun;
  ui.wave.textContent = state.wave;
  ui.pauseIcon.textContent = state.paused ? "▶" : "II";
  ui.seedCards.forEach((card) => {
    const type = card.dataset.plant;
    card.classList.toggle("selected", type === state.selected);
    card.classList.toggle("disabled", state.sun < plantTypes[type].cost);
  });
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
        child.material.dispose();
      }
    }
  });
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  const viewHeight = 9;
  const viewWidth = viewHeight * (width / height);
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}

function getSunMeterWorldPosition() {
  const rect = ui.sunMeter.getBoundingClientRect();
  return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, 2.2);
}

function screenToWorld(clientX, clientY, z = 0) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  return new THREE.Vector3(ndcX, ndcY, 0).unproject(camera).setZ(z);
}

function render() {
  for (const item of state.floatingTexts) {
    if ("vx" in item) {
      item.mesh.position.x += item.vx * 0.016;
      item.mesh.position.y += item.vy * 0.016;
      item.mesh.material.opacity *= 0.965;
    }
  }
  renderer.render(scene, camera);
}
