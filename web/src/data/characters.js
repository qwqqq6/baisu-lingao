// 机制2（角色回归）：核心人物各自主张一个维度(favorStat)。
// 玩家持续在某一维度上偏袒（favor 有符号累加超过阈值），该人物"坐大"，
// 触发其反噬卡（backlashCard，triggerOnly，经 pending 注入）。
// 反噬卡两侧仍反对称：纵容会把该维推得更高（更接近 100 失败线），
// 打压则回落该维但付出其它代价——因此堆单维策略会被自然惩罚。
export const characters = [
  { id: "wunanhai", name: "吴南海", favorStat: "livelihood", threshold: 22, backlashCard: "BL-LIV" },
  { id: "wude", name: "邬德", favorStat: "people", threshold: 22, backlashCard: "BL-PEO" },
  { id: "baoweizu", name: "保卫组", favorStat: "military", threshold: 22, backlashCard: "BL-MIL" },
  { id: "zhiweihui", name: "执委会元老", favorStat: "council", threshold: 22, backlashCard: "BL-COU" },
];
