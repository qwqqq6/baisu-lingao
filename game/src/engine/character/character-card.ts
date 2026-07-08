/**
 * 人物卡定义的是“这个人怎样治理”，而不是 RPG 式能力值。
 *
 * 其中 `tendencies` 译作“治理倾向”：数值越高，表示该人物越容易
 * 从这个角度解释问题、包装政策、选择代价。它会影响后续卡牌左右
 * 回复的匹配，但不直接等同于强弱。
 */

/** 领域类治理倾向：人物优先从哪类政治/治理问题切入。 */
export type DomainTendencyKey =
  | "agriculture"
  | "civil"
  | "security"
  | "planning"
  | "council"
  | "trade"
  | "technology";

/** 风格类治理倾向：人物倾向用什么手段解决问题。 */
export type StyleTendencyKey =
  | "pragmatism"
  | "coercion"
  | "charisma"
  | "caution"
  | "ambition"
  | "compromise"
  | "discipline";

export type TendencyKey = DomainTendencyKey | StyleTendencyKey;

/** 治理倾向统一使用 0-5，方便策划和 Mod 作者理解。 */
export type GovernanceTendencies = Record<TendencyKey, number>;

/** 人物压力偏向，用来描述某人更容易在哪类压力上出问题。 */
export type CharacterPressureKey =
  | "personal_pressure"
  | "faction_alarm"
  | "violence_risk"
  | "legitimacy";

export type CharacterPressureBias = Partial<Record<CharacterPressureKey, number>>;

/** 人物卡的第一版结构，只保留人物设定和后续系统会用到的挂钩。 */
export type CharacterCard = {
  id: string;
  name: string;
  summary: string;
  tendencies: GovernanceTendencies;
  pressureBias?: CharacterPressureBias;
  recommendedForNewPlayers?: boolean;
};

export const TENDENCY_MIN = 0;
export const TENDENCY_MAX = 5;

export const DOMAIN_TENDENCY_KEYS: DomainTendencyKey[] = [
  "agriculture",
  "civil",
  "security",
  "planning",
  "council",
  "trade",
  "technology",
];

export const STYLE_TENDENCY_KEYS: StyleTendencyKey[] = [
  "pragmatism",
  "coercion",
  "charisma",
  "caution",
  "ambition",
  "compromise",
  "discipline",
];

export const TENDENCY_KEYS: TendencyKey[] = [
  ...DOMAIN_TENDENCY_KEYS,
  ...STYLE_TENDENCY_KEYS,
];

/** 给编辑器、调试面板和说明文档使用的倾向中文名。 */
export const TENDENCY_LABELS: Record<TendencyKey, string> = {
  agriculture: "农政/民生",
  civil: "民政/组织",
  security: "军务/安全",
  planning: "计划/工业",
  council: "元老院/会议政治",
  trade: "商贸/外事",
  technology: "技术/专业化",
  pragmatism: "务实",
  coercion: "强制",
  charisma: "动员",
  caution: "谨慎",
  ambition: "扩张",
  compromise: "妥协",
  discipline: "纪律",
};

/** 创建一份全 0 倾向，避免人物卡漏字段。 */
export function createEmptyTendencies(): GovernanceTendencies {
  return Object.fromEntries(TENDENCY_KEYS.map((key) => [key, 0])) as GovernanceTendencies;
}

/**
 * 合并倾向配置。
 *
 * 人物数据只需要写非 0 倾向，未声明的字段会自动补 0；
 * 所有数值会被裁剪到 0-5。
 */
export function defineTendencies(
  partial: Partial<Record<TendencyKey, number>>,
): GovernanceTendencies {
  const tendencies = createEmptyTendencies();

  for (const key of TENDENCY_KEYS) {
    tendencies[key] = clampTendency(partial[key] ?? 0);
  }

  return tendencies;
}

/** 校验人物卡基础结构，尽早发现内容包或 Mod 配置错误。 */
export function validateCharacterCard(card: CharacterCard): void {
  if (!card.id || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/.test(card.id)) {
    throw new Error(`Invalid character id: ${card.id}`);
  }

  if (!card.name.trim()) {
    throw new Error(`Character ${card.id} requires a display name`);
  }

  if (!card.summary.trim()) {
    throw new Error(`Character ${card.id} requires a summary`);
  }

  for (const key of TENDENCY_KEYS) {
    const value = card.tendencies[key];
    if (!Number.isFinite(value) || value < TENDENCY_MIN || value > TENDENCY_MAX) {
      throw new Error(`Invalid tendency ${key} for character ${card.id}: ${value}`);
    }
  }
}

/**
 * 计算人物与某组倾向需求的匹配分。
 *
 * 这是后续“回复匹配器”的基础工具：回复会声明自己偏向哪些治理倾向，
 * 当前人物的相关倾向越高，该回复越容易替换基础左右选项。
 */
export function scoreTendencyMatch(
  character: CharacterCard,
  weights: Partial<Record<TendencyKey, number>>,
): number {
  let score = 0;

  for (const [key, weight] of Object.entries(weights) as [TendencyKey, number][]) {
    score += character.tendencies[key] * weight;
  }

  return score;
}

function clampTendency(value: number): number {
  return Math.min(TENDENCY_MAX, Math.max(TENDENCY_MIN, Math.round(value)));
}
