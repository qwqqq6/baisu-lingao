// 机制2（角色回归）：跟踪对各人物主张维度的偏袒程度，坐大则注入反噬卡。
import { GAME_DATA as DATA } from "../data/index.js";
import { store } from "../core/store.js";

// 结算一次选择后调用：按本次四柱增减累加各人物 favor（有符号）。
// 某人物 favor 超过其阈值且反噬卡未在近期注入时，把反噬卡压入 pending。
export function trackFavor(effects) {
  const state = store.state;
  state.favor = state.favor || {};
  state.backlashDone = state.backlashDone || [];

  for (const char of DATA.characters) {
    const delta = Number(effects[char.favorStat] || 0);
    if (!delta) continue;
    state.favor[char.id] = (state.favor[char.id] || 0) + delta;
  }

  for (const char of DATA.characters) {
    const favor = state.favor[char.id] || 0;
    if (favor >= char.threshold && !state.backlashDone.includes(char.backlashCard)) {
      state.backlashDone.push(char.backlashCard);
      state.pending.push(char.backlashCard);
      state.favor[char.id] = 0; // 反噬后情绪释放，重新累积
    }
  }
}
