// 共享可变游戏状态容器。
// ES 模块的导入绑定是只读的，因此把跨模块共享的可变状态集中放在一个对象上，
// 各模块通过 store.xxx 读写，保持与旧 IIFE 闭包变量等价的行为。
export const store = {
  state: null,
  currentCard: null,
  inputLocked: false,
  drag: null,
};

export const SAVE_KEY = "lingao_100_days_save_v1";
