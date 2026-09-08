/**
 * 游戏流程控制器：开局、抽卡、结算、倒台与继任、崩局判定、存读档。
 * 引擎模块保持纯逻辑，这里负责把它们串成一局游戏。
 */

import { StateManager, matchesWithContext } from "../engine/state.js";
import { ForcesManager } from "../engine/forces.js";
import { CharacterManager } from "../engine/character.js";
import { applyEffects, checkCollapse, PILLAR_STATE_IDS } from "../engine/effects.js";
import {
  buildDrawContext,
  availableSeries,
  applySeriesWeight,
  pickCardInSeries,
  applyVariants,
} from "../engine/draw.js";
import { weightedPick } from "../engine/state.js";
import { saveGame, loadGame, clearSave } from "../engine/save.js";

const RECENT_CARDS_LIMIT = 8;
const RECENT_SERIES_LIMIT = 4;

/** 各人物的本命势力：倒台时若它足够强势，可强行挽留（架空）。 */
const HOME_FORCE = {
  wunanhai: "farm",
  wude: "naturalized",
  beiwei: "guard",
  maqianzhu: "planning",
  wendsi: "council",
};

export const FALL_REASONS = {
  impeach: "罢免",
  purge: "清洗",
  assassinate: "刺杀",
  mutiny: "军变",
  health: "病退",
  farm_overreach: "农庄坐大",
  network_overreach: "网络失控",
  plan_failure: "计划失败",
  council_seizure: "会议夺权",
};

export const ENDING_TEXTS = {
  taiwan: {
    title: "终局：扬帆南渡",
    text: "船队在夜色里离开南寮海口，帆影连成一线，铁拳旗卷在桅杆上。没有人说话——大家沉默地看着临高在海上变成一道黑线。\n\n八年前，他们在「台湾还是海南」之间选了海南；八年后，海南站不住了，五百余人掉头向南，去大员驱逐红毛人，从一座叫台湾的岛从头再来。值班秘书在航海日志的末页写：崇祯二年，临高失守，全伙南渡台湾。八年前之争，至此有了答案。\n\n《临高启明·执政者》——另一个开头，等你再来书写。",
    button: "在另一个时空重新开始",
  },
};

/** 专属结局（effects.ending 触发）：非崩局、非败退的叙事终局。 */
export const ENDING_TEXTS = {
  taiwan: {
    title: "终局：扬帆南渡",
    text: "船队在夜色里离开南寮海口，帆影连成一线，铁拳旗卷在桅杆上。没有人说话——大家沉默地看着临高在海上变成一道黑线。\n\n八年前，他们在「台湾还是海南」之间选了海南；八年后，海南站不住了，五百余人掉头向南，去大员驱逐红毛人，从一座叫台湾的岛从头再来。值班秘书在航海日志的末页写：崇祯二年，临高失守，全伙南渡台湾。八年前之争，至此有了答案。\n\n《临高启明·执政者》——另一个开头，等你再来书写。",
    button: "在另一个时空重新开始",
  },
};

export const COLLAPSE_TEXTS = {
  livelihood: {
    title: "生产崩溃",
    text: "仓廪见底，灶冷烟稀。饥荒像潮水一样漫过营地，队伍在一夜之间散了。《临高启明》的第一页，翻不到这里。",
  },
  people: {
    title: "民变四起",
    text: "归化民跑了，劳工逃了，连跟了最久的老人也开始夜里磨刀。营地在大火中易主，史书里只留下一行'初，众不服'。",
  },
  military: {
    title: "军务失控",
    text: "枪杆子终于不再听命于会议。哨线之内是军营，哨线之外没有人说话——因为已经没有人需要被说服了。",
  },
  council: {
    title: "元老院分裂",
    text: "会议彻底破裂，各派各立山头、各征各粮。临高集团在一场没有枪声的内战里四分五裂。",
  },
  wind: {
    title: "外部围剿",
    text: "风声终于变成了刀兵。官军、海商、乡勇组成联军封锁了海岸，桅杆如林，旌旗蔽日——这片海摊再无宁日。",
  },
  legitimacy: {
    title: "执政失效",
    text: "没有人再执行来自上头的命令，不是因为反抗，而是因为无所谓。权力在无声无息中蒸发，营地仍在，'临高'已经不在了。",
  },
  succession: {
    title: "继任危机",
    text: "前任倒台，继任无人。各派相持不下，营地陷入漫长的空位期，直到外部势力不请自来。",
  },
};

export class Game {
  constructor(content) {
    this.content = content;
    this.state = new StateManager();
    this.forces = new ForcesManager();
    this.characterManager = new CharacterManager();

    this.state.loadDefinitions(content.states);
    this.forces.loadDefinitions(content.forces);
    this.characterManager.loadDefinitions(content.characters);

    this.resetRuntime();
  }

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
    this.log = [];
  }

  get rulerId() {
    return this.state.get("ruler.current");
  }

  get ruler() {
    return this.characterManager.get(this.rulerId);
  }

  get stage() {
    const day = this.day;
    if (day <= 10) return "landing";
    if (day <= 40) return "expansion";
    return "consolidation";
  }

  /** 季节：每十天一季，影响农事/商贸/军务系列权重（天时系统） */
  get season() {
    return ["春", "夏", "秋", "冬"][Math.floor((this.day - 1) / 10) % 4];
  }

  // ---------------------------------------------------------------- 开局

  newGame(characterId) {
    this.resetRuntime();
    this.state.reset();
    this.state.loadDefinitions(this.content.states);
    this.forces.reset();

    const character = this.characterManager.get(characterId);
    if (!character) throw new Error(`未知人物：${characterId}`);

    this.state.set("ruler.current", characterId);
    const bonus = character.initialBonus || {};
    if (bonus.stats) {
      for (const [key, value] of Object.entries(bonus.stats)) {
        this.state.apply({ id: PILLAR_STATE_IDS[key], op: "add", value });
      }
    }
    if (bonus.wind) this.state.apply({ id: "core.wind", op: "add", value: bonus.wind });
    if (bonus.personal) {
      for (const [key, value] of Object.entries(bonus.personal)) {
        const id =
          key === "legitimacy"
            ? "ruler.legitimacy"
            : key === "personal_pressure"
              ? "ruler.pressure_personal"
              : key === "faction_alarm"
                ? "ruler.pressure_faction"
                : "ruler.pressure_violence";
        this.state.apply({ id, op: "add", value });
      }
    }

    this.pushLog(`崇祯元年，广东琼州府临高县。${character.name}（${character.route}）被推上执政之位。`, "system");
    if (bonus.desc) this.pushLog(`${character.name}的初始加成已生效。`, "system");
    if (character.openingCard) this.pendingCards.push(character.openingCard);
  }

  // ---------------------------------------------------------------- 回合

  /** 抽出下一张要展示的卡（含倒台/继任等强制事件），返回 false 表示游戏结束或无卡可发。 */
  nextTurn() {
    if (this.gameOverReason) return false;
    this.forces.ensureUnlocked(this.ctx());

    // 人物缺陷：周期性压力漂移（隐藏进行，只进日志暗示）
    const ruler = this.ruler;
    if (ruler?.flaw && this.day % ruler.flaw.everyDays === 0) {
      for (const [key, value] of Object.entries(ruler.flaw.personal || {})) {
        const id =
          key === "legitimacy"
            ? "ruler.legitimacy"
            : key === "personal_pressure"
              ? "ruler.pressure_personal"
              : key === "faction_alarm"
                ? "ruler.pressure_faction"
                : "ruler.pressure_violence";
        this.state.apply({ id, op: "add", value });
      }
    }

    const collapse = checkCollapse(this.state);
    if (collapse) {
      this.gameOver(collapse);
      return false;
    }

    // 倒台结局：先放结局，再议继任
    if (this.epilogueQueued) {
      const epilogue = this.epilogueQueued;
      this.epilogueQueued = null;
      this.present(epilogue, epilogue.meta || {});
      return true;
    }

    if (!this.rulerId || this.rulerId === "none") {
      return this.drawSuccession();
    }

    // 倒台卡：优先级最高的强制事件
    const ctx = this.ctx();
    for (const card of this.content.cards) {
      if (card.type !== "downfall" || this.usedCards.has(card.id)) continue;
      if (!(card.requires || []).every((c) => matchesWithContext(c, ctx))) continue;
      if ((card.excludes || []).some((c) => matchesWithContext(c, ctx))) continue;
      this.present(card);
      return true;
    }

    // 未处理的插入卡（后续链卡在此弹出，出队时重新校验条件）
    while (this.pendingCards.length) {
      const id = this.pendingCards.shift();
      const card = this.content.cardIndex.get(id);
      if (!card) continue;
      if (card.type !== "daily" && this.usedCards.has(card.id)) continue;
      if (!(card.requires || []).every((c) => matchesWithContext(c, ctx))) continue;
      if ((card.excludes || []).some((c) => matchesWithContext(c, ctx))) continue;
      this.present(card);
      return true;
    }

    // 阶段报告：每十天一份，用暗示代替数值（压力不进公开 UI）
    if (this.day - this.lastReportDay >= 10) {
      this.lastReportDay = this.day;
      this.present(this.buildReport());
      return true;
    }

    // 系列加权抽取：只保留当前确有可用卡牌的系列，避免"系列可用但入口卡未解锁"导致空抽
    const drawRuntime = this.runtimeForDraw();
    const weighted = [];
    for (const s of availableSeries(this.content.series, ctx)) {
      const card = pickCardInSeries(s, this.content.cards, ctx, drawRuntime);
      if (!card) continue;
      const { weight } = applySeriesWeight(s, ctx, drawRuntime);
      weighted.push({ series: s, card, weight });
    }
    const picked = weightedPick(weighted);
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

  present(card, meta = {}) {
    this.currentCard = { ...card, meta };
    this.lastDrawnCardId = card.id;
  }

  /** 玩家选择 left / right，结算并推进天数。返回结算反馈。 */
  choose(side) {
    const holder = this.currentCard;
    if (!holder || this.gameOverReason) return null;
    const option = holder.options?.[side];
    if (!option) return null;

    const before = this.pillars();
    const beforeStates = this.state.snapshot();
    const result = applyEffects(option.effects, { state: this.state, forces: this.forces });
    const after = this.pillars();

    // 结局反哺继任：前任的结局在继任者开局留下痕迹（软禁的旧部寒心、被杀的军中不安……）
    if (holder.type === "succession" && this.pendingInherit) {
      applyEffects(this.pendingInherit, { state: this.state, forces: this.forces });
      this.pendingInherit = null;
    }

    // 专属结局（如扬帆南渡）
    if (option.effects?.ending) {
      this.gameOver(option.effects.ending);
    }

    // 倒台卡特殊规则：只有真正下台才消耗该卡；强行续任后压力仍在，倒台会再次逼近
    const refusedDownfall = holder.type === "downfall" && !option.effects?.stepDown;
    if (!refusedDownfall) this.usedCards.add(holder.id);
    this.cardSeen[holder.id] = (this.cardSeen[holder.id] || 0) + 1;

    // 不可逆状态发生变化时写入纪事，让"后果"可见
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
    if (holder.type === "daily") {
      this.recentCards = [holder.id, ...this.recentCards].slice(0, RECENT_CARDS_LIMIT);
    }

    // 后续插入卡
    for (const id of option.followups || []) {
      if (this.content.cardIndex.has(id)) this.pendingCards.push(id);
    }

    // 推进天数、计时器与阶段
    this.advanceDays(result.days);

    // 倒台结算：把当前执政者挪入前任序列
    let fell = null;
    if (option.effects?.stepDown) {
      fell = this.performStepDown();
    }

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

  performStepDown() {
    const ruler = this.ruler;
    if (!ruler) return null;
    const reason = this.state.get("fall.last_reason");

    // 支持者强行挽留：罢免转化为架空/勉强续任（文档 4.2 节）
    const homeForce = HOME_FORCE[ruler.id];
    if (
      homeForce &&
      this.forces.isUnlocked(homeForce) &&
      this.forces.metric(homeForce, "influence") >= 65 &&
      this.forces.metric(homeForce, "satisfaction") >= 50 &&
      !this.state.get(`character.${ruler.id}.weakened`)
    ) {
      this.state.set(`character.${ruler.id}.weakened`, true);
      this.state.apply({ id: "ruler.pressure_faction", op: "add", value: 10 });
      this.state.apply({ id: "ruler.pressure_personal", op: "add", value: 5 });
      this.forces.adjust(homeForce, { influence: 5 });
      const forceName = (this.forces.definitions.find((f) => f.id === homeForce) || {}).name || homeForce;
      this.pushLog(`众意难违：「${forceName}」力保 ${ruler.name} 留任。位子保住了，威权却没有了。`, "succession");
      return { character: ruler, reason: "强行挽留（架空）", entrenched: true };
    }

    this.state.apply({ id: "history.former_rulers", op: "addToSet", value: ruler.id });
    this.formerRuler = ruler.id;
    this.state.set("ruler.current", "none");
    // 压力交接：个人压力与暴力风险清零，派系警惕减半遗留，合法性保留由继任卡修正
    this.state.set("ruler.pressure_personal", 0);
    this.state.set("ruler.pressure_violence", 0);
    this.state.set("ruler.pressure_faction", Math.ceil((this.state.get("ruler.pressure_faction") || 0) / 2));
    this.abilityReadyDay = this.day;
    const reasonText = FALL_REASONS[reason] || "去职";
    this.pushLog(`朝局震动：${ruler.name} 因「${reasonText}」下台。`, "succession");

    // 专属结局：按倒台原因从人物数据里取（软禁 / 被杀 / 无人听令 / 流放 / 病退……）
    const fates = ruler.fates || {};
    const fate = fates[reason] || fates.default;
    let fateLabel = null;
    if (fate) {
      fateLabel = fate.fateLabel || null;
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
        meta: { fateLabel },
      };
      if (fateLabel) this.pushLog(`【结局】${ruler.name}：${fateLabel}。`, "succession");
    }
    return {
      character: ruler,
      reason: reasonText,
      dead: Boolean(this.state.get(`character.${ruler.id}.dead`)),
      fateLabel,
    };
  }

  /** 阶段报告：把隐藏局势写成几行公文，不出现任何数值。 */
  buildReport() {
    const lines = [];
    const ruler = this.ruler;
    if (this.state.get("ruler.pressure_personal") >= 40) {
      lines.push("近来各口的事务都压在您一人肩上。秘书处的人说，后半夜常见您屋里的灯还亮着。");
    }
    if (this.state.get("ruler.pressure_faction") >= 40) {
      lines.push("会上的风向有些不对。几位委员散会后留在廊下交头接耳，见人来了就住口。");
    }
    if (this.state.get("ruler.pressure_violence") >= 40) {
      lines.push("营区外夜里不太平。保卫组这个月拿的人，比往常都多。");
    }
    if (this.state.get("ruler.legitimacy") <= 40) {
      lines.push("各口对批示开始讨价还价，一件三五天能办的事，如今要走七八道手续。");
    }
    if (this.state.get("core.wind") >= 40) {
      lines.push("海面上生面孔的船多了。县衙那边许久没有递话来——安静得反常。");
    }
    for (const def of this.forces.definitions) {
      if (!this.forces.isUnlocked(def.id)) continue;
      const m = this.metricsOf(def.id);
      if (m.satisfaction <= 25) lines.push(`「${def.name}」近来对上头的话爱答不理，差事办得敷衍。`);
      else if (m.hostility >= 60) lines.push(`「${def.name}」的人在暗中串联，风声很紧。`);
      else if (m.influence >= 70) lines.push(`「${def.name}」的势力正盛，营里办事，先得过他们的门。`);
    }
    if (!lines.length) {
      const neutrals = [
        "各处大致安分。粮仓的账对得上，哨线的记录也齐——这样的日子，在临高算得上好日子。",
        "没什么可写的大事。东门市的市面照常，工地的进度照旧，往年这个时节，土匪该来了，今年还没有。",
        "各口的日子过得平平。归化民里有几家在办喜事，借走了营里两副碗筷，说好如数归还。",
        "本旬无事。值夜的战士说，后半夜听见海滩上有野狗刨沙子，除此之外，天下太平。",
      ];
      lines.push(neutrals[this.day % neutrals.length]);
    }
    return {
      id: `REPORT-${this.day}`,
      pool: "core",
      series: "politics.council",
      type: "report",
      title: `阶段报告（第 ${this.day} 日）`,
      source: { kind: "force", id: "council", name: "执委会秘书处" },
      tags: ["报告"],
      requires: [],
      excludes: [],
      weight: 0,
      text: `秘书处汇总了近旬各方情形，择要报呈首长：\n\n${lines.map((l) => `· ${l}`).join("\n")}`,
      options: {
        left: {
          id: "cun_dang_beicha",
          label: "阅毕，存档备查",
          effects: {}
        }
      }
    };
  }

  metricsOf(forceId) {
    return {
      influence: this.forces.metric(forceId, "influence") ?? 0,
      satisfaction: this.forces.metric(forceId, "satisfaction") ?? 0,
      hostility: this.forces.metric(forceId, "hostility") ?? 0,
    };
  }

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
      const names = { landing: "登陆期", expansion: "扩张期", consolidation: "巩固期" };
      this.pushLog(`时代推进：进入${names[newStage]}。`, "system");
    }
  }

  // ---------------------------------------------------------------- 人物能力

  canUseAbility() {
    return Boolean(this.ruler?.ability) && this.day >= this.abilityReadyDay && !this.gameOverReason;
  }

  useAbility() {
    if (!this.canUseAbility()) return null;
    const ability = this.ruler.ability;
    applyEffects(ability.effects, { state: this.state, forces: this.forces });
    this.abilityReadyDay = this.day + (ability.cooldownDays || 10);
    this.pushLog(`【人物能力】${this.ruler.name} 发动「${ability.name}」。`, "system");
    return ability;
  }

  // ---------------------------------------------------------------- 结算描述

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

  setDebug(on) {
    this.debug = Boolean(on);
  }

  /** 调试工具：跳过若干天（触发阶段报告/计时器等） */
  debugSkipDays(n) {
    this.advanceDays(Math.max(1, n));
  }

  /** 调试工具：直接抬高某项隐藏压力（legitimacy 为减） */
  debugBump(kind) {
    const map = {
      personal: "ruler.pressure_personal",
      faction: "ruler.pressure_faction",
      violence: "ruler.pressure_violence",
    };
    const id = map[kind];
    if (!id) return;
    this.state.apply({ id, op: "add", value: 20 });
  }

  debugBumpLegitimacy() {
    this.state.apply({ id: "ruler.legitimacy", op: "add", value: -20 });
  }

  describeChanges(before, after, effects) {
    // 批牍体反馈：一行四柱增减 + 至多一条隐晦注脚
    const names = this.pillarNames();
    const parts = [];
    for (const key of Object.keys(names)) {
      const delta = after[key] - before[key];
      if (delta !== 0) parts.push(`${names[key]} ${delta > 0 ? "+" : ""}${delta}`);
    }
    const deltas = parts.length ? parts.join("，") : "四柱无变动";

    const notes = [];
    const wind = effects?.wind || 0;
    if (wind >= 3) notes.push("风声渐紧");
    else if (wind <= -3) notes.push("风声稍歇");
    const personal = effects?.personal || {};
    const p = personal.personal_pressure || 0, f = personal.faction_alarm || 0,
      v = personal.violence_risk || 0, l = personal.legitimacy || 0;
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
    return { deltas, notes: notes.slice(0, 2) };
  }

  pushLog(text, kind = "info") {
    this.log.unshift({ day: this.day, text, kind });
    if (this.log.length > 60) this.log.pop();
  }

  // ---------------------------------------------------------------- 内部

  ctx() {
    return buildDrawContext({
      state: this.state,
      forces: this.forces,
      day: this.day,
      usedCards: this.usedCards,
    });
  }

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

  gameOver(reason, customText) {
    this.gameOverReason = reason;
    const ending = ENDING_TEXTS[reason];
    if (ending) {
      this.gameOverTitle = ending.title;
      this.gameOverText = ending.text;
      this.gameOverButton = ending.button;
    }
    const text = COLLAPSE_TEXTS[reason];
    if (text) this.pushLog(`【终局】${text.title}`, "collapse");
  }

  // ---------------------------------------------------------------- 存档

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
      state: this.state.snapshot(),
      forces: this.forces.snapshot(),
      log: [...this.log],
    };
  }

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
    this.state.restore(data.state);
    this.forces.restore(data.forces);
    this.log = [...(data.log || [])];
    this.currentCard = null;
  }

  save() {
    return saveGame(this.serialize());
  }

  static load(content) {
    const data = loadGame();
    if (!data) return null;
    const game = new Game(content);
    game.restore(data);
    return game;
  }

  static discardSave() {
    clearSave();
  }
}
