/**
 * 局内视图（王权式）：顶栏四印宝座指标 + 居中人物卡（立绘/对白）+
 * 左右滑动批复 + 极简 chrome（纪事与功能收进菜单浮层）。
 *
 * @module app/views
 */

import { h, avatarElForName } from "./dom.js";
import { TYPE_LABELS, PILLAR_LABELS } from "./labels.js";
import { attachSwipe, flyOut } from "./swipe.js";

/** 四柱图标（宝座指标）。 */
const PILLAR_ICONS = { people: "👥", livelihood: "🌾", military: "⚔", council: "⚖" };
/** 危险阈值（趋势图标泛红）。 */
const DANGER_LOW = 20;
const DANGER_HIGH = 80;
/** 纪事在浮层中的显示条数。 */
const LOG_ROWS = 40;

// ---------------------------------------------------------------- 主界面

/**
 * 主界面：指标行 + 卡台 + 角落按钮；随后渲染当前卡。
 * @param {*} game
 * @param {object} handlers
 */
export function renderMain(game, handlers) {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const ruler = game.ruler;

  app.append(
    h("div", { class: "reign" },
      renderMeters(game),
      h("div", { class: "reign-date" },
        h("span", { class: "chip" }, `第 ${game.day} 天`),
        h("span", { class: "chip" }, `${game.season}季`),
        ruler ? h("span", { class: "chip chip-ruler" }, ruler.name) : h("span", { class: "chip chip-ruler" }, "权位空悬")
      ),
      h("div", { class: "reign-fall", id: "fall-slot" }),
      h("div", { class: "reign-stage" },
        h("button", { class: "choice-dot", id: "dot-left", title: "向左滑：批复左侧" }),
        h("div", { class: "card-slot", id: "card-slot" }),
        h("button", { class: "choice-dot", id: "dot-right", title: "向右滑：批复右侧" })
      ),
      h("button", {
        class: "btn round ability-fab",
        id: "ability-fab",
        disabled: !game.canUseAbility(),
        onclick: handlers.onAbility,
        title: ruler?.ability ? `${ruler.ability.name}：${ruler.ability.desc}` : "",
      }, ruler?.ability ? ruler.ability.name.slice(0, 2) : "技"),
      h("button", { class: "btn round menu-fab", onclick: () => toggleMenu(game, handlers) }, "☰")
    )
  );

  renderCard(game, handlers);
}

/** 指标行：四印宝座（默认只有图标，调试模式附数字）。 */
function renderMeters(game) {
  return h("div", { class: "meters", id: "meters" },
    Object.entries(PILLAR_LABELS).map(([key, label]) => {
      const value = game.state.get(`core.pillar.${key}`);
      const danger = value <= DANGER_LOW || value >= DANGER_HIGH;
      return h("div", { class: `meter ${danger ? "danger" : ""}`, dataset: { key } },
        h("span", { class: "meter-icon" }, PILLAR_ICONS[key]),
        h("span", { class: "meter-name" }, label),
        game.debug ? h("span", { class: "meter-value" }, String(value)) : null
      );
    })
  );
}

/** 调试数据行（仅调试模式）：隐藏数值一览。 */
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
 * 当前事件卡：立绘 + 对白；挂滑动交互；侧点显示批复台词。
 * 单选项卡（报告/结局）左右皆可滑走。
 * @param {*} game @param {object} handlers
 */
export function renderCard(game, handlers) {
  const slot = document.getElementById("card-slot");
  const dotLeft = document.getElementById("dot-left");
  const dotRight = document.getElementById("dot-right");
  if (!slot) return;
  slot.innerHTML = "";

  const card = game.currentCard;
  if (!card) {
    slot.append(h("div", { class: "rcard empty" }, h("p", {}, "各处事务暂告一段落……")));
    setDots(dotLeft, dotRight, null, null, () => {});
    return;
  }

  const meta = card.meta || {};
  const left = card.options?.left;
  const right = card.options?.right || left; // 单选项卡：右滑同左
  const speaker = firstSpeaker(game, card);

  const cardEl = h("div", { class: "rcard" },
    h("div", { class: "rcard-badges" },
      h("span", { class: "badge badge-source" }, card.source?.name || "未知来源"),
      h("span", { class: `badge badge-type type-${card.type}` }, TYPE_LABELS[card.type] || card.type)
    ),
    h("div", { class: "rcard-portrait" },
      speaker.avatar,
      h("div", { class: "rcard-who" }, speaker.name)
    ),
    h("div", { class: "rcard-body-wrap" },
      meta.character ? h("p", { class: "rcard-meta" }, `继任者：${meta.character.name}（${meta.character.route}）`) : null,
      meta.reasons?.length
        ? h("ul", { class: "card-reasons" }, meta.reasons.map((r) => h("li", {}, r)))
        : null,
      h("h2", { class: "rcard-title" }, card.title),
      Array.isArray(card.lines) && card.lines.length
        ? h("div", { class: "rcard-lines" },
            card.lines.map((l) => h("div", { class: "rcard-line" }, h("span", {}, l.line))))
        : h("p", { class: "rcard-text" }, card.text),
      card.hintExtra ? h("p", { class: "rcard-hint" }, card.hintExtra) : null
    )
  );
  slot.append(cardEl);

  const choose = (side) => {
    if (!card.options?.[side]) side = "left"; // 单选项卡
    cardEl.dataset.flying = "1"; // 键盘路径据此跳过重复动画
    flyOut(cardEl, side).then(() => handlers.onChoose(side));
  };
  setDots(dotLeft, dotRight, left, right, choose, game);

  attachSwipe(cardEl, (side) => choose(side), (side, progress) => {
    lightDot(dotLeft, dotRight, side, progress);
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

/** 配置左右侧点：文案、点击批复、调试 tooltip。 */
function setDots(dotLeft, dotRight, left, right, choose, game) {
  if (!dotLeft || !dotRight) return;
  for (const [dot, opt, side] of [[dotLeft, left, "left"], [dotRight, right, "right"]]) {
    dot.innerHTML = "";
    if (!opt) {
      dot.classList.add("inactive");
      dot.onclick = null;
      continue;
    }
    dot.classList.remove("inactive");
    dot.append(
      h("span", { class: "dot-seal" }, "批"),
      h("span", { class: "dot-label" }, opt.label)
    );
    if (game && game.debug && opt.effects) dot.title = JSON.stringify(opt.effects);
    else dot.title = side === "left" ? "向左滑动" : "向右滑动";
    dot.onclick = () => choose(side);
  }
}

/** 拖拽进度点亮侧点。 */
function lightDot(dotLeft, dotRight, side, progress) {
  const active = side === "left" ? dotLeft : dotRight;
  const other = side === "left" ? dotRight : dotLeft;
  if (active) active.style.setProperty("--lit", String(progress));
  if (other) other.style.setProperty("--lit", "0");
}

// ---------------------------------------------------------------- 反馈

/**
 * 决策后的宝座反馈：受影响指标上方浮出 ▲/▼（默认模式唯一数值线索，
 * 只示方向不示大小）。
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

/** 下台横幅（顶栏下短暂显示）。 @param {*} fell */
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
      h("button", { class: "btn", onclick: () => mask.remove() }, "回到批牍")
    )
  );
  document.body.append(mask);
}
