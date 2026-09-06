// 测试夹具：一套最小的内容包，供引擎测试使用。
// 注意：与正式内容包字段结构保持一致（见 docs/开源化优化计划.md §4 P1）。

const bool = (id, def, mutability = "reversible") =>
  ({ id, name: id, type: "boolean", scope: "global", default: def, visibility: "hidden", mutability });

export const fixtureStates = [
  { id: "core.pillar.people", name: "民望", type: "counter", default: 50, min: 0, max: 100, visibility: "public", mutability: "reversible" },
  { id: "core.pillar.livelihood", name: "生计", type: "counter", default: 50, min: 0, max: 100, visibility: "public", mutability: "reversible" },
  { id: "core.pillar.military", name: "军务", type: "counter", default: 50, min: 0, max: 100, visibility: "public", mutability: "reversible" },
  { id: "core.pillar.council", name: "元老院", type: "counter", default: 50, min: 0, max: 100, visibility: "public", mutability: "reversible" },
  { id: "core.wind", name: "风声", type: "counter", default: 0, min: 0, max: 100, visibility: "hidden", mutability: "reversible" },
  { id: "ruler.current", name: "当前执政者", type: "enum", values: ["none", "wunanhai", "wude"], default: "none", visibility: "public", mutability: "reversible" },
  { id: "ruler.pressure_personal", name: "个人压力", type: "counter", default: 0, min: 0, max: 100, visibility: "hidden", mutability: "reversible" },
  { id: "ruler.pressure_faction", name: "派系警惕", type: "counter", default: 0, min: 0, max: 100, visibility: "hidden", mutability: "reversible" },
  { id: "ruler.pressure_violence", name: "暴力风险", type: "counter", default: 0, min: 0, max: 100, visibility: "hidden", mutability: "reversible" },
  { id: "ruler.legitimacy", name: "合法性", type: "counter", default: 50, min: 0, max: 100, visibility: "hidden", mutability: "reversible" },
  { id: "stage.current", name: "阶段", type: "enum", values: ["landing", "expansion", "consolidation"], default: "landing", visibility: "hidden", mutability: "reversible" },
  { id: "fall.last_reason", name: "倒台原因", type: "enum", values: ["none", "impeach", "farm_overreach", "assassinate"], default: "none", visibility: "hidden", mutability: "reversible" },
  { id: "history.former_rulers", name: "前任", type: "set", default: [], visibility: "hidden", mutability: "reversible" },
  bool("contact.locals", false, "immutable"),
  bool("farm.established", false, "immutable"),
  bool("martial_law.active", false),
  { id: "martial_law.timer", name: "戒严计时", type: "timer", default: null, visibility: "hidden", mutability: "reversible" },
  { id: "series.politics_council", name: "会议进度", type: "level", default: 0, min: 0, max: 5, visibility: "hidden", mutability: "reversible" },
  bool("character.wunanhai.available", true),
  bool("character.wunanhai.dead", false, "terminal"),
  bool("character.wunanhai.weakened", false, "immutable"),
  bool("character.wude.available", true),
  bool("character.wude.dead", false, "terminal"),
];

export const fixtureForces = [
  { id: "council", name: "扩大会议", tags: ["会议"], initial: { influence: 45, satisfaction: 50, hostility: 10 } },
  { id: "farm", name: "南海农庄", tags: ["农庄", "农业"], requires: [{ "state": "farm.established", "equals": true }], initial: { influence: 15, satisfaction: 55, hostility: 0 } },
];

export const fixtureSeries = [
  { id: "politics.council", name: "元老会议", pool: "core", tags: ["会议", "政治"], weight: 10, requires: [], excludes: [], dependsOn: [], entryCards: ["T-OPEN"] },
];

const FARM_FORCE = { farm: { influence: 3 } };

export const fixtureCards = [
  {
    "id": "T-OPEN", "pool": "core", "series": "politics.council", "type": "opening",
    "title": "开局", "source": { "kind": "force", "id": "council", "name": "执委会" },
    "tags": ["会议"], "requires": [], "excludes": [], "weight": 100,
    "text": "开局呈文。",
    "options": {
      "left": { "id": "a", "label": "甲", "effects": { "stats": { "council": 2 } } },
      "right": { "id": "b", "label": "乙", "effects": { "stats": { "people": 2 } } },
    },
  },
  {
    "id": "T-DAILY", "pool": "core", "series": "politics.council", "type": "daily",
    "title": "日常", "source": { "kind": "force", "id": "council", "name": "执委会" },
    "tags": ["会议"], "requires": [], "excludes": [], "weight": 12,
    "text": "日常呈文。",
    "options": {
      "left": { "id": "a", "label": "甲", "effects": { "stats": { "council": 1 }, "followups": ["T-KEY"] } },
      "right": { "id": "b", "label": "乙", "effects": { "stats": { "people": 1 } } },
    },
  },
  {
    "id": "T-KEY", "pool": "core", "series": "politics.council", "type": "key",
    "title": "关键", "source": { "kind": "force", "id": "council", "name": "执委会" },
    "tags": ["会议"], "requires": [], "excludes": [], "weight": 25,
    "text": "关键呈文。",
    "options": {
      "left": { "id": "a", "label": "甲", "effects": { "states": [{ "id": "series.politics_council", "op": "add", "value": 1 }], "forces": FARM_FORCE } },
      "right": { "id": "b", "label": "乙", "effects": {} },
    },
  },
  {
    "id": "T-CRISIS", "pool": "core", "series": "politics.council", "type": "crisis",
    "title": "危机", "source": { "kind": "force", "id": "council", "name": "元老院" },
    "tags": ["危机"], "requires": [{ "state": "core.pillar.council", "lte": 30 }], "excludes": [], "weight": 40,
    "text": "危机呈文。",
    "options": {
      "left": { "id": "a", "label": "甲", "effects": { "stats": { "council": 5 } } },
      "right": { "id": "b", "label": "乙", "effects": { "stats": { "council": -3 } } },
    },
  },
  {
    "id": "T-FALL", "pool": "core", "series": "politics.council", "type": "downfall",
    "title": "倒台", "source": { "kind": "force", "id": "council", "name": "元老院" },
    "tags": ["倒台"],
    "requires": [
      { "ruler": "wunanhai" },
      { "state": "ruler.pressure_personal", "gte": 55 },
    ],
    "excludes": [],
    "weight": 100,
    "text": "倒台呈文。",
    "options": {
      "left": {
        "id": "step", "label": "去职",
        "effects": {
          "states": [
            { "id": "fall.last_reason", "op": "set", "value": "impeach" },
            { "id": "character.wunanhai.available", "op": "set", "value": false },
          ],
          "stepDown": true,
        },
      },
      "right": { "id": "stay", "label": "不走", "effects": { "personal": { "faction_alarm": 5 } } },
    },
  },
  {
    "id": "T-DAILY-2", "pool": "core", "series": "politics.council", "type": "daily",
    "title": "日常二", "source": { "kind": "force", "id": "council", "name": "执委会" },
    "tags": ["会议"], "requires": [], "excludes": [], "weight": 12,
    "text": "另一份日常呈文。",
    "options": {
      "left": { "id": "a", "label": "甲", "effects": { "stats": { "people": 1 } } },
      "right": { "id": "b", "label": "乙", "effects": { "stats": { "council": 1 } } },
    },
  },
  {
    "id": "T-FALL2", "pool": "core", "series": "politics.council", "type": "downfall",
    "title": "二次倒台", "source": { "kind": "force", "id": "council", "name": "元老院" },
    "tags": ["倒台"],
    "requires": [
      { "ruler": "wunanhai" },
      { "state": "character.wunanhai.weakened", "equals": true },
      { "state": "ruler.pressure_faction", "gte": 65 },
    ],
    "excludes": [],
    "weight": 100,
    "text": "二次倒台呈文。",
    "options": {
      "left": {
        "id": "step", "label": "去职",
        "effects": {
          "states": [
            { "id": "fall.last_reason", "op": "set", "value": "impeach" },
            { "id": "character.wunanhai.available", "op": "set", "value": false },
          ],
          "stepDown": true,
        },
      },
      "right": { "id": "stay", "label": "不走", "effects": { "personal": { "faction_alarm": 5 } } },
    },
  },
  {
    "id": "T-SUCC-WD", "pool": "core", "series": "politics.council", "type": "succession",
    "title": "继任", "source": { "kind": "force", "id": "council", "name": "扩大会议" },
    "tags": ["继任"], "requires": [], "excludes": [], "weight": 100,
    "text": "继任呈文。",
    "options": {
      "left": {
        "id": "acc", "label": "受任",
        "effects": { "ruler": "wude", "states": [{ "id": "ruler.current", "op": "set", "value": "wude" }] },
      },
      "right": { "id": "x", "label": "乙", "effects": { "ruler": "wude", "states": [{ "id": "ruler.current", "op": "set", "value": "wude" }] } },
    },
  },
];

export const fixtureCharacters = [
  {
    "id": "wunanhai", "name": "吴南海", "route": "农政/民生", "personality": ["务实"],
    "strengths": "s", "risks": "r", "fallStyles": "f", "tags": ["农业", "民生"],
    "initialBonus": { "desc": "d", "stats": { "livelihood": 5 }, "personal": { "legitimacy": 5 } },
    "ability": {
      "id": "a1", "name": "劝农", "desc": "d", "cooldownDays": 10,
      "effects": { "stats": { "livelihood": 7 }, "forces": { "farm": { "influence": 4 } } },
    },
    "flaw": { "name": "护短", "desc": "d", "everyDays": 6, "personal": { "faction_alarm": 2 } },
    "fates": {
      "default": { "title": "卸任", "fateLabel": "闲居", "option": "阅。", "text": "闲居呈文。" },
      "impeach": { "title": "软禁", "fateLabel": "软禁于农庄旧宅", "option": "阅。", "text": "软禁呈文。",
                   "inherit": { "personal": { "faction_alarm": 3 }, "forces": { "farm": { "satisfaction": -5 } } } },
    },
    "succession": {
      "baseWeight": 8,
      "requires": [{ "state": "character.wunanhai.available", "equals": true }],
      "excludes": [
        { "state": "character.wunanhai.dead", "equals": true },
        { "state": "character.wunanhai.available", "equals": false },
      ],
      "weightModifiers": [
        { "when": [{ "state": "core.pillar.livelihood", "lte": 35 }], "add": 8, "reason": "生计危机。" },
      ],
      "entryCard": "T-SUCC-WN",
    },
    "openingCard": "T-OPEN",
  },
  {
    "id": "wude", "name": "邬德", "route": "民政/组织", "personality": ["缜密"],
    "strengths": "s", "risks": "r", "fallStyles": "f", "tags": ["民政", "组织"],
    "initialBonus": { "desc": "d", "stats": { "people": 5 } },
    "succession": {
      "baseWeight": 8,
      "requires": [{ "state": "character.wude.available", "equals": true }],
      "excludes": [{ "state": "character.wude.dead", "equals": true }],
      "weightModifiers": [
        { "when": [{ "state": "core.pillar.people", "lte": 35 }], "add": 8, "reason": "民望低靡。" },
      ],
      "entryCard": "T-SUCC-WD",
    },
    "openingCard": "T-OPEN-WD",
  },
];

// 继任卡按需补齐（T-SUCC-WN 指向吴南海自己的继任卡）
fixtureCards.push({
  "id": "T-SUCC-WN", "pool": "core", "series": "politics.council", "type": "succession",
  "title": "农政派", "source": { "kind": "force", "id": "council", "name": "扩大会议" },
  "tags": ["继任"], "requires": [], "excludes": [], "weight": 100, "text": "继任呈文。",
  "options": {
    "left": { "id": "a", "label": "受任", "effects": { "ruler": "wunanhai", "states": [{ "id": "ruler.current", "op": "set", "value": "wunanhai" }] } },
    "right": { "id": "b", "label": "扩权", "effects": { "ruler": "wunanhai", "states": [{ "id": "ruler.current", "op": "set", "value": "wunanhai" }] } },
  },
});

export function makeFixture() {
  const cards = JSON.parse(JSON.stringify(fixtureCards));
  return {
    states: JSON.parse(JSON.stringify(fixtureStates)),
    forces: JSON.parse(JSON.stringify(fixtureForces)),
    series: JSON.parse(JSON.stringify(fixtureSeries)),
    characters: JSON.parse(JSON.stringify(fixtureCharacters)),
    cards,
    cardIndex: new Map(cards.map((c) => [c.id, c])),
  };
}
