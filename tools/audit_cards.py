#!/usr/bin/env python3
"""全量卡牌审计：排查「叙事预设无前置」与「选项效果与文案不符」两类问题。

用法：python tools/audit_cards.py [节名]
  A  引用可达性：requires 里出现、但没有任何卡能置真的状态（死内容）
  B  叙事预设：卡面提到某实体（俘虏/玻璃/芳草地……），但既不前置也不引入
  C  followup 前置链：后果卡 requires 不是父卡效果、默认值或引擎能满足的
  D  逐卡清单：id/标题/前置/两侧批复与状态效果（供人工逐张复查，按文件分组）

原理：状态的中文名与效果 op 参照 engine/state.js（set/add/subtract/addToSet/
removeFromSet/startTimer）；条件参照 engine/conditions.js（any/all/state/used/day/force）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "game" / "content" / "official"

CARD_FILES = [
    "cards/core.json", "cards/external.json", "cards/farm.json", "cards/civil.json",
    "cards/security.json", "cards/planning.json", "cards/trade.json",
    "cards/figures.json", "cards/characters.json",
]

# 引擎/流程自行维护、不在卡牌审计范围内置真的状态（前缀或全名）
ENGINE_MANAGED = (
    "core.pillar.", "core.wind", "ruler.", "stage.current", "fall.last_reason",
    "history.", "character.", "martial_law.timer",
)

# 叙事实体关键词：状态 id -> 出现这些词的卡必须有前置或自己引入
KEYWORD_MAP = {
    "civil.captives_arrived": ["俘虏", "战俘"],
    "farm.established": ["南海农庄", "农庄"],
    "school.established": ["芳草地", "国民学校", "学堂"],
    "school.girls_class": ["女童"],
    "industry.glass": ["玻璃"],
    "industry.gunpowder": ["无烟火药"],
    "industry.canfood": ["罐头"],
    "shipyard.keel": ["龙骨", "船台"],
    "pirate.liuxiang_contact": ["刘香"],
    "zheng.flag": ["郑氏令旗", "郑芝龙"],
    "macao.trade": ["澳门", "佛郎机"],
    "dutch.heard": ["红毛", "大员"],
    "polbur.established": ["政治保卫局", "政保局"],
    "times.established": ["临高时报"],
    "ziminglou.open": ["紫明楼"],
    "health.vaccinated": ["牛痘", "种痘"],
    "health.beriberi": ["脚气病"],
    "trade.dongmen_established": ["东门市"],
    "planning.committee_established": ["计划委员会"],
    "security.guard_authorized": ["保卫组"],
    "typhoon.prepared": ["台风"],
    "official.beaten": ["官军已被击退", "击退官军"],
}


def load_all():
    states = json.loads((CONTENT / "states/core.json").read_text(encoding="utf-8"))
    forces = json.loads((CONTENT / "forces/core.json").read_text(encoding="utf-8"))
    series = json.loads((CONTENT / "series/core.json").read_text(encoding="utf-8"))
    characters = json.loads((CONTENT / "characters/core.json").read_text(encoding="utf-8"))
    cards = []
    for rel in CARD_FILES:
        cards.append((rel, json.loads((CONTENT / rel).read_text(encoding="utf-8"))))
    return states, forces, series, characters, cards


def iter_options(card):
    """产出 (side, option, 来源标记)；含变体整侧替换后的选项。"""
    opts = card.get("options") or {}
    for side in ("left", "right"):
        if opts.get(side):
            yield side, opts[side], ""
    for v in card.get("variants") or []:
        if v.get("replaceOption") and v.get("option"):
            yield v["replaceOption"], v["option"], f"[变体{v.get('id','?')}替换]"


def iter_conditions(node, out):
    """拉平 any/all 嵌套，产出叶子条件。"""
    if not isinstance(node, list):
        node = [node]
    for cond in node:
        if not isinstance(cond, dict):
            continue
        if "any" in cond or "all" in cond:
            iter_conditions(cond.get("any") or cond.get("all"), out)
        else:
            out.append(cond)


def option_sets(option):
    """该选项能置真的状态 id 集合（boolean set true / enum 赋非空值 / level、counter add）。"""
    result = set()
    for change in (option.get("effects") or {}).get("states") or []:
        sid, op = change.get("id"), change.get("op", "set")
        if sid is None:
            continue
        if op == "set":
            result.add(sid)  # 置真或翻转，具体方向人工看
        elif op in ("add", "subtract"):
            result.add(sid)
        elif op == "addToSet":
            result.add(sid)
        elif op == "startTimer":
            result.add(sid)
    return result


def engine_managed(sid: str) -> bool:
    return any(sid == p or sid.startswith(p) for p in ENGINE_MANAGED)


def cond_str(cond) -> str:
    if not isinstance(cond, dict):
        return str(cond)
    keys = [k for k in ("state", "used", "day", "force", "ruler", "stage") if k in cond]
    if not keys:
        return json.dumps(cond, ensure_ascii=False)
    k = keys[0]
    rest = {kk: vv for kk, vv in cond.items() if kk != k}
    return f"{k}:{cond[k]} {json.dumps(rest, ensure_ascii=False)}"


def requires_str(card) -> str:
    conds = []
    iter_conditions(card.get("requires"), conds)
    return " & ".join(cond_str(c) for c in conds) or "∅"


# ---------------------------------------------------------------- A 引用可达性
def audit_a(states, forces, series, characters, cards_by_file):
    defs = {s["id"]: s for s in states}
    setters: dict[str, set[str]] = {}

    def add_setter(sid, who):
        setters.setdefault(sid, set()).add(who)

    for rel, cards in cards_by_file:
        for card in cards:
            for side, opt, tag in iter_options(card):
                for sid in option_sets(opt):
                    add_setter(sid, f"{card['id']}{tag}")
    for ch in characters:
        for change in ((ch.get("ability") or {}).get("effects") or {}).get("states") or []:
            add_setter(change.get("id"), f"{ch['id']}.能力")
        for change in (ch.get("initialBonus") or {}).get("states") or []:
            add_setter(change.get("id"), f"{ch['id']}.开局")

    referenced: dict[str, set[str]] = {}

    def add_ref(sid, who):
        referenced.setdefault(sid, set()).add(who)

    for rel, cards in cards_by_file:
        for card in cards:
            conds = []
            iter_conditions(card.get("requires"), conds)
            iter_conditions(card.get("excludes"), conds)
            for v in card.get("variants") or []:
                when = v.get("when") or {}
                iter_conditions(when.get("conditions"), conds)
            for c in conds:
                if "state" in c:
                    add_ref(c["state"], card["id"])
    for s in series:
        conds = []
        iter_conditions(s.get("requires"), conds)
        iter_conditions(s.get("excludes"), conds)
        for c in conds:
            if "state" in c:
                add_ref(c["state"], f"系列{s['id']}")
    for f in forces:
        conds = []
        iter_conditions(f.get("requires"), conds)
        for c in conds:
            if "state" in c:
                add_ref(c["state"], f"势力{f['id']}")

    print("=" * 30, "A 引用可达性（被 requires 引用但无人置真）", "=" * 30)
    hits = 0
    for sid in sorted(referenced):
        if engine_managed(sid):
            continue
        if sid in setters:
            continue
        d = defs.get(sid)
        default = d.get("default") if d else "?"
        # 默认值本身满足 equals:false / lte 之类的不算死，列出供人工判断
        print(f"[审] {sid}（{d.get('name') if d else '未定义!'}，默认 {default}）"
              f" ← 被 {', '.join(sorted(referenced[sid]))} 引用，无任何卡置真")
        hits += 1
    if not hits:
        print("（无）")


# ---------------------------------------------------------------- B 叙事预设
def audit_b(states, forces, series, characters, cards_by_file):
    defs = {s["id"]: s for s in states}
    # 势力门槛暗含解锁状态：requires force:F 等价于同时 gate 了 F 的解锁状态
    force_unlock = {}
    for f in forces:
        conds = []
        iter_conditions(f.get("requires"), conds)
        force_unlock[f["id"]] = {c.get("state") for c in conds if "state" in c}
    print("=" * 30, "B 叙事预设（提到实体但无前置、也不是引入卡）", "=" * 30)
    hits = 0
    for rel, cards in cards_by_file:
        for card in cards:
            text = card.get("title", "") + " " + card.get("text", "") + " " + \
                " ".join(ln.get("line", "") for ln in card.get("lines") or [])
            req_conds = []
            iter_conditions(card.get("requires"), req_conds)
            gated = {c.get("state") for c in req_conds if "state" in c}
            for c in req_conds:
                if "force" in c:
                    gated |= force_unlock.get(c["force"], set())
            for side, opt, tag in iter_options(card):
                gated |= option_sets(opt)
            for sid, words in KEYWORD_MAP.items():
                d = defs.get(sid)
                if d and d.get("type") == "boolean" and d.get("default") is False:
                    for w in words:
                        if w in text and sid not in gated:
                            print(f"[审] {card['id']}《{card['title']}》提到「{w}」"
                                  f"但未前置 {sid}、也不引入（req: {requires_str(card)[:70]}）")
                            hits += 1
                            break
    if not hits:
        print("（无）")


# ---------------------------------------------------------------- C followup 前置
def audit_c(states, forces, series, characters, cards_by_file):
    defs = {s["id"]: s for s in states}
    index = {}
    for rel, cards in cards_by_file:
        for card in cards:
            index[card["id"]] = card
    print("=" * 30, "C followup 前置（后果卡 requires 非父效果/父卡前置/默认/引擎可满足）", "=" * 30)
    hits = 0
    for rel, cards in cards_by_file:
        for card in cards:
            parent_conds = []
            iter_conditions(card.get("requires"), parent_conds)
            parent_state_true = {c["state"] for c in parent_conds
                                 if c.get("state") and c.get("equals") is True}
            parent_used = {c["used"] for c in parent_conds if "used" in c}
            for side, opt, tag in iter_options(card):
                for fu in opt.get("followups") or []:
                    target = index.get(fu)
                    if not target:
                        continue
                    conds = []
                    iter_conditions(target.get("requires"), conds)
                    parent_sets = option_sets(opt)
                    for c in conds:
                        if "used" in c:
                            if c["used"] in (card["id"],) | parent_used:
                                continue  # 父卡或父卡前置刚用过，成立
                            print(f"[审] {card['id']}→{fu} 要求 used:{c['used']}"
                                  f"（非父卡，需链上游保证）")
                            hits += 1
                            continue
                        if "state" not in c:
                            continue
                        sid = c["state"]
                        if engine_managed(sid) or sid in parent_sets or sid in parent_state_true:
                            continue
                        d = defs.get(sid) or {}
                        satisfied = False
                        if c.get("equals") is False and d.get("default") is False:
                            satisfied = True
                        if c.get("equals") is True and d.get("default") is True:
                            satisfied = True
                        if str(c.get("equals")) == str(d.get("default")):
                            satisfied = True
                        if not satisfied:
                            print(f"[审] {card['id']}→{fu} 要求 {cond_str(c)}"
                                  f"（默认 {d.get('default')} 不满足，父选项与父卡前置均未保证）")
                            hits += 1
    if not hits:
        print("（无）")


# ---------------------------------------------------------------- D 逐卡清单
def effects_str(opt) -> str:
    eff = opt.get("effects") or {}
    parts = []
    stats = eff.get("stats") or {}
    if stats:
        parts.append("柱" + ",".join(f"{k}{v:+d}" for k, v in stats.items()))
    if "wind" in eff:
        parts.append(f"风声{eff['wind']:+d}")
    for change in eff.get("states") or []:
        v = change.get("value")
        parts.append(f"{change['id']}{'+' if change.get('op') == 'add' else '='}{v}"
                     if isinstance(v, (int, float)) or isinstance(v, bool)
                     else f"{change['id']}:{change.get('op')}:{v}")
    forces = eff.get("forces") or {}
    for fid, m in forces.items():
        parts.append(f"势{fid}:" + ",".join(f"{k}{x:+d}" if isinstance(x, int) else f"{k}={x}"
                                            for k, x in m.items()))
    for k in ("stepDown", "ending"):
        if k in eff:
            parts.append(str(eff[k]))
    if "personal" in eff:
        parts.append("个人:" + json.dumps(eff["personal"], ensure_ascii=False))
    return " ".join(parts) or "∅"


def audit_d(states, forces, series, characters, cards_by_file, only_file=None):
    print("=" * 30, "D 逐卡清单（人工复查用）", "=" * 30)
    for rel, cards in cards_by_file:
        if only_file and only_file not in rel:
            continue
        print(f"\n----- {rel}（{len(cards)} 张）-----")
        for card in cards:
            print(f"{card['id']}《{card['title']}》 [{card.get('type')}] req: {requires_str(card)}")
            for side, opt, tag in iter_options(card):
                label = opt.get("label", "?")
                fus = opt.get("followups") or []
                print(f"  {tag}{'左' if side == 'left' else '右'}「{label}」→ {effects_str(opt)}"
                      + (f" ⇒{'>'.join(fus)}" if fus else ""))


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else "ABCD"
    states, forces, series, characters, cards_by_file = load_all()
    if "A" in only:
        audit_a(states, forces, series, characters, cards_by_file)
    if "B" in only:
        audit_b(states, forces, series, characters, cards_by_file)
    if "C" in only:
        audit_c(states, forces, series, characters, cards_by_file)
    if "D" in only:
        audit_d(states, forces, series, characters, cards_by_file,
                only_file=only[1:] if only.startswith("D") and len(only) > 1 else None)


if __name__ == "__main__":
    main()
