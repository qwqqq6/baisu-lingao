// 弹窗与玩法说明。
import { els } from "./dom.js";

export function showHelp() {
  showModal(
    "玩法说明",
    `
      <p>你扮演文德嗣，在登陆后的前 100 天中处理执委会裁断。每张卡向左或向右选择，普通卡推进 1 天，插入卡不耗时，重大行动会消耗多天。</p>
      <ul>
        <li>四柱是元老院、民望、军务、生计。太低或太高都会失败。</li>
        <li>风声是隐藏压力，代表外部世界对临高异常的注意程度。</li>
        <li>可以拖拽卡牌，也可以按 A / D 选择。</li>
        <li>卡面图暂未制作，本版以文字、数值和流程为主。</li>
      </ul>
    `
  );
}

export function showModal(title, body) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = body;
  if (typeof els.modal.showModal === "function") els.modal.showModal();
  else alert(`${title}\n\n${els.modalBody.textContent}`);
}

export function closeModal() {
  if (els.modal.open) els.modal.close();
}
