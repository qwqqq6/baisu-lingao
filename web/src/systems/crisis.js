// 危机/风声触发系统。指标进入危险区或风声达阈值时产出对应危机卡。
import { GAME_DATA as DATA } from "../data/index.js";
import { store } from "../core/store.js";
import { findCard, choose } from "../core/state.js";

function rememberCrisis(cardId) {
  const state = store.state;
  state.recentCrisis = [cardId, ...(state.recentCrisis || []).filter((id) => id !== cardId)].slice(0, 3);
}

export function dangerCrisis() {
  const state = store.state;
  if (state.lastCrisisDay === state.day) return null;
  const checks = [
    ["livelihood", "low", "CR-LIV-LOW"],
    ["livelihood", "high", "CR-LIV-HIGH"],
    ["military", "low", "CR-MIL-LOW"],
    ["military", "high", "CR-MIL-HIGH"],
    ["people", "low", "CR-PEO-LOW"],
    ["people", "high", "CR-PEO-HIGH"],
    ["council", "low", "CR-COU-LOW"],
    ["council", "high", "CR-COU-HIGH"],
  ];
  const rawCandidates = checks.filter(([stat, direction]) =>
    direction === "low" ? state.stats[stat] <= 18 : state.stats[stat] >= 82
  );
  if (!rawCandidates.length) return null;
  const freshCandidates = rawCandidates.filter(([, , id]) => !(state.recentCrisis || []).includes(id));
  const candidates = freshCandidates.length ? freshCandidates : rawCandidates;
  const card = findCard(choose(candidates)[2]);
  state.lastCrisisDay = state.day;
  rememberCrisis(card.id);
  return card;
}

export function windCrisis() {
  const state = store.state;
  const threshold = [40, 60, 80, 92].find((value) => state.wind >= value && !state.windEvents.includes(value));
  if (!threshold) return null;
  state.windEvents.push(threshold);
  return findCard("CR-WIND");
}
