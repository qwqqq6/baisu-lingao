// 数据聚合层：把按机制拆分的数据模块组装成等价于旧 window.GAME_DATA 的对象。
// engine/ui 统一从这里取数据，降低迁移风险。
import { stats, initialState } from "./stats.js";
import { stages, reports } from "./stages.js";
import { endings, successEndings } from "./endings.js";
import { crisisCards } from "./crisisCards.js";
import { cards } from "./cards.js";
import { characters } from "./characters.js";
import { quests } from "./quests.js";

export const GAME_DATA = {
  stats,
  initialState,
  stages,
  reports,
  endings,
  successEndings,
  crisisCards,
  cards,
  characters,
  quests,
};
