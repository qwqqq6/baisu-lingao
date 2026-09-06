// 引擎测试用例（框架无关）：由 tests/node/engine.test.mjs 与 tests/index.html 两个运行器加载。
// 约定：registerTests(t) 中 t(name, fn)，fn 抛错即视为失败。

// 断言垫片：Node 与浏览器都能跑
const assert = {
  equal(actual, expected, msg) {
    const ok = typeof expected === "object" && expected !== null
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : actual === expected;
    if (!ok) throw new Error(msg || `断言失败：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  },
  notEqual(actual, unexpected, msg) {
    if (actual === unexpected) throw new Error(msg || `断言失败：两值不应相等（${JSON.stringify(actual)}）`);
  },
  ok(value, msg) {
    if (!value) throw new Error(msg || "断言失败：期望真值");
  },
  deepEqual(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg || `断言失败：${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  },
};

import { StateManager, matchesWithContext, weightedPick } from "../src/engine/state.js";
import { applyEffects, checkCollapse } from "../src/engine/effects.js";
import { ForcesManager } from "../src/engine/forces.js";
import { CharacterManager } from "../src/engine/character.js";
import { availableSeries, pickCardInSeries, applyVariants, buildDrawContext } from "../src/engine/draw.js";
import { Game } from "../src/app/game.js";
import { makeFixture } from "./fixture.mjs";

function freshGame() {
  const game = new Game(makeFixture());
  game.newGame("wunanhai");
  game.nextTurn(); // 呈现第一张卡（开局贺表）
  return game;
}

export function registerTests(t) {
  // ---------- StateManager ----------
  t("状态：counter 按 min/max 裁剪", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    s.set("core.pillar.people", 120);
    assert.equal(s.get("core.pillar.people"), 100);
    s.apply({ id: "core.pillar.people", op: "subtract", value: 150 });
    assert.equal(s.get("core.pillar.people"), 0);
  });

  t("状态：immutable 只能从默认值推进一次", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    assert.equal(s.set("contact.locals", true), true);
    assert.equal(s.set("contact.locals", false), false, "不可回滚");
    assert.equal(s.get("contact.locals"), true);
  });

  t("状态：terminal 只能触发一次", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    assert.equal(s.set("character.wunanhai.dead", true), true);
    assert.equal(s.set("character.wunanhai.dead", false), false);
    assert.equal(s.get("character.wunanhai.dead"), true);
  });

  t("状态：enum 非法值回落默认，set 去重", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    s.set("ruler.current", "谁也不是");
    assert.equal(s.get("ruler.current"), "none", "非法枚举回落默认");
    s.apply({ id: "history.former_rulers", op: "addToSet", value: "wunanhai" });
    s.apply({ id: "history.former_rulers", op: "addToSet", value: "wunanhai" });
    assert.deepEqual(s.get("history.former_rulers"), ["wunanhai"]);
  });

  t("状态：计时器归零自动置空", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    s.apply({ id: "martial_law.timer", op: "startTimer", value: 3 });
    s.tickTimers(2);
    assert.deepEqual(s.get("martial_law.timer"), { remainingDays: 1 });
    s.tickTimers(1);
    assert.equal(s.get("martial_law.timer"), null);
  });

  t("状态：快照/恢复往返一致", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    s.set("core.wind", 33);
    const snap = s.snapshot();
    const s2 = new StateManager();
    s2.loadDefinitions(makeFixture().states);
    s2.restore(snap);
    assert.equal(s2.get("core.wind"), 33);
  });

  // ---------- 条件 ----------
  t("条件：any/all/used/day/force/ruler", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    s.set("ruler.current", "wunanhai");
    s.set("core.pillar.council", 28);
    const forces = new ForcesManager();
    forces.loadDefinitions(makeFixture().forces);
    forces.ensureUnlocked({ state: s, day: 1, usedCards: new Set(), forceMetric: () => 0 });
    const ctx = {
      state: s, day: 12, usedCards: new Set(["X-1"]), forces,
      forceMetric: (id, m) => forces.metric(id, m),
    };
    assert.equal(matchesWithContext({ "any": [{ "state": "core.pillar.council", "lte": 30 }, { "day": { "gte": 999 } }] }, ctx), true);
    assert.equal(matchesWithContext({ "all": [{ "day": { "gte": 10 } }, { "ruler": "wunanhai" }] }, ctx), true);
    assert.equal(matchesWithContext({ "used": "X-1" }, ctx), true);
    assert.equal(matchesWithContext({ "used": "X-2" }, ctx), false);
    assert.equal(matchesWithContext({ "day": { "gte": 10, "lte": 20 } }, ctx), true);
    assert.equal(matchesWithContext({ "force": "council", "metric": "influence", "gte": 40 }, ctx), true);
    assert.equal(matchesWithContext({ "ruler": "wude" }, ctx), false);
  });

  // ---------- 加权随机 ----------
  t("weightedPick：零权重被排除且必返回成员", () => {
    const picked = new Set();
    for (let i = 0; i < 200; i++) {
      const r = weightedPick([{ id: "a", weight: 0 }, { id: "b", weight: 5 }]);
      assert.ok(r, "必须返回一项");
      picked.add(r.id);
    }
    assert.deepEqual([...picked], ["b"]);
  });

  // ---------- 抽卡 ----------
  t("抽卡：强制事件类型不进入常规卡池", () => {
    const fx = makeFixture();
    const s = new StateManager();
    s.loadDefinitions(fx.states);
    const forces = new ForcesManager();
    forces.loadDefinitions(fx.forces);
    const ctx = buildDrawContext({ state: s, forces, day: 1, usedCards: new Set() });
    const runtime = { usedCards: new Set(), recentCards: [], recentSeries: [], seriesStall: {}, forces, characterManager: new CharacterManager() };
    const series = fx.series[0];
    const card = pickCardInSeries(series, fx.cards, ctx, runtime);
    assert.ok(card);
    assert.notEqual(card.type, "downfall", "倒台卡不得从常规池抽出");
    assert.notEqual(card.type, "succession", "继任卡不得从常规池抽出");
    assert.notEqual(card.type, "opening", "开局卡不得从常规池抽出");
  });

  t("抽卡：已消耗卡不再出现；crisis 优先于 daily", () => {
    const fx = makeFixture();
    const s = new StateManager();
    s.loadDefinitions(fx.states);
    s.set("core.pillar.council", 20); // 满足危机卡条件
    const forces = new ForcesManager();
    forces.loadDefinitions(fx.forces);
    const used = new Set(["T-DAILY", "T-KEY", "T-OPEN"]);
    const ctx = buildDrawContext({ state: s, forces, day: 5, usedCards: used });
    const runtime = { usedCards: used, recentCards: [], recentSeries: [], seriesStall: {}, forces, characterManager: new CharacterManager() };
    const series = fx.series[0];
    const card = pickCardInSeries(series, fx.cards, ctx, runtime);
    assert.equal(card.id, "T-CRISIS", "危机卡优先级高于日常");
  });

  t("抽卡：lastCardId 相邻去重", () => {
    const fx = makeFixture();
    const s = new StateManager();
    s.loadDefinitions(fx.states);
    const forces = new ForcesManager();
    forces.loadDefinitions(fx.forces);
    const ctx = buildDrawContext({ state: s, forces, day: 5, usedCards: new Set() });
    const runtime = { usedCards: new Set(), recentCards: [], recentSeries: [], seriesStall: {}, forces, characterManager: new CharacterManager(), lastCardId: "T-DAILY" };
    const series = fx.series[0];
    for (let i = 0; i < 50; i++) {
      const card = pickCardInSeries(series, fx.cards, ctx, runtime);
      assert.ok(card, "必须能抽出卡");
      assert.notEqual(card.id, "T-DAILY", "相邻两张不得重复");
    }
  });

  t("变体：人物变体按 chance/replaceOption 生效", () => {
    const fx = makeFixture();
    const s = new StateManager();
    s.loadDefinitions(fx.states);
    s.set("ruler.current", "wunanhai");
    const cm = new CharacterManager();
    cm.loadDefinitions(fx.characters);
    const ctx = buildDrawContext({ state: s, forces: new ForcesManager(), day: 1, usedCards: new Set() });
    const card = {
      id: "X", pool: "core", series: "politics.council", type: "key", title: "t", text: "x",
      options: { left: { id: "l", label: "左", effects: {} }, right: { id: "r", label: "右", effects: {} } },
      variants: [{ kind: "character", when: { ruler: "wunanhai", chance: 1 }, replaceOption: "left", option: { id: "v", label: "替换", effects: {} } }],
    };
    const { card: resolved, variant } = applyVariants(card, ctx, cm);
    assert.equal(resolved.options.left.id, "v");
    assert.equal(variant.kind, "character");
  });

  // ---------- 效果与崩局 ----------
  t("效果：四柱/风声/压力/势力/天数映射", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    const forces = new ForcesManager();
    forces.loadDefinitions(makeFixture().forces);
    forces.ensureUnlocked({ state: s, day: 1, usedCards: new Set(), forceMetric: () => 0 });
    const result = applyEffects(
      { stats: { people: 3, livelihood: -2 }, wind: 5, personal: { faction_alarm: 4, legitimacy: -2 }, forces: { council: { influence: 7 } }, states: [{ "id": "series.politics_council", "op": "add", "value": 1 }] },
      { state: s, forces },
    );
    assert.equal(result.days, 1);
    assert.equal(s.get("core.pillar.people"), 53);
    assert.equal(s.get("core.pillar.livelihood"), 48);
    assert.equal(s.get("core.wind"), 5);
    assert.equal(s.get("ruler.pressure_faction"), 4);
    assert.equal(s.get("ruler.legitimacy"), 48);
    assert.equal(forces.metric("council", "influence"), 52);
  });

  t("崩局：阈值逐项触发", () => {
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    assert.equal(checkCollapse(s), null);
    s.set("core.pillar.livelihood", 3);
    assert.equal(checkCollapse(s), "livelihood");
    s.set("core.pillar.livelihood", 50);
    s.set("core.wind", 96);
    assert.equal(checkCollapse(s), "wind");
    s.set("core.wind", 0);
    s.set("ruler.legitimacy", 3);
    assert.equal(checkCollapse(s), "legitimacy");
  });

  // ---------- 游戏流程 ----------
  t("流程：开局设执政者、贺表入场、能力冷却", () => {
    const g = freshGame();
    assert.equal(g.rulerId, "wunanhai");
    assert.equal(g.currentCard.id, "T-OPEN");
    assert.equal(g.canUseAbility(), true);
    const ability = g.useAbility();
    assert.ok(ability);
    assert.equal(g.abilityReadyDay, g.day + 10);
    assert.equal(g.canUseAbility(), false);
  });

  t("流程：followup 立即弹出且已消耗卡不重复", () => {
    const g = freshGame();
    g.choose("left"); g.nextTurn(); // 开局卡左 → 关键卡优先级高于日常，应抽出 T-KEY
    assert.equal(g.currentCard.id, "T-KEY");
    g.choose("left"); g.nextTurn(); // 关键卡左 → 下一张应是日常卡（关键已消耗）
    assert.notEqual(g.currentCard.id, "T-KEY");
    assert.equal(g.currentCard.type, "daily");
    // 已消耗卡塞回队列也不会再次出现
    g.usedCards.add("T-KEY");
    g.pendingCards.push("T-KEY");
    g.choose("left"); g.nextTurn();
    assert.notEqual(g.currentCard.id, "T-KEY", "已消耗的链卡不得重复出现");
  });

  t("流程：倒台→结局→继任，强势力转化为架空", () => {
    const g = freshGame();
    // 强势农庄 + 压力到位（农庄已解锁判定走 forces.unlocked）
    g.forces.unlocked.add("farm");
    g.forces.metrics.set("farm", { influence: 70, satisfaction: 70, hostility: 0 });
    g.state.set("ruler.pressure_personal", 60);
    g.choose("left"); g.nextTurn(); // 结算当前卡 → 倒台卡应被强制呈现
    assert.equal(g.currentCard.type, "downfall");
    g.choose("left"); g.nextTurn(); // 去职 → 农庄强势，应转化为架空
    assert.equal(g.rulerId, "wunanhai", "架空时执政者留任");
    assert.equal(g.state.get("character.wunanhai.weakened"), true);
    // 二段压力触发再次倒台 → 真正下台
    g.state.set("ruler.pressure_faction", 65);
    g.choose("left"); g.nextTurn(); // 先结掉手头这张卡
    assert.equal(g.currentCard.type, "downfall", "二次倒台卡应被强制呈现");
    g.choose("left"); g.nextTurn(); // 体面交印
    assert.equal(g.rulerId, "none", "二次倒台后权位空悬");
    assert.ok(g.state.get("history.former_rulers").includes("wunanhai"));
    // 结局卡先于继任
    assert.equal(g.currentCard.type, "epilogue");
    g.choose("left"); g.nextTurn(); // 阅毕
    assert.equal(g.currentCard.type, "succession", "结局放完出现继任卡");
    g.choose("left"); g.nextTurn(); // 接受继任
    assert.notEqual(g.rulerId, "none", "继任完成");
    assert.notEqual(g.rulerId, "wunanhai", "继任者不是前任");
    // 结局反哺继任：前任被软禁——派系警惕减半后 +3，农庄满意度 -5 落在继任开局
    assert.equal(g.state.get("ruler.pressure_faction"), 36, "65 减半 33 + 结局反哺 3");
    assert.equal(g.forces.metric("farm", "satisfaction"), 65, "70 - 结局反哺 5");
  });

  t("流程：崩局即终局", () => {
    const g = freshGame();
    g.state.set("core.pillar.livelihood", 2);
    g.choose("left");
    assert.ok(g.gameOverReason, "生计崩盘应终局");
  });

  t("流程：存档序列化/恢复往返", () => {
    const g = freshGame();
    g.choose("left");
    const day = g.day;
    const ruler = g.rulerId;
    const data = g.serialize();
    const g2 = new Game(g.content);
    g2.restore(JSON.parse(JSON.stringify(data)));
    assert.equal(g2.day, day);
    assert.equal(g2.rulerId, ruler);
    assert.equal(g2.state.get("core.pillar.council"), g.state.get("core.pillar.council"));
    assert.deepEqual([...g2.usedCards], [...g.usedCards]);
  });

  // ---------- 继任 ----------
  t("继任：排除不可用者并应用权重修正理由", () => {
    const cm = new CharacterManager();
    cm.loadDefinitions(makeFixture().characters);
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    s.set("ruler.current", "wunanhai");
    s.set("core.pillar.people", 30); // 触发邬德权重修正
    const ctx = buildDrawContext({ state: s, forces: new ForcesManager(), day: 1, usedCards: new Set() });
    const pick = cm.pickSuccessor(ctx);
    assert.equal(pick.character.id, "wude");
    assert.equal(pick.entryCardId, "T-SUCC-WD");
    assert.ok(pick.reasons.some((r) => r.includes("民望")), "命中的权重修正应带理由");
  });

  t("继任：全员不可用则继任危机", () => {
    const cm = new CharacterManager();
    cm.loadDefinitions(makeFixture().characters);
    const s = new StateManager();
    s.loadDefinitions(makeFixture().states);
    s.set("ruler.current", "none");
    s.set("character.wunanhai.available", false);
    s.set("character.wude.dead", true);
    const ctx = buildDrawContext({ state: s, forces: new ForcesManager(), day: 1, usedCards: new Set() });
    assert.equal(cm.pickSuccessor(ctx), null);
  });
}
