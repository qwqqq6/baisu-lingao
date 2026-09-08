/**
 * 中文界面渲染：开局选人、主界面（四柱/卡牌/日志/能力）、结局与帮助。
 * 原生 DOM 操作，不引入任何框架。
 */

import { COLLAPSE_TEXTS } from "./game.js";

const TYPE_LABELS = {
  opening: "开局",
  key: "关键",
  daily: "日常",
  crisis: "危机",
  price: "索价",
  benefit: "收益",
  backlash: "反噬",
  omen: "前兆",
  downfall: "倒台",
  legacy: "遗产",
  cleanup: "善后",
  exclusive: "专属",
  report: "阶段报告",
  epilogue: "结局",
  succession: "继任",
};

const STAGE_LABELS = { landing: "登陆期", expansion: "扩张期", consolidation: "巩固期" };

const PILLAR_LABELS = {
  people: "民望",
  livelihood: "生计",
  military: "军务",
  council: "元老院",
};

const COLLAPSE_HINTS = {
  livelihood: "生计见底",
  people: "民望崩坏",
  military: "军务膨胀",
  council: "元老院离析",
  wind: "风声走漏",
  legitimacy: "威信扫地",
  succession: "继任无人",
};

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "disabled" || key === "checked") el[key] = Boolean(value);
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

const DEBUG_KEY = "lingqi-debug";

export function isDebugOn() {
  try { return localStorage.getItem(DEBUG_KEY) === "1"; } catch { return false; }
}

export function setDebugOn(on) {
  try { localStorage.setItem(DEBUG_KEY, on ? "1" : "0"); } catch { /* 忽略 */ }
}

/** 头像：优先读 assets/portraits/<id>.png，加载失败回落首字剪影 */
function avatarEl(id, name) {
  const wrap = h("span", { class: "avatar", title: name },
    h("span", { class: "avatar-fallback" }, (name || "?").slice(0, 1)));
  const img = h("img", { src: `./assets/portraits/${id || "unknown"}.png`, alt: name || "" });
  img.addEventListener("error", () => img.remove());
  wrap.append(img);
  return wrap;
}

function avatarElForName(game, name) {
  const character = game.characterManager.characters.find((c) => c.name === name);
  return avatarEl(character ? character.id : null, name);
}

export const ui = {
  /** 内容加载失败提示 */
  showError(message, hint) {
    const app = document.getElementById("app");
    app.innerHTML = "";
    app.append(
      h("div", { class: "fatal" },
        h("h1", {}, "游戏加载失败"),
        h("p", {}, message),
        h("p", { class: "fatal-hint" }, hint || "请通过本地静态服务器访问本页，例如：python -m http.server 8080")
      )
    );
  },

  /** 标题页：开始游戏 */
  renderTitle(opts) {
    const app = document.getElementById("app");
    app.innerHTML = "";
    const embers = Array.from({ length: 7 }, (_, i) =>
      h("i", { class: "ember", style: `left:${8 + i * 13}%; animation-delay:${i * 1.7}s; animation-duration:${9 + (i % 4) * 2.5}s;` })
    );
    // 旗帜切片波动：竖切 16 条，振幅向旗尾递增、相位依次错开，形成自旗杆传出的行波
    const flagDiv = h("div", { class: "flag" });
    const N = 16;
    for (let i = 0; i < N; i++) {
      const slice = h("i", { class: "flag-slice" });
      slice.style.left = (i * 100 / N) + "%";
      slice.style.width = (100 / N + 0.12) + "%";
      slice.style.backgroundImage = "url('./assets/yuanlaoyuan-flag.jpg')";
      slice.style.backgroundSize = (N * 100) + "% 100%";
      slice.style.backgroundPositionX = (i / (N - 1) * 100) + "%";
      slice.style.setProperty("--amp", (0.6 + 12 * (i / (N - 1))).toFixed(1));
      slice.style.animationDelay = (-(i * 0.085)).toFixed(2) + "s";
      flagDiv.append(slice);
    }
    app.append(
      h("div", { class: "title-screen" },
        h("div", { class: "embers" }, embers),
        h("div", { class: "title-inner" },
          h("div", { class: "flag-wrap" },
            h("div", { class: "flagpole" }),
            flagDiv
          ),
          h("h1", { class: "game-title" }, "临高启明"),
          h("div", { class: "game-sub" }, "执政者"),
          h("p", { class: "title-line" }, "崇祯元年，五百穿越众登陆琼州临高。"),
          h("div", { class: "title-buttons" },
            opts.hasSave ? h("button", { class: "btn", onclick: opts.onContinue }, "继续上次") : null,
            h("button", { class: "btn", onclick: opts.onStart }, "开始游戏"),
            h("button", { class: "btn ghost", onclick: opts.onDebugToggle }, `调试模式：${isDebugOn() ? "开" : "关"}`),
            h("button", { class: "btn ghost", onclick: opts.onHelp }, "玩法说明")
          )
        )
      )
    );
  },

  /** 开局：选择人物 */
  renderStart(characters, onSelect) {
    const app = document.getElementById("app");
    app.innerHTML = "";
    app.append(
      h("div", { class: "start" },
        h("header", { class: "start-head" },
          h("h1", {}, "选择一位首长"),
          h("p", { class: "muted" }, "百事待举，总得有人执掌大局。")
        ),
        h("div", { class: "char-grid" },
          characters.map((character) =>
            h("button", { class: "char-card", onclick: () => onSelect(character.id) },
              h("div", { class: "char-head" },
                avatarEl(character.id, character.name),
                h("div", {},
                  h("div", { class: "char-name" }, character.name),
                  h("div", { class: "char-route" }, character.route, character.title ? ` · ${character.title}` : ""))),
              h("div", { class: "char-line" }, h("span", { class: "char-key" }, "性格："), character.personality.join("、")),
              h("div", { class: "char-line" }, h("span", { class: "char-key" }, "擅长："), character.strengths),
              h("div", { class: "char-line" }, h("span", { class: "char-key" }, "风险："), character.risks),
              h("div", { class: "char-line" }, h("span", { class: "char-key" }, "加成："), character.initialBonus?.desc || "无"),
              h("div", { class: "char-line char-fall" }, h("span", { class: "char-key" }, "倒台："), character.fallStyles)
            )
          )
        ),
        h("footer", { class: "start-foot" },
          h("button", { class: "btn ghost", id: "btn-help-start", onclick: () => this.showHelp() }, "玩法说明")
        )
      )
    );
  },

  /** 主界面骨架 + 每回合刷新 */
  renderMain(game, handlers) {
    const app = document.getElementById("app");
    app.innerHTML = "";
    const ruler = game.ruler;

    const pillars = h("div", { class: "pillars" },
      Object.entries(PILLAR_LABELS).map(([key, label]) => {
        const value = game.state.get(`core.pillar.${key}`);
        return h("div", { class: "pillar" },
          h("div", { class: "pillar-top" },
            h("span", {}, label),
            game.debug ? h("span", { class: "pillar-value" }, String(value)) : null),
          h("div", { class: "pillar-bar" }, h("div", { class: `pillar-fill ${value <= 20 || value >= 80 ? "danger" : ""}`, style: `width:${value}%` }))
        );
      })
    );

    const debugPanels = game.debug ? h("div", { class: "debug-panel" },
      h("h4", {}, "调试面板"),
      h("div", { class: "debug-bar" }, h("span", {}, "风声"), h("span", {}, String(game.state.get("core.wind")))),
      h("div", { class: "debug-bar" }, h("span", {}, "个人压力"), h("span", {}, String(game.state.get("ruler.pressure_personal")))),
      h("div", { class: "debug-bar" }, h("span", {}, "派系警惕"), h("span", {}, String(game.state.get("ruler.pressure_faction")))),
      h("div", { class: "debug-bar" }, h("span", {}, "暴力风险"), h("span", {}, String(game.state.get("ruler.pressure_violence")))),
      h("div", { class: "debug-bar" }, h("span", {}, "合法性"), h("span", {}, String(game.state.get("ruler.legitimacy")))),
      h("div", { class: "debug-forces" },
        game.forces.definitions.filter((d) => game.forces.isUnlocked(d.id)).map((d) =>
          h("div", {}, `「${d.name}」 影响力${game.forces.metric(d.id, "influence")} · 满意${game.forces.metric(d.id, "satisfaction")} · 敌意${game.forces.metric(d.id, "hostility")}`))
      ),
      h("div", { class: "debug-actions" },
        h("button", { class: "btn ghost", onclick: () => handlers.onDebugAction("skip5") }, "跳5天"),
        h("button", { class: "btn ghost", onclick: () => handlers.onDebugAction("personal") }, "压力+20"),
        h("button", { class: "btn ghost", onclick: () => handlers.onDebugAction("faction") }, "警惕+20"),
        h("button", { class: "btn ghost", onclick: () => handlers.onDebugAction("violence") }, "暴力+20"),
        h("button", { class: "btn ghost", onclick: () => handlers.onDebugAction("legitimacy") }, "合法性-20")
      )
    ) : null;

    const header = h("header", { class: "topbar" },
      h("div", { class: "topbar-title" }, "临高启明 · 执政者"),
      h("div", { class: "topbar-info" },
        h("span", { class: "chip" }, `第 ${game.day} 天`),
        h("span", { class: "chip" }, `${STAGE_LABELS[game.stage]} · ${game.season}季`),
        ruler ? h("span", { class: "chip chip-ruler" }, `${ruler.name} · ${ruler.route}`) : h("span", { class: "chip chip-ruler" }, "权位空悬")
      )
    );

    const cardArea = h("section", { class: "card-area", id: "card-area" });
    const feedback = h("section", { class: "feedback", id: "feedback" });
    const logArea = h("aside", { class: "log", id: "log" },
      h("h3", {}, "营地纪事"),
      h("ul", {},
        game.log.slice(0, 24).map((entry) =>
          h("li", { class: `log-item log-${entry.kind}` },
            h("span", { class: "log-day" }, `第${entry.day}天`),
            h("span", {}, entry.text)
          )
        )
      )
    );

    const toolbar = h("div", { class: "toolbar" },
      ruler?.ability
        ? h("button", {
            class: "btn ability",
            disabled: !game.canUseAbility(),
            onclick: handlers.onAbility,
            title: ruler.ability.desc,
          }, game.canUseAbility() ? `人物能力 · ${ruler.ability.name}` : `能力冷却中（第${game.abilityReadyDay}天可用）`)
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

    app.append(
      h("div", { class: "layout" },
        header,
        h("div", { class: "main-grid" },
          h("div", { class: "left-col" }, pillars, debugPanels, feedback, cardArea),
          h("div", { class: "right-col" }, logArea)
        ),
        toolbar
      )
    );

    this.renderCard(game, handlers);
  },

  /** 当前事件卡 */
  renderCard(game, handlers) {
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
  },

  /** 结算反馈：调试模式给全部数据，默认模式只有一句「照批」 */
  showFeedback(fb, debugMode) {
    const feedback = document.getElementById("feedback");
    if (!feedback) return;
    feedback.innerHTML = "";
    if (!fb) return;
    if (!debugMode) {
      feedback.append(
        h("div", { class: "feedback-box" }, h("span", { class: "feedback-seal" }, "照批"))
      );
      return;
    }
    feedback.append(
      h("div", { class: "feedback-box" },
        h("span", { class: "feedback-seal" }, "照批"),
        h("span", { class: "feedback-deltas" }, fb.deltas),
        (fb.notes || []).map((n) => h("span", { class: "feedback-note" }, n))
      )
    );
  },

  /** 下台提示 */
  showFallNotice(fell) {
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
  },

  /** 结局画面 */
  renderGameOver(game) {
    const reason = game.gameOverReason;
    const app = document.getElementById("app");
    const rulerNames = [...new Set((game.state.get("history.former_rulers") || []).concat(game.rulerId !== "none" ? [game.rulerId] : []))]
      .map((id) => game.characterManager.get(id)?.name || id)
      .join("、") || "无";
    const title = game.gameOverTitle || `终局：${COLLAPSE_TEXTS_TITLE(reason)}`;
    const text = game.gameOverText
      || (reason === "succession"
        ? "继任无人：没有人能被推上台，营地陷入漫长的空位期，直到外部势力不请自来。"
        : COLLAPSE_TEXTS[reason]?.text || "");
    const buttonLabel = game.gameOverButton || "重新开始";
    app.innerHTML = "";
    app.append(
      h("div", { class: "gameover" },
        h("h1", {}, title),
        h("p", { class: "gameover-text" }, text),
        h("div", { class: "gameover-stats" },
          h("div", {}, `坚持天数：第 ${game.day} 天`),
          h("div", {}, `历任执政者：${rulerNames}`),
          h("div", {}, `最终四柱：民望 ${game.state.get("core.pillar.people")} / 生计 ${game.state.get("core.pillar.livelihood")} / 军务 ${game.state.get("core.pillar.military")} / 元老院 ${game.state.get("core.pillar.council")}`)
        ),
        h("button", { class: "btn", onclick: () => location.reload() }, buttonLabel)
      )
    );
  },

  showHelp() {
    const existing = document.getElementById("help-mask");
    if (existing) existing.remove();
    const mask = h("div", {
      class: "help-mask",
      id: "help-mask",
      onclick: (event) => { if (event.target.id === "help-mask") mask.remove(); },
    },
      h("div", { class: "help-panel" },
        h("h2", {}, "玩法说明"),
        h("p", {}, "你扮演一位穿越集团的执政者。每一张卡是一次摊在案头的事件，左右二选一；选择会改变四柱（民望、生计、军务、元老院），也会悄悄改变风声、隐藏势力和你自身的处境。"),
        h("p", {}, "四柱是公开的局势指标，任何一项滑向极端都会导致总崩局。风声、势力数值与你的个人压力、派系警惕、暴力风险、继任合法性全部隐藏——你只能通过卡牌来源、文本和「营地纪事」判断局势。"),
        h("p", {}, "压力逼近危险时，会先出现前兆卡；处理失败，倒台卡随之而来。倒台不是结束：继任者会按人物卡声明的条件与权重被推上台，前任的遗产卡和擦屁股卡将进入卡池。"),
        h("p", {}, "人物能力每隔若干天可用一次，能救急，也会强化对应路线的风险。卡牌来源（吴南海、保卫组、值班秘书……）是判断谁在得势的关键线索。"),
        h("button", { class: "btn", onclick: () => document.getElementById("help-mask").remove() }, "知道了")
      )
    );
    document.body.append(mask);
  },

  toast(text) {
    const el = h("div", { class: "toast" }, text);
    document.body.append(el);
    setTimeout(() => el.remove(), 1800);
  },
};

function COLLAPSE_TEXTS_TITLE(reason) {
  const map = {
    livelihood: "生产崩溃",
    people: "民变四起",
    military: "军务失控",
    council: "元老院分裂",
    wind: "外部围剿",
    legitimacy: "执政失效",
    succession: "继任危机",
  };
  return map[reason] || "终局";
}
