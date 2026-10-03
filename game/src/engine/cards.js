/**
 * 卡牌类型元数据：抽取优先级、强制事件边界、消耗规则。
 *
 * @module engine/cards
 */

/**
 * 卡牌类型抽取优先级：数字越小越优先（对应设计文档第 8 节优先级表）。
 * 常规池抽取时取"当前候选中最高优先级"的类型分组再按权重抽。
 */
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

/**
 * 强制事件类型：只能由倒台/继任/开局等专属流程呈现，
 * 绝不进入常规抽卡池。
 */
export const FORCED_TYPES = new Set(["succession", "downfall", "collapse", "opening"]);

/**
 * 除日常卡外，其余类型一旦用掉即退出卡池。
 * @param {*} card
 * @returns {boolean}
 */
export function isConsumable(card) {
  return card.type !== "daily";
}

/** @returns {number} 类型优先级（未知类型按最低优先 9 处理） */
export function priorityOf(card) {
  return TYPE_PRIORITY[card.type] ?? 9;
}
