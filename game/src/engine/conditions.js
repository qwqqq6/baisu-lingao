/**
 * 条件判定：卡牌/系列/变体/继任权重的统一出现条件匹配。
 * 条件形态见 docs/重做规划 v0.2 第 10.12 节：
 * - { state, equals|notEquals|gt|gte|lt|lte|between|includes|notIncludes|exists }
 * - { force, metric, gte|gt|lt|lte|equals }
 * - { ruler: id } / { used: cardId } / { day: {gte, lte} } / { stage }
 * - { any: [...] } / { all: [...] }
 *
 * @module engine/conditions
 */

/**
 * 运行时判定上下文。
 * @typedef {object} DrawContext
 * @property {{ get(id: string): * }} state            状态读取器（StateManager 或等价物）
 * @property {number} day                              当前天数（从 1 起）
 * @property {Set<string>} usedCards                   已出现过的卡 id 集合
 * @property {(forceId: string, metric: string) => number|undefined} forceMetric
 *                                                      势力数值读取器
 */

/**
 * 比较单个状态值与条件预期。
 * @param {*} condition 带比较谓词的条件对象
 * @param {*} value 状态当前值
 * @returns {boolean}
 */
export function compareState(condition, value) {
  if (condition.equals !== undefined) return value === condition.equals;
  if (condition.notEquals !== undefined) return value !== condition.notEquals;
  if (condition.gt !== undefined) return (Number(value) || 0) > condition.gt;
  if (condition.gte !== undefined) return (Number(value) || 0) >= condition.gte;
  if (condition.lt !== undefined) return (Number(value) || 0) < condition.lt;
  if (condition.lte !== undefined) return (Number(value) || 0) <= condition.lte;
  if (condition.between !== undefined) {
    const [lo, hi] = condition.between;
    const n = Number(value) || 0;
    return n >= lo && n <= hi;
  }
  if (condition.includes !== undefined) return Array.isArray(value) && value.includes(condition.includes);
  if (condition.notIncludes !== undefined) return !Array.isArray(value) || !value.includes(condition.notIncludes);
  if (condition.exists !== undefined) {
    const has = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
    return condition.exists ? has : !has;
  }
  return true;
}

/**
 * 带运行时上下文的条件判断（抽卡与事件触发的统一入口）。
 * @param {*} condition 条件对象；空值视为恒真
 * @param {DrawContext} ctx
 * @returns {boolean}
 */
export function matchesWithContext(condition, ctx) {
  if (!condition) return true;
  if (condition.any) return condition.any.some((c) => matchesWithContext(c, ctx));
  if (condition.all) return condition.all.every((c) => matchesWithContext(c, ctx));
  if (condition.used !== undefined) return ctx.usedCards.has(condition.used);
  if (condition.ruler !== undefined) return ctx.state.get("ruler.current") === condition.ruler;
  if (condition.stage !== undefined) return ctx.state.get("stage.current") === condition.stage;
  if (condition.day !== undefined) {
    const day = ctx.day || 0;
    if (condition.day.gte !== undefined && day < condition.day.gte) return false;
    if (condition.day.lte !== undefined && day > condition.day.lte) return false;
    return true;
  }
  if (condition.force !== undefined) {
    const value = ctx.forceMetric(condition.force, condition.metric);
    if (value === undefined) return false;
    if (condition.equals !== undefined) return value === condition.equals;
    if (condition.gt !== undefined) return value > condition.gt;
    if (condition.gte !== undefined) return value >= condition.gte;
    if (condition.lt !== undefined) return value < condition.lt;
    if (condition.lte !== undefined) return value <= condition.lte;
    return true;
  }
  if (condition.state !== undefined) return compareState(condition, ctx.state.get(condition.state));
  return true;
}
