// 交互绑定：按钮、键盘 A/D、指针拖拽卡牌。
import { store } from "../core/store.js";
import { els } from "./dom.js";
import { render, renderEffectPreview } from "./render.js";
import { applyChoice, newGame } from "../core/engine.js";
import { load, save } from "../core/storage.js";
import { showHelp, closeModal } from "./modal.js";

export function bindEvents() {
  els.leftBtn.addEventListener("click", () => applyChoice("left"));
  els.rightBtn.addEventListener("click", () => applyChoice("right"));
  els.newGameBtn.addEventListener("click", () => {
    if (!store.state || store.state.history.length === 0 || confirm("开始新局会清除当前自动存档，确定吗？")) newGame();
  });
  els.continueBtn.addEventListener("click", () => {
    if (!load()) {
      els.card.classList.add("shake");
      setTimeout(() => els.card.classList.remove("shake"), 340);
    }
  });
  els.helpBtn.addEventListener("click", showHelp);
  els.modalClose.addEventListener("click", closeModal);
  els.modalPrimary.addEventListener("click", closeModal);
  els.preciseToggle.addEventListener("change", () => {
    store.state.precise = els.preciseToggle.checked;
    render();
    save();
  });
  els.autosaveToggle.addEventListener("change", () => {
    store.state.autosave = els.autosaveToggle.checked;
    save();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || els.modal.open) return;
    if (event.key.toLowerCase() === "a" || event.key === "ArrowLeft") applyChoice("left");
    if (event.key.toLowerCase() === "d" || event.key === "ArrowRight") applyChoice("right");
    if (event.key === "?") showHelp();
  });

  els.leftBtn.addEventListener("mouseenter", () => renderEffectPreview("left"));
  els.leftBtn.addEventListener("mouseleave", () => renderEffectPreview(null));
  els.rightBtn.addEventListener("mouseenter", () => renderEffectPreview("right"));
  els.rightBtn.addEventListener("mouseleave", () => renderEffectPreview(null));

  els.card.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerDown(event) {
  if (store.inputLocked || store.currentCard?.ending) return;
  store.drag = { startX: event.clientX, startY: event.clientY, dx: 0 };
  els.card.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  const drag = store.drag;
  if (!drag) return;
  drag.dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  const rotate = drag.dx / 24;
  els.card.style.transform = `translate(${drag.dx}px, ${dy * 0.18}px) rotate(${rotate}deg)`;
  els.leftHint.classList.toggle("visible", drag.dx < -45);
  els.rightHint.classList.toggle("visible", drag.dx > 45);
  if (drag.dx < -45) renderEffectPreview("left");
  else if (drag.dx > 45) renderEffectPreview("right");
  else renderEffectPreview(null);
}

function onPointerUp() {
  const drag = store.drag;
  if (!drag) return;
  const dx = drag.dx;
  store.drag = null;
  els.leftHint.classList.remove("visible");
  els.rightHint.classList.remove("visible");
  if (dx < -120) applyChoice("left");
  else if (dx > 120) applyChoice("right");
  else {
    els.card.style.transform = "";
    renderEffectPreview(null);
  }
}
