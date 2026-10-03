/**
 * 存档：localStorage 单槽位存取。
 * 载荷带 saveVersion 字段；当前为 1（结构变化时递增并写迁移）。
 *
 * @module engine/save
 */

const SAVE_KEY = "lingqi_ruler_save_v1";

/**
 * 写入存档。
 * @param {*} payload Game.serialize() 的产物
 * @returns {boolean}
 */
export function saveGame(payload) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn("存档失败", err);
    return false;
  }
}

/** @returns {*|null} 读档；无档或损坏返回 null */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("读档失败", err);
    return null;
  }
}

/** @returns {boolean} 是否存在存档 */
export function hasSave() {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

/** 清除存档（重新开始用）。 */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 忽略 */
  }
}
