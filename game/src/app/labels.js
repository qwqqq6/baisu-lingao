/**
 * 界面文案标签：卡牌类型、阶段、四柱的中文映射。
 * 纯数据模块。
 *
 * @module app/labels
 */

/** 卡牌类型 -> 徽章文案。 */
export const TYPE_LABELS = {
  opening: "开局",
  key: "关键",
  daily: "日常",
  crisis: "危机",
  price: "索价",
  benefit: "收益",
  backlash: "反噬",
  omen: "前兆",
  downfall: "倒台",
  legacy: "遗产",
  cleanup: "善后",
  exclusive: "专属",
  report: "阶段报告",
  epilogue: "结局",
  succession: "继任",
};

/** 阶段 -> 顶栏文案。 */
export const STAGE_LABELS = { landing: "登陆期", expansion: "扩张期", consolidation: "巩固期" };

/** 四柱键 -> 中文名。 */
export const PILLAR_LABELS = {
  people: "民望",
  livelihood: "生计",
  military: "军务",
  council: "元老院",
};
