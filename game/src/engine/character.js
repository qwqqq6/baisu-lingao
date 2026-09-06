/**
 * 人物与继任：程序只实现通用流程（读候选、判条件、算权重、抽取），
 * 谁在什么局势下适合继任，全部写在人物卡（characters/core.json）的 succession 定义里。
 */

import { matchesWithContext, weightedPick } from "./state.js";

export class CharacterManager {
  /** @type {Array<object>} 人物定义 */
  characters = [];

  loadDefinitions(definitions) {
    this.characters = definitions || [];
  }

  get(id) {
    return this.characters.find((c) => c.id === id) || null;
  }

  /**
   * 数据驱动继任：按人物卡的 succession 定义筛选候选、应用权重修正并抽取。
   * 返回 { character, reasons, entryCardId } 或 null（无人可继任 → 继任危机）。
   */
  pickSuccessor(ctx) {
    const candidates = [];
    for (const character of this.characters) {
      if (character.id === ctx.state.get("ruler.current")) continue;
      const succession = character.succession;
      if (!succession) continue;
      if (!(succession.requires || []).every((cond) => matchesWithContext(cond, ctx))) continue;
      if ((succession.excludes || []).some((cond) => matchesWithContext(cond, ctx))) continue;

      let weight = succession.baseWeight || 1;
      const reasons = [];
      for (const modifier of succession.weightModifiers || []) {
        if ((modifier.when || []).every((cond) => matchesWithContext(cond, ctx))) {
          weight += modifier.add || 0;
          if (modifier.reason && modifier.add !== 0) reasons.push(modifier.reason);
        }
      }
      candidates.push({ character, weight, reasons, entryCardId: succession.entryCard });
    }
    const picked = weightedPick(candidates);
    if (!picked) return null;
    return {
      character: picked.character,
      reasons: picked.reasons.slice(0, 3),
      entryCardId: picked.entryCardId,
    };
  }
}
