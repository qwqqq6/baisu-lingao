/**
 * 入口编排：加载内容包 → 标题页（继续/开始/调试）→ 选人 → 回合循环。
 * 事件回调集中在本文件，UI 模块保持纯渲染。
 *
 * @module app/main
 */

import { loadOfficialContent } from "../engine/content.js";
import { hasSave, saveGame } from "../engine/save.js";
import { Game } from "./game.js";
import { isDebugOn, setDebugOn, ui } from "./ui.js";

/** @type {*} 内容包（loadOfficialContent 产物） */
let content;
/** @type {Game|null} 当前局 */
let game;

// ---------------------------------------------------------------- 回调表

/** 组装传给 UI 的事件回调（每帧重建，闭包最新 game）。 */
function handlers() {
  return {
    onChoose: (side) => choose(side),
    onAbility: () => useAbility(),
    onSave: () => doSave(),
    onLoad: () => doLoad(),
    onExportSave: () => exportSave(),
    onImportFile: (file) => importSaveFile(file),
    onDebugToggle: () => toggleDebug(),
    onDebugAction: (kind) => debugAction(kind),
    onHelp: () => ui.showHelp(),
    onRestart: () => restart(),
  };
}

// ---------------------------------------------------------------- 回合驱动

/** 推进一回合；终局时渲染结局画面并返回 false。 */
function advanceOrRender() {
  if (!game.nextTurn()) {
    if (game.gameOverReason) ui.renderGameOver(game);
    return false;
  }
  ui.renderMain(game, handlers());
  return true;
}

/** 批复一条：结算 → 纪事 → 终局/下一张 → 反馈与下台提示。 */
function choose(side) {
  const result = game.choose(side);
  if (!result) return;
  const fb = result.feedback;
  // 默认模式：纪事里也不留数字与势力态度；调试模式全量记录
  game.pushLog(game.debug
    ? `照批。${fb.deltas}${fb.notes.length ? "。" + fb.notes.join("；") : ""}`
    : "照批。", "info");
  if (result.over) {
    ui.renderGameOver(game);
    return;
  }
  if (!advanceOrRender()) return;
  ui.showFeedback(fb, game.debug);
  if (result.fell) ui.showFallNotice(result.fell);
}

/** 人物能力：不消耗天数，停留在当前事件上只刷新界面。 */
function useAbility() {
  const ability = game.useAbility();
  if (!ability) return;
  ui.toast(`发动人物能力「${ability.name}」`);
  if (game.currentCard) {
    ui.renderMain(game, handlers());
  }
}

// ---------------------------------------------------------------- 存档

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
  advanceOrRender();
}

/** 导出存档为 JSON 文件（换浏览器续玩）。 */
function exportSave() {
  try {
    const data = JSON.stringify(game.serialize(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lingqi-save-第${game.day}天.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    ui.toast("存档已导出");
  } catch (err) {
    ui.toast("导出失败：" + (err && err.message || err));
  }
}

/** 导入存档文件：校验载荷结构后写入槽位并读档。 @param {File|null} file */
function importSaveFile(file) {
  if (!file) return;
  file.text()
    .then((text) => {
      const data = JSON.parse(text);
      if (!data || data.version !== 1 || !data.state) throw new Error("不是有效的存档文件");
      saveGame(data);
      doLoad();
    })
    .catch((err) => ui.toast("导入失败：" + (err && err.message || err)));
}

// ---------------------------------------------------------------- 调试

/** 切换调试模式（同步 localStorage 与界面）。 */
function toggleDebug() {
  game.setDebug(!game.debug);
  setDebugOn(game.debug);
  ui.toast(game.debug ? "调试模式已开启" : "调试模式已关闭");
  ui.renderMain(game, handlers());
}

/** 调试面板按钮：跳天 / 压力拨杆。 @param {"skip5"|"personal"|"faction"|"violence"|"legitimacy"} kind */
function debugAction(kind) {
  if (kind === "skip5") {
    game.debugSkipDays(5);
    ui.toast("时间快进 5 天");
  } else if (kind === "legitimacy") {
    game.debugBumpLegitimacy();
    ui.toast("合法性 -20");
  } else {
    game.debugBump(kind);
    ui.toast("压力 +20");
  }
  if (game.currentCard) ui.renderMain(game, handlers());
}

// ---------------------------------------------------------------- 流程

function restart() {
  if (!confirm("确定要放弃当前进度、重新开始吗？")) return;
  Game.discardSave();
  location.reload();
}

/** 标题页「继续上次」入口；无有效存档回标题页。 @returns {boolean} 是否成功进局 */
function startFromSave() {
  const loaded = Game.load(content);
  if (!loaded) return false;
  game = loaded;
  window.__game = game;
  if (game.gameOverReason) {
    ui.renderGameOver(game);
    return true;
  }
  advanceOrRender();
  return true;
}

function showTitle() {
  ui.renderTitle({
    hasSave: hasSave(),
    onContinue: () => {
      if (!startFromSave()) showTitle();
    },
    onStart: () => startNew(),
    onDebugToggle: () => {
      setDebugOn(!isDebugOn());
      showTitle();
    },
    onHelp: () => ui.showHelp(),
  });
}

/** 开新局：选人 → 落座 → 呈上开局贺表。 */
function startNew() {
  game = new Game(content);
  window.__game = game;
  game.resetRuntime();
  game.setDebug(isDebugOn());
  ui.renderStart(content.characters, (characterId) => {
    game.newGame(characterId);
    game.setDebug(isDebugOn());
    advanceOrRender();
  });
}

// ---------------------------------------------------------------- 启动

async function boot() {
  try {
    content = await loadOfficialContent();
  } catch (err) {
    console.error(err);
    ui.showError(
      `无法加载内容包：${err.message}。若直接以 file:// 打开本页，浏览器会拦截 JSON 请求。`,
      "请在 game 目录运行：python serve.py 8080，然后访问 http://localhost:8080"
    );
    return;
  }

  // URL ?debug=1 直接开调试
  if (new URLSearchParams(location.search).has("debug")) setDebugOn(true);

  // 键盘操作：1/← 批左侧，2/→ 批右侧
  window.addEventListener("keydown", (e) => {
    if (!game || !game.currentCard || game.gameOverReason) return;
    if (e.key === "1" || e.key === "ArrowLeft") choose("left");
    else if (e.key === "2" || e.key === "ArrowRight") choose("right");
  });

  game = new Game(content);
  window.__game = game; // 控制台调试句柄
  showTitle();
}

boot();
