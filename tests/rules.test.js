import test from "node:test";
import assert from "node:assert/strict";
import {
  freshProgress,
  sanitizeProgress,
  awardVictory,
  rankInfo,
  levels,
  waveCount,
  enemyForSpawn,
  plantTypes,
  zombieTypes,
} from "../src/rules.js";

test("campaign has finite waves and a single final boss", () => {
  let bosses = 0;
  levels.forEach((level, index) => {
    for (let wave = 1; wave <= level.waves; wave++) {
      const count = waveCount(index + 1, wave);
      assert.ok(count >= 4 && count <= 14);
      for (let spawn = 0; spawn < count; spawn++) {
        const type = enemyForSpawn(index + 1, wave, spawn);
        assert.ok(zombieTypes[type]);
        if (type === "giant") {
          bosses++;
          assert.equal(index, 5);
          assert.equal(wave, 4);
          assert.equal(spawn, count - 1);
        }
      }
    }
  });
  assert.equal(bosses, 1);
});

test("stars unlock stages and replay rewards cannot be farmed", () => {
  let progress = awardVictory(freshProgress(), 1, 3);
  assert.equal(progress.unlocked, 2);
  assert.equal(rankInfo(progress).xp, 40);
  progress = awardVictory(progress, 1, 0);
  assert.equal(rankInfo(progress).xp, 120);
  assert.deepEqual(awardVictory(progress, 1, 5), progress);
  assert.deepEqual(awardVictory(progress, 1, 0), progress);
  progress = awardVictory(progress, 2, 1);
  assert.equal(rankInfo(progress).rank, 1);
  assert.equal(rankInfo(progress).bonusSun, 25);
});

test("malformed storage cannot skip campaign or create invalid stats", () => {
  for (const value of [
    null,
    [],
    123,
    "oops",
    { unlocked: 99 },
    { stars: { 1: -3 } },
    { stars: { 1: "3" } },
  ]) {
    assert.deepEqual(sanitizeProgress(value), freshProgress());
  }
  assert.deepEqual(
    sanitizeProgress({ stars: { 1: 2, 3: 3 }, difficulty: "standard" }),
    { unlocked: 2, stars: { 1: 2 }, difficulty: "standard" },
  );
});

test("full campaign reaches top rank with all cards unlocked", () => {
  let progress = freshProgress();
  for (let level = 1; level <= levels.length; level++)
    progress = awardVictory(progress, level, 0);
  assert.equal(progress.unlocked, 6);
  assert.equal(rankInfo(progress).rank, 4);
  assert.equal(rankInfo(progress).xp, 720);
  assert.equal(Object.keys(plantTypes).length, 9);
  assert.ok(
    Object.values(plantTypes).every((p) => p.unlock <= progress.unlocked),
  );
});
