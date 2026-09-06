/**
 * 内容包加载器：抓取 game/content/official/ 下的 JSON 并聚合成运行时内容。
 * 官方内容与 Mod 内容包使用同样的目录与字段结构。
 *
 * Mod 规范（可选）：game/mods/mods.json
 * {
 *   "mods": [
 *     { "id": "示例Mod", "name": "示例", "priority": 100,
 *       "entry": { "cards": ["cards.json"] },
 *       "patch": [ { "target": "FARM-001", "changes": { "weight": 5 } } ] }
 *   ]
 * }
 * - entry.cards：新增卡牌文件（相对 ./mods/<id>/），同 id 新增冲突直接报错；
 * - patch：点分路径深合并覆盖（必须指向已存在的卡牌）；
 * - 不执行任意 JavaScript。
 */

const BASE = "./content/official";

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`加载失败 ${path}: ${res.status}`);
  return res.json();
}

function applyPatch(obj, changes) {
  // 点分路径深合并：{ "options.left.label": "新文案" }
  for (const [dotted, value] of Object.entries(changes || {})) {
    const keys = dotted.split(".");
    let node = obj;
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (typeof node[keys[i]] !== "object" || node[keys[i]] === null) node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
  }
}

/** 加载 mods/mods.json（不存在则返回空数组，官方包可独立运行）。 */
async function loadModList() {
  try {
    const res = await fetch("./mods/mods.json", { cache: "no-store" });
    if (!res.ok) return [];
    const list = await res.json();
    return (list.mods || []).slice().sort((a, b) => (a.priority || 0) - (b.priority || 0));
  } catch {
    return [];
  }
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
  const cardIndex = new Map(cards.map((c) => [c.id, c]));
  const cardIds = new Set(cards.map((c) => c.id));
  if (cardIds.size !== cards.length) throw new Error("卡牌 id 存在重复，请运行 tools/validate_content.py 检查");

  // Mod：数据包，不执行任意 JS
  const mods = await loadModList();
  for (const mod of mods) {
    for (const rel of mod.entry?.cards || []) {
      const modCards = await fetchJson(`./mods/${mod.id}/${rel}`);
      for (const c of modCards) {
        if (cardIds.has(c.id)) throw new Error(`Mod「${mod.name || mod.id}」卡牌 id 冲突：${c.id}`);
        cards.push(c);
        cardIds.add(c.id);
        cardIndex.set(c.id, c);
      }
    }
    for (const p of mod.patch || []) {
      const target = cardIndex.get(p.target);
      if (!target) throw new Error(`Mod「${mod.name || mod.id}」patch 目标不存在：${p.target}`);
      applyPatch(target, p.changes || {});
    }
  }

  return { states, forces, series, characters, cards, cardIndex };
}
