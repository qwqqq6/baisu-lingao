/**
 * 选项效果结算：把卡牌选项/人物能力/遗产的 effects 写入
 * 状态、四柱、风声、势力与人物压力，并判定总崩局。
 *
 * @module engine/effects
 */

/** 四柱 -> 状态库 id（四柱是状态库中的四个公开核心状态）。 */
export const PILLAR_STATE_IDS = {
  people: "core.pillar.people",
  livelihood: "core.pillar.livelihood",
  military: "core.pillar.military",
  council: "core.pillar.council",
};

/** 人物压力键 -> 状态库 id。 */
export const PRESSURE_STATE_IDS = {
  personal_pressure: "ruler.pressure_personal",
  faction_alarm: "ruler.pressure_faction",
  violence_risk: "ruler.pressure_violence",
  legitimacy: "ruler.legitimacy",
};

/**
 * 把 personal/stage 之类的压力键翻译成状态 id。
 * @param {string} key personal_pressure | faction_alarm | violence_risk | legitimacy
 * @returns {string|null}
 */
export function pressureStateId(key) {
  return PRESSURE_STATE_IDS[key] || null;
}

/**
 * @typedef {object} Effects
 * @property {Record<string, number>} [stats]      四柱增减 { people, livelihood, military, council }
 * @property {number} [wind]                        风声增减
 * @property {number} [days]                        消耗天数（缺省 1）
 * @property {Record<string, Record<string, number>>} [forces]
 *      势力数值增减 { forceId: { influence, satisfaction, hostility } }
 * @property {Record<string, number>} [personal]   压力增减（见 PRESSURE_STATE_IDS）
 * @property {Array<object>} [states]              状态变化数组（见 engine/state.js StateChange）
 * @property {string} [ruler]                      继任卡专用：执政者 id
 * @property {boolean} [stepDown]                  触发下台流程（由游戏控制器执行）
 * @property {string} [ending]                     专属结局 id（如 taiwan）
 */

/**
 * @typedef {object} EffectTarget
 * @property {import("./state.js").StateManager} state
 * @property {import("./forces.js").ForcesManager} forces
 */

/**
 * @typedef {object} EffectResult
 * @property {number} days    本结算消耗的天数（≥1）
 * @property {string[]} warnings 结算中产生的告警（如未定义状态）
 */

/**
 * 应用一组效果。
 * @param {Effects} effects
 * @param {EffectTarget} param0
 * @returns {EffectResult}
 */
export function applyEffects(effects, { state, forces }) {
  const result = { days: 0, warnings: [] };

  for (const [key, delta] of Object.entries(effects?.stats || {})) {
    const id = PILLAR_STATE_IDS[key];
    if (id) state.apply({ id, op: "add", value: delta });
  }

  if (effects?.wind) state.apply({ id: "core.wind", op: "add", value: effects.wind });

  for (const [key, delta] of Object.entries(effects?.personal || {})) {
    const id = pressureStateId(key);
    if (id) state.apply({ id, op: "add", value: delta });
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

/**
 * 总崩局判定：四柱或隐藏压力滑向极端即终局。
 * @param {import("./state.js").StateManager} state
 * @returns {string|null} 崩局原因 id（对应 app/endings.js COLLAPSE_TEXTS），未崩为 null
 */
export function checkCollapse(state) {
  if (state.get("core.pillar.livelihood") <= 5) return "livelihood";
  if (state.get("core.pillar.people") <= 5) return "people";
  if (state.get("core.pillar.military") >= 95) return "military";
  if (state.get("core.pillar.council") <= 5) return "council";
  if (state.get("core.wind") >= 95) return "wind";
  if (state.get("ruler.legitimacy") <= 5) return "legitimacy";
  return null;
}
