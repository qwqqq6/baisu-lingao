/**
 * 状态管理器是游戏世界状态的唯一读写入口。
 *
 * 它只负责“状态库”这一层：状态定义、运行时状态值、状态变更、
 * 条件判断、计时器推进和存档快照。四柱指标、隐藏势力数值、
 * 抽卡逻辑、UI 展示都应由其他模块负责。
 */
export type StateType = "boolean" | "counter" | "level" | "enum" | "timer" | "set";
export type StateScope = "global" | "ruler" | "character" | "force" | "series";
export type StateVisibility = "hidden" | "hinted" | "public";
export type StateMutability = "immutable" | "reversible" | "terminal";

/** 临时状态的运行时值，例如“戒严还剩 3 天”。 */
export type TimerStateValue = {
  remainingDays: number;
};

/** 所有状态类型在存档中的值域。 */
export type StateValue = boolean | number | string | string[] | TimerStateValue | null;

/**
 * 状态定义描述一个状态“是什么”。
 * 这些定义未来会来自官方内容包或 Mod 内容包。
 */
export type StateDefinition = {
  id: string;
  name: string;
  type: StateType;
  scope: StateScope;
  default: StateValue;
  visibility: StateVisibility;
  mutability: StateMutability;
  tags?: string[];
  desc?: string;
  min?: number;
  max?: number;
  values?: string[];
};

/** 卡牌选项结算后写入状态库的原子操作。 */
export type StateChange =
  | { id: string; op: "set"; value: StateValue }
  | { id: string; op: "add" | "subtract"; value: number }
  | { id: string; op: "addToSet" | "removeFromSet"; value: string }
  | { id: string; op: "startTimer"; value: number }
  | { id: string; op: "clearTimer" };

/** 系列、卡牌或变体用来判断自身是否可用的状态条件。 */
export type StateCondition = {
  state: string;
  equals?: StateValue;
  notEquals?: StateValue;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  includes?: string;
  notIncludes?: string;
  between?: [number, number];
  exists?: boolean;
};

/** 可直接写入存档的状态快照。 */
export type StateSnapshot = Record<string, StateValue>;

/**
 * 状态管理单例。
 *
 * 设计成单例是为了让引擎、卡牌结算、存档系统共享同一个状态库；
 * 测试或工具若需要隔离实例，应在未来再补专用工厂，而不是在运行时
 * 到处 new 多份状态管理器。
 */
export class StateManager {
  private static instance: StateManager | null = null;

  /** 状态定义表，负责校验状态 id、类型和值域。 */
  private readonly definitions = new Map<string, StateDefinition>();

  /** 当前运行时状态值，随游戏选择、天数推进和读档变化。 */
  private values = new Map<string, StateValue>();

  private constructor() {}

  /** 取得全局唯一状态管理器实例。 */
  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }

    return StateManager.instance;
  }

  /** 重新加载完整状态定义，通常用于新游戏、测试或内容包重载。 */
  loadDefinitions(definitions: StateDefinition[]): void {
    this.definitions.clear();
    this.values.clear();

    for (const definition of definitions) {
      this.define(definition);
    }
  }

  /** 注册单个状态定义，并用默认值初始化运行时状态。 */
  define(definition: StateDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Duplicate state definition: ${definition.id}`);
    }

    this.validateDefinition(definition);
    this.definitions.set(definition.id, definition);
    this.values.set(definition.id, this.cloneValue(definition.default));
  }

  /** 判断状态定义是否存在，不读取运行时值。 */
  has(id: string): boolean {
    return this.definitions.has(id);
  }

  /** 获取状态定义；未知 id 直接抛错，避免静默吞掉卡牌配置问题。 */
  getDefinition(id: string): StateDefinition {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`Unknown state definition: ${id}`);
    }

    return definition;
  }

  /** 读取状态值，并返回克隆值，防止外部直接改内部数组或对象。 */
  get(id: string): StateValue {
    this.assertDefined(id);
    return this.cloneValue(this.values.get(id) ?? null);
  }

  /**
   * 直接设置状态值。
   *
   * `force` 只给存档迁移、修复工具或调试入口使用；
   * 正常卡牌结算不应绕过可变性规则。
   */
  set(id: string, value: StateValue, options: { force?: boolean } = {}): void {
    const definition = this.getDefinition(id);
    const nextValue = this.normalizeValue(definition, value);
    const currentValue = this.values.get(id) ?? this.cloneValue(definition.default);

    if (!options.force) {
      this.assertMutationAllowed(definition, currentValue, nextValue);
    }

    this.values.set(id, nextValue);
  }

  /** 执行一条卡牌状态变更操作。 */
  apply(change: StateChange): void {
    const definition = this.getDefinition(change.id);
    const currentValue = this.values.get(change.id) ?? this.cloneValue(definition.default);

    switch (change.op) {
      case "set":
        this.set(change.id, change.value);
        break;
      case "add":
        this.set(change.id, this.numericValue(definition, currentValue) + change.value);
        break;
      case "subtract":
        this.set(change.id, this.numericValue(definition, currentValue) - change.value);
        break;
      case "addToSet":
        this.set(change.id, [...this.setValue(definition, currentValue), change.value]);
        break;
      case "removeFromSet":
        this.set(
          change.id,
          this.setValue(definition, currentValue).filter((item) => item !== change.value),
        );
        break;
      case "startTimer":
        this.assertType(definition, "timer");
        this.set(change.id, { remainingDays: Math.max(0, Math.round(change.value)) });
        break;
      case "clearTimer":
        this.assertType(definition, "timer");
        this.set(change.id, null);
        break;
      default:
        this.assertNever(change);
    }
  }

  /** 按顺序执行多条状态变更，适合卡牌选项一次性结算。 */
  applyAll(changes: StateChange[] = []): void {
    for (const change of changes) {
      this.apply(change);
    }
  }

  /** 判断单个条件是否满足。 */
  matches(condition: StateCondition): boolean {
    const value = this.get(condition.state);

    if (condition.exists !== undefined) {
      const exists = value !== null && value !== undefined;
      if (exists !== condition.exists) return false;
    }

    if ("equals" in condition && !this.valuesEqual(value, condition.equals ?? null)) {
      return false;
    }

    if ("notEquals" in condition && this.valuesEqual(value, condition.notEquals ?? null)) {
      return false;
    }

    if (condition.gt !== undefined && !(this.asNumber(value) > condition.gt)) return false;
    if (condition.gte !== undefined && !(this.asNumber(value) >= condition.gte)) return false;
    if (condition.lt !== undefined && !(this.asNumber(value) < condition.lt)) return false;
    if (condition.lte !== undefined && !(this.asNumber(value) <= condition.lte)) return false;

    if (condition.between) {
      const numberValue = this.asNumber(value);
      const [min, max] = condition.between;
      if (numberValue < min || numberValue > max) return false;
    }

    if (condition.includes !== undefined && !this.asStringArray(value).includes(condition.includes)) {
      return false;
    }

    if (
      condition.notIncludes !== undefined &&
      this.asStringArray(value).includes(condition.notIncludes)
    ) {
      return false;
    }

    return true;
  }

  /** 判断一组条件是否全部满足。 */
  matchesAll(conditions: StateCondition[] = []): boolean {
    return conditions.every((condition) => this.matches(condition));
  }

  /** 推进所有 timer 状态；归零后自动清空为 null。 */
  tickTimers(days = 1): void {
    const step = Math.max(0, Math.round(days));

    for (const [id, definition] of this.definitions.entries()) {
      if (definition.type !== "timer") continue;

      const value = this.values.get(id);
      if (!this.isTimerValue(value)) continue;

      const remainingDays = Math.max(0, value.remainingDays - step);
      this.values.set(id, remainingDays > 0 ? { remainingDays } : null);
    }
  }

  /** 导出可存档的状态快照。 */
  snapshot(): StateSnapshot {
    const snapshot: StateSnapshot = {};

    for (const [id, value] of this.values.entries()) {
      snapshot[id] = this.cloneValue(value);
    }

    return snapshot;
  }

  /** 从存档快照恢复状态；缺失状态会回落到定义中的默认值。 */
  restore(snapshot: StateSnapshot): void {
    for (const id of Object.keys(snapshot)) {
      this.assertDefined(id);
    }

    const restored = new Map<string, StateValue>();
    for (const [id, definition] of this.definitions.entries()) {
      const value = Object.prototype.hasOwnProperty.call(snapshot, id)
        ? snapshot[id]
        : definition.default;
      restored.set(id, this.normalizeValue(definition, value));
    }

    this.values = restored;
  }

  /** 将所有状态恢复为默认值，保留已加载的状态定义。 */
  reset(): void {
    for (const [id, definition] of this.definitions.entries()) {
      this.values.set(id, this.cloneValue(definition.default));
    }
  }

  /** 校验状态定义本身，尽早拦截内容包配置错误。 */
  private validateDefinition(definition: StateDefinition): void {
    if (!definition.id || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/.test(definition.id)) {
      throw new Error(`Invalid state id: ${definition.id}`);
    }

    if (definition.type === "enum" && (!definition.values || !definition.values.length)) {
      throw new Error(`Enum state requires values: ${definition.id}`);
    }

    this.normalizeValue(definition, definition.default);
  }

  /** 将外部传入值规范化为该状态类型允许的运行时值。 */
  private normalizeValue(definition: StateDefinition, value: StateValue): StateValue {
    switch (definition.type) {
      case "boolean":
        if (typeof value !== "boolean") throw new Error(`State ${definition.id} expects boolean`);
        return value;
      case "counter":
      case "level":
        if (typeof value !== "number") throw new Error(`State ${definition.id} expects number`);
        return this.clamp(definition, Math.round(value));
      case "enum":
        if (typeof value !== "string") throw new Error(`State ${definition.id} expects string enum`);
        if (!definition.values?.includes(value)) {
          throw new Error(`Invalid enum value for ${definition.id}: ${value}`);
        }
        return value;
      case "timer":
        if (value === null) return null;
        if (!this.isTimerValue(value)) throw new Error(`State ${definition.id} expects timer value`);
        return { remainingDays: Math.max(0, Math.round(value.remainingDays)) };
      case "set":
        if (!Array.isArray(value)) throw new Error(`State ${definition.id} expects string array`);
        return Array.from(new Set(value.map((item) => String(item)))).sort();
      default:
        this.assertNever(definition.type);
    }
  }

  private assertMutationAllowed(
    definition: StateDefinition,
    currentValue: StateValue,
    nextValue: StateValue,
  ): void {
    if (definition.mutability === "reversible") return;
    if (this.valuesEqual(currentValue, nextValue)) return;

    const defaultValue = definition.default;
    const hasLeftDefault = !this.valuesEqual(currentValue, defaultValue);
    const returnsToDefault = this.valuesEqual(nextValue, defaultValue);

    // immutable / terminal 状态用来记录历史事实或终局后果。
    // 一旦离开默认值，就不允许普通卡牌再改回去；应新增后果状态表达变化。
    if (hasLeftDefault || returnsToDefault) {
      throw new Error(
        `State ${definition.id} is ${definition.mutability}; create a consequence state instead of reverting it`,
      );
    }
  }

  /** 确认 id 已注册，避免卡牌引用不存在的状态。 */
  private assertDefined(id: string): void {
    if (!this.definitions.has(id)) {
      throw new Error(`Unknown state definition: ${id}`);
    }
  }

  /** 确认状态类型符合当前操作。 */
  private assertType(definition: StateDefinition, type: StateType): void {
    if (definition.type !== type) {
      throw new Error(`State ${definition.id} expects ${type}, got ${definition.type}`);
    }
  }

  /** 取出数值状态，供 add/subtract 和数值条件使用。 */
  private numericValue(definition: StateDefinition, value: StateValue): number {
    if (definition.type !== "counter" && definition.type !== "level") {
      throw new Error(`State ${definition.id} is not numeric`);
    }

    return this.asNumber(value);
  }

  /** 取出集合状态，供 addToSet/removeFromSet 和 includes 条件使用。 */
  private setValue(definition: StateDefinition, value: StateValue): string[] {
    this.assertType(definition, "set");
    return this.asStringArray(value);
  }

  /** 按状态定义中的 min/max 裁剪数值。 */
  private clamp(definition: StateDefinition, value: number): number {
    const min = definition.min ?? Number.NEGATIVE_INFINITY;
    const max = definition.max ?? Number.POSITIVE_INFINITY;
    return Math.min(max, Math.max(min, value));
  }

  /** 克隆复合值，避免调用方拿到内部引用。 */
  private cloneValue(value: StateValue): StateValue {
    if (Array.isArray(value)) return [...value];
    if (this.isTimerValue(value)) return { remainingDays: value.remainingDays };
    return value;
  }

  /** 状态值结构都很浅，用 JSON 序列化比较足够直观。 */
  private valuesEqual(left: StateValue, right: StateValue): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  /** 将状态值视为数字；类型错误时主动抛错。 */
  private asNumber(value: StateValue): number {
    if (typeof value !== "number") {
      throw new Error(`Expected numeric state value, got ${typeof value}`);
    }

    return value;
  }

  /** 将状态值视为字符串集合；类型错误时主动抛错。 */
  private asStringArray(value: StateValue): string[] {
    if (!Array.isArray(value)) {
      throw new Error("Expected set state value");
    }

    return value;
  }

  /** 判断一个值是否符合 timer 状态结构。 */
  private isTimerValue(value: StateValue | undefined): value is TimerStateValue {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as TimerStateValue).remainingDays === "number"
    );
  }

  /** 编译期穷尽检查；新增联合类型分支时提醒补齐处理。 */
  private assertNever(value: never): never {
    throw new Error(`Unhandled state manager branch: ${String(value)}`);
  }
}

/** 全项目共享的状态管理器实例。 */
export const stateManager = StateManager.getInstance();
