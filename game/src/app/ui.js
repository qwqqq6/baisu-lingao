/**
 * UI 门面：组合 screens（全屏场景）与 views（局内视图），
 * 保持既有 `ui.xxx()` 调用形态；调试开关在 ./dom.js。
 *
 * @module app/ui
 */

import { isDebugOn, setDebugOn } from "./dom.js";
import * as screens from "./screens.js";
import * as views from "./views.js";

export { isDebugOn, setDebugOn };

export const ui = {
  // 全屏场景
  showError: screens.showError,
  renderTitle: screens.renderTitle,
  renderStart: (characters, onSelect) => screens.renderStart(characters, onSelect, screens.showHelp),
  renderGameOver: screens.renderGameOver,
  showHelp: screens.showHelp,
  toast: screens.toast,

  // 局内视图
  renderMain: views.renderMain,
  renderCard: views.renderCard,
  showFeedback: views.showFeedback,
  showFallNotice: views.showFallNotice,
};
