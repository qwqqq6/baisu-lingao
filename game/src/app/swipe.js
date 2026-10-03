/**
 * 王权式滑动交互：拖拽卡片左右倾斜，越过阈值松手即批复；
 * 未过阈值弹回。支持鼠标/触摸/指针，点击侧点亦可直接批复。
 *
 * @module app/swipe
 */

/** 拖拽超过卡片宽度的该比例即视为批复。 */
const THRESHOLD_RATIO = 0.22;
/** 倾斜系数：每像素水平位移的旋转角（度）。 */
const TILT_PER_PX = 0.06;
/** 最大旋转角。 */
const MAX_TILT = 14;

/**
 * 给卡片挂滑动交互。
 * @param {HTMLElement} cardEl 卡片元素（transform 由本模块接管）
 * @param {(side: "left"|"right") => void} onChoose 越阈松手时的批复回调
 * @param {(side: "left"|"right", progress: number) => void} [onTilt]
 *        拖拽进度回调（progress 0~1，用于点亮侧点）
 * @returns {() => void} 解绑函数
 */
export function attachSwipe(cardEl, onChoose, onTilt) {
  let dragging = false;
  let startX = 0;
  let dx = 0;
  let pointerId = null;

  const threshold = () => cardEl.offsetWidth * THRESHOLD_RATIO;

  function setTransform() {
    const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx * TILT_PER_PX));
    cardEl.style.transform = `translateX(${dx}px) rotate(${tilt}deg)`;
    cardEl.style.transition = "none";
    if (onTilt) {
      const t = threshold();
      const side = dx < 0 ? "left" : "right";
      onTilt(side, Math.min(1, Math.abs(dx) / t));
    }
  }

  function release() {
    if (!dragging) return;
    dragging = false;
    const t = threshold();
    if (Math.abs(dx) >= t) {
      const side = dx < 0 ? "left" : "right";
      flyOut(cardEl, side).then(() => onChoose(side));
    } else {
      springBack(cardEl);
      if (onTilt) onTilt(dx < 0 ? "left" : "right", 0);
    }
    dx = 0;
  }

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    dx = 0;
  }

  function onMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dx = e.clientX - startX;
    setTransform();
  }

  cardEl.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  return () => {
    cardEl.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
  };
}

/**
 * 批复后的飞出动画（向 side 方向滑出屏幕）。
 * @param {HTMLElement} cardEl
 * @param {"left"|"right"} side
 * @returns {Promise<void>} 动画结束
 */
export function flyOut(cardEl, side) {
  return new Promise((resolve) => {
    const dir = side === "left" ? -1 : 1;
    cardEl.style.transition = "transform 260ms ease-in, opacity 240ms ease-in";
    cardEl.style.transform = `translateX(${dir * (window.innerWidth * 0.9)}px) rotate(${dir * 24}deg)`;
    cardEl.style.opacity = "0";
    setTimeout(resolve, 260);
  });
}

/** 未过阈值的弹回。 */
export function springBack(cardEl) {
  cardEl.style.transition = "transform 220ms cubic-bezier(.2,1.4,.4,1)";
  cardEl.style.transform = "translateX(0) rotate(0)";
}
