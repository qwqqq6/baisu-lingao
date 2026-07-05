// 游戏引擎：抽卡调度、选择结算、决策动画、新局。
import { GAME_DATA as DATA } from "../data/index.js";
import { store, SAVE_KEY } from "./store.js";
import { makeInitialState, clamp, currentStage, findCard, choose, effectEntries, resolveEffects } from "./state.js";
import { dangerCrisis, windCrisis } from "../systems/crisis.js";
import { trackFavor } from "../systems/characters.js";
import { settleQuests } from "../systems/quests.js";
import { getFailureEnding, getSuccessEnding, endingCard, stageReportCard } from "../systems/endingpicker.js";
import { save } from "./storage.js";
import { render } from "../ui/render.js";
import { els } from "../ui/dom.js";

function availableCards(stage) {
  const state = store.state;
  return DATA.cards.filter((card) => {
    if (card.triggerOnly) return false;
    if (card.type === "插入") return false;
    if (card.stage !== stage.id && card.stage !== "all") return false;
    if (card.once && state.used.includes(card.id)) return false;
    return true;
  });
}

function randomFallbackCards(stage) {
  return DATA.cards.filter((card) => {
    if (card.triggerOnly || card.type === "插入") return false;
    if (card.stage !== stage.id && card.stage !== "all") return false;
    return true;
  });
}

export function drawNextCard() {
  const state = store.state;

  const failure = getFailureEnding();
  if (failure) {
    state.over = true;
    state.ending = failure.id;
    store.currentCard = endingCard(failure);
    render();
    save();
    return;
  }

  if (state.day > 100) {
    const success = getSuccessEnding();
    state.over = true;
    state.ending = success.id;
    store.currentCard = endingCard(success);
    render();
    save();
    return;
  }

  const stage = currentStage();
  if (!state.shownReports.includes(stage.id)) {
    state.shownReports.push(stage.id);
    // 机制5（任务/隐藏目标）：进入新阶段时结算已结束阶段的隐藏 KPI，注入增益/隐患卡。
    settleQuests(stage.id);
    store.currentCard = stageReportCard(stage);
    render();
    save();
    return;
  }

  if (state.pending.length) {
    store.currentCard = findCard(state.pending.shift()) || choose(DATA.crisisCards);
    render();
    save();
    return;
  }

  const crisis = dangerCrisis() || windCrisis();
  if (crisis) {
    store.currentCard = crisis;
    render();
    save();
    return;
  }

  const pool = availableCards(stage);
  const keyCards = pool.filter((card) => card.type.includes("阶段关键"));
  const daysLeft = stage.end - state.day + 1;
  const shouldForceKey = keyCards.length && daysLeft <= keyCards.length * 3;
  const selected = shouldForceKey
    ? choose(keyCards)
    : choose(pool.filter((card) => card.type.includes("阶段关键") && Math.random() < 0.45)) || choose(pool);

  store.currentCard =
    selected ||
    choose(randomFallbackCards(stage)) ||
    choose(DATA.cards.filter((card) => !card.triggerOnly && card.type !== "插入")) ||
    choose(DATA.cards);
  render();
  save();
}

export function applyChoice(side) {
  const currentCard = store.currentCard;
  if (store.inputLocked || !currentCard) return;

  if (currentCard.ending) {
    if (side === "left") newGame();
    return;
  }

  store.inputLocked = true;
  const state = store.state;
  const choice = currentCard[side];
  // 机制9（阶段卡池演化）：结算时按当前阶段解析选项的阶段变体，命中则覆盖基础 effects。
  const effects = resolveEffects(choice, currentStage().id);

  for (const [key, value] of effectEntries(effects)) {
    if (key === "wind") state.wind = clamp(state.wind + value);
    else state.stats[key] = clamp(state.stats[key] + value);
  }

  // 机制2（角色回归）：按本次四柱增减累加各人物 favor，坐大则注入反噬卡到 pending。
  trackFavor(effects);

  if (currentCard.once !== false && !currentCard.reportId) {
    state.used.push(currentCard.id);
  }

  if (choice.followups) {
    state.pending.push(...choice.followups);
  }

  const cost = Number(choice.cost || 0);
  state.history.unshift({
    day: state.day,
    title: currentCard.title,
    choice: choice.label,
    effects,
    cost,
  });
  state.history = state.history.slice(0, 24);

  state.day += cost;

  animateDecision(side);
  setTimeout(() => {
    store.inputLocked = false;
    drawNextCard();
  }, 210);
}

function animateDecision(side) {
  const distance = side === "left" ? -720 : 720;
  const rotate = side === "left" ? -10 : 10;
  els.card.style.transform = `translateX(${distance}px) rotate(${rotate}deg)`;
  els.card.style.opacity = "0";
  setTimeout(() => {
    els.card.style.transition = "none";
    els.card.style.transform = "translateY(16px)";
    els.card.style.opacity = "0";
    requestAnimationFrame(() => {
      els.card.style.transition = "";
      els.card.style.transform = "";
      els.card.style.opacity = "";
    });
  }, 190);
}

export function newGame() {
  store.state = makeInitialState();
  store.currentCard = null;
  localStorage.removeItem(SAVE_KEY);
  drawNextCard();
}
