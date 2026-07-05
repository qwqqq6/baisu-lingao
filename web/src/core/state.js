// 状态创建与基础工具函数。
import { GAME_DATA as DATA } from "../data/index.js";
import { store } from "./store.js";

export function makeInitialState() {
  return {
    day: DATA.initialState.day,
    stats: { ...DATA.initialState.stats },
    wind: DATA.initialState.wind,
    used: [],
    history: [],
    shownReports: [],
    windEvents: [],
    pending: [],
    precise: false,
    autosave: true,
    over: false,
    ending: null,
    seed: Date.now(),
    lastCrisisDay: 0,
    recentCrisis: [],
    favor: {},
    backlashDone: [],
    questsDone: [],
  };
}

export function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function currentStage() {
  const state = store.state;
  return (
    DATA.stages.find((stage) => state.day >= stage.start && state.day <= stage.end) ||
    DATA.stages[DATA.stages.length - 1]
  );
}

export function findCard(id) {
  return (
    DATA.cards.find((card) => card.id === id) ||
    DATA.crisisCards.find((card) => card.id === id)
  );
}

export function choose(items) {
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

export function effectEntries(effects) {
  return Object.entries(effects || {}).filter(([, value]) => value !== 0);
}

// 机制9（阶段卡池演化）：同一选项在不同阶段可有不同结算。
// 若选项声明了 stageEffects 且命中当前阶段，则优先使用该阶段变体，
// 否则回落到基础 effects。变体本身仍保持两侧反对称，不破坏零和约束。
export function resolveEffects(option, stageId) {
  if (option && option.stageEffects && option.stageEffects[stageId]) {
    return option.stageEffects[stageId];
  }
  return (option && option.effects) || {};
}
