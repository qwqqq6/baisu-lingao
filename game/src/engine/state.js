/**
 * StateManager：游戏世界状态的唯一定义与存取处。
 *
 * 职责（与 docs/状态管理类说明.md 一致）：
 * - 注册状态定义，按定义初始化默认值。
 * - 校验类型、枚举值、数值边界和可变性。
 * - 执行卡牌选项产生的状态变化（apply / applyAll）。
 * - 条件判断（matches / matchesAll）。
 * - 推进计时器（tickTimers）。
 * - 存档快照（snapshot / restore / reset）。
 */

export class StateManager {
  constructor() {
    /** @type {Map<string, object>} id -> 定义 */
    this.definitions = new Map();
    /** @type {Map<string, any>} id -> 运行时值 */
    this.values = new Map();
    /** 最近一次被拒绝的写入原因，供日志与调试使用 */
    this.lastWarning = "";
  }

  /** 清空并加载一组新定义，初始化默认值。 */
  loadDefinitions(definitions) {
    this.reset();
    for (const def of definitions || []) {
      this.define(def);
    }
  }

  /** 追加一个状态定义。 */
  define(definition) {
    if (!definition || !definition.id) {
      throw new Error("状态定义缺少 id");
    }
    if (this.definitions.has(definition.id)) {
      throw new Error(`状态 id 重复定义：${definition.id}`);
    }
    this.definitions.set(definition.id, definition);
    this.values.set(definition.id, this._normalize(definition, definition.default));
  }

  /** 读取状态值；未定义的 id 返回 undefined。 */
  get(id) {
    return this.values.get(id);
  }

  getDefinition(id) {
    return this.definitions.get(id);
  }

  /** 直接设置状态值，带类型/枚举/边界/可变性校验。 */
  set(id, value) {
    const def = this.definitions.get(id);
    if (!def) {
      this.lastWarning = `未定义的状态 id：${id}`;
      return false;
    }
    if (!this._checkMutability(def, value)) {
      return false;
    }
    this.values.set(id, this._normalize(def, value));
    return true;
  }

  /** 执行单条状态变化 { id, op, value }。 */
  apply(change) {
    if (!change || !change.id) return false;
    const def = this.definitions.get(change.id);
    if (!def) {
      this.lastWarning = `未定义的状态 id：${change.id}`;
      return false;
    }
    const current = this.values.get(change.id);
    const op = change.op || "set";
    let next = current;

    switch (op) {
      case "set":
        next = change.value;
        break;
      case "add":
      case "subtract":
        if (def.type !== "counter" && def.type !== "level") {
          this.lastWarning = `状态 ${change.id} 类型 ${def.type} 不支持 ${op}`;
          return false;
        }
        next = (Number(current) || 0) + (op === "add" ? change.value : -change.value);
        break;
      case "addToSet":
        if (def.type !== "set") {
          this.lastWarning = `状态 ${change.id} 类型 ${def.type} 不支持 addToSet`;
          return false;
        }
        if (!current.includes(change.value)) next = [...current, change.value];
        break;
      case "removeFromSet":
        if (def.type !== "set") {
          this.lastWarning = `状态 ${change.id} 类型 ${def.type} 不支持 removeFromSet`;
          return false;
        }
        next = current.filter((v) => v !== change.value);
        break;
      case "startTimer":
        if (def.type !== "timer") {
          this.lastWarning = `状态 ${change.id} 类型 ${def.type} 不支持 startTimer`;
          return false;
        }
        next = { remainingDays: Math.max(1, Math.round(change.value)) };
        break;
      case "clearTimer":
        next = null;
        break;
      default:
        this.lastWarning = `未知的状态操作：${op}`;
        return false;
    }

    if (!this._checkMutability(def, next)) return false;
    this.values.set(change.id, this._normalize(def, next));
    return true;
  }

  applyAll(changes) {
    let ok = true;
    for (const change of changes || []) {
      if (!this.apply(change)) ok = false;
    }
    return ok;
  }

  /** 推进所有计时器；归零后自动置为 null。 */
  tickTimers(days) {
    for (const [id, def] of this.definitions) {
      if (def.type !== "timer") continue;
      const value = this.values.get(id);
      if (!value) continue;
      const remaining = (value.remainingDays || 0) - days;
      this.values.set(id, remaining > 0 ? { remainingDays: remaining } : null);
    }
  }

  matches(condition) {
    return matchCondition(condition, (id) => this.values.get(id));
  }

  matchesAll(conditions) {
    return (conditions || []).every((c) => this.matches(c));
  }

  /** 导出普通对象快照，适合写入存档。 */
  snapshot() {
    const out = {};
    for (const [id, value] of this.values) out[id] = value;
    return out;
  }

  /** 恢复快照：校验 id 已定义，补齐缺失的默认值。 */
  restore(snapshot) {
    for (const [id, def] of this.definitions) {
      const value = snapshot ? snapshot[id] : undefined;
      this.values.set(id, value === undefined ? this._normalize(def, def.default) : this._normalize(def, value));
    }
  }

  reset() {
    this.definitions.clear();
    this.values.clear();
    this.lastWarning = "";
  }

  _normalize(def, value) {
    switch (def.type) {
      case "counter":
      case "level": {
        let n = Math.round(Number(value) || 0);
        if (def.min !== undefined) n = Math.max(def.min, n);
        if (def.max !== undefined) n = Math.min(def.max, n);
        return n;
      }
      case "boolean":
        return Boolean(value);
      case "enum":
        return def.values && def.values.includes(value) ? value : def.default;
      case "set":
        return Array.isArray(value) ? [...value] : [];
      case "timer":
        if (!value) return null;
        return { remainingDays: Math.max(1, Math.round(Number(value.remainingDays) || 1)) };
      default:
        return value;
    }
  }

  /**
   * 可变性检查：
   * - reversible：自由变化。
   * - immutable：只能从默认值向新值推进，不能回滚也不能反复横跳。
   * - terminal：只能从默认值触发一次。
   */
  _checkMutability(def, nextValue) {
    if (def.mutability === "reversible") return true;
    const current = this.values.get(def.id);
    const atDefault = current === def.default;
    const goingDefault = nextValue === def.default;
    if (def.mutability === "immutable") {
      if (!atDefault || goingDefault) {
        this.lastWarning = `状态 ${def.id} 为 immutable，拒绝改写（当前 ${JSON.stringify(current)}）`;
        return false;
      }
      return true;
    }
    if (def.mutability === "terminal") {
      if (!atDefault) {
        this.lastWarning = `状态 ${def.id} 为 terminal，只能触发一次`;
        return false;
      }
      return true;
    }
    return true;
  }
}

/**
 * 条件判断。condition 的形态见 docs/重做规划 v0.2 第 10.12 节：
 * - { state, equals|notEquals|gt|gte|lt|lte|between|includes|notIncludes|exists }
 * - { force, metric, gte|gt|lt|lte|equals }
 * - { ruler: id } / { used: cardId } / { day: {gte, lte} } / { stage }
 * - { any: [...] } / { all: [...] }
 * getState 是一个 (stateId) => value 的取值函数，避免引擎模块间的循环依赖。
 */
export function matchCondition(condition, getState) {
  if (!condition) return true;
  if (condition.any) return condition.any.some((c) => matchCondition(c, getState));
  if (condition.all) return condition.all.every((c) => matchCondition(c, getState));
  if (condition.used !== undefined) return true; // used 集合由调用方在外层判定，见 matchesWithContext
  if (condition.ruler !== undefined) return getState("ruler.current") === condition.ruler;
  if (condition.stage !== undefined) return getState("stage.current") === condition.stage;
  if (condition.day !== undefined) return false; // 需要天数，由 matchesWithContext 处理
  if (condition.force !== undefined) return false; // 需要势力数值，由 matchesWithContext 处理
  if (condition.state !== undefined) return compareState(condition, getState(condition.state));
  return true;
}

function compareState(condition, value) {
  if (condition.equals !== undefined) return value === condition.equals;
  if (condition.notEquals !== undefined) return value !== condition.notEquals;
  if (condition.gt !== undefined) return (Number(value) || 0) > condition.gt;
  if (condition.gte !== undefined) return (Number(value) || 0) >= condition.gte;
  if (condition.lt !== undefined) return (Number(value) || 0) < condition.lt;
  if (condition.lte !== undefined) return (Number(value) || 0) <= condition.lte;
  if (condition.between !== undefined) {
    const [lo, hi] = condition.between;
    const n = Number(value) || 0;
    return n >= lo && n <= hi;
  }
  if (condition.includes !== undefined) return Array.isArray(value) && value.includes(condition.includes);
  if (condition.notIncludes !== undefined) return !Array.isArray(value) || !value.includes(condition.notIncludes);
  if (condition.exists !== undefined) {
    const has = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
    return condition.exists ? has : !has;
  }
  return true;
}

/**
 * 带运行时上下文的条件判断（卡牌抽取统一入口）。
 * ctx: { state: StateManager, day, usedCards:Set<string>, forces, currentRuler }
 */
export function matchesWithContext(condition, ctx) {
  if (!condition) return true;
  if (condition.any) return condition.any.some((c) => matchesWithContext(c, ctx));
  if (condition.all) return condition.all.every((c) => matchesWithContext(c, ctx));
  if (condition.used !== undefined) return ctx.usedCards.has(condition.used);
  if (condition.ruler !== undefined) return ctx.state.get("ruler.current") === condition.ruler;
  if (condition.stage !== undefined) return ctx.state.get("stage.current") === condition.stage;
  if (condition.day !== undefined) {
    const day = ctx.day || 0;
    if (condition.day.gte !== undefined && day < condition.day.gte) return false;
    if (condition.day.lte !== undefined && day > condition.day.lte) return false;
    return true;
  }
  if (condition.force !== undefined) {
    const value = ctx.forceMetric(condition.force, condition.metric);
    if (value === undefined) return false;
    if (condition.equals !== undefined) return value === condition.equals;
    if (condition.gt !== undefined) return value > condition.gt;
    if (condition.gte !== undefined) return value >= condition.gte;
    if (condition.lt !== undefined) return value < condition.lt;
    if (condition.lte !== undefined) return value <= condition.lte;
    return true;
  }
  if (condition.state !== undefined) return compareState(condition, ctx.state.get(condition.state));
  return true;
}

/** 简单加权随机。items 的每项需含 weight 数值字段。 */
export function weightedPick(items) {
  const pool = items.filter((item) => (item.weight || 0) > 0);
  if (!pool.length) return null;
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}
