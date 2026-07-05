// 四柱指标定义与初始状态。
export const stats = {
  council: { name: "元老院", desc: "内部支持、部门协同、派系容忍度" },
  people: { name: "民望", desc: "归化民、村社、工匠与周边社会的接受度" },
  military: { name: "军务", desc: "保卫、纪律、治安、武装威慑" },
  livelihood: { name: "生计", desc: "粮食、物资、卫生、工程与生产能力" },
};

export const initialState = {
  day: 1,
  stats: { council: 50, people: 50, military: 50, livelihood: 50 },
  wind: 15,
};
