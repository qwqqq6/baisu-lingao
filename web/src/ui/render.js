// 渲染层：局势、四柱指标、风声、卡面、裁断记录。
import { GAME_DATA as DATA } from "../data/index.js";
import { store } from "../core/store.js";
import { currentStage, effectEntries } from "../core/state.js";
import { els } from "./dom.js";

export function formatEffect(key, value, precise = store.state.precise) {
  const names = {
    ...Object.fromEntries(Object.entries(DATA.stats).map(([id, item]) => [id, item.name])),
    wind: "风声",
  };
  const arrows = Math.abs(value) >= 10 ? (value > 0 ? "↑↑" : "↓↓") : value > 0 ? "↑" : "↓";
  // 机制8（风声神秘化）：风声任何情况下都只给方向暗示，不显示精确数字，
  // 即便玩家开启了四柱精确模式。四柱本身的精确显示不受影响。
  if (key === "wind") return `${names.wind} ${arrows}`;
  return precise ? `${names[key]} ${value > 0 ? "+" : ""}${value}` : `${names[key]} ${arrows}`;
}

export function render() {
  const state = store.state;
  const stage = currentStage();
  els.dayValue.textContent = state.day > 100 ? "D+100" : `D+${state.day}`;
  els.stageName.textContent = stage.name;
  els.stageTheme.textContent = stage.theme;
  els.phaseNote.textContent = stage.note;
  els.stageProgress.style.width = `${Math.min(100, Math.max(0, state.day))}%`;
  els.preciseToggle.checked = state.precise;
  els.autosaveToggle.checked = state.autosave;

  renderMetrics();
  renderWind();
  renderCard();
  renderHistory();
}

function renderMetrics() {
  const state = store.state;
  els.metrics.innerHTML = "";
  for (const [id, meta] of Object.entries(DATA.stats)) {
    const value = state.stats[id];
    const card = document.createElement("section");
    card.className = "metric-card";
    card.innerHTML = `
      <div class="metric-head">
        <span class="metric-name">${meta.name}</span>
        <span class="metric-value">${state.precise ? value : describeValue(value)}</span>
      </div>
      <div class="meter" title="${meta.desc}">
        <div class="meter-fill ${meterClass(value)}" style="width: ${value}%"></div>
      </div>
    `;
    els.metrics.appendChild(card);
  }
}

function describeValue(value) {
  if (value <= 15) return "危急";
  if (value <= 30) return "偏低";
  if (value >= 85) return "危急";
  if (value >= 70) return "偏高";
  return "平衡";
}

function meterClass(value) {
  if (value <= 15 || value >= 85) return "danger";
  if (value <= 30 || value >= 70) return "warn";
  return "";
}

function renderWind() {
  const state = store.state;
  // 机制8（风声神秘化）：风声是"神秘条"，永远只用文本暗示外界注意程度，
  // 不给精确数字（即便精确模式开启），玩家只能凭措辞感知大致档位。
  let text = "海风很静，外界尚未看清临高的轮廓。";
  if (state.wind >= 85) text = "风声已经压不住了，县城、海商和海上势力都在看向这里。";
  else if (state.wind >= 65) text = "关于临高的传言越来越具体，外部试探正在增多。";
  else if (state.wind >= 40) text = "有人开始打听港口、货物和外来人口。风声不再只是风声。";
  else if (state.wind >= 25) text = "周边已经知道这里来了不寻常的人，但还没看清来路。";
  els.windText.textContent = text;
}

export function renderCard() {
  const currentCard = store.currentCard;
  if (!currentCard) return;
  els.cardType.textContent = currentCard.type;
  els.cardCost.textContent = costText(currentCard);
  els.cardTitle.textContent = currentCard.title;
  els.cardSource.textContent = currentCard.source;
  els.cardText.textContent = currentCard.text;
  els.leftLabel.textContent = currentCard.left.label;
  els.rightLabel.textContent = currentCard.right.label;
  els.leftHint.textContent = currentCard.left.hint || currentCard.left.label;
  els.rightHint.textContent = currentCard.right.hint || currentCard.right.label;

  els.cardTags.innerHTML = "";
  (currentCard.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.textContent = tag;
    els.cardTags.appendChild(span);
  });

  renderEffectPreview(null);
}

function costText(card) {
  const left = card.left?.cost ?? 0;
  const right = card.right?.cost ?? 0;
  if (left === right) return left === 0 ? "不耗时" : `+${left} 天`;
  return `+${left}/${right} 天`;
}

export function renderEffectPreview() {
  // 决策前完全隐藏每个选项的影响（四柱与风声都不预览），
  // 让玩家凭卡面叙事盲选，真实变化只在裁断后于记录中体现。
  els.effectPreview.innerHTML = "";
}

function renderHistory() {
  const state = store.state;
  els.historyList.innerHTML = "";
  if (!state.history.length) {
    const li = document.createElement("li");
    li.textContent = "还没有裁断记录。";
    els.historyList.appendChild(li);
    return;
  }
  state.history.forEach((item) => {
    const li = document.createElement("li");
    const effects = effectEntries(item.effects)
      .map(([key, value]) => formatEffect(key, value, true))
      .join("，");
    li.innerHTML = `<b>D+${item.day} ${item.title}</b>${item.choice}${
      item.cost ? `，耗时 ${item.cost} 天` : ""
    }${effects ? `<br>${effects}` : ""}`;
    els.historyList.appendChild(li);
  });
}
