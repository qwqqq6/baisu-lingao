/**
 * 抽卡算法（docs v0.2 第 10.6.3 节）：
 * 1. 强制事件（倒台/继任/崩局）由游戏控制器先行处理；
 * 2. 未处理插入卡（pending）优先；
 * 3. 先按权重抽一个可用系列，再在系列内按优先级与权重抽卡；
 * 4. 应用最匹配的一个变体（人物替换选项 / 额外提示）。
 */

import { matchesWithContext, weightedPick } from "./state.js";

/** 卡牌类型优先级：数字越小越优先（对应文档第 8 节的优先级表）。 */
export const TYPE_PRIORITY = {
  collapse: 0,
  downfall: 1,
  succession: 1,
  crisis: 3,
  backlash: 4,
  price: 5,
  benefit: 5,
  omen: 5,
  key: 6,
  cleanup: 6,
  opening: 6,
  exclusive: 7,
  legacy: 7,
  daily: 8,
};

/** 除日常卡外，其余类型一旦用掉即退出卡池。 */
export function isConsumable(card) {
  return card.type !== "daily";
}

/** 强制事件卡：只能由倒台/继任/开局流程专用，绝不进入常规抽卡池。 */
const FORCED_TYPES = new Set(["succession", "downfall", "collapse", "opening"]);

export function buildDrawContext({ state, forces, day, usedCards }) {
  return {
    state,
    day,
    usedCards,
    forceMetric: (forceId, metric) => forces.metric(forceId, metric),
  };
}

/** 收集当前可用的系列（requires / excludes / dependsOn 全部满足）。 */
export function availableSeries(seriesDefs, ctx) {
  let defs = seriesDefs.filter(
    (s) =>
      (s.requires || []).every((c) => matchesWithContext(c, ctx)) &&
      !(s.excludes || []).some((c) => matchesWithContext(c, ctx))
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

/** 季节天时：对应系列在应季权重上浮（docs 开源化计划 §5.4 季节系统） */
const SEASON_TAGS = {
  春: ["农业", "农庄"],
  夏: ["商贸", "外部", "天灾"],
  秋: ["农业", "农庄", "商贸"],
  冬: ["军务", "治安", "保卫"],
};

function seasonOf(day) {
  return ["春", "夏", "秋", "冬"][Math.floor((Math.max(1, day) - 1) / 10) % 4];
}

/** 系列权重修正：人物标签、势力状态、停滞、近期重复、季节天时。 */
export function applySeriesWeight(series, ctx, runtime) {
  let weight = series.weight || 1;
  const ruler = runtime.characterManager.get(ctx.state.get("ruler.current"));
  if (ruler) {
    const hits = (series.tags || []).filter((tag) => (ruler.tags || []).includes(tag)).length;
    if (hits > 0) weight += 6;
  }
  const season = seasonOf(ctx.day);
  for (const tag of SEASON_TAGS[season] || []) {
    if ((series.tags || []).includes(tag)) {
      weight += 3;
      break;
    }
  }
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
  const stall = runtime.seriesStall[series.id];
  if (stall !== undefined && stall >= 6) weight += 4;
  if ((runtime.recentSeries || []).includes(series.id)) weight -= 8;
  return { series, weight: Math.max(1, weight) };
}

/** 系列内抽卡：按类型优先级分组，取最高优先级组，再按权重抽（见过的卡递减权重，上一张不重复）。 */
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
  const topPriority = Math.min(...candidates.map((c) => TYPE_PRIORITY[c.type] ?? 9));
  const group = candidates.filter((c) => (TYPE_PRIORITY[c.type] ?? 9) === topPriority);
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
 * when 支持 ruler、chance、tagsAny、conditions（通用条件数组，经 matchesWithContext 判定）。
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
