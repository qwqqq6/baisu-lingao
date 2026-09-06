/**
 * 隐藏势力系统：每个势力有影响力 / 满意度 / 敌意三项隐藏数值。
 * 势力通过事件解锁（requires 条件满足后才进入运行时），全部数值不进公开 UI。
 */

import { matchesWithContext } from "./state.js";

export class ForcesManager {
  constructor() {
    /** @type {Array<object>} 势力定义 */
    this.definitions = [];
    /** @type {Map<string, {influence:number, satisfaction:number, hostility:number}>} */
    this.metrics = new Map();
    /** @type {Set<string>} 已解锁势力 */
    this.unlocked = new Set();
  }

  loadDefinitions(definitions) {
    this.definitions = definitions || [];
    this.metrics.clear();
    this.unlocked.clear();
  }

  /** 每回合检查解锁条件；新解锁的势力按初始值登场。 */
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

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  metric(id, name) {
    const m = this.metrics.get(id);
    return m ? m[name] : undefined;
  }

  /** 调整势力数值；未解锁的势力忽略调整（卡牌引用了未登场势力是正常情况）。 */
  adjust(id, changes) {
    if (!this.metrics.has(id)) return;
    const m = this.metrics.get(id);
    for (const key of ["influence", "satisfaction", "hostility"]) {
      const delta = Number(changes?.[key]) || 0;
      if (delta !== 0) m[key] = clamp(m[key] + delta);
    }
  }

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

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}
