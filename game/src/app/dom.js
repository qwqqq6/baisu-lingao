/**
 * DOM 原语：元素构建器 h()、头像、调试开关的本地存储。
 * 原生 DOM 操作，不引入任何框架。
 *
 * @module app/dom
 */

/**
 * 声明式建元素。
 * attrs 约定：class / dataset / disabled / checked 走属性；
 * on* 事件函数挂监听；其余 setAttribute。子节点自动展平，
 * null/undefined/false 跳过，字符串转文本节点。
 *
 * @param {string} tag
 * @param {object} [attrs]
 * @param {...*} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
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

/** 调试开关在 localStorage 的键。 */
const DEBUG_KEY = "lingqi-debug";

/** @returns {boolean} 调试模式是否开启 */
export function isDebugOn() {
  try { return localStorage.getItem(DEBUG_KEY) === "1"; } catch { return false; }
}

/** @param {boolean} on */
export function setDebugOn(on) {
  try { localStorage.setItem(DEBUG_KEY, on ? "1" : "0"); } catch { /* 忽略 */ }
}

/**
 * 头像：优先读 assets/portraits/<id>.png，加载失败回落首字剪影。
 * @param {string|null} id 人物 id
 * @param {string} name 显示名（剪影字与悬停提示）
 * @returns {HTMLElement}
 */
export function avatarEl(id, name) {
  const wrap = h("span", { class: "avatar", title: name },
    h("span", { class: "avatar-fallback" }, (name || "?").slice(0, 1)));
  const img = h("img", { src: `./assets/portraits/${id || "unknown"}.png`, alt: name || "" });
  img.addEventListener("error", () => img.remove());
  wrap.append(img);
  return wrap;
}

/**
 * 按说话人名取头像（对话气泡用）：先在人物表里查 id，查不到走剪影。
 * @param {*} game
 * @param {string} name
 */
export function avatarElForName(game, name) {
  const character = game.characterManager.characters.find((c) => c.name === name);
  return avatarEl(character ? character.id : null, name);
}
