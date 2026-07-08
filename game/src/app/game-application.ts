import { characterManager } from "../engine/character/character-manager.ts";
import type { CharacterCard } from "../engine/character/character-card.ts";
import { stateManager, type StateDefinition } from "../engine/state/state-manager.ts";

/** 主程序当前只区分“已创建”和“已初始化”两个阶段。 */
export type AppStatus = "created" | "initialized";

/** 初始化参数；后续会继续挂载人物、系列、卡牌和 Mod 内容包。 */
export type AppInitializationOptions = {
  stateDefinitions?: StateDefinition[];
  characters?: CharacterCard[];
};

/**
 * 游戏应用入口。
 *
 * 这个类只负责编排启动流程，不直接承载具体玩法逻辑。
 * 后续抽卡器、内容加载器、存档系统和 UI 初始化会从这里串起来。
 */
export class GameApplication {
  private status: AppStatus = "created";

  /** 初始化核心单例；当前加载状态定义和人物卡。 */
  initialize(options: AppInitializationOptions = {}): void {
    if (this.status === "initialized") return;

    stateManager.loadDefinitions(options.stateDefinitions ?? []);
    characterManager.loadCharacters(options.characters ?? []);
    this.status = "initialized";
  }

  /** 返回当前应用生命周期状态，便于调试和测试。 */
  getStatus(): AppStatus {
    return this.status;
  }

  /** 判断主程序是否已经完成初始化。 */
  isInitialized(): boolean {
    return this.status === "initialized";
  }
}

/** 全项目共享的应用实例。 */
export const app = new GameApplication();
