/**
 * 抽卡算法（docs v0.2 第 10.6.3 节）：
 * 1. 强制事件（倒台/继任/崩局）由游戏控制器先行处理；
 * 2. 未处理插入卡（pending）优先；
 * 3. 先按权重抽一个可用系列，再在系列内按优先级与权重抽卡；
 * 4. 应用最匹配的一个变体（人物替换选项 / 追加提示）。
 *
 * 防重复三件套（由调用方通过 runtime 传入）：
 * - cardSeen：出现越多权重越低（除数 1 + 0.6×次数）；
 * - recentCards：日常卡冷却窗；
 * - lastCardId：相邻两张必不重复。
 *
 * @module engine/draw
 */

import { matchesWithContext } from "./conditions.js";
import { weightedPick } from "./random.js";
import { FORCED_TYPES, isConsumable, priorityOf } from "./cards.js";

// 兼容再导出：类型元数据统一在 engine/cards.js
export { TYPE_PRIORITY, FORCED_TYPES, isConsumable } from "./cards.js";

/**
 * @typedef {import("./conditions.js").DrawContext} DrawContext
 * @typedef {import("./character.js").CharacterManager} CharacterManager
 * @typedef {import("./forces.js").ForcesManager} ForcesManager
 */

/**
 * @typedef {object} DrawRuntime
 * @property {Set<string>} usedCards
 * @property {string[]} recentCards     日常卡冷却窗
 * @property {string[]} recentSeries    近期系列（降权用）
 * @property {Record<string, number>} seriesStall   系列停滞计数
 * @property {Record<string, number>} cardSeen      卡牌出现次数（降权用）
 * @property {string|null} lastCardId   上一张呈现的卡（相邻去重）
 * @property {ForcesManager} forces
 * @property {CharacterManager} characterManager
 */

/** 季节 -> 应季标签（对应系列权重上浮）。 */
const SEASON_TAGS = {
  春: ["农业", "农庄"],
  夏: ["商贸", "外部", "天灾"],
  秋: ["农业", "农庄", "商贸"],
  冬: ["军务", "治安", "保卫"],
};

/**
 * 构建抽卡上下文。
 * @param {{state: object, forces: ForcesManager, day: number, usedCards: Set<string>}} param0
 * @returns {DrawContext}
 */
export function buildDrawContext({ state, forces, day, usedCards }) {
  return {
    state,
    day,
    usedCards,
    forceMetric: (forceId, metric) => forces.metric(forceId, metric),
  };
}

/** 依天数推算季节（每十天一季，春夏秋冬轮转）。 */
function seasonOf(day) {
  return ["春", "夏", "秋", "冬"][Math.floor((Math.max(1, day) - 1) / 10) % 4];
}

/**
 * 收集当前可用的系列（requires / excludes / dependsOn 全部满足）。
 * @param {Array<*>} seriesDefs
 * @param {DrawContext} ctx
 */
export function availableSeries(seriesDefs, ctx) {
  let defs = seriesDefs.filter(
    (s) =>
      (s.requires || []).every((c) => matchesWithContext(c, ctx)) &&
      !(s.excludes || []).some((c) => matchesWithContext(c, ctx)),
  );
  const ids = new Set(defs.map((s) => s.id));
  // 两遍扫描解决浅层依赖链（dependsOn 指向的系列也必须可用）
  for (let pass = 0; pass < 2; pass += 1) {
    defs = defs.filter((s) => (s.dependsOn || []).every((dep) => ids.has(dep)));
    ids.clear();
    defs.forEach((s) => ids.add(s.id));
  }
  return defs;
}

/**
 * 系列权重修正：人物标签、季节天时、势力状态、停滞、近期重复。
 * @param {*} series
 * @param {DrawContext} ctx
 * @param {DrawRuntime} runtime
 * @returns {{series: *, weight: number}}
 */
export function applySeriesWeight(series, ctx, runtime) {
  let weight = series.weight || 1;

  // 执政者标签命中系列标签
  const ruler = runtime.characterManager.get(ctx.state.get("ruler.current"));
  if (ruler) {
    const hits = (series.tags || []).filter((tag) => (ruler.tags || []).includes(tag)).length;
    if (hits > 0) weight += 6;
  }

  // 季节天时
  const season = seasonOf(ctx.day);
  for (const tag of SEASON_TAGS[season] || []) {
    if ((series.tags || []).includes(tag)) {
      weight += 3;
      break;
    }
  }

  // 势力状态：影响力过盛或不满/敌意高涨，相关系列更活跃
  for (const tag of series.tags || []) {
    for (const def of runtime.forces.definitions) {
      if (!runtime.forces.isUnlocked(def.id)) continue;
      if (!(def.tags || []).includes(tag)) continue;
      const influence = runtime.forces.metric(def.id, "influence");
      const satisfaction = runtime.forces.metric(def.id, "satisfaction");
      const hostility = runtime.forces.metric(def.id, "hostility");
      if (influence >= 70) weight += 4;
      if (satisfaction <= 25 || hostility >= 60) weight += 3;
    }
  }

  // 系列长期停滞时，推进卡上浮
  const stall = runtime.seriesStall[series.id];
  if (stall !== undefined && stall >= 6) weight += 4;

  // 近期重复系列降权
  if ((runtime.recentSeries || []).includes(series.id)) weight -= 8;

  return { series, weight: Math.max(1, weight) };
}

/**
 * 系列内抽卡：按类型优先级分组，取最高优先级组，再按权重抽
 * （含防重复三件套与强制类型排除）。
 * @param {*} series
 * @param {Array<*>} cards
 * @param {DrawContext} ctx
 * @param {DrawRuntime} runtime
 * @returns {*} 被选中的卡；系列内无可用卡为 null
 */
export function pickCardInSeries(series, cards, ctx, runtime) {
  const candidates = cards.filter((card) => {
    if (card.series !== series.id) return false;
    if (FORCED_TYPES.has(card.type)) return false;
    if (isConsumable(card) && runtime.usedCards.has(card.id)) return false;
    if (!isConsumable(card) && (runtime.recentCards || []).includes(card.id)) return false;
    if (runtime.lastCardId && card.id === runtime.lastCardId) return false;
    if (!(card.requires || []).every((c) => matchesWithContext(c, ctx))) return false;
    if ((card.excludes || []).some((c) => matchesWithContext(c, ctx))) return false;
    return true;
  });
  if (!candidates.length) return null;
  const topPriority = Math.min(...candidates.map(priorityOf));
  const group = candidates.filter((c) => priorityOf(c) === topPriority);
  const weighted = group.map((card) => {
    const seen = (runtime.cardSeen && runtime.cardSeen[card.id]) || 0;
    return { card, weight: (card.weight || 1) / (1 + 0.6 * seen) };
  });
  const picked = weightedPick(weighted);
  return picked ? picked.card : null;
}

/**
 * 应用变体：同一张卡一次只应用最关键的一个变体。
 * kind: character（人物变体）/ force（势力变体）/ stage（阶段变体）/ history（历史变体）。
 * when 支持 ruler、chance、tagsAny、conditions（通用条件数组）。
 * @param {*} card
 * @param {DrawContext} ctx
 * @param {CharacterManager} characterManager
 * @returns {{card: *, variant: *|null}}
 */
export function applyVariants(card, ctx, characterManager) {
  if (!card.variants || !card.variants.length) return { card, variant: null };
  const ruler = characterManager.get(ctx.state.get("ruler.current"));
  for (const variant of card.variants) {
    const when = variant.when || {};
    if (when.ruler && when.ruler !== (ruler && ruler.id)) continue;
    if (when.tagsAny) {
      if (!ruler) continue;
      const hits = (when.tagsAny || []).filter((tag) => (ruler.tags || []).includes(tag));
      if (!hits.length) continue;
    }
    if (when.conditions && !when.conditions.every((c) => matchesWithContext(c, ctx))) continue;
    if (when.chance !== undefined && Math.random() > when.chance) continue;
    if (variant.replaceOption && variant.option) {
      const next = {
        ...card,
        options: {
          ...card.options,
          [variant.replaceOption]: variant.option,
        },
      };
      return { card: next, variant };
    }
    if (variant.extraHint) {
      return { card: { ...card, hintExtra: variant.extraHint }, variant };
    }
  }
  return { card, variant: null };
}
