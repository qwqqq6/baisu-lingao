/**
 * 局内视图：主界面骨架（四柱/调试面板/纪事/工具栏）、事件卡、
 * 结算反馈与下台提示。全屏场景在 ./screens.js。
 *
 * @module app/views
 */

import { h, avatarElForName } from "./dom.js";
import { TYPE_LABELS, STAGE_LABELS, PILLAR_LABELS } from "./labels.js";

/** 四柱告警阈值（趋势条变红）。 */
const PILLAR_DANGER_LOW = 20;
const PILLAR_DANGER_HIGH = 80;
/** 纪事显示条数。 */
const LOG_ROWS = 24;

/**
 * 主界面骨架：顶栏（天数/阶段/执政者）+ 四柱 + 调试面板 +
 * 反馈区 + 事件卡 + 营地纪事 + 工具栏，随后渲染当前卡。
 *
 * @param {*} game
 * @param {object} handlers 事件回调（见 app/main.js handlers()）
 */
export function renderMain(game, handlers) {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const ruler = game.ruler;

  app.append(
    h("div", { class: "layout" },
      renderTopbar(game, ruler),
      h("div", { class: "main-grid" },
        h("div", { class: "left-col" },
          renderPillars(game),
          renderDebugPanel(game, handlers),
          h("section", { class: "feedback", id: "feedback" }),
          h("section", { class: "card-area", id: "card-area" })
        ),
        h("div", { class: "right-col" }, renderLog(game))
      ),
      renderToolbar(game, ruler, handlers)
    )
  );

  renderCard(game, handlers);
}

/** 顶栏：标题 + 天数/阶段·季节/执政者徽章。 */
function renderTopbar(game, ruler) {
  return h("header", { class: "topbar" },
    h("div", { class: "topbar-title" }, "临高启明 · 执政者"),
    h("div", { class: "topbar-info" },
      h("span", { class: "chip" }, `第 ${game.day} 天`),
      h("span", { class: "chip" }, `${STAGE_LABELS[game.stage]} · ${game.season}季`),
      ruler
        ? h("span", { class: "chip chip-ruler" }, `${ruler.name} · ${ruler.route}`)
        : h("span", { class: "chip chip-ruler" }, "权位空悬")
    )
  );
}

/** 四柱趋势条：默认模式只显示条形，调试模式附精确数字。 */
function renderPillars(game) {
  return h("div", { class: "pillars" },
    Object.entries(PILLAR_LABELS).map(([key, label]) => {
      const value = game.state.get(`core.pillar.${key}`);
      const danger = value <= PILLAR_DANGER_LOW || value >= PILLAR_DANGER_HIGH;
      return h("div", { class: "pillar" },
        h("div", { class: "pillar-top" },
          h("span", {}, label),
          game.debug ? h("span", { class: "pillar-value" }, String(value)) : null),
        h("div", { class: "pillar-bar" },
          h("div", { class: `pillar-fill ${danger ? "danger" : ""}`, style: `width:${value}%` }))
      );
    })
  );
}

/** 调试面板（仅调试模式）：隐藏数值 + 势力表 + 调试按钮。 */
function renderDebugPanel(game, handlers) {
  if (!game.debug) return null;
  const bar = (label, id) =>
    h("div", { class: "debug-bar" }, h("span", {}, label), h("span", {}, String(game.state.get(id))));
  const action = (label, kind) =>
    h("button", { class: "btn ghost", onclick: () => handlers.onDebugAction(kind) }, label);
  return h("div", { class: "debug-panel" },
    h("h4", {}, "调试面板"),
    bar("风声", "core.wind"),
    bar("个人压力", "ruler.pressure_personal"),
    bar("派系警惕", "ruler.pressure_faction"),
    bar("暴力风险", "ruler.pressure_violence"),
    bar("合法性", "ruler.legitimacy"),
    h("div", { class: "debug-forces" },
      game.forces.definitions
        .filter((d) => game.forces.isUnlocked(d.id))
        .map((d) => h("div", {},
          `「${d.name}」 影响力${game.forces.metric(d.id, "influence")}` +
          ` · 满意${game.forces.metric(d.id, "satisfaction")}` +
          ` · 敌意${game.forces.metric(d.id, "hostility")}`))
    ),
    h("div", { class: "debug-actions" },
      action("跳5天", "skip5"),
      action("压力+20", "personal"),
      action("警惕+20", "faction"),
      action("暴力+20", "violence"),
      action("合法性-20", "legitimacy")
    )
  );
}

/** 营地纪事（最近 LOG_ROWS 条）。 */
function renderLog(game) {
  return h("aside", { class: "log", id: "log" },
    h("h3", {}, "营地纪事"),
    h("ul", {},
      game.log.slice(0, LOG_ROWS).map((entry) =>
        h("li", { class: `log-item log-${entry.kind}` },
          h("span", { class: "log-day" }, `第${entry.day}天`),
          h("span", {}, entry.text)
        )
      )
    )
  );
}

/** 工具栏：能力 / 存读导导 / 调试 / 说明 / 重开。 */
function renderToolbar(game, ruler, handlers) {
  return h("div", { class: "toolbar" },
    ruler?.ability
      ? h("button", {
          class: "btn ability",
          disabled: !game.canUseAbility(),
          onclick: handlers.onAbility,
          title: ruler.ability.desc,
        }, game.canUseAbility()
          ? `人物能力 · ${ruler.ability.name}`
          : `能力冷却中（第${game.abilityReadyDay}天可用）`)
      : null,
    h("button", { class: "btn ghost", onclick: handlers.onSave }, "存档"),
    h("button", { class: "btn ghost", onclick: handlers.onLoad }, "读档"),
    h("button", { class: "btn ghost", onclick: handlers.onExportSave }, "导出存档"),
    h("label", { class: "btn ghost btn-file" }, "导入存档",
      h("input", { type: "file", accept: "application/json,.json", style: "display:none",
        onchange: (e) => handlers.onImportFile(e.target.files && e.target.files[0]) })),
    h("button", { class: "btn ghost", onclick: handlers.onDebugToggle }, `调试：${game.debug ? "开" : "关"}`),
    h("button", { class: "btn ghost", onclick: handlers.onHelp }, "玩法说明"),
    h("button", { class: "btn danger ghost", onclick: handlers.onRestart }, "重新开始")
  );
}

/**
 * 当前事件卡：来源/类型徽章 + 对话气泡（lines）或呈文（text）+
 * 变体提示 + 批示选项（调试模式附效果 tooltip）。
 * @param {*} game @param {object} handlers
 */
export function renderCard(game, handlers) {
  const area = document.getElementById("card-area");
  const feedback = document.getElementById("feedback");
  if (!area) return;
  area.innerHTML = "";
  if (feedback) feedback.innerHTML = "";

  const card = game.currentCard;
  if (!card) {
    area.append(h("div", { class: "card empty" }, h("p", {}, "各处事务暂告一段落……")));
    return;
  }

  const meta = card.meta || {};
  const sourceBadge = h("span", { class: "badge badge-source" }, card.source?.name || "未知来源");
  const typeBadge = h("span", { class: `badge badge-type type-${card.type}` }, TYPE_LABELS[card.type] || card.type);

  const body = h("div", { class: "card" },
    h("div", { class: "card-badges" }, sourceBadge, typeBadge),
    h("h2", { class: "card-title" }, card.title),
    meta.character
      ? h("p", { class: "card-meta" }, `继任者：${meta.character.name}（${meta.character.route}）`)
      : null,
    meta.reasons?.length
      ? h("ul", { class: "card-reasons" }, meta.reasons.map((reason) => h("li", {}, reason)))
      : null,
    Array.isArray(card.lines) && card.lines.length
      ? h("div", { class: "dialog" },
          card.lines.map((l) => h("div", { class: "dialog-line" },
            avatarElForName(game, l.who),
            h("div", { class: "dialog-body" },
              h("div", { class: "dialog-who" }, l.who),
              h("div", { class: "dialog-bubble" }, l.line)))))
      : h("p", { class: "card-text" }, card.text),
    card.hintExtra ? h("p", { class: "card-hint-extra" }, card.hintExtra) : null,
    h("div", { class: "option-divider" }, h("span", {}, "批示")),
    h("div", { class: "card-options" },
      ["left", "right"].map((side) => {
        const option = card.options?.[side];
        if (!option) return null;
        return h("button", {
          class: "option",
          title: game.debug && option.effects ? JSON.stringify(option.effects) : undefined,
          onclick: () => handlers.onChoose(side),
        },
          h("div", { class: "option-label" }, h("span", { class: "pyin" }, "批"), option.label),
          option.hint ? h("div", { class: "option-hint" }, option.hint) : null
        );
      })
    )
  );
  area.append(body);
}

/**
 * 结算反馈：调试模式给全部数据，默认模式只有一句「照批」。
 * @param {{deltas: string, notes: string[]}|null} fb
 * @param {boolean} debugMode
 */
export function showFeedback(fb, debugMode) {
  const feedback = document.getElementById("feedback");
  if (!feedback || !fb) return;
  feedback.innerHTML = "";
  if (!debugMode) {
    feedback.append(h("div", { class: "feedback-box" }, h("span", { class: "feedback-seal" }, "照批")));
    return;
  }
  feedback.append(
    h("div", { class: "feedback-box" },
      h("span", { class: "feedback-seal" }, "照批"),
      h("span", { class: "feedback-deltas" }, fb.deltas),
      (fb.notes || []).map((n) => h("span", { class: "feedback-note" }, n))
    )
  );
}

/** 下台提示（附在反馈区）。 @param {*} fell performStepDown 的返回值 */
export function showFallNotice(fell) {
  if (!fell) return;
  const fate = fell.fateLabel ? `——${fell.fateLabel}` : "";
  const text = fell.entrenched
    ? `${fell.character.name} 被强行挽留，位子保住了，威权却没有了。`
    : fell.dead
      ? `${fell.character.name} 死了（${fell.reason}）${fate}。朝局震动，继任者即将产生。`
      : `${fell.character.name} 因「${fell.reason}」下台${fate}。继任者即将产生。`;
  const feedback = document.getElementById("feedback");
  if (feedback) {
    feedback.append(h("div", { class: "fall-notice" }, text));
  }
}
