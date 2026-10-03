/**
 * 局内视图（王权式·烛光暗夜版）：顶部金线图标宝座 + 居中牌匾大卡
 * （立绘/对白）+ 左右斜向批复文字 + 底部在位纪年 + 角落浮钮。
 * 纪事与功能收进菜单浮层。
 *
 * @module app/views
 */

import { h, avatarElForName } from "./dom.js";
import { TYPE_LABELS, PILLAR_LABELS } from "./labels.js";
import { attachSwipe, flyOut } from "./swipe.js";

/** 危险阈值（图标泛红、背景切换为危机图，两者对齐）。 */
const DANGER_LOW = 20;
const DANGER_HIGH = 80;
/** 背景切换：风声高涨 / 全柱鼎盛阈值。 */
const BG_WIND_HIGH = 70;
const BG_GOLD_MIN = 65;
/** 纪事在浮层中的显示条数。 */
const LOG_ROWS = 40;

/** 四柱金线图标（SVG 线描，王权式）。 */
const PILLAR_SVGS = {
  people: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="10" r="4.4"/><path d="M7 26c1.6-5.2 5-7.6 9-7.6s7.4 2.4 9 7.6"/></svg>`,
  livelihood: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 28V8"/><path d="M16 12c-4-.6-6-3-6.4-6.4 3.6.3 6 2.4 6.4 6.4zM16 12c4-.6 6-3 6.4-6.4-3.6.3-6 2.4-6.4 6.4z"/>
    <path d="M16 18c-4-.6-6-3-6.4-6.4 3.6.3 6 2.4 6.4 6.4zM16 18c4-.6 6-3 6.4-6.4-3.6.3-6 2.4-6.4 6.4z"/>
    <path d="M16 24c-4-.6-6-3-6.4-6.4 3.6.3 6 2.4 6.4 6.4zM16 24c4-.6 6-3 6.4-6.4-3.6.3-6 2.4-6.4 6.4z"/></svg>`,
  military: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M25 7l-3.4 12L11 25l-4-4L19 10.4 25 7z"/><path d="M8 20l4 4"/><path d="M6 26l3-3"/><path d="M25 7l1.6-1.6"/></svg>`,
  council: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 5v20"/><path d="M8 9h16"/><path d="M16 25H7"/><path d="M16 25h9"/>
    <path d="M7 25l-2.6-7h5.2L7 25z"/><path d="M25 25l-2.6-7h5.2L25 25z"/>
    <path d="M7 9l9 4 9-4"/><circle cx="16" cy="4" r="1.4"/></svg>`,
};

// ---------------------------------------------------------------- 主界面

/**
 * 按局势挑像素背景键（挂 .reign 的 data-bg，CSS 换图）：
 * 任一柱进入危险区（与图标泛红同阈值）→ 该柱危机图，多柱同危取离中点最远者；
 * 风声高涨 → 暗潮涌动；四柱皆盛 → 金光普照；否则太平月夜。
 * @param {*} game
 * @returns {"people"|"livelihood"|"military"|"council"|"wind"|"gold"|"calm"}
 */
export function pickBackground(game) {
  const pillars = Object.keys(PILLAR_LABELS).map((key) => {
    const value = game.state.get(`core.pillar.${key}`);
    return { key, value, extremity: Math.abs(value - 50) };
  });
  const worst = pillars
    .filter((p) => p.value <= DANGER_LOW || p.value >= DANGER_HIGH)
    .sort((a, b) => b.extremity - a.extremity)[0];
  if (worst) return worst.key;
  if (game.state.get("core.wind") >= BG_WIND_HIGH) return "wind";
  if (pillars.every((p) => p.value >= BG_GOLD_MIN)) return "gold";
  return "calm";
}

/**
 * 主界面：宝座行 + 卡台（斜向选项）+ 底部纪年 + 角落浮钮；随后渲染当前卡。
 * @param {*} game
 * @param {object} handlers
 */
export function renderMain(game, handlers) {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const ruler = game.ruler;

  app.append(
    h("div", { class: "reign", dataset: { bg: pickBackground(game) } },
      renderMeters(game),
      h("div", { class: "reign-stage" },
        h("button", { class: "choice choice-left", id: "choice-left", title: "向左滑动批复" }),
        h("div", { class: "card-slot", id: "card-slot" }),
        h("button", { class: "choice choice-right", id: "choice-right", title: "向右滑动批复" })
      ),
      h("div", { class: "reign-fall", id: "fall-slot" }),
      h("div", { class: "reign-footer" },
        `第 ${game.day} 天 · ${game.season}季 · ${ruler ? ruler.name : "权位空悬"}在位`
      ),
      h("button", {
        class: "fab fab-ability",
        disabled: !game.canUseAbility(),
        onclick: handlers.onAbility,
        title: ruler?.ability ? `${ruler.ability.name}：${ruler.ability.desc}` : "",
      }, "技"),
      h("button", { class: "fab fab-menu", onclick: () => toggleMenu(game, handlers) }, "☰")
    )
  );

  renderCard(game, handlers);
}

/** 宝座行：金线图标 + 进度细条（四柱为公开指标），危险泛红；调试模式附数字。 */
function renderMeters(game) {
  return h("div", { class: "meters", id: "meters" },
    Object.entries(PILLAR_LABELS).map(([key, label]) => {
      const value = game.state.get(`core.pillar.${key}`);
      const danger = value <= DANGER_LOW || value >= DANGER_HIGH;
      const icon = h("span", { class: "meter-icon", title: label });
      icon.innerHTML = PILLAR_SVGS[key];
      return h("div", { class: `meter ${danger ? "danger" : ""}`, dataset: { key }, title: label },
        icon,
        h("div", { class: "meter-track" },
          h("div", { class: `meter-fill ${danger ? "danger" : ""}`, style: `width:${value}%` })),
        game.debug ? h("span", { class: "meter-value" }, String(value)) : null
      );
    })
  );
}

/** 调试数据行（仅调试模式，位于菜单浮层内）。 */
function renderDebugStrip(game, handlers) {
  if (!game.debug) return null;
  const bar = (label, id) =>
    h("span", { class: "dbg-item" }, `${label} ${game.state.get(id)}`);
  const action = (label, kind) =>
    h("button", { class: "btn tiny", onclick: () => handlers.onDebugAction(kind) }, label);
  return h("div", { class: "debug-strip" },
    bar("风声", "core.wind"),
    bar("压", "ruler.pressure_personal"),
    bar("惕", "ruler.pressure_faction"),
    bar("暴", "ruler.pressure_violence"),
    bar("威", "ruler.legitimacy"),
    h("span", { class: "dbg-item forces" },
      game.forces.definitions
        .filter((d) => game.forces.isUnlocked(d.id))
        .map((d) => `${d.name.slice(0, 2)}${game.forces.metric(d.id, "influence")}/${game.forces.metric(d.id, "satisfaction")}/${game.forces.metric(d.id, "hostility")}`)
        .join(" ")),
    action("跳5天", "skip5"), action("压+20", "personal"),
    action("惕+20", "faction"), action("暴+20", "violence"), action("威-20", "legitimacy")
  );
}

// ---------------------------------------------------------------- 事件卡

/**
 * 当前事件卡：立绘 + 对白；挂滑动交互；两侧斜向文字显示批复台词。
 * 单选项卡（报告/结局）左右皆可滑走。
 * @param {*} game @param {object} handlers
 */
export function renderCard(game, handlers) {
  const slot = document.getElementById("card-slot");
  const choiceLeft = document.getElementById("choice-left");
  const choiceRight = document.getElementById("choice-right");
  if (!slot) return;
  slot.innerHTML = "";

  const card = game.currentCard;
  if (!card) {
    slot.append(h("div", { class: "rcard empty" }, h("p", {}, "各处事务暂告一段落……")));
    setChoices(choiceLeft, choiceRight, null, null, () => {});
    return;
  }

  const meta = card.meta || {};
  const left = card.options?.left;
  const right = card.options?.right || left; // 单选项卡：右滑同左
  const speaker = firstSpeaker(game, card);

  const cardEl = h("div", { class: "rcard" },
    h("div", { class: "rcard-frame" }),
    h("div", { class: "rcard-badges" },
      h("span", { class: "badge badge-source" }, card.source?.name || "未知来源"),
      h("span", { class: `badge badge-type type-${card.type}` }, TYPE_LABELS[card.type] || card.type)
    ),
    h("div", { class: "rcard-portrait" },
      speaker.avatar,
      h("div", { class: "rcard-who" }, speaker.name)
    ),
    h("div", { class: "rcard-body" },
      h("h2", { class: "rcard-title" }, card.title),
      Array.isArray(card.lines) && card.lines.length
        ? h("div", { class: "rcard-lines" },
            card.lines.map((l) => h("div", { class: "rcard-line" }, h("span", {}, l.line))))
        : h("p", { class: "rcard-text" }, card.text),
      card.hintExtra ? h("p", { class: "rcard-hint" }, card.hintExtra) : null,
      meta.character ? h("p", { class: "rcard-meta" }, `继任者：${meta.character.name}（${meta.character.route}）`) : null,
      meta.reasons?.length
        ? h("ul", { class: "card-reasons" }, meta.reasons.map((r) => h("li", {}, r)))
        : null
    )
  );
  slot.append(cardEl);

  const choose = (side) => {
    if (!card.options?.[side]) side = "left"; // 单选项卡
    cardEl.dataset.flying = "1"; // 键盘路径据此跳过重复动画
    flyOut(cardEl, side).then(() => handlers.onChoose(side));
  };
  setChoices(choiceLeft, choiceRight, left, right, choose, game);

  attachSwipe(cardEl, (side) => choose(side), (side, progress) => {
    lightChoice(choiceLeft, choiceRight, side, progress);
  });
}

/** 取首说话人（立绘与名牌）。 */
function firstSpeaker(game, card) {
  if (Array.isArray(card.lines) && card.lines.length && card.lines[0].who) {
    return { name: card.lines[0].who, avatar: avatarElForName(game, card.lines[0].who) };
  }
  const name = card.source?.name || "未知来源";
  return { name, avatar: avatarElForName(game, name) };
}

/** 配置两侧斜向批复文字：文案、点击批复、调试 tooltip。 */
function setChoices(choiceLeft, choiceRight, left, right, choose, game) {
  if (!choiceLeft || !choiceRight) return;
  for (const [el, opt, side] of [[choiceLeft, left, "left"], [choiceRight, right, "right"]]) {
    el.innerHTML = "";
    if (!opt) {
      el.classList.add("inactive");
      el.onclick = null;
      continue;
    }
    el.classList.remove("inactive");
    el.append(h("span", { class: "choice-text" }, opt.label));
    if (game && game.debug && opt.effects) el.title = JSON.stringify(opt.effects);
    else el.title = side === "left" ? "向左滑动批复" : "向右滑动批复";
    el.onclick = () => choose(side);
  }
}

/** 拖拽进度点亮对应侧文字。 */
function lightChoice(choiceLeft, choiceRight, side, progress) {
  const active = side === "left" ? choiceLeft : choiceRight;
  const other = side === "left" ? choiceRight : choiceLeft;
  if (active) active.style.setProperty("--lit", String(progress));
  if (other) other.style.setProperty("--lit", "0");
}

// ---------------------------------------------------------------- 反馈

/**
 * 决策后的宝座反馈：受影响图标上方浮出 ▲/▼。
 * @param {Record<string, number>|undefined} pillarDeltas
 */
export function showFeedback(fb) {
  const meters = document.getElementById("meters");
  if (!meters || !fb || !fb.pillarDeltas) return;
  for (const [key, delta] of Object.entries(fb.pillarDeltas)) {
    const meter = meters.querySelector(`[data-key="${key}"]`);
    if (!meter) continue;
    const dot = h("span", { class: `meter-delta ${delta > 0 ? "up" : "down"}` },
      delta > 0 ? "▲" : "▼");
    meter.append(dot);
    setTimeout(() => dot.remove(), 1300);
  }
}

/** 下台横幅。 @param {*} fell */
export function showFallNotice(fell) {
  if (!fell) return;
  const slot = document.getElementById("fall-slot");
  if (!slot) return;
  slot.innerHTML = "";
  const fate = fell.fateLabel ? `——${fell.fateLabel}` : "";
  const text = fell.entrenched
    ? `${fell.character.name} 被强行挽留，威权已失。`
    : fell.dead
      ? `${fell.character.name} 死了（${fell.reason}）${fate}。`
      : `${fell.character.name} 因「${fell.reason}」下台${fate}。`;
  slot.append(h("div", { class: "fall-banner" }, text));
  setTimeout(() => { if (slot.firstChild) slot.innerHTML = ""; }, 3500);
}

// ---------------------------------------------------------------- 菜单浮层

/** 切换菜单浮层（存读/导入导出/调试/纪事/说明/重开）。 */
function toggleMenu(game, handlers) {
  const existing = document.getElementById("menu-mask");
  if (existing) { existing.remove(); return; }

  const mask = h("div", {
    class: "menu-mask", id: "menu-mask",
    onclick: (e) => { if (e.target.id === "menu-mask") mask.remove(); },
  },
    h("div", { class: "menu-panel" },
      h("h2", {}, "临高启明 · 执政者"),
      h("div", { class: "menu-actions" },
        h("button", { class: "btn ghost", onclick: handlers.onSave }, "存档"),
        h("button", { class: "btn ghost", onclick: handlers.onLoad }, "读档"),
        h("button", { class: "btn ghost", onclick: () => { mask.remove(); handlers.onExportSave(); } }, "导出存档"),
        h("label", { class: "btn ghost btn-file" }, "导入存档",
          h("input", { type: "file", accept: "application/json,.json", style: "display:none",
            onchange: (e) => { mask.remove(); handlers.onImportFile(e.target.files && e.target.files[0]); } })),
        h("button", { class: "btn ghost", onclick: handlers.onDebugToggle }, `调试模式：${game.debug ? "开" : "关"}`),
        h("button", { class: "btn ghost", onclick: handlers.onHelp }, "玩法说明"),
        h("button", { class: "btn danger ghost", onclick: handlers.onRestart }, "重新开始")
      ),
      h("div", { class: "debug-slot" }, renderDebugStrip(game, handlers)),
      h("h3", {}, "营地纪事"),
      h("ul", { class: "menu-log" },
        game.log.slice(0, LOG_ROWS).map((entry) =>
          h("li", { class: `log-item log-${entry.kind}` },
            h("span", { class: "log-day" }, `第${entry.day}天`),
            h("span", {}, entry.text)
          )
        )
      ),
      h("div", { class: "menu-close" },
        h("button", { class: "btn", onclick: () => mask.remove() }, "回到批牍"))
    )
  );
  document.body.append(mask);
}
