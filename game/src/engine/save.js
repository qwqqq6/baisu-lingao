/**
 * 存档：localStorage 单槽位存取，保存运行时上下文 + 状态快照 + 势力快照。
 */

const SAVE_KEY = "lingqi_ruler_save_v1";

export function saveGame(payload) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn("存档失败", err);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("读档失败", err);
    return null;
  }
}

export function hasSave() {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 忽略 */
  }
}
