// 存档读写（localStorage）。
import { store, SAVE_KEY } from "./store.js";
import { findCard } from "./state.js";
import { render } from "../ui/render.js";

export function save() {
  const state = store.state;
  if (!state?.autosave) return;
  const currentCard = store.currentCard;
  const payload = {
    state,
    currentCardId: currentCard?.id,
    virtualCard: currentCard?.reportId || currentCard?.ending ? currentCard : null,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    const state = payload.state;
    store.state = state;
    store.currentCard = payload.virtualCard || findCard(payload.currentCardId);
    if (!state || !store.currentCard) return false;
    state.used = state.used || [];
    state.history = state.history || [];
    state.shownReports = state.shownReports || [];
    state.windEvents = state.windEvents || [];
    state.pending = state.pending || [];
    state.recentCrisis = state.recentCrisis || [];
    state.lastCrisisDay = state.lastCrisisDay || 0;
    state.favor = state.favor || {};
    state.backlashDone = state.backlashDone || [];
    state.questsDone = state.questsDone || [];
    state.precise = Boolean(state.precise);
    state.autosave = state.autosave !== false;
    render();
    return true;
  } catch (error) {
    console.warn("存档读取失败", error);
    return false;
  }
}
