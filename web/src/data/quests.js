// 机制5（任务/隐藏目标）：每个阶段有一个不告知玩家的 KPI。
// 阶段结束（进入下一阶段）时结算上一阶段的 KPI：
//   达成 → 注入一张"增益卡"（两侧都还算体面的顺势卡）；
//   失败 → 注入一张"隐患卡"（两侧都要付代价的补救卡）。
// 增益/隐患卡均为 triggerOnly + 危机类型（不进随机池、不计入 lint 零和统计），
// 通过 systems/quests.js 经 pending 注入，因此不破坏卡池零和大盘。
export const quests = [
  {
    stage: "landing",
    stat: "livelihood",
    min: 40,
    desc: "登陆阶段：把队伍和物资安顿好，生计不能垮（生计 ≥ 40）。",
    rewardCard: "QT-LAND-OK",
    penaltyCard: "QT-LAND-BAD",
  },
  {
    stage: "foothold",
    stat: "people",
    min: 40,
    desc: "立足阶段：站稳脚跟的同时争取周边人心（民望 ≥ 40）。",
    rewardCard: "QT-FOOT-OK",
    penaltyCard: "QT-FOOT-BAD",
  },
  {
    stage: "build",
    stat: "council",
    min: 40,
    desc: "建设阶段：制度和内部共识要跟上工程速度（元老院 ≥ 40）。",
    rewardCard: "QT-BUILD-OK",
    penaltyCard: "QT-BUILD-BAD",
  },
];
