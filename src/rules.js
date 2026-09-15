export const plantTypes = {
  sunflower: {
    name: "向日花",
    icon: "☀",
    cost: 50,
    hp: 260,
    sunInterval: 7,
    unlock: 1,
    sprite: "sunflower",
    color: 0xffffff,
    tip: "每 7 秒生产 25 阳光",
  },
  shooter: {
    name: "豌豆射手",
    icon: "●",
    cost: 75,
    hp: 320,
    cooldown: 1.25,
    damage: 35,
    unlock: 1,
    sprite: "shooter",
    color: 0xffffff,
    tip: "低成本的单行持续火力",
  },
  wallnut: {
    name: "坚果墙",
    icon: "▣",
    cost: 50,
    hp: 1500,
    unlock: 1,
    sprite: "wallnut",
    color: 0xffffff,
    tip: "高生命前排，升级会完全修复",
  },
  ice: {
    name: "寒冰射手",
    icon: "❄",
    cost: 125,
    hp: 300,
    cooldown: 1.65,
    damage: 28,
    slow: 3,
    unlock: 1,
    sprite: "shooter",
    color: 0x80dfff,
    tip: "命中后减速 55%，持续 3 秒",
  },
  bomb: {
    name: "爆裂樱桃",
    icon: "✹",
    cost: 100,
    hp: 300,
    damage: 650,
    recharge: 18,
    unlock: 1,
    sprite: "sunflower",
    color: 0xff7070,
    tip: "种下 1 秒后炸击周围九宫格；冷却 18 秒",
  },
  repeater: {
    name: "双发射手",
    icon: "••",
    cost: 150,
    hp: 340,
    cooldown: 1.25,
    damage: 32,
    shots: 2,
    unlock: 2,
    sprite: "shooter",
    color: 0xd6ffa1,
    tip: "同时射出两颗豌豆，集中压制",
  },
  spike: {
    name: "钢刺地毯",
    icon: "▲",
    cost: 100,
    hp: 500,
    cooldown: 0.7,
    damage: 32,
    unlock: 3,
    sprite: "wallnut",
    color: 0xb5cad4,
    tip: "无法被啃食，持续伤害经过的敌人",
  },
  cannon: {
    name: "西瓜重炮",
    icon: "◉",
    cost: 200,
    hp: 380,
    cooldown: 2.7,
    damage: 100,
    splash: 1.4,
    unlock: 4,
    sprite: "shooter",
    color: 0xffc56b,
    tip: "炮弹爆炸，波及相邻行敌人",
  },
  lightning: {
    name: "雷电花",
    icon: "ϟ",
    cost: 200,
    hp: 300,
    cooldown: 2,
    damage: 65,
    chain: 3,
    unlock: 5,
    sprite: "sunflower",
    color: 0xc8a0ff,
    tip: "电击本行目标，连锁附近最多 3 个敌人",
  },
};

export const zombieTypes = {
  basic: {
    name: "普通僵尸",
    mark: "",
    hp: 150,
    speed: 0.17,
    damage: 24,
    color: 0xffffff,
    reward: 5,
    tip: "移动缓慢，基础射手即可应对",
  },
  cone: {
    name: "路障僵尸",
    mark: "▲",
    hp: 310,
    speed: 0.16,
    damage: 28,
    color: 0xffc58b,
    reward: 10,
    tip: "额外护甲，用双发火力处理",
  },
  runner: {
    name: "疾跑僵尸",
    mark: "»",
    hp: 130,
    speed: 0.34,
    damage: 22,
    color: 0xffa4a4,
    reward: 10,
    tip: "速度快，用寒冰减速和坚果拦截",
  },
  bucket: {
    name: "铁桶僵尸",
    mark: "▣",
    hp: 550,
    speed: 0.14,
    damage: 32,
    color: 0xb4c9e2,
    reward: 15,
    tip: "重甲耐打，集中火力或用爆炸解决",
  },
  healer: {
    name: "医师僵尸",
    mark: "+",
    hp: 260,
    speed: 0.16,
    damage: 20,
    color: 0xb1ffe0,
    reward: 15,
    tip: "每 4 秒治疗周围同伴 25 生命，范围攻击可同时压制",
  },
  giant: {
    name: "巨人僵尸",
    mark: "★",
    hp: 1250,
    speed: 0.105,
    damage: 85,
    color: 0xd5adf7,
    reward: 35,
    tip: "首领：高生命和破墙伤害，减速配合重炮",
  },
};

export const levels = [
  {
    name: "晨光小院",
    subtitle: "熟悉种植，建立第一道防线",
    waves: 2,
    count: 4,
    interval: 6.5,
    sun: 450,
    types: ["basic"],
    rows: [2, 1, 3, 2, 0, 4],
  },
  {
    name: "路障来客",
    subtitle: "双发射手加入，击穿路障护甲",
    waves: 3,
    count: 5,
    interval: 6,
    sun: 450,
    types: ["basic", "cone"],
    rows: [2, 1, 3, 0, 4],
  },
  {
    name: "疾风小径",
    subtitle: "用寒冰与钢刺地毯阻止疾跑者",
    waves: 3,
    count: 6,
    interval: 5.5,
    sun: 475,
    types: ["basic", "runner", "cone"],
    rows: [1, 3, 2, 0, 4],
  },
  {
    name: "铁桶围城",
    subtitle: "西瓜重炮登场，建立范围火力",
    waves: 3,
    count: 7,
    interval: 5,
    sun: 500,
    types: ["basic", "bucket", "cone", "runner"],
    rows: [2, 0, 4, 1, 3],
  },
  {
    name: "雷雨花园",
    subtitle: "医师加入敌阵，用闪电瓦解集群",
    waves: 4,
    count: 7,
    interval: 4.8,
    sun: 525,
    types: ["cone", "healer", "runner", "bucket"],
    rows: [0, 4, 2, 1, 3],
  },
  {
    name: "最后的守望",
    subtitle: "组合全部武器，迎战最后一波巨人",
    waves: 4,
    count: 8,
    interval: 4.5,
    sun: 550,
    types: ["basic", "bucket", "runner", "healer", "cone"],
    rows: [2, 1, 3, 0, 4],
  },
];

export const difficulties = {
  relaxed: { name: "休闲", hp: 0.8, speed: 0.85, sun: 100, preparation: 25 },
  standard: { name: "标准", hp: 1, speed: 1, sun: 0, preparation: 20 },
};
export const ranks = [
  "见习园丁",
  "花园守卫",
  "防线专家",
  "植物大师",
  "花园传奇",
];
export const freshProgress = () => ({
  unlocked: 1,
  stars: {},
  difficulty: "relaxed",
});
export function sanitizeProgress(value) {
  const result = freshProgress();
  if (!value || typeof value !== "object") return result;
  if (difficulties[value.difficulty]) result.difficulty = value.difficulty;
  // Unlocks are derived from consecutive wins, never from untrusted stored counts.
  for (let i = 1; i <= levels.length; i++) {
    const stars = value.stars?.[i];
    if (!Number.isInteger(stars) || stars < 1 || stars > 3) break;
    result.stars[i] = stars;
    result.unlocked = Math.min(levels.length, i + 1);
  }
  return result;
}
export function rankInfo(progress) {
  const xp = Object.values(progress.stars).reduce(
    (sum, stars) => sum + stars * 40,
    0,
  );
  const rank = Math.min(ranks.length - 1, Math.floor(xp / 160));
  return {
    xp,
    rank,
    name: ranks[rank],
    bonusSun: rank * 25,
    damageMultiplier: 1 + rank * 0.05,
  };
}
export function awardVictory(progress, level, usedMowers) {
  const stars = usedMowers === 0 ? 3 : usedMowers <= 2 ? 2 : 1;
  return sanitizeProgress({
    ...progress,
    stars: {
      ...progress.stars,
      [level]: Math.max(progress.stars[level] || 0, stars),
    },
  });
}
export function waveCount(level, wave) {
  return levels[level - 1].count + (wave - 1) * 2;
}
export function enemyForSpawn(level, wave, index) {
  if (
    level === 6 &&
    wave === levels[5].waves &&
    index === waveCount(level, wave) - 1
  )
    return "giant";
  const types = levels[level - 1].types;
  return types[(index + wave - 1) % types.length];
}
export function upgradeCost(plant) {
  return Math.round((plantTypes[plant.type].cost * 0.6 * plant.level) / 5) * 5;
}
export function plantPower(plant) {
  return 1 + (plant.level - 1) * 0.45;
}
