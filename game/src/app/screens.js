/**
 * 全屏场景：标题页、选人页、结局画面、帮助弹层、错误页。
 * 主界面（局内视图）在 ./views.js。
 *
 * @module app/screens
 */

import { h, avatarEl, isDebugOn } from "./dom.js";
import { COLLAPSE_TEXTS, collapseTitleOf } from "./endings.js";

/** 清空 #app 并返回该容器。 */
function appRoot() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  return app;
}

/** 内容加载失败提示。 */
export function showError(message, hint) {
  const app = appRoot();
  app.append(
    h("div", { class: "fatal" },
      h("h1", {}, "游戏加载失败"),
      h("p", {}, message),
      h("p", { class: "fatal-hint" }, hint || "请通过本地静态服务器访问本页，例如：python -m http.server 8080")
    )
  );
}

/**
 * 标题页：旗帜行波 + 火星 + 开始/继续/调试/说明。
 * @param {{hasSave: boolean, onContinue: Function, onStart: Function,
 *          onDebugToggle: Function, onHelp: Function}} opts
 */
export function renderTitle(opts) {
  const app = appRoot();

  const embers = Array.from({ length: 7 }, (_, i) =>
    h("i", { class: "ember", style: `left:${8 + i * 13}%; animation-delay:${i * 1.7}s; animation-duration:${9 + (i % 4) * 2.5}s;` })
  );

  // 旗帜切片波动：竖切 16 条，振幅向旗尾递增、相位依次错开，
  // 形成自旗杆传出的行波
  const flagDiv = h("div", { class: "flag" });
  const SLICES = 16;
  for (let i = 0; i < SLICES; i++) {
    const slice = h("i", { class: "flag-slice" });
    slice.style.left = (i * 100 / SLICES) + "%";
    slice.style.width = (100 / SLICES + 0.12) + "%";
    slice.style.backgroundImage = "url('./assets/yuanlaoyuan-flag.jpg')";
    slice.style.backgroundSize = (SLICES * 100) + "% 100%";
    slice.style.backgroundPositionX = (i / (SLICES - 1) * 100) + "%";
    slice.style.setProperty("--amp", (0.6 + 12 * (i / (SLICES - 1))).toFixed(1));
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
}

/**
 * 选人页：五名首长卡片（头像 + 路线 + 性格/擅长/风险/加成/倒台）。
 * @param {Array<*>} characters
 * @param {(id: string) => void} onSelect
 */
export function renderStart(characters, onSelect, onHelp) {
  const app = appRoot();
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
        h("button", { class: "btn ghost", id: "btn-help-start", onclick: onHelp }, "玩法说明")
      )
    )
  );
}

/**
 * 结局画面（总崩局 / 继任危机 / 专属结局共用）。
 * 专属结局（effects.ending，如 taiwan）带自定义标题/文案/按钮与专属背景图；
 * 其余结局共用崩局背景（data-ending 驱动 CSS 换图）。
 * @param {*} game
 */
export function renderGameOver(game) {
  const app = appRoot();
  const reason = game.gameOverReason;
  const rulerNames = [...new Set((game.state.get("history.former_rulers") || []).concat(game.rulerId !== "none" ? [game.rulerId] : []))]
    .map((id) => game.characterManager.get(id)?.name || id)
    .join("、") || "无";
  const title = game.gameOverTitle || `终局：${collapseTitleOf(reason)}`;
  const text = game.gameOverText
    || (reason === "succession"
      ? "继任无人：没有人能被推上台，营地陷入漫长的空位期，直到外部势力不请自来。"
      : COLLAPSE_TEXTS[reason]?.text || "");
  const buttonLabel = game.gameOverButton || "重新开始";
  app.append(
    h("div", { class: "gameover", dataset: { ending: reason } },
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
}

/** 玩法说明弹层（点击遮罩或按钮关闭）。 */
export function showHelp() {
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
}

/** 轻提示（1.8 秒自动消失）。 @param {string} text */
export function toast(text) {
  const el = h("div", { class: "toast" }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}
