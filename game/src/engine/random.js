/**
 * 加权随机：抽卡与继任推举共用的随机原语。
 *
 * @module engine/random
 */

/**
 * 从带 weight 字段的条目中按权重随机抽取一项。
 * 零权重条目被排除；空池返回 null。
 *
 * @param {Array<{weight?: number}>} items
 * @returns {*} 被抽中的条目；池空时为 null
 */
export function weightedPick(items) {
  const pool = items.filter((item) => (item.weight || 0) > 0);
  if (!pool.length) return null;
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}
