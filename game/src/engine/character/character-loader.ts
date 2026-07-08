import {
  type CharacterCard,
  type CharacterPressureBias,
  defineTendencies,
  type TendencyKey,
  validateCharacterCard,
} from "./character-card.ts";

/**
 * JSON 中的人物卡原始结构。
 *
 * JSON 文件只负责表达内容，可以只写非 0 的治理倾向；
 * 加载器会补齐缺失字段、裁剪数值并做结构校验。
 */
export type CharacterCardJson = {
  id: string;
  name: string;
  summary: string;
  recommendedForNewPlayers?: boolean;
  tendencies?: Partial<Record<TendencyKey, number>>;
  pressureBias?: CharacterPressureBias;
};

/** 将 JSON 原始数据转换为引擎内部使用的人物卡。 */
export function loadCharacterCards(rawCharacters: CharacterCardJson[]): CharacterCard[] {
  if (!Array.isArray(rawCharacters)) {
    throw new Error("Character data must be an array");
  }

  return rawCharacters.map(loadCharacterCard);
}

/** 转换并校验单张人物卡。 */
export function loadCharacterCard(raw: CharacterCardJson): CharacterCard {
  const card: CharacterCard = {
    id: expectString(raw.id, "character.id"),
    name: expectString(raw.name, `${raw.id}.name`),
    summary: expectString(raw.summary, `${raw.id}.summary`),
    recommendedForNewPlayers: Boolean(raw.recommendedForNewPlayers),
    tendencies: defineTendencies(raw.tendencies ?? {}),
    pressureBias: raw.pressureBias ?? {},
  };

  validateCharacterCard(card);
  return card;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected string field: ${field}`);
  }

  return value;
}
