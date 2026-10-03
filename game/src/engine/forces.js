/**
 * 隐藏势力系统：每个势力有影响力 / 满意度 / 敌意三项隐藏数值。
 * 势力通过事件解锁（requires 满足后进入运行时），数值不进公开 UI。
 *
 * @module engine/forces
 */

import { matchesWithContext } from "./conditions.js";

/**
 * @typedef {object} ForceDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} [desc]
 * @property {string[]} [tags]
 * @property {Array<*>} [requires]  解锁条件（缺省即开局存在）
 * @property {{influence?: number, satisfaction?: number, hostility?: number}} initial
 */

/** 势力三项数值的取值范围。 */
const METRIC_MIN = 0;
const METRIC_MAX = 100;

export class ForcesManager {
  constructor() {
    /** @type {ForceDefinition[]} */
    this.definitions = [];
    /** @type {Map<string, {influence:number, satisfaction:number, hostility:number}>} */
    this.metrics = new Map();
    /** @type {Set<string>} 已解锁势力 id */
    this.unlocked = new Set();
  }

  /** @param {ForceDefinition[]} definitions */
  loadDefinitions(definitions) {
    this.definitions = definitions || [];
    this.metrics.clear();
    this.unlocked.clear();
  }

  /**
   * 每回合检查解锁条件；新解锁的势力按定义的初始值登场。
   * @param {import("./conditions.js").DrawContext} ctx
   */
  ensureUnlocked(ctx) {
    for (const def of this.definitions) {
      if (this.unlocked.has(def.id)) continue;
      const requires = def.requires || [];
      if (requires.every((cond) => matchesWithContext(cond, ctx))) {
        this.unlocked.add(def.id);
        this.metrics.set(def.id, {
          influence: def.initial.influence ?? 0,
          satisfaction: def.initial.satisfaction ?? 0,
          hostility: def.initial.hostility ?? 0,
        });
      }
    }
  }

  /** @param {string} id */
  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  /**
   * 读取单项数值。
   * @param {string} id 势力 id
   * @param {"influence"|"satisfaction"|"hostility"} name
   */
  metric(id, name) {
    const m = this.metrics.get(id);
    return m ? m[name] : undefined;
  }

  /**
   * 调整势力数值；未解锁的势力忽略调整
   * （卡牌引用了未登场势力属于正常情况）。
   * @param {string} id
   * @param {{influence?: number, satisfaction?: number, hostility?: number}} changes
   */
  adjust(id, changes) {
    if (!this.metrics.has(id)) return;
    const m = this.metrics.get(id);
    for (const key of ["influence", "satisfaction", "hostility"]) {
      const delta = Number(changes?.[key]) || 0;
      if (delta !== 0) m[key] = clamp(m[key] + delta);
    }
  }

  /**
   * 应用 effects.forces 结构。
   * @param {Record<string, Record<string, number>>} effects
   */
  applyEffects(effects) {
    for (const [id, changes] of Object.entries(effects || {})) {
      this.adjust(id, changes);
    }
  }

  snapshot() {
    const out = { unlocked: [...this.unlocked], metrics: {} };
    for (const [id, m] of this.metrics) out.metrics[id] = { ...m };
    return out;
  }

  restore(snapshot) {
    this.unlocked = new Set(snapshot?.unlocked || []);
    this.metrics.clear();
    for (const [id, m] of Object.entries(snapshot?.metrics || {})) {
      this.metrics.set(id, { ...m });
    }
  }

  reset() {
    this.metrics.clear();
    this.unlocked.clear();
  }
}

/** @param {number} n */
function clamp(n) {
  return Math.max(METRIC_MIN, Math.min(METRIC_MAX, Math.round(n)));
}
