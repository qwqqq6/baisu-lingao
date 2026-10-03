/**
 * 人物与继任：程序只实现通用流程（读候选、判条件、算权重、抽取），
 * 谁在什么局势下适合继任，全部写在人物卡（characters/core.json）的
 * succession 定义里（数据驱动，文档 4.3 节）。
 *
 * @module engine/character
 */

import { matchesWithContext } from "./conditions.js";
import { weightedPick } from "./random.js";

/**
 * @typedef {object} WeightModifier
 * @property {Array<*>} when    命中条件（全部满足才生效）
 * @property {number} add       权重修正值
 * @property {string} [reason]  命中时的解释（展示在继任卡上）
 */

/**
 * @typedef {object} SuccessionDefinition
 * @property {number} baseWeight
 * @property {Array<*>} requires
 * @property {Array<*>} excludes
 * @property {WeightModifier[]} weightModifiers
 * @property {string} entryCard  继任卡 id
 */

/**
 * @typedef {object} FateDefinition
 * @property {string} title
 * @property {string} text
 * @property {string} [fateLabel]  结局短标签（如「软禁于农庄旧宅」）
 * @property {string} [option]     结局卡按钮文案
 * @property {object} [inherit]    结局反哺继任的 effects
 */

/**
 * @typedef {object} Character
 * @property {string} id
 * @property {string} name
 * @property {string} route
 * @property {string} [title]
 * @property {string[]} personality
 * @property {string} strengths
 * @property {string} risks
 * @property {string} fallStyles
 * @property {string[]} tags
 * @property {object} initialBonus
 * @property {object} [ability]
 * @property {object} [flaw]
 * @property {Record<string, FateDefinition>} [fates]
 * @property {SuccessionDefinition} [succession]
 * @property {string} [openingCard]
 */

export class CharacterManager {
  /** @type {Character[]} */
  characters = [];

  /** @param {Character[]} definitions */
  loadDefinitions(definitions) {
    this.characters = definitions || [];
  }

  /** @param {string} id */
  get(id) {
    return this.characters.find((c) => c.id === id) || null;
  }

  /**
   * 数据驱动继任：按人物卡的 succession 定义筛选候选、
   * 应用权重修正并抽取。
   * @param {import("./conditions.js").DrawContext} ctx
   * @returns {{character: Character, reasons: string[], entryCardId: string}|null}
   *          无人可继任时返回 null（由调用方判继任危机）。
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
