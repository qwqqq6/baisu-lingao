/**
 * 入口：加载内容包 → 恢复存档或进入开局选人 → 驱动回合循环。
 */

import { loadOfficialContent } from "../engine/content.js";
import { hasSave } from "../engine/save.js";
import { Game } from "./game.js";
import { ui } from "./ui.js";

let content;
let game;

function handlers() {
  return {
    onChoose: (side) => choose(side),
    onAbility: () => useAbility(),
    onSave: () => doSave(),
    onLoad: () => doLoad(),
    onHelp: () => ui.showHelp(),
    onRestart: () => restart(),
  };
}

function advanceOrRender() {
  if (!game.nextTurn()) {
    if (game.gameOverReason) ui.renderGameOver(game);
    return false;
  }
  ui.renderMain(game, handlers());
  return true;
}

function choose(side) {
  const result = game.choose(side);
  if (!result) return;
  const fb = result.feedback;
  game.pushLog(`照批。${fb.deltas}${fb.notes.length ? "。" + fb.notes.join("；") : ""}`, "info");
  if (result.over) {
    ui.renderGameOver(game);
    return;
  }
  if (!advanceOrRender()) return;
  ui.showFeedback(fb);
  if (result.fell) ui.showFallNotice(result.fell);
}

function useAbility() {
  const ability = game.useAbility();
  if (!ability) return;
  ui.toast(`发动人物能力「${ability.name}」`);
  // 能力不消耗天数：停留在当前事件上，只刷新四柱与按钮状态
  if (game.currentCard) {
    ui.renderMain(game, handlers());
  }
}

function doSave() {
  ui.toast(game.save() ? "已存档" : "存档失败");
}

function doLoad() {
  const loaded = Game.load(content);
  if (!loaded) {
    ui.toast("没有找到存档");
    return;
  }
  game = loaded;
  window.__game = game;
  ui.toast("读档成功");
  if (game.gameOverReason) {
    ui.renderGameOver(game);
    return;
  }
  if (!advanceOrRender()) return;
}

function restart() {
  if (!confirm("确定要放弃当前进度、重新开始吗？")) return;
  Game.discardSave();
  location.reload();
}

function startFromSave() {
  const loaded = Game.load(content);
  if (!loaded) return false;
  game = loaded;
  window.__game = game;
  if (game.gameOverReason) {
    ui.renderGameOver(game);
    return true;
  }
  if (!advanceOrRender()) return true;
  return true;
}

async function boot() {
  try {
    content = await loadOfficialContent();
  } catch (err) {
    console.error(err);
    ui.showError(
      `无法加载内容包：${err.message}。若直接以 file:// 打开本页，浏览器会拦截 JSON 请求。`,
      "请在 game 目录运行：python -m http.server 8080，然后访问 http://localhost:8080"
    );
    return;
  }

  // 标题页：继续 / 开始 / 说明
  game = new Game(content);
  window.__game = game; // 调试句柄
  showTitle();
}

function showTitle() {
  ui.renderTitle({
    hasSave: hasSave(),
    onContinue: () => {
      if (!startFromSave()) showTitle();
    },
    onStart: () => startNew(),
    onHelp: () => ui.showHelp(),
  });
}

function startNew() {
  game = new Game(content);
  window.__game = game;
  game.resetRuntime();
  ui.renderStart(content.characters, (characterId) => {
    game.newGame(characterId);
    if (!advanceOrRender()) return;
  });
}

boot();
