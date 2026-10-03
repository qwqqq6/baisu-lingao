/**
 * StateManager：游戏世界状态的唯一定义与存取处。
 *
 * 职责（与 docs/状态管理类说明.md 一致）：
 * - 注册状态定义，按定义初始化默认值；
 * - 校验类型、枚举值、数值边界和可变性；
 * - 执行卡牌选项产生的状态变化（apply / applyAll）；
 * - 推进计时器（tickTimers）；
 * - 导出与恢复存档快照（snapshot / restore / reset）。
 *
 * 条件判定在 engine/conditions.js，加权随机在 engine/random.js；
 * 此处重新导出以保持既有导入路径兼容。
 *
 * @module engine/state
 */

import { matchesWithContext } from "./conditions.js";
import { weightedPick } from "./random.js";

export { matchesWithContext, weightedPick };

/**
 * @typedef {object} StateDefinition
 * @property {string} id            英文命名空间 id（如 core.pillar.people）
 * @property {string} name          中文名
 * @property {"boolean"|"counter"|"level"|"enum"|"timer"|"set"} type
 * @property {string} [scope]       作用域（保留字段，当前全部 global）
 * @property {*} default            默认值
 * @property {number} [min]         数值下界
 * @property {number} [max]         数值上界
 * @property {string[]} [values]    enum 的合法值
 * @property {"public"|"hinted"|"hidden"} [visibility]
 * @property {"reversible"|"immutable"|"terminal"} [mutability]
 * @property {string[]} [tags]
 * @property {string} [desc]
 */

/**
 * @typedef {object} StateChange
 * @property {string} id
 * @property {"set"|"add"|"subtract"|"addToSet"|"removeFromSet"|"startTimer"|"clearTimer"} op
 * @property {*} value
 */

export class StateManager {
  constructor() {
    /** @type {Map<string, StateDefinition>} id -> 定义 */
    this.definitions = new Map();
    /** @type {Map<string, *>} id -> 运行时值 */
    this.values = new Map();
    /** 最近一次被拒绝的写入原因（诊断用，随时会被覆盖） */
    this.lastWarning = "";
  }

  /** 清空并加载一组新定义，初始化默认值。 */
  loadDefinitions(definitions) {
    this.reset();
    for (const def of definitions || []) {
      this.define(def);
    }
  }

  /** 追加一个状态定义；id 重复视为内容错误，直接抛出。 */
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

  /**
   * 读取状态值；未定义的 id 返回 undefined。
   * @param {string} id
   */
  get(id) {
    return this.values.get(id);
  }

  /** @param {string} id @returns {StateDefinition|undefined} */
  getDefinition(id) {
    return this.definitions.get(id);
  }

  /**
   * 直接设置状态值，带类型/枚举/边界/可变性校验。
   * @param {string} id
   * @param {*} value
   * @returns {boolean} 是否写入成功
   */
  set(id, value) {
    const def = this.definitions.get(id);
    if (!def) {
      this.lastWarning = `未定义的状态 id：${id}`;
      return false;
    }
    if (!this._checkMutability(def, value)) return false;
    this.values.set(id, this._normalize(def, value));
    return true;
  }

  /**
   * 执行单条状态变化。
   * @param {StateChange} change
   * @returns {boolean} 是否执行成功
   */
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

  /**
   * 依次执行一组状态变化；返回是否全部成功。
   * @param {StateChange[]} changes
   */
  applyAll(changes) {
    let ok = true;
    for (const change of changes || []) {
      if (!this.apply(change)) ok = false;
    }
    return ok;
  }

  /** 推进所有计时器 days 天；归零后自动置为 null。 */
  tickTimers(days) {
    for (const [id, def] of this.definitions) {
      if (def.type !== "timer") continue;
      const value = this.values.get(id);
      if (!value) continue;
      const remaining = (value.remainingDays || 0) - days;
      this.values.set(id, remaining > 0 ? { remainingDays: remaining } : null);
    }
  }

  /** @param {*} condition @returns {boolean}（见 engine/conditions.js） */
  matches(condition) {
    return matchesWithContext(condition, {
      state: this,
      day: 0,
      usedCards: new Set(),
      forceMetric: () => undefined,
    });
  }

  /** @param {*[]} conditions */
  matchesAll(conditions) {
    return (conditions || []).every((c) => this.matches(c));
  }

  /** 导出普通对象快照，适合写入存档。 */
  snapshot() {
    const out = {};
    for (const [id, value] of this.values) out[id] = value;
    return out;
  }

  /** 恢复快照：校验 id 已定义，补齐缺失状态的默认值。 */
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

  /** 按定义归一化值：数值取整并裁剪边界，enum 回落默认，timer 补结构。 */
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
   * - reversible：自由变化；
   * - immutable：只能从默认值向新值推进一次，不能回滚；
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
