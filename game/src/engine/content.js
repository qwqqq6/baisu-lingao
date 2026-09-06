/**
 * 内容包加载器：抓取 game/content/official/ 下的 JSON 并聚合成运行时内容。
 * 官方内容与未来的 Mod 内容包使用同样的目录与字段结构。
 */

const BASE = "./content/official";

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`加载失败 ${path}: ${res.status}`);
  return res.json();
}

export async function loadOfficialContent() {
  const [states, forces, series, characters, ...cardFiles] = await Promise.all([
    fetchJson(`${BASE}/states/core.json`),
    fetchJson(`${BASE}/forces/core.json`),
    fetchJson(`${BASE}/series/core.json`),
    fetchJson(`${BASE}/characters/core.json`),
    fetchJson(`${BASE}/cards/core.json`),
    fetchJson(`${BASE}/cards/external.json`),
    fetchJson(`${BASE}/cards/farm.json`),
    fetchJson(`${BASE}/cards/civil.json`),
    fetchJson(`${BASE}/cards/security.json`),
    fetchJson(`${BASE}/cards/planning.json`),
    fetchJson(`${BASE}/cards/trade.json`),
    fetchJson(`${BASE}/cards/characters.json`),
  ]);

  const cards = cardFiles.flat();
  const cardIds = new Set(cards.map((c) => c.id));
  if (cardIds.size !== cards.length) throw new Error("卡牌 id 存在重复，请运行 tools/validate_content.py 检查");

  return { states, forces, series, characters, cards, cardIndex: new Map(cards.map((c) => [c.id, c])) };
}
