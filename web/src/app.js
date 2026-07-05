(function () {
  const DATA = window.GAME_DATA;
  const SAVE_KEY = "lingao_100_days_save_v1";

  const $ = (id) => document.getElementById(id);

  const els = {
    dayValue: $("dayValue"),
    stageName: $("stageName"),
    stageTheme: $("stageTheme"),
    stageProgress: $("stageProgress"),
    metrics: $("metrics"),
    windText: $("windText"),
    phaseNote: $("phaseNote"),
    card: $("card"),
    cardType: $("cardType"),
    cardCost: $("cardCost"),
    cardTitle: $("cardTitle"),
    cardSource: $("cardSource"),
    cardText: $("cardText"),
    cardTags: $("cardTags"),
    effectPreview: $("effectPreview"),
    leftHint: $("leftHint"),
    rightHint: $("rightHint"),
    leftLabel: $("leftLabel"),
    rightLabel: $("rightLabel"),
    leftBtn: $("leftBtn"),
    rightBtn: $("rightBtn"),
    historyList: $("historyList"),
    newGameBtn: $("newGameBtn"),
    continueBtn: $("continueBtn"),
    helpBtn: $("helpBtn"),
    preciseToggle: $("preciseToggle"),
    autosaveToggle: $("autosaveToggle"),
    modal: $("modal"),
    modalTitle: $("modalTitle"),
    modalBody: $("modalBody"),
    modalClose: $("modalClose"),
    modalPrimary: $("modalPrimary"),
  };

  let state = null;
  let currentCard = null;
  let drag = null;
  let inputLocked = false;

  function makeInitialState() {
    return {
      day: DATA.initialState.day,
      stats: { ...DATA.initialState.stats },
      wind: DATA.initialState.wind,
      used: [],
      history: [],
      shownReports: [],
      windEvents: [],
      pending: [],
      precise: false,
      autosave: true,
      over: false,
      ending: null,
      seed: Date.now(),
      lastCrisisDay: 0,
      recentCrisis: [],
    };
  }

  function clamp(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function currentStage() {
    return DATA.stages.find((stage) => state.day >= stage.start && state.day <= stage.end) || DATA.stages[DATA.stages.length - 1];
  }

  function findCard(id) {
    return DATA.cards.find((card) => card.id === id) || DATA.crisisCards.find((card) => card.id === id);
  }

  function choose(items) {
    if (!items.length) return null;
    const index = Math.floor(Math.random() * items.length);
    return items[index];
  }

  function rememberCrisis(cardId) {
    state.recentCrisis = [cardId, ...(state.recentCrisis || []).filter((id) => id !== cardId)].slice(0, 3);
  }

  function stageReportCard(stage) {
    const report = DATA.reports[stage.id];
    return {
      id: `REPORT-${stage.id}`,
      stage: stage.id,
      type: "阶段报告",
      title: report.title,
      source: "执委会秘书处",
      text: report.text,
      tags: [stage.name, "报告"],
      reportId: stage.id,
      left: { label: "翻阅报告", hint: "了解局势", effects: {}, cost: 0 },
      right: { label: "进入阶段", hint: "继续裁断", effects: {}, cost: 0 },
    };
  }

  function endingCard(ending) {
    return {
      id: `ENDING-${ending.id}`,
      type: "百日总结",
      title: ending.title,
      source: "百日档案",
      text: ending.text,
      tags: ["结局", state.day > 100 ? "D+100" : `D+${state.day}`],
      left: { label: "重新开始", hint: "新开一局", effects: {}, cost: 0 },
      right: { label: "保留记录", hint: "查看局势", effects: {}, cost: 0 },
      ending: true,
    };
  }

  function getFailureEnding() {
    return DATA.endings.find((ending) => ending.test(state)) || null;
  }

  function getSuccessEnding() {
    const { council, people, military, livelihood } = state.stats;
    const values = Object.values(state.stats);
    const balanced = values.every((value) => value >= 30 && value <= 70);
    if (balanced && state.wind < 45) return DATA.successEndings.find((item) => item.id === "steady");
    if (state.wind < 30) return DATA.successEndings.find((item) => item.id === "low_profile");
    if (military >= 68 && livelihood >= 62) return DATA.successEndings.find((item) => item.id === "iron");
    if (livelihood >= 72) return DATA.successEndings.find((item) => item.id === "workshop");
    if (people >= 70) return DATA.successEndings.find((item) => item.id === "civil");
    if (council >= 70) return DATA.successEndings.find((item) => item.id === "council");
    return DATA.successEndings.find((item) => item.id === "steady");
  }

  function dangerCrisis() {
    if (state.lastCrisisDay === state.day) return null;
    const checks = [
      ["livelihood", "low", "CR-LIV-LOW"],
      ["livelihood", "high", "CR-LIV-HIGH"],
      ["military", "low", "CR-MIL-LOW"],
      ["military", "high", "CR-MIL-HIGH"],
      ["people", "low", "CR-PEO-LOW"],
      ["people", "high", "CR-PEO-HIGH"],
      ["council", "low", "CR-COU-LOW"],
      ["council", "high", "CR-COU-HIGH"],
    ];
    const rawCandidates = checks.filter(([stat, direction]) => direction === "low" ? state.stats[stat] <= 18 : state.stats[stat] >= 82);
    if (!rawCandidates.length) return null;
    const freshCandidates = rawCandidates.filter(([, , id]) => !(state.recentCrisis || []).includes(id));
    const candidates = freshCandidates.length ? freshCandidates : rawCandidates;
    const card = findCard(choose(candidates)[2]);
    state.lastCrisisDay = state.day;
    rememberCrisis(card.id);
    return card;
  }

  function windCrisis() {
    const threshold = [40, 60, 80, 92].find((value) => state.wind >= value && !state.windEvents.includes(value));
    if (!threshold) return null;
    state.windEvents.push(threshold);
    return findCard("CR-WIND");
  }

  function availableCards(stage) {
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

  function drawNextCard() {
    const failure = getFailureEnding();
    if (failure) {
      state.over = true;
      state.ending = failure.id;
      currentCard = endingCard(failure);
      render();
      save();
      return;
    }

    if (state.day > 100) {
      const success = getSuccessEnding();
      state.over = true;
      state.ending = success.id;
      currentCard = endingCard(success);
      render();
      save();
      return;
    }

    const stage = currentStage();
    if (!state.shownReports.includes(stage.id)) {
      state.shownReports.push(stage.id);
      currentCard = stageReportCard(stage);
      render();
      save();
      return;
    }

    if (state.pending.length) {
      currentCard = findCard(state.pending.shift()) || choose(DATA.crisisCards);
      render();
      save();
      return;
    }

    const crisis = dangerCrisis() || windCrisis();
    if (crisis) {
      currentCard = crisis;
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

    currentCard = selected || choose(randomFallbackCards(stage)) || choose(DATA.cards.filter((card) => !card.triggerOnly && card.type !== "插入")) || choose(DATA.cards);
    render();
    save();
  }

  function effectEntries(effects) {
    return Object.entries(effects || {}).filter(([, value]) => value !== 0);
  }

  function formatEffect(key, value, precise = state.precise) {
    const names = { ...Object.fromEntries(Object.entries(DATA.stats).map(([id, item]) => [id, item.name])), wind: "风声" };
    const arrows = Math.abs(value) >= 10 ? (value > 0 ? "↑↑" : "↓↓") : (value > 0 ? "↑" : "↓");
    return precise ? `${names[key]} ${value > 0 ? "+" : ""}${value}` : `${names[key]} ${arrows}`;
  }

  function applyChoice(side) {
    if (inputLocked || !currentCard) return;

    if (currentCard.ending) {
      if (side === "left") newGame();
      return;
    }

    inputLocked = true;
    const choice = currentCard[side];
    const effects = choice.effects || {};

    for (const [key, value] of effectEntries(effects)) {
      if (key === "wind") state.wind = clamp(state.wind + value);
      else state.stats[key] = clamp(state.stats[key] + value);
    }

    if (currentCard.once !== false && !currentCard.reportId) {
      state.used.push(currentCard.id);
    }

    if (currentCard.reportId) {
      // The report has already been marked as shown when it was drawn.
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
      inputLocked = false;
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

  function render() {
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
    let text = "海风很静，外界尚未看清临高的轮廓。";
    if (state.wind >= 85) text = "风声已经压不住了，县城、海商和海上势力都在看向这里。";
    else if (state.wind >= 65) text = "关于临高的传言越来越具体，外部试探正在增多。";
    else if (state.wind >= 40) text = "有人开始打听港口、货物和外来人口。风声不再只是风声。";
    else if (state.wind >= 25) text = "周边已经知道这里来了不寻常的人，但还没看清来路。";
    if (state.precise) text += `（${state.wind}/100）`;
    els.windText.textContent = text;
  }

  function renderCard() {
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

  function renderEffectPreview(side) {
    els.effectPreview.innerHTML = "";
    if (!side || !currentCard) return;
    effectEntries(currentCard[side].effects).forEach(([key, value]) => {
      const span = document.createElement("span");
      span.textContent = formatEffect(key, value);
      els.effectPreview.appendChild(span);
    });
  }

  function renderHistory() {
    els.historyList.innerHTML = "";
    if (!state.history.length) {
      const li = document.createElement("li");
      li.textContent = "还没有裁断记录。";
      els.historyList.appendChild(li);
      return;
    }
    state.history.forEach((item) => {
      const li = document.createElement("li");
      const effects = effectEntries(item.effects).map(([key, value]) => formatEffect(key, value, true)).join("，");
      li.innerHTML = `<b>D+${item.day} ${item.title}</b>${item.choice}${item.cost ? `，耗时 ${item.cost} 天` : ""}${effects ? `<br>${effects}` : ""}`;
      els.historyList.appendChild(li);
    });
  }

  function save() {
    if (!state?.autosave) return;
    const payload = {
      state,
      currentCardId: currentCard?.id,
      virtualCard: currentCard?.reportId || currentCard?.ending ? currentCard : null,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }

  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const payload = JSON.parse(raw);
      state = payload.state;
      currentCard = payload.virtualCard || findCard(payload.currentCardId);
      if (!state || !currentCard) return false;
      state.used = state.used || [];
      state.history = state.history || [];
      state.shownReports = state.shownReports || [];
      state.windEvents = state.windEvents || [];
      state.pending = state.pending || [];
      state.recentCrisis = state.recentCrisis || [];
      state.lastCrisisDay = state.lastCrisisDay || 0;
      state.precise = Boolean(state.precise);
      state.autosave = state.autosave !== false;
      render();
      return true;
    } catch (error) {
      console.warn("存档读取失败", error);
      return false;
    }
  }

  function newGame() {
    state = makeInitialState();
    currentCard = null;
    localStorage.removeItem(SAVE_KEY);
    drawNextCard();
  }

  function showHelp() {
    showModal("玩法说明", `
      <p>你扮演文德嗣，在登陆后的前 100 天中处理执委会裁断。每张卡向左或向右选择，普通卡推进 1 天，插入卡不耗时，重大行动会消耗多天。</p>
      <ul>
        <li>四柱是元老院、民望、军务、生计。太低或太高都会失败。</li>
        <li>风声是隐藏压力，代表外部世界对临高异常的注意程度。</li>
        <li>可以拖拽卡牌，也可以按 A / D 选择。</li>
        <li>卡面图暂未制作，本版以文字、数值和流程为主。</li>
      </ul>
    `);
  }

  function showModal(title, body) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = body;
    if (typeof els.modal.showModal === "function") els.modal.showModal();
    else alert(`${title}\n\n${els.modalBody.textContent}`);
  }

  function closeModal() {
    if (els.modal.open) els.modal.close();
  }

  function bindEvents() {
    els.leftBtn.addEventListener("click", () => applyChoice("left"));
    els.rightBtn.addEventListener("click", () => applyChoice("right"));
    els.newGameBtn.addEventListener("click", () => {
      if (!state || state.history.length === 0 || confirm("开始新局会清除当前自动存档，确定吗？")) newGame();
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
      state.precise = els.preciseToggle.checked;
      render();
      save();
    });
    els.autosaveToggle.addEventListener("change", () => {
      state.autosave = els.autosaveToggle.checked;
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
    if (inputLocked || currentCard?.ending) return;
    drag = { startX: event.clientX, startY: event.clientY, dx: 0 };
    els.card.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
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
    if (!drag) return;
    const dx = drag.dx;
    drag = null;
    els.leftHint.classList.remove("visible");
    els.rightHint.classList.remove("visible");
    if (dx < -120) applyChoice("left");
    else if (dx > 120) applyChoice("right");
    else {
      els.card.style.transform = "";
      renderEffectPreview(null);
    }
  }

  function boot() {
    bindEvents();
    if (!load()) newGame();
  }

  boot();
})();
