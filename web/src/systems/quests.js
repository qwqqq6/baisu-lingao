// 机制5（任务/隐藏目标）：阶段切换时结算上一阶段的隐藏 KPI。
import { GAME_DATA as DATA } from "../data/index.js";
import { store } from "../core/store.js";

// 进入新阶段时调用：结算所有"已结束但尚未结算"的阶段任务。
// 只结算阶段顺序早于当前阶段的任务（即已经过去的阶段），避免提前结算未来阶段。
// 达成注入 rewardCard，失败注入 penaltyCard（均经 pending）。
export function settleQuests(newStageId) {
  const state = store.state;
  state.questsDone = state.questsDone || [];

  const order = DATA.stages.map((stage) => stage.id);
  const newIndex = order.indexOf(newStageId);

  for (const quest of DATA.quests) {
    if (state.questsDone.includes(quest.stage)) continue;
    const questIndex = order.indexOf(quest.stage);
    if (questIndex < 0 || questIndex >= newIndex) continue; // 只结算已结束的阶段

    state.questsDone.push(quest.stage);
    const ok = (state.stats[quest.stat] || 0) >= quest.min;
    state.pending.push(ok ? quest.rewardCard : quest.penaltyCard);
  }
}
