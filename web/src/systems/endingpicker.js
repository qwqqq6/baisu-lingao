// 结局与阶段报告的虚拟卡生成，以及结局判定。
import { GAME_DATA as DATA } from "../data/index.js";
import { store } from "../core/store.js";

export function stageReportCard(stage) {
  const report = DATA.reports[stage.id];
  return {
    id: `REPORT-${stage.id}`,
    stage: stage.id,
    type: "阶段报告",
    title: report.title,
    source: "执委会秘书处",
    text: report.text,
    tags: [stage.name, "报告"],
    reportId: stage.id,
    left: { label: "翻阅报告", hint: "了解局势", effects: {}, cost: 0 },
    right: { label: "进入阶段", hint: "继续裁断", effects: {}, cost: 0 },
  };
}

export function endingCard(ending) {
  const state = store.state;
  return {
    id: `ENDING-${ending.id}`,
    type: "百日总结",
    title: ending.title,
    source: "百日档案",
    text: ending.text,
    tags: ["结局", state.day > 100 ? "D+100" : `D+${state.day}`],
    left: { label: "重新开始", hint: "新开一局", effects: {}, cost: 0 },
    right: { label: "保留记录", hint: "查看局势", effects: {}, cost: 0 },
    ending: true,
  };
}

export function getFailureEnding() {
  return DATA.endings.find((ending) => ending.test(store.state)) || null;
}

export function getSuccessEnding() {
  const state = store.state;
  const { council, people, military, livelihood } = state.stats;
  const values = Object.values(state.stats);
  const balanced = values.every((value) => value >= 30 && value <= 70);
  if (balanced && state.wind < 45) return DATA.successEndings.find((item) => item.id === "steady");
  if (state.wind < 30) return DATA.successEndings.find((item) => item.id === "low_profile");
  if (military >= 68 && livelihood >= 62) return DATA.successEndings.find((item) => item.id === "iron");
  if (livelihood >= 72) return DATA.successEndings.find((item) => item.id === "workshop");
  if (people >= 70) return DATA.successEndings.find((item) => item.id === "civil");
  if (council >= 70) return DATA.successEndings.find((item) => item.id === "council");
  return DATA.successEndings.find((item) => item.id === "steady");
}
