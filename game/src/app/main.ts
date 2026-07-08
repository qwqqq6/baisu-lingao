import coreCharacterData from "../../content/official/characters/core.json" with { type: "json" };
import { loadCharacterCards } from "../engine/character/character-loader.ts";
import { app, type AppInitializationOptions, type GameApplication } from "./game-application.ts";

const CORE_CHARACTERS = loadCharacterCards(coreCharacterData);

export { app, GameApplication } from "./game-application.ts";
export type { AppInitializationOptions, AppStatus } from "./game-application.ts";

/** 显式初始化入口，供浏览器入口、测试或未来平台壳调用。 */
export function initializeApp(options?: AppInitializationOptions): GameApplication {
  app.initialize({
    ...options,
    characters: options?.characters ?? CORE_CHARACTERS,
  });

  return app;
}

// 当前阶段没有 UI 壳，模块加载时先完成一次核心内容初始化。
initializeApp();
