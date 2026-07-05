// 卡牌与选项工厂函数，供各数据模块复用。
// c(): 生成一张卡；e(): 生成一个选项（左/右）。
export const c = (id, stage, type, title, source, text, left, right, tags = [], once = true, extra = {}) => ({
  id,
  stage,
  type,
  title,
  source,
  text,
  left,
  right,
  tags,
  once,
  ...extra,
});

export const e = (label, effects, cost = 1, hint = "", extra = {}) => ({ label, effects, cost, hint, ...extra });
