/**
 * 选项效果结算：把卡牌选项的 effects 写入状态、四柱、风声、势力与人物压力。
 *
 * effects 结构（与 docs v0.2 第 10.10 节一致）：
 * - stats: { people, livelihood, military, council }   —— 四柱增减
 * - wind: number                                        —— 风声增减
 * - days: number                                        —— 消耗天数（默认 1）
 * - forces: { forceId: { influence, satisfaction, hostility } }
 * - personal: { personal_pressure, faction_alarm, violence_risk, legitimacy }
 * - states: [{ id, op, value }]
 * - ruler: characterId                                  —— 继任卡专用，随 states 里的 ruler.current 一起生效
 * - stepDown: true                                      —— 触发下台流程（由游戏控制器执行）
 */

export const PILLAR_STATE_IDS = {
  people: "core.pillar.people",
  livelihood: "core.pillar.livelihood",
  military: "core.pillar.military",
  council: "core.pillar.council",
};

const PRESSURE_STATE_IDS = {
  personal_pressure: "ruler.pressure_personal",
  faction_alarm: "ruler.pressure_faction",
  violence_risk: "ruler.pressure_violence",
};

export function applyEffects(effects, { state, forces }) {
  const result = { days: 0, warnings: [] };

  for (const [key, delta] of Object.entries(effects?.stats || {})) {
    const id = PILLAR_STATE_IDS[key];
    if (id) state.apply({ id, op: "add", value: delta });
  }

  if (effects?.wind) state.apply({ id: "core.wind", op: "add", value: effects.wind });

  for (const [key, delta] of Object.entries(effects?.personal || {})) {
    const pressureId = PRESSURE_STATE_IDS[key];
    if (pressureId) {
      state.apply({ id: pressureId, op: "add", value: delta });
    } else if (key === "legitimacy") {
      state.apply({ id: "ruler.legitimacy", op: "add", value: delta });
    }
  }

  if (effects?.forces) forces.applyEffects(effects.forces);
  if (effects?.states) state.applyAll(effects.states);

  result.days = Math.max(1, Math.round(effects?.days || 1));
  if (state.lastWarning) {
    result.warnings.push(state.lastWarning);
    state.lastWarning = "";
  }
  return result;
}

/** 四柱滑向极端即总崩局；返回崩局原因描述或 null。 */
export function checkCollapse(state) {
  if (state.get("core.pillar.livelihood") <= 5) return "livelihood";
  if (state.get("core.pillar.people") <= 5) return "people";
  if (state.get("core.pillar.military") >= 95) return "military";
  if (state.get("core.pillar.council") <= 5) return "council";
  if (state.get("core.wind") >= 95) return "wind";
  if (state.get("ruler.legitimacy") <= 5) return "legitimacy";
  return null;
}
