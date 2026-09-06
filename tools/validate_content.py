# -*- coding: utf-8 -*-
"""内容包校验脚本：检查 game/content/official/ 下 JSON 的结构、唯一性与交叉引用。

用法：
    python tools/validate_content.py

校验项：
- 所有 JSON 可解析，数组/字段结构完整；
- 状态、卡牌 id 全局唯一；状态 id 使用英文命名空间；
- enum 状态的 default 必须在 values 中；
- 卡牌的 series 必须存在，pool 与系列 pool 一致；
- 选项必须有 label 与 effects；effects 里的 state id / force id 必须已定义；
- followups、系列 entryCards、人物 openingCard / succession.entryCard 引用的卡牌必须存在；
- 继任卡（type=succession）的 effects 必须包含 ruler 字段；
- 势力的 requires / 人物继任条件中的 state、force 引用必须存在。
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "game" / "content" / "official"

# 可选深度校验：安装 jsonschema 后自动启用（pip install jsonschema）
try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False

STATE_ID_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$")
CARD_ID_RE = re.compile(r"^[A-Z0-9\-]+$")

CARD_FILES = [
    "cards/core.json", "cards/external.json", "cards/farm.json", "cards/civil.json",
    "cards/security.json", "cards/planning.json", "cards/trade.json", "cards/characters.json",
]

CONDITION_KEYS = {
    "state", "force", "ruler", "used", "day", "stage", "any", "all",
    "equals", "notEquals", "gt", "gte", "lt", "lte", "between",
    "includes", "notIncludes", "exists", "metric",
}
EFFECT_KEYS = {"stats", "wind", "days", "forces", "personal", "states", "ruler", "stepDown"}
STAT_KEYS = {"people", "livelihood", "military", "council"}
PERSONAL_KEYS = {"personal_pressure", "faction_alarm", "violence_risk", "legitimacy"}
FORCE_METRICS = {"influence", "satisfaction", "hostility"}

errors = []
warnings = []


def fail(path, message):
    errors.append(f"{path}: {message}")


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # noqa: BLE001
        fail(path, f"JSON 解析失败：{exc}")
        return None


def walk_conditions(conds, path, state_ids, force_ids, ctx=""):
    if conds is None or conds == []:
        return
    if not isinstance(conds, list):
        fail(path, f"{ctx}conditions 必须是数组")
        return
    for i, cond in enumerate(conds):
        walk_condition(cond, path, state_ids, force_ids, f"{ctx}conditions[{i}].")


def walk_condition(cond, path, state_ids, force_ids, prefix):
    if not isinstance(cond, dict):
        fail(path, f"{prefix}条件必须是对象")
        return
    unknown = set(cond) - CONDITION_KEYS
    if unknown:
        warnings.append(f"{path}: {prefix}未知条件键 {sorted(unknown)}")
    if "any" in cond or "all" in cond:
        for key in ("any", "all"):
            if key in cond:
                if not isinstance(cond[key], list):
                    fail(path, f"{prefix}{key} 必须是数组")
                for j, sub in enumerate(cond[key]):
                    walk_condition(sub, path, state_ids, force_ids, f"{prefix}{key}[{j}].")
        return
    if "state" in cond:
        if cond["state"] not in state_ids:
            fail(path, f"{prefix}引用了未定义状态 {cond['state']}")
    if "force" in cond:
        if cond["force"] not in force_ids:
            fail(path, f"{prefix}引用了未定义势力 {cond['force']}")
        if "metric" in cond and cond["metric"] not in FORCE_METRICS:
            fail(path, f"{prefix}势力指标非法：{cond['metric']}")


def walk_effects(effects, path, state_ids, force_ids, ctx=""):
    if not isinstance(effects, dict):
        fail(path, f"{ctx}effects 必须是对象")
        return
    unknown = set(effects) - EFFECT_KEYS
    if unknown:
        warnings.append(f"{path}: {ctx}未知效果键 {sorted(unknown)}")
    stats = effects.get("stats", {})
    if not set(stats) <= STAT_KEYS:
        fail(path, f"{ctx}stats 含非法四柱键：{sorted(set(stats) - STAT_KEYS)}")
    personal = effects.get("personal", {})
    if not set(personal) <= PERSONAL_KEYS:
        fail(path, f"{ctx}personal 含非法键：{sorted(set(personal) - PERSONAL_KEYS)}")
    forces = effects.get("forces", {})
    for force_id, changes in forces.items():
        if force_id not in force_ids:
            fail(path, f"{ctx}forces 引用了未定义势力 {force_id}")
        if not set(changes) <= FORCE_METRICS:
            fail(path, f"{ctx}势力 {force_id} 的数值键非法")
    for i, change in enumerate(effects.get("states", [])):
        if not isinstance(change, dict) or "id" not in change or "op" not in change:
            fail(path, f"{ctx}states[{i}] 必须含 id 与 op")
            continue
        if change["id"] not in state_ids:
            fail(path, f"{ctx}states[{i}] 引用了未定义状态 {change['id']}")


def main():
    if not CONTENT.exists():
        print(f"找不到内容目录：{CONTENT}")
        return 1

    states = load(CONTENT / "states" / "core.json") or []
    forces = load(CONTENT / "forces" / "core.json") or []
    series = load(CONTENT / "series" / "core.json") or []
    characters = load(CONTENT / "characters" / "core.json") or []

    state_ids = set()
    for state in states:
        sid = state.get("id", "")
        if not STATE_ID_RE.match(sid):
            fail("states/core.json", f"状态 id 不符合英文命名空间规范：{sid}")
        if sid in state_ids:
            fail("states/core.json", f"状态 id 重复：{sid}")
        state_ids.add(sid)
        if state.get("type") == "enum" and state.get("default") not in (state.get("values") or []):
            fail("states/core.json", f"enum 状态 {sid} 的 default 不在 values 中")
        if state.get("type") == "boolean" and not isinstance(state.get("default"), bool):
            fail("states/core.json", f"boolean 状态 {sid} 的 default 必须是布尔值")

    force_ids = set()
    for force in forces:
        fid = force.get("id", "")
        if fid in force_ids:
            fail("forces/core.json", f"势力 id 重复：{fid}")
        force_ids.add(fid)
        walk_conditions(force.get("requires"), "forces/core.json", state_ids, force_ids, f"势力 {fid}.")

    series_ids = set()
    series_by_id = {}
    for s in series:
        sid = s.get("id", "")
        if sid in series_ids:
            fail("series/core.json", f"系列 id 重复：{sid}")
        series_ids.add(sid)
        series_by_id[sid] = s
        if sid not in state_ids:
            pass  # 系列进度状态由 states 提供，名字约定 series.<id 下划线化>，此处不强制
        walk_conditions(s.get("requires"), "series/core.json", state_ids, force_ids, f"系列 {sid}.")
        walk_conditions(s.get("excludes"), "series/core.json", state_ids, force_ids, f"系列 {sid}.")
        for dep in s.get("dependsOn", []):
            if dep not in series_ids and dep not in {x.get("id") for x in series}:
                fail("series/core.json", f"系列 {sid} 依赖了未知系列 {dep}")

    # 系列进度状态命名约定检查：series.<id 以点换下划线> 应存在于 states
    for s in series:
        progress_id = "series." + s["id"].replace(".", "_")
        if progress_id not in state_ids:
            warnings.append(f"系列 {s['id']} 缺少对应的进度状态 {progress_id}（停滞检测将退化为 0）")

    cards = []
    card_ids = set()
    for rel in CARD_FILES:
        path = CONTENT / rel
        file_cards = load(path)
        if file_cards is None:
            continue
        for card in file_cards:
            cid = card.get("id", "<无 id>")
            if cid in card_ids:
                fail(rel, f"卡牌 id 重复：{cid}")
            if not CARD_ID_RE.match(cid):
                fail(rel, f"卡牌 id 含非法字符：{cid}")
            card_ids.add(cid)
            cards.append(card)

            if card.get("series") not in series_by_id:
                fail(rel, f"卡牌 {cid} 的系列不存在：{card.get('series')}")
            elif card.get("pool") != series_by_id[card["series"]].get("pool"):
                warnings.append(f"卡牌 {cid} 的 pool 与系列 pool 不一致")
            if not card.get("title"):
                fail(rel, f"卡牌 {cid} 缺少 title")
            if not card.get("text") and not card.get("lines"):
                fail(rel, f"卡牌 {cid} 缺少 text（呈文）或 lines（对话）")
            for i, ln in enumerate(card.get("lines") or []):
                if not isinstance(ln, dict) or not ln.get("who") or not ln.get("line"):
                    fail(rel, f"卡牌 {cid} 的 lines[{i}] 必须含 who 与 line")
            options = card.get("options") or {}
            if "left" not in options or "right" not in options:
                fail(rel, f"卡牌 {cid} 必须包含左右两个选项")
            for side in ("left", "right"):
                option = options.get(side) or {}
                if not option.get("label"):
                    fail(rel, f"卡牌 {cid} 的 {side} 选项缺少 label")
                walk_effects(option.get("effects"), rel, state_ids, force_ids, f"卡牌 {cid} {side} 选项.")
                for followup in option.get("followups", []):
                    if followup not in card_ids and followup not in {c.get("id") for c in cards}:
                        pass  # 引用检查放到第二遍
            walk_conditions(card.get("requires"), rel, state_ids, force_ids, f"卡牌 {cid}.")
            walk_conditions(card.get("excludes"), rel, state_ids, force_ids, f"卡牌 {cid}.")
            for variant in card.get("variants", []):
                when = variant.get("when")
                if isinstance(when, dict) and isinstance(when.get("conditions"), list):
                    walk_conditions(when["conditions"], rel, state_ids, force_ids,
                                    f"卡牌 {cid} 变体 {variant.get('id')}.")

    # 第二遍：followups 与入口卡引用
    for card in cards:
        cid = card.get("id")
        for side in ("left", "right"):
            for followup in ((card.get("options") or {}).get(side) or {}).get("followups", []):
                if followup not in card_ids:
                    fail(CARD_FILES[0], f"卡牌 {cid} 的 followup 指向不存在的卡：{followup}")

    for s in series:
        for entry in s.get("entryCards", []):
            if entry not in card_ids:
                fail("series/core.json", f"系列 {s['id']} 的入口卡不存在：{entry}")

    succession_cards = set()
    char_ids = set()
    for character in characters:
        cid = character.get("id", "")
        char_ids.add(cid)
        # 人物相关状态
        for suffix in ("available", "dead"):
            if f"character.{cid}.{suffix}" not in state_ids:
                fail("characters/core.json", f"人物 {cid} 缺少状态 character.{cid}.{suffix}")
        ability = character.get("ability")
        if ability:
            walk_effects(ability.get("effects"), "characters/core.json", state_ids, force_ids, f"人物 {cid} 能力.")
        succession = character.get("succession")
        if succession:
            entry = succession.get("entryCard")
            if entry and entry not in card_ids:
                fail("characters/core.json", f"人物 {cid} 的继任卡不存在：{entry}")
            if entry:
                succession_cards.add(entry)
            walk_conditions(succession.get("requires"), "characters/core.json", state_ids, force_ids, f"人物 {cid} 继任.")
            walk_conditions(succession.get("excludes"), "characters/core.json", state_ids, force_ids, f"人物 {cid} 继任.")
            for i, modifier in enumerate(succession.get("weightModifiers", [])):
                walk_conditions(modifier.get("when"), "characters/core.json", state_ids, force_ids,
                                f"人物 {cid} 继任权重[{i}].")
        opening = character.get("openingCard")
        if opening and opening not in card_ids:
            fail("characters/core.json", f"人物 {cid} 的开局卡不存在：{opening}")

    for card in cards:
        if card.get("type") == "succession":
            for side in ("left", "right"):
                effects = ((card.get("options") or {}).get(side) or {}).get("effects") or {}
                if "ruler" not in effects:
                    fail(CARD_FILES[-1], f"继任卡 {card.get('id')} 的 {side} 选项缺少 ruler 字段")
                elif effects["ruler"] not in char_ids:
                    fail(CARD_FILES[-1], f"继任卡 {card.get('id')} 的 {side} 选项指向未知人物 {effects['ruler']}")

    print("=" * 60)
    print(f"状态定义：{len(states)}  势力：{len(forces)}  系列：{len(series)}  人物：{len(characters)}  卡牌：{len(cards)}")
    print(f"JSON Schema 深度校验：{'已启用' if HAS_JSONSCHEMA else '跳过（pip install jsonschema 后启用）'}")
    if HAS_JSONSCHEMA:
        schema_dir = CONTENT.parent.parent / "schemas"
        try:
            card_schema = json.loads((schema_dir / "card.schema.json").read_text(encoding="utf-8"))
            state_schema = json.loads((schema_dir / "state.schema.json").read_text(encoding="utf-8"))
            v_card = jsonschema.Draft7Validator(card_schema)
            v_state = jsonschema.Draft7Validator(state_schema)
            for st in states:
                for err in sorted(v_state.iter_errors(st), key=lambda e: e.path):
                    errors.append(f"states: 状态 {st.get('id')} schema：{err.message}")
            for c in cards:
                for err in sorted(v_card.iter_errors(c), key=lambda e: e.path):
                    errors.append(f"cards: 卡牌 {c.get('id')} schema：{err.message}")
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"schema 校验器异常，已跳过：{exc}")
    print("=" * 60)
    for warning in warnings:
        print(f"[警告] {warning}")
    for error in errors:
        print(f"[错误] {error}")
    if not errors:
        print("校验通过：未发现错误。")
        return 0
    print(f"校验失败：共 {len(errors)} 个错误。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
