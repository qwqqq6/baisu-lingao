/**
 * 阶段报告：每十天一份，把隐藏局势写成几行公文——
 * 不出现任何数值，压力与势力动向只以场景暗示（信息隐藏的补偿通道）。
 *
 * @module app/report
 */

/** 各项隐藏指标的暗示阈值（达到才写进报告）。 */
const THRESHOLDS = {
  pressurePersonal: 40,
  pressureFaction: 40,
  pressureViolence: 40,
  legitimacyLow: 40,
  wind: 40,
  forceSatisfactionLow: 25,
  forceHostilityHigh: 60,
  forceInfluenceHigh: 70,
};

/** 风平浪静时的兜底文案（按天数轮换，避免连读重复）。 */
const NEUTRAL_LINES = [
  "各处大致安分。粮仓的账对得上，哨线的记录也齐——这样的日子，在临高算得上好日子。",
  "没什么可写的大事。东门市的市面照常，工地的进度照旧，往年这个时节，土匪该来了，今年还没有。",
  "各口的日子过得平平。归化民里有几家在办喜事，借走了营里两副碗筷，说好如数归还。",
  "本旬无事。值夜的战士说，后半夜听见海滩上有野狗刨沙子，除此之外，天下太平。",
];

/**
 * 生成阶段报告卡（引擎生成，type=report，单选项，不进内容池）。
 * @param {object} param0
 * @param {number} param0.day
 * @param {import("../engine/state.js").StateManager} param0.state
 * @param {import("../engine/forces.js").ForcesManager} param0.forces
 * @returns {*} 卡牌形态对象
 */
export function buildReport({ day, state, forces }) {
  const T = THRESHOLDS;
  const lines = [];

  if (state.get("ruler.pressure_personal") >= T.pressurePersonal) {
    lines.push("近来各口的事务都压在您一人肩上。秘书处的人说，后半夜常见您屋里的灯还亮着。");
  }
  if (state.get("ruler.pressure_faction") >= T.pressureFaction) {
    lines.push("会上的风向有些不对。几位委员散会后留在廊下交头接耳，见人来了就住口。");
  }
  if (state.get("ruler.pressure_violence") >= T.pressureViolence) {
    lines.push("营区外夜里不太平。保卫组这个月拿的人，比往常都多。");
  }
  if (state.get("ruler.legitimacy") <= T.legitimacyLow) {
    lines.push("各口对批示开始讨价还价，一件三五天能办的事，如今要走七八道手续。");
  }
  if (state.get("core.wind") >= T.wind) {
    lines.push("海面上生面孔的船多了。县衙那边许久没有递话来——安静得反常。");
  }
  for (const def of forces.definitions) {
    if (!forces.isUnlocked(def.id)) continue;
    const satisfaction = forces.metric(def.id, "satisfaction") ?? 0;
    const hostility = forces.metric(def.id, "hostility") ?? 0;
    const influence = forces.metric(def.id, "influence") ?? 0;
    if (satisfaction <= T.forceSatisfactionLow) {
      lines.push(`「${def.name}」近来对上头的话爱答不理，差事办得敷衍。`);
    } else if (hostility >= T.forceHostilityHigh) {
      lines.push(`「${def.name}」的人在暗中串联，风声很紧。`);
    } else if (influence >= T.forceInfluenceHigh) {
      lines.push(`「${def.name}」的势力正盛，营里办事，先得过他们的门。`);
    }
  }

  if (!lines.length) {
    lines.push(NEUTRAL_LINES[day % NEUTRAL_LINES.length]);
  }

  return {
    id: `REPORT-${day}`,
    pool: "core",
    series: "politics.council",
    type: "report",
    title: `阶段报告（第 ${day} 日）`,
    source: { kind: "force", id: "council", name: "执委会秘书处" },
    tags: ["报告"],
    requires: [],
    excludes: [],
    weight: 0,
    text: `秘书处汇总了近旬各方情形，择要报呈首长：\n\n${lines.map((l) => `· ${l}`).join("\n")}`,
    options: {
      left: { id: "cun_dang_beicha", label: "阅毕，存档备查", effects: {} },
    },
  };
}
