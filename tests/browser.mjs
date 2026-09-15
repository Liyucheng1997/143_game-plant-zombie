import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
  args: ["--enable-webgl", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const errors = [];
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
// Test-only instrumentation: no debug controls are shipped to players.
await page.route("**/src/main.js*", async (route) => {
  const response = await route.fetch();
  const source = await response.text();
  await route.fulfill({
    response,
    body:
      source +
      "\nwindow.testGame = { state, plantAt, resetGame, update, spawnZombie, killZombie, useTool, endGame, syncUi, render, camera, renderer, board, cellToWorld, getProgress: () => progress, setProgress: p => { progress = sanitizeProgress(p); }, stop: () => renderer.setAnimationLoop(null) };",
  });
});
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.waitForFunction(() => Boolean(window.testGame));
  await page.evaluate(() => window.testGame.stop());
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/campaign.png" });
  assert.equal(await page.locator(".level-card:disabled").count(), 5);
  assert.equal(await page.locator(".seed-card").count(), 9);
  assert.equal(await page.locator(".enemy-entry").count(), 6);
  await page.locator('[data-level="1"]').click();
  const cell = async (row, col) =>
    page.evaluate(
      ({ row, col }) => {
        const g = window.testGame;
        const p = g.cellToWorld(row, col);
        const r = document.querySelector("#game").getBoundingClientRect();
        return {
          x:
            r.left +
            ((p.x - g.camera.left) / (g.camera.right - g.camera.left)) *
              r.width,
          y:
            r.top +
            ((g.camera.top - p.y) / (g.camera.top - g.camera.bottom)) *
              r.height,
        };
      },
      { row, col },
    );
  // Actual pointer planting and upgrade controls.
  await page.locator('[data-plant="shooter"]').click();
  const pos = await cell(2, 1);
  await page.mouse.click(pos.x, pos.y);
  assert.equal(
    await page.evaluate(() => window.testGame.state.plants.length),
    1,
  );
  await page.locator('[data-mode="upgrade"]').click();
  await page.mouse.click(pos.x, pos.y);
  assert.equal(
    await page.evaluate(() => window.testGame.state.plants[0].level),
    2,
  );
  await page.locator("#pause-button").click();
  const pausedSun = await page.evaluate(() => window.testGame.state.sun);
  await page.mouse.click(pos.x, pos.y);
  assert.equal(await page.evaluate(() => window.testGame.state.sun), pausedSun);
  await page.locator("#pause-button").click();
  await page.locator('[data-mode="shovel"]').click();
  await page.mouse.click(pos.x, pos.y);
  assert.equal(
    await page.evaluate(() => window.testGame.state.plants.length),
    0,
  );
  // Simulate normal game ticks: starter defense can clear the introductory stage.
  const firstLevel = await page.evaluate(() => {
    const g = window.testGame;
    g.resetGame();
    for (let row = 0; row < 5; row++) g.plantAt(row, 1, "shooter");
    g.plantAt(2, 0, "sunflower");
    for (let tick = 0; tick < 12000 && !g.state.ended; tick++) g.update(0.05);
    return {
      ended: g.state.ended,
      won: g.state.won,
      progress: g.getProgress(),
      kills: g.state.totalKilled,
    };
  });
  assert.equal(firstLevel.won, true, JSON.stringify(firstLevel));
  assert.equal(firstLevel.kills, 10);
  assert.equal(firstLevel.progress.unlocked, 2);
  await page.locator("#message-restart").click();
  assert.equal(await page.evaluate(() => window.testGame.state.level), 2);
  assert.equal(
    await page.locator('[data-plant="repeater"]').isDisabled(),
    false,
  );
  const mechanics = await page.evaluate(() => {
    const g = window.testGame;
    g.setProgress({ stars: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 } });
    g.state.level = 6;
    g.resetGame();
    g.state.sun = 10000;
    const spawnAt = (row, col) => {
      g.spawnZombie();
      const z = g.state.zombies.at(-1);
      const p = g.cellToWorld(row, col);
      z.row = row;
      z.x = p.x;
      z.baseY = p.y;
      z.mesh.position.set(p.x, p.y, 0.4);
      return z;
    };
    g.plantAt(0, 0, "ice");
    const cold = spawnAt(0, 3);
    for (let i = 0; i < 40; i++) g.update(0.05);
    const slowed = cold.slowTimer > 0;
    g.resetGame();
    g.state.sun = 10000;
    const bombTarget = spawnAt(2, 4);
    g.plantAt(2, 4, "bomb");
    for (let i = 0; i < 22; i++) g.update(0.05);
    const bombKilled = !g.state.zombies.includes(bombTarget);
    g.plantAt(1, 1, "bomb");
    const bombCooldown = g.state.grid[1][1] === null;
    g.resetGame();
    g.state.sun = 10000;
    const spikeTarget = spawnAt(1, 4);
    g.plantAt(1, 4, "spike");
    const before = spikeTarget.hp;
    for (let i = 0; i < 15; i++) g.update(0.05);
    const spikeWorks =
      spikeTarget.hp < before &&
      g.state.grid[1][4].hp === 500 &&
      spikeTarget.x < g.cellToWorld(1, 4).x;
    g.resetGame();
    g.state.sun = 10000;
    const supportTarget = spawnAt(3, 6);
    g.state.mode = "support";
    g.useTool(3, 0);
    const supportWorks =
      !g.state.zombies.includes(supportTarget) &&
      g.state.supportCooldown === 40;
    g.resetGame();
    g.state.sun = 10000;
    const splashA = spawnAt(2, 3);
    const splashB = spawnAt(1, 3);
    const splashBefore = splashB.hp;
    g.plantAt(2, 0, "cannon");
    for (let i = 0; i < 35; i++) g.update(0.05);
    const splashWorks = splashB.hp < splashBefore && splashA.hp < splashA.maxHp;
    g.resetGame();
    g.state.sun = 10000;
    const chainA = spawnAt(2, 3);
    const chainB = spawnAt(1, 3);
    const chainC = spawnAt(3, 3);
    g.plantAt(2, 0, "lightning");
    for (let i = 0; i < 12; i++) g.update(0.05);
    const chainWorks = [chainA, chainB, chainC].every((z) => z.hp < z.maxHp);
    g.resetGame();
    g.state.sun = 10000;
    spawnAt(0, 5);
    g.plantAt(0, 0, "repeater");
    for (let i = 0; i < 12; i++) g.update(0.05);
    const doubleShot = g.state.peas.length === 2;
    g.resetGame();
    const friend = spawnAt(2, 4);
    friend.hp -= 70;
    g.state.spawned = 3;
    const healer = spawnAt(2, 5);
    healer.healTimer = 0.01;
    const friendHp = friend.hp;
    g.update(0.05);
    const healingWorks =
      healer.type === "healer" && friend.hp === friendHp + 25;
    g.resetGame();
    const startingSun = g.state.sun;
    for (let i = 0; i < 230; i++) g.update(0.05);
    const autoSun = g.state.sun > startingSun;
    g.resetGame();
    const mowerTarget = spawnAt(2, 0);
    mowerTarget.x = -5.6;
    mowerTarget.mesh.position.x = -5.6;
    g.update(0.05);
    const mowerRescue =
      !g.state.ended &&
      g.state.mowers[2].used &&
      !g.state.zombies.includes(mowerTarget);
    const breach = spawnAt(2, 0);
    breach.x = -6.8;
    breach.mesh.position.x = -6.8;
    g.update(0.05);
    const defeatWorks = g.state.ended && !g.state.won;
    return {
      slowed,
      bombKilled,
      bombCooldown,
      spikeWorks,
      supportWorks,
      splashWorks,
      chainWorks,
      doubleShot,
      healingWorks,
      autoSun,
      mowerRescue,
      defeatWorks,
    };
  });
  for (const [name, works] of Object.entries(mechanics))
    assert.equal(works, true, name);
  // Clear every configured wave, verify quota exhaustion and final boss spawn.
  const campaign = await page.evaluate(() => {
    const g = window.testGame;
    const results = [];
    for (let level = 1; level <= 6; level++) {
      g.state.level = level;
      g.resetGame();
      let giant = false;
      for (let tick = 0; tick < 20000 && !g.state.ended; tick++) {
        g.update(0.05);
        for (const z of [...g.state.zombies]) {
          if (z.type === "giant") giant = true;
          g.killZombie(z);
        }
      }
      results.push({ level, won: g.state.won, giant });
    }
    return results;
  });
  assert.ok(
    campaign.every((result) => result.won),
    JSON.stringify(campaign),
  );
  assert.equal(campaign[5].giant, true);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.testGame));
  await page.evaluate(() => window.testGame.stop());
  assert.equal(await page.locator(".level-card:disabled").count(), 0);
  await page.locator('[data-level="6"]').click();
  await page.evaluate(() => {
    const g = window.testGame;
    g.state.sun = 10000;
    [
      "sunflower",
      "shooter",
      "ice",
      "repeater",
      "cannon",
      "lightning",
      "spike",
      "wallnut",
    ].forEach((type, i) => g.plantAt(i % 5, Math.floor(i / 5) + 1, type));
    for (let i = 0; i < 6; i++) {
      g.state.spawned = i;
      g.spawnZombie();
      const z = g.state.zombies.at(-1);
      z.x = 3.5 + (i % 3) * 0.6;
      z.mesh.position.x = z.x;
    }
    g.state.spawned = 0;
    g.syncUi();
    g.render();
  });
  await page.screenshot({ path: "test-results/battlefield.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#map-button").click();
  await page.screenshot({ path: "test-results/mobile-map.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator('[data-level="1"]').click();
  const mobileBounds = await page.locator("#game").boundingBox();
  assert.ok(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 390);
  await page.evaluate(() => window.testGame.render());
  await page.screenshot({ path: "test-results/mobile-battle.png" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      { firstLevel, mechanics, campaign, browserErrors: errors },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
