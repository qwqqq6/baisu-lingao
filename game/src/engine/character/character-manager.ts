import {
  type CharacterCard,
  scoreTendencyMatch,
  type TendencyKey,
  validateCharacterCard,
} from "./character-card.ts";

/**
 * 人物管理器负责人物卡的注册、查询和当前执政者选择。
 *
 * 它不负责回复匹配和继任判定，只提供稳定的人物数据入口。
 * 这样后续 Mod 新增人物时，只需要加载新人物卡，不需要改抽卡逻辑。
 */
export class CharacterManager {
  private static instance: CharacterManager | null = null;

  private readonly characters = new Map<string, CharacterCard>();
  private currentCharacterId: string | null = null;

  private constructor() {}

  /** 取得全局唯一人物管理器实例。 */
  static getInstance(): CharacterManager {
    if (!CharacterManager.instance) {
      CharacterManager.instance = new CharacterManager();
    }

    return CharacterManager.instance;
  }

  /** 重新加载人物卡列表，通常用于新游戏、内容包重载或测试。 */
  loadCharacters(characters: CharacterCard[]): void {
    this.characters.clear();
    this.currentCharacterId = null;

    for (const character of characters) {
      this.register(character);
    }
  }

  /** 注册单张人物卡。 */
  register(character: CharacterCard): void {
    if (this.characters.has(character.id)) {
      throw new Error(`Duplicate character id: ${character.id}`);
    }

    validateCharacterCard(character);
    this.characters.set(character.id, character);
  }

  /** 返回所有人物卡，按注册顺序排列。 */
  list(): CharacterCard[] {
    return [...this.characters.values()];
  }

  /** 根据 id 查询人物卡；未知 id 直接抛错，方便尽早发现内容包问题。 */
  get(id: string): CharacterCard {
    const character = this.characters.get(id);
    if (!character) {
      throw new Error(`Unknown character id: ${id}`);
    }

    return character;
  }

  /** 判断人物是否已经注册。 */
  has(id: string): boolean {
    return this.characters.has(id);
  }

  /** 设置当前执政人物。 */
  setCurrent(id: string): void {
    this.get(id);
    this.currentCharacterId = id;
  }

  /** 读取当前执政人物；尚未选择人物时返回 null。 */
  getCurrent(): CharacterCard | null {
    if (!this.currentCharacterId) return null;
    return this.get(this.currentCharacterId);
  }

  /** 清空当前执政人物，通常用于新游戏重置。 */
  clearCurrent(): void {
    this.currentCharacterId = null;
  }

  /**
   * 计算某人物与一组治理倾向权重的匹配分。
   * 后续回复匹配器会复用这个入口，而不是直接读取人物卡内部结构。
   */
  scoreMatch(id: string, weights: Partial<Record<TendencyKey, number>>): number {
    return scoreTendencyMatch(this.get(id), weights);
  }
}

/** 全项目共享的人物管理器实例。 */
export const characterManager = CharacterManager.getInstance();
