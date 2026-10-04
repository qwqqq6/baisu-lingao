/**
 * 游戏流程控制器：开局、回合循环、倒台与继任、崩局与专属结局、存读档。
 * 引擎模块保持纯逻辑，这里负责把它们串成一局游戏。
 *
 * 结构约定：
 * - 结局文案在 ./endings.js（纯数据）；
 * - 阶段报告在 ./report.js（引擎生成卡）；
 * - Game 类只做编排，可序列化字段集中在 serialize/restore。
 *
 * @module app/game
 */

import { StateManager, matchesWithContext, weightedPick } from "../engine/state.js";
import { ForcesManager } from "../engine/forces.js";
import { CharacterManager } from "../engine/character.js";
import { applyEffects, checkCollapse, PILLAR_STATE_IDS, pressureStateId } from "../engine/effects.js";
import {
  buildDrawContext,
  availableSeries,
  applySeriesWeight,
  pickCardInSeries,
  applyVariants,
} from "../engine/draw.js";
import { saveGame, loadGame, clearSave } from "../engine/save.js";
import { FALL_REASONS, ENDING_TEXTS, COLLAPSE_TEXTS } from "./endings.js";
import { buildReport } from "./report.js";

// 兼容再导出：UI 与测试从 game.js 取结局文案
export { FALL_REASONS, ENDING_TEXTS, COLLAPSE_TEXTS };

/** 日常卡冷却窗（最近 N 张不重复；小卡池保底见 pickCardInSeries 的降级过滤）。 */
const RECENT_CARDS_LIMIT = 18;
/** 近期系列降权窗。 */
const RECENT_SERIES_LIMIT = 6;
/** 阶段报告间隔（天）。 */
const REPORT_INTERVAL = 10;
/** 纪事上限。 */
const LOG_LIMIT = 60;
/** 阶段分界（天）。 */
const STAGE_BOUNDARIES = { expansion: 10, consolidation: 40 };
const STAGE_NAMES = { landing: "登陆期", expansion: "扩张期", consolidation: "巩固期" };
/** 季节轮转（每十天一季）。 */
const SEASONS = ["春", "夏", "秋", "冬"];
const SEASON_LENGTH = 10;

/** 各人物的本命势力：倒台时若它足够强势，可强行挽留（架空，文档 4.2 节）。 */
const HOME_FORCE = {
  wunanhai: "farm",
  wude: "naturalized",
  beiwei: "guard",
  maqianzhu: "planning",
  wendsi: "council",
};

/** 强行挽留（架空）的门槛。 */
const ENTRENCH_INFLUENCE = 65;
const ENTRENCH_SATISFACTION = 50;

/** 永不进入常规抽卡池的类型（usedRatio 的分母不含它们）。 */
const FORCED_CARD_TYPES = new Set(["opening", "succession", "downfall"]);

export class Game {
  /**
   * @param {*} content loadOfficialContent() 的产物（或测试夹具）
   */
  constructor(content) {
    this.content = content;
    /** 常规叙事池（用于计算 usedRatio：已批常规卡 / 常规池总量） */
    this.narrativePool = new Set(
      (content.cards || []).filter((c) => !FORCED_CARD_TYPES.has(c.type)).map((c) => c.id),
    );
    this.state = new StateManager();
    this.forces = new ForcesManager();
    this.characterManager = new CharacterManager();

    this.state.loadDefinitions(content.states);
    this.forces.loadDefinitions(content.forces);
    this.characterManager.loadDefinitions(content.characters);

    this.resetRuntime();
  }

  /** 把一局游戏的运行时状态归零（不动内容与定义）。 */
  resetRuntime() {
    this.day = 1;
    this.usedCards = new Set();
    this.pendingCards = [];
    this.recentCards = [];
    this.recentSeries = [];
    /** @type {Record<string, number>} 系列停滞计数 */
    this.seriesStall = {};
    /** @type {Record<string, number>} 系列上次进度 */
    this.seriesProgressSeen = {};
    this.abilityReadyDay = 1;
    this.formerRuler = null;
    this.currentCard = null;
    this.gameOverReason = null;
    this.lastReportDay = 1;
    /** @type {Record<string, number>} 每张卡被选中的次数：出现越多权重越低 */
    this.cardSeen = {};
    this.lastDrawnCardId = null;
    /** 倒台后待放的专属结局卡（先于继任呈现） */
    this.epilogueQueued = null;
    /** 前任结局对继任者的开局影响（结局反哺继任） */
    this.pendingInherit = null;
    /** 调试模式：UI 显示隐藏数值与调试工具（不影响引擎逻辑） */
    this.debug = false;
    /** 专属结局画面的自定义文案（gameOver 时按 ENDING_TEXTS 填充） */
    this.gameOverTitle = null;
    this.gameOverText = null;
    this.gameOverButton = null;
    this.log = [];
  }

  // ------------------------------------------------------------ 只读视图

  /** @returns {string} 当前执政者 id（"none" 表示权位空悬） */
  get rulerId() {
    return this.state.get("ruler.current");
  }

  /** @returns {import("../engine/character.js").Character|null} */
  get ruler() {
    return this.characterManager.get(this.rulerId);
  }

  /** @returns {"landing"|"expansion"|"consolidation"} */
  get stage() {
    if (this.day <= STAGE_BOUNDARIES.expansion) return "landing";
    if (this.day <= STAGE_BOUNDARIES.consolidation) return "expansion";
    return "consolidation";
  }

  /** @returns {string} 季节（春夏秋冬，每十天一季） */
  get season() {
    return SEASONS[Math.floor((this.day - 1) / SEASON_LENGTH) % 4];
  }

  /** @returns {Record<string, number>} 四柱快照 */
  pillars() {
    return {
      people: this.state.get("core.pillar.people"),
      livelihood: this.state.get("core.pillar.livelihood"),
      military: this.state.get("core.pillar.military"),
      council: this.state.get("core.pillar.council"),
    };
  }

  pillarNames() {
    return { people: "民望", livelihood: "生计", military: "军务", council: "元老院" };
  }

  // ------------------------------------------------------------ 开局

  /**
   * 开新局：重置世界，落座执政者，应用初始加成，入队开局贺表。
   * @param {string} characterId
   */
  newGame(characterId) {
    this.resetRuntime();
    this.state.reset();
    this.state.loadDefinitions(this.content.states);
    this.forces.reset();

    const character = this.characterManager.get(characterId);
    if (!character) throw new Error(`未知人物：${characterId}`);

    this.state.set("ruler.current", characterId);
    this.applyInitialBonus(character.initialBonus || {});

    this.pushLog(`崇祯元年，广东琼州府临高县。${character.name}（${character.route}）被推上执政之位。`, "system");
    if (character.initialBonus?.desc) {
      this.pushLog(`${character.name}的初始加成已生效。`, "system");
    }
    if (character.openingCard) this.pendingCards.push(character.openingCard);
  }

  /** @param {object} bonus 人物卡 initialBonus */
  applyInitialBonus(bonus) {
    if (bonus.stats) {
      for (const [key, value] of Object.entries(bonus.stats)) {
        this.state.apply({ id: PILLAR_STATE_IDS[key], op: "add", value });
      }
    }
    if (bonus.wind) this.state.apply({ id: "core.wind", op: "add", value: bonus.wind });
    if (bonus.personal) this.applyPressure(bonus.personal);
  }

  /** @param {Record<string, number>} personal 压力键值对 */
  applyPressure(personal) {
    for (const [key, value] of Object.entries(personal)) {
      const id = pressureStateId(key);
      if (id) this.state.apply({ id, op: "add", value });
    }
  }

  // ------------------------------------------------------------ 回合循环

  /**
   * 抽出下一张要呈现的卡（含倒台/继任/结局等强制事件）。
   * 优先级：崩局 > 结局卡 > 继任 > 倒台 > 插入卡 > 阶段报告 > 系列加权抽取。
   * @returns {boolean} false 表示游戏结束或无卡可发
   */
  nextTurn() {
    if (this.gameOverReason) return false;
    this.forces.ensureUnlocked(this.ctx());
    this.applyFlawDrift();

    const collapse = checkCollapse(this.state);
    if (collapse) {
      this.gameOver(collapse);
      return false;
    }

    if (this.epilogueQueued) {
      const epilogue = this.epilogueQueued;
      this.epilogueQueued = null;
      this.present(epilogue, epilogue.meta || {});
      return true;
    }

    if (!this.rulerId || this.rulerId === "none") {
      return this.drawSuccession();
    }

    const ctx = this.ctx();
    return (
      this.presentDownfallIfDue(ctx) ||
      this.popPendingCard(ctx) ||
      this.presentReportIfDue() ||
      this.drawFromSeries(ctx)
    );
  }

  /** 人物缺陷：周期性压力漂移（隐藏进行，只通过阶段报告暗示）。 */
  applyFlawDrift() {
    const ruler = this.ruler;
    if (ruler?.flaw && this.day % ruler.flaw.everyDays === 0) {
      this.applyPressure(ruler.flaw.personal || {});
    }
  }

  /**
   * 倒台卡是最高优先级的强制事件：条件满足且未消耗即呈现。
   * @returns {boolean} 是否呈现了倒台卡
   */
  presentDownfallIfDue(ctx) {
    for (const card of this.content.cards) {
      if (card.type !== "downfall" || this.usedCards.has(card.id)) continue;
      if (!this.cardAvailable(card, ctx)) continue;
      this.present(card);
      return true;
    }
    return false;
  }

  /**
   * 弹出待处理插入卡（链式事件弧的后续）。
   * 出队时重新校验条件；已消耗的非日常卡不重复出队。
   * @returns {boolean}
   */
  popPendingCard(ctx) {
    while (this.pendingCards.length) {
      const id = this.pendingCards.shift();
      const card = this.content.cardIndex.get(id);
      if (!card) continue;
      if (card.type !== "daily" && this.usedCards.has(card.id)) continue;
      if (!this.cardAvailable(card, ctx)) continue;
      this.present(card);
      return true;
    }
    return false;
  }

  /** @param {*} card @param {object} ctx */
  cardAvailable(card, ctx) {
    return (
      (card.requires || []).every((c) => matchesWithContext(c, ctx)) &&
      !(card.excludes || []).some((c) => matchesWithContext(c, ctx))
    );
  }

  /** 每 REPORT_INTERVAL 天一份阶段报告。 @returns {boolean} */
  presentReportIfDue() {
    if (this.day - this.lastReportDay < REPORT_INTERVAL) return false;
    this.lastReportDay = this.day;
    this.present(buildReport({ day: this.day, state: this.state, forces: this.forces }));
    return true;
  }

  /**
   * 系列加权抽取：只保留当前确有可用卡牌的系列
   * （避免"系列可用但入口卡未解锁"导致空抽）。
   * @returns {boolean}
   */
  drawFromSeries(ctx) {
    const runtime = this.runtimeForDraw();
    // 已连出两次的系列本轮硬排除（避免同主题连环霸场）
    const streakSeries = this.recentSeries[0] != null && this.recentSeries[0] === this.recentSeries[1]
      ? this.recentSeries[0]
      : null;
    const collect = (filterStreak, relaxWindow) => {
      const weighted = [];
      for (const series of availableSeries(this.content.series, ctx)) {
        if (filterStreak && series.id === streakSeries) continue;
        const card = pickCardInSeries(series, this.content.cards, ctx, runtime, { relaxWindow });
        if (!card) continue;
        const { weight } = applySeriesWeight(series, ctx, runtime);
        weighted.push({ series, card, weight });
      }
      return weighted;
    };
    // 三级回退：排除连出系列 → 不排除 → 全池枯竭时放宽冷却窗（防死局）
    const picked = weightedPick(collect(true, false))
      || weightedPick(collect(false, false))
      || weightedPick(collect(false, true));
    if (!picked) {
      this.pushLog("各处暂时风平浪静……", "system");
      return false;
    }
    this.recentSeries = [picked.series.id, ...this.recentSeries].slice(0, RECENT_SERIES_LIMIT);
    this.trackStall(picked.series.id);
    const { card: resolved } = applyVariants(picked.card, ctx, this.characterManager);
    this.present(resolved);
    return true;
  }

  /**
   * 继任：按人物数据声明的权重推举；无人可继任即继任危机终局。
   * @returns {boolean}
   */
  drawSuccession() {
    const pick = this.characterManager.pickSuccessor(this.ctx());
    if (!pick) {
      this.gameOver("succession");
      return false;
    }
    const card = this.content.cardIndex.get(pick.entryCardId);
    if (!card) {
      this.gameOver("succession");
      return false;
    }
    this.usedCards.add(card.id);
    this.pushLog(`${pick.character.name}（${pick.character.route}）被推举为继任者。`, "succession");
    this.present(card, { succession: pick.character, reasons: pick.reasons });
    return true;
  }

  /** @param {*} card @param {*} [meta] */
  present(card, meta = {}) {
    this.currentCard = { ...card, meta };
    this.lastDrawnCardId = card.id;
  }

  // ------------------------------------------------------------ 批复结算

  /**
   * 玩家批复 left / right：结算效果、推进天数、处理下台与终局。
   * @param {"left"|"right"} side
   * @returns {{feedback: {deltas: string, notes: string[]}, fell: *|null,
   *            over: *|null, days?: number}|null}
   */
  choose(side) {
    const holder = this.currentCard;
    if (!holder || this.gameOverReason) return null;
    const option = holder.options?.[side];
    if (!option) return null;

    const before = this.pillars();
    const beforeStates = this.state.snapshot();
    const result = applyEffects(option.effects, { state: this.state, forces: this.forces });
    const after = this.pillars();

    // 结局反哺继任：前任的结局在继任者开局留下痕迹
    if (holder.type === "succession" && this.pendingInherit) {
      applyEffects(this.pendingInherit, { state: this.state, forces: this.forces });
      this.pendingInherit = null;
    }

    // 专属结局（如扬帆南渡）
    if (option.effects?.ending) {
      this.gameOver(option.effects.ending);
    }

    // 倒台卡特殊规则：只有真正下台才消耗该卡；强行续任后倒台会再次逼近
    const refusedDownfall = holder.type === "downfall" && !option.effects?.stepDown;
    if (!refusedDownfall) this.usedCards.add(holder.id);
    this.cardSeen[holder.id] = (this.cardSeen[holder.id] || 0) + 1;

    this.logIrreversibleChanges(beforeStates);
    if (holder.type === "daily") {
      this.recentCards = [holder.id, ...this.recentCards].slice(0, RECENT_CARDS_LIMIT);
    }

    // 后续插入卡（链式事件弧）
    for (const id of option.followups || []) {
      if (this.content.cardIndex.has(id)) this.pendingCards.push(id);
    }

    this.advanceDays(result.days);

    // 倒台结算：把当前执政者挪入前任序列（或被强行挽留）
    const fell = option.effects?.stepDown ? this.performStepDown() : null;

    const collapse = checkCollapse(this.state);
    if (collapse) {
      this.gameOver(collapse);
      return { feedback: this.describeChanges(before, after, option.effects), fell, over: COLLAPSE_TEXTS[collapse] };
    }

    this.currentCard = null;
    return {
      feedback: this.describeChanges(before, after, option.effects),
      fell,
      over: null,
      days: result.days,
    };
  }

  /**
   * 不可逆状态发生变化时写「【此后】×××」进纪事，让后果可见
   * （counter 不记，避免泄露隐藏压力）。
   * @param {Record<string, *>} beforeStates
   */
  logIrreversibleChanges(beforeStates) {
    for (const [id, old] of Object.entries(beforeStates)) {
      const def = this.state.getDefinition(id);
      if (!def) continue;
      const now = this.state.get(id);
      if (now === old) continue;
      if (def.type === "boolean" || def.type === "set" || def.mutability === "immutable" || def.mutability === "terminal") {
        if (def.type === "set") {
          const added = now.filter((v) => !old.includes(v));
          if (added.length) this.pushLog(`【此后】${def.name}：${added.join("、")}`, "system");
        } else if (now) {
          this.pushLog(`【此后】${def.name}`, "system");
        }
      } else if (def.type === "enum" || def.type === "level") {
        this.pushLog(`【此后】${def.name}`, "system");
      }
    }
  }

  /**
   * 下台结算。强势的本命势力会把罢免转化为「强行挽留（架空）」；
   * 真正下台时按 fates 表排专属结局卡（先于继任呈现）。
   * @returns {{character: *, reason: string, dead?: boolean, fateLabel?: string|null, entrenched?: boolean}|null}
   */
  performStepDown() {
    const ruler = this.ruler;
    if (!ruler) return null;
    const reason = this.state.get("fall.last_reason");

    if (this.tryEntrench(ruler)) {
      return { character: ruler, reason: "强行挽留（架空）", entrenched: true };
    }

    this.state.apply({ id: "history.former_rulers", op: "addToSet", value: ruler.id });
    this.formerRuler = ruler.id;
    this.state.set("ruler.current", "none");
    // 压力交接：个人压力与暴力风险清零，派系警惕减半遗留，
    // 合法性保留由继任卡修正
    this.state.set("ruler.pressure_personal", 0);
    this.state.set("ruler.pressure_violence", 0);
    this.state.set("ruler.pressure_faction", Math.ceil((this.state.get("ruler.pressure_faction") || 0) / 2));
    this.abilityReadyDay = this.day;

    const reasonText = FALL_REASONS[reason] || "去职";
    this.pushLog(`朝局震动：${ruler.name} 因「${reasonText}」下台。`, "succession");

    const fell = {
      character: ruler,
      reason: reasonText,
      dead: Boolean(this.state.get(`character.${ruler.id}.dead`)),
      fateLabel: null,
    };
    this.queueEpilogue(ruler, reason, fell);
    return fell;
  }

  /**
   * 强行挽留（架空）：本命势力足够强势时，罢免转化为架空。
   * @returns {boolean} 是否触发了挽留
   */
  tryEntrench(ruler) {
    const homeForce = HOME_FORCE[ruler.id];
    if (!homeForce || !this.forces.isUnlocked(homeForce)) return false;
    if (
      this.forces.metric(homeForce, "influence") < ENTRENCH_INFLUENCE ||
      this.forces.metric(homeForce, "satisfaction") < ENTRENCH_SATISFACTION ||
      this.state.get(`character.${ruler.id}.weakened`)
    ) {
      return false;
    }
    this.state.set(`character.${ruler.id}.weakened`, true);
    this.state.apply({ id: "ruler.pressure_faction", op: "add", value: 10 });
    this.state.apply({ id: "ruler.pressure_personal", op: "add", value: 5 });
    this.forces.adjust(homeForce, { influence: 5 });
    const forceName = this.forces.definitions.find((f) => f.id === homeForce)?.name || homeForce;
    this.pushLog(`众意难违：「${forceName}」力保 ${ruler.name} 留任。位子保住了，威权却没有了。`, "succession");
    return true;
  }

  /**
   * 按倒台原因从人物 fates 表排专属结局卡，并暂存反哺继任的 inherit。
   * @param {object} ruler @param {string} reason @param {object} fell
   */
  queueEpilogue(ruler, reason, fell) {
    const fate = ruler.fates?.[reason] || ruler.fates?.default;
    if (!fate) return;
    fell.fateLabel = fate.fateLabel || null;
    this.pendingInherit = fate.inherit || null;
    this.epilogueQueued = {
      id: `EPILOGUE-${ruler.id}-${this.day}`,
      pool: "core",
      series: "politics.council",
      type: "epilogue",
      title: fate.title,
      source: { kind: "character", id: ruler.id, name: ruler.name },
      tags: ["结局"],
      requires: [],
      excludes: [],
      weight: 0,
      text: fate.text,
      options: {
        left: { id: "yue_cundang", label: fate.option || "阅。存档备查。", effects: {} },
      },
      meta: { fateLabel: fell.fateLabel },
    };
    if (fell.fateLabel) {
      this.pushLog(`【结局】${ruler.name}：${fell.fateLabel}。`, "succession");
    }
  }

  // ------------------------------------------------------------ 时间推进

  /**
   * 推进天数：计时器、戒严到期、阶段切换。
   * @param {number} days
   */
  advanceDays(days) {
    const oldStage = this.stage;
    this.day += days;
    this.state.tickTimers(days);
    if (this.state.get("martial_law.active") && !this.state.get("martial_law.timer")) {
      this.state.set("martial_law.active", false);
      this.pushLog("戒严期满，营地解除戒严。", "system");
    }
    const newStage = this.stage;
    if (newStage !== oldStage) {
      this.state.set("stage.current", newStage);
      this.pushLog(`时代推进：进入${STAGE_NAMES[newStage]}。`, "system");
    }
  }

  // ------------------------------------------------------------ 人物能力

  /** @returns {boolean} */
  canUseAbility() {
    return Boolean(this.ruler?.ability) && this.day >= this.abilityReadyDay && !this.gameOverReason;
  }

  /** 发动执政者能力；返回能力定义（不可用时为 null）。 */
  useAbility() {
    if (!this.canUseAbility()) return null;
    const ability = this.ruler.ability;
    applyEffects(ability.effects, { state: this.state, forces: this.forces });
    this.abilityReadyDay = this.day + (ability.cooldownDays || 10);
    this.pushLog(`【人物能力】${this.ruler.name} 发动「${ability.name}」。`, "system");
    return ability;
  }

  // ------------------------------------------------------------ 反馈与调试

  /**
   * 批牍体反馈：一行四柱增减 + 至多两条隐晦注脚（仅调试模式展示）。
   * @param {Record<string, number>} before @param {Record<string, number>} after
   * @param {*} effects
   * @returns {{deltas: string, notes: string[]}}
   */
  describeChanges(before, after, effects) {
    const names = this.pillarNames();
    const parts = [];
    /** @type {Record<string, number>} 四柱增减（宝座 ▲▼ 反馈用） */
    const pillarDeltas = {};
    for (const key of Object.keys(names)) {
      const delta = after[key] - before[key];
      if (delta !== 0) {
        parts.push(`${names[key]} ${delta > 0 ? "+" : ""}${delta}`);
        pillarDeltas[key] = delta;
      }
    }
    const deltas = parts.length ? parts.join("，") : "四柱无变动";

    const notes = [];
    const wind = effects?.wind || 0;
    if (wind >= 3) notes.push("风声渐紧");
    else if (wind <= -3) notes.push("风声稍歇");
    const personal = effects?.personal || {};
    const p = personal.personal_pressure || 0;
    const f = personal.faction_alarm || 0;
    const v = personal.violence_risk || 0;
    const l = personal.legitimacy || 0;
    if (p >= 4) notes.push("肩上担子更重");
    if (f >= 4) notes.push("元老院投来警惕目光");
    if (v >= 4) notes.push("空气里多了火药味");
    if (l <= -4) notes.push("威信受损");
    if (l >= 4) notes.push("威信上升");
    for (const [forceId, changes] of Object.entries(effects?.forces || {})) {
      const def = this.forces.definitions.find((x) => x.id === forceId);
      if (!def || !this.forces.isUnlocked(forceId)) continue;
      if ((changes.hostility || 0) >= 5) notes.push(`「${def.name}」敌意滋生`);
      else if ((changes.satisfaction || 0) >= 5) notes.push(`「${def.name}」颇为受用`);
    }
    return { deltas, notes: notes.slice(0, 2), pillarDeltas };
  }

  /** @param {string} text @param {string} [kind] */
  pushLog(text, kind = "info") {
    this.log.unshift({ day: this.day, text, kind });
    if (this.log.length > LOG_LIMIT) this.log.pop();
  }

  /** @param {boolean} on */
  setDebug(on) {
    this.debug = Boolean(on);
  }

  /** 调试：跳过若干天（触发计时器/阶段推进）。 @param {number} n */
  debugSkipDays(n) {
    this.advanceDays(Math.max(1, n));
  }

  /** 调试：抬高一项隐藏压力。 @param {"personal"|"faction"|"violence"} kind */
  debugBump(kind) {
    const id = pressureStateId(
      kind === "personal" ? "personal_pressure" : kind === "faction" ? "faction_alarm" : "violence_risk",
    );
    if (id) this.state.apply({ id, op: "add", value: 20 });
  }

  /** 调试：合法性 -20。 */
  debugBumpLegitimacy() {
    this.state.apply({ id: "ruler.legitimacy", op: "add", value: -20 });
  }

  // ------------------------------------------------------------ 终局

  /**
   * 终局入口：崩局原因或专属结局 id。
   * 专属结局（ENDING_TEXTS）会覆盖结局画面的标题/文案/按钮。
   * @param {string} reason
   */
  gameOver(reason) {
    this.gameOverReason = reason;
    const ending = ENDING_TEXTS[reason];
    if (ending) {
      this.gameOverTitle = ending.title;
      this.gameOverText = ending.text;
      this.gameOverButton = ending.button;
    }
    const collapse = COLLAPSE_TEXTS[reason];
    if (collapse) this.pushLog(`【终局】${collapse.title}`, "collapse");
  }

  // ------------------------------------------------------------ 内部

  /** @returns {import("../engine/conditions.js").DrawContext} */
  ctx() {
    let consumed = 0;
    for (const id of this.usedCards) {
      if (this.narrativePool.has(id)) consumed += 1;
    }
    const usedRatio = this.narrativePool.size ? consumed / this.narrativePool.size : 0;
    return buildDrawContext({
      state: this.state,
      forces: this.forces,
      day: this.day,
      usedCards: this.usedCards,
      usedRatio,
    });
  }

  /** @returns {import("../engine/draw.js").DrawRuntime} */
  runtimeForDraw() {
    return {
      usedCards: this.usedCards,
      recentCards: this.recentCards,
      recentSeries: this.recentSeries,
      seriesStall: this.seriesStall,
      cardSeen: this.cardSeen,
      lastCardId: this.lastDrawnCardId,
      forces: this.forces,
      characterManager: this.characterManager,
    };
  }

  /** 系列停滞计数：进度长期不动时给推进卡加权。 @param {string} seriesId */
  trackStall(seriesId) {
    const progressId = `series.${seriesId.replace(".", "_")}`;
    const current = this.state.get(progressId) || 0;
    const seen = this.seriesProgressSeen[seriesId];
    if (seen === undefined) {
      this.seriesProgressSeen[seriesId] = current;
      this.seriesStall[seriesId] = 0;
    } else if (current > seen) {
      this.seriesProgressSeen[seriesId] = current;
      this.seriesStall[seriesId] = 0;
    } else {
      this.seriesStall[seriesId] = (this.seriesStall[seriesId] || 0) + 1;
    }
  }

  // ------------------------------------------------------------ 存档

  /** 序列化一局游戏（写入 localStorage 或导出为文件）。 */
  serialize() {
    return {
      version: 1,
      day: this.day,
      usedCards: [...this.usedCards],
      pendingCards: [...this.pendingCards],
      recentCards: [...this.recentCards],
      recentSeries: [...this.recentSeries],
      seriesStall: { ...this.seriesStall },
      seriesProgressSeen: { ...this.seriesProgressSeen },
      abilityReadyDay: this.abilityReadyDay,
      formerRuler: this.formerRuler,
      lastReportDay: this.lastReportDay,
      cardSeen: { ...this.cardSeen },
      lastDrawnCardId: this.lastDrawnCardId,
      epilogueQueued: this.epilogueQueued,
      pendingInherit: this.pendingInherit,
      debug: this.debug,
      gameOverReason: this.gameOverReason,
      gameOverTitle: this.gameOverTitle || null,
      gameOverText: this.gameOverText || null,
      gameOverButton: this.gameOverButton || null,
      state: this.state.snapshot(),
      forces: this.forces.snapshot(),
      log: [...this.log],
    };
  }

  /**
   * 从存档载荷恢复（字段缺省按新局处理）。
   * @param {*} data
   */
  restore(data) {
    this.resetRuntime();
    this.state.reset();
    this.state.loadDefinitions(this.content.states);
    this.forces.reset();

    this.day = data.day ?? 1;
    this.usedCards = new Set(data.usedCards || []);
    this.pendingCards = [...(data.pendingCards || [])];
    this.recentCards = [...(data.recentCards || [])];
    this.recentSeries = [...(data.recentSeries || [])];
    this.seriesStall = { ...(data.seriesStall || {}) };
    this.seriesProgressSeen = { ...(data.seriesProgressSeen || {}) };
    this.abilityReadyDay = data.abilityReadyDay ?? 1;
    this.formerRuler = data.formerRuler ?? null;
    this.lastReportDay = data.lastReportDay ?? 1;
    this.cardSeen = { ...(data.cardSeen || {}) };
    this.lastDrawnCardId = data.lastDrawnCardId ?? null;
    this.epilogueQueued = data.epilogueQueued ?? null;
    this.pendingInherit = data.pendingInherit ?? null;
    this.debug = Boolean(data.debug);
    this.gameOverReason = data.gameOverReason ?? null;
    this.gameOverTitle = data.gameOverTitle ?? null;
    this.gameOverText = data.gameOverText ?? null;
    this.gameOverButton = data.gameOverButton ?? null;
    this.state.restore(data.state);
    this.forces.restore(data.forces);
    this.log = [...(data.log || [])];
    this.currentCard = null;
  }

  /** 写入 localStorage。 @returns {boolean} */
  save() {
    return saveGame(this.serialize());
  }

  /**
   * 从 localStorage 恢复一局。
   * @param {*} content
   * @returns {Game|null}
   */
  static load(content) {
    const data = loadGame();
    if (!data) return null;
    const game = new Game(content);
    game.restore(data);
    return game;
  }

  /** 清除存档。 */
  static discardSave() {
    clearSave();
  }
}
