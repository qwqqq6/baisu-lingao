# -*- coding: utf-8 -*-
"""
百日临高卡池平衡工具

两个功能：
  1. lint     —— 静态校验，找出违反"零和/交易"约束的卡（整体通胀的根源）。
  2. simulate —— 蒙特卡洛模拟，跑随机玩家和贪婪玩家，看 100 天末四柱分布。

用法：
  python tools/balance_check.py            # 默认两个都跑
  python tools/balance_check.py lint
  python tools/balance_check.py simulate 20000

数据来源：web/src/data.js（不修改它，只解析）。
"""

import os
import re
import sys
import random
import statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 数据已按机制拆分到 web/src/data/ 目录；卡牌定义分布在 cards.js 与 crisisCards.js。
DATA_DIR = os.path.join(ROOT, "web", "src", "data")
DATA_FILES = [
    os.path.join(DATA_DIR, "cards.js"),
    os.path.join(DATA_DIR, "crisisCards.js"),
]

PILLARS = ["council", "people", "military", "livelihood"]
PILLAR_CN = {"council": "元老院", "people": "民望", "military": "军务", "livelihood": "生计", "wind": "风声"}

# ------- 平衡标准（可按需调整） -------
WIND_WEIGHT = 0.6      # 风声上升折算成"成本"的权重
COST_WEIGHT = 1.0      # 每消耗 1 天折算成的"成本"
INFLATION_TOL = 2.0    # 单选项：四柱净收益 - 预算 允许的上限
HEDGE_MIN = 3          # 两侧都 > 此值且同号 => 判为"无对冲"


# ============ 解析 data.js ============
def load_cards():
    src = ""
    for path in DATA_FILES:
        with open(path, encoding="utf-8") as f:
            src += f.read() + "\n"

    # 定位每张卡：c("id", "stage", "type", ...)
    card_hdr = re.compile(r'c\(\s*"([\w-]+)"\s*,\s*"(\w+)"\s*,\s*"([^"]+)"')
    # 每个选项：e("label", { effects(扁平) }, cost
    opt_re = re.compile(r'e\(\s*"([^"]*)"\s*,\s*(\{[^{}]*\})\s*,\s*(-?\d+)')

    headers = [(m.start(), m.group(1), m.group(2), m.group(3)) for m in card_hdr.finditer(src)]

    cards = []
    for i, (pos, cid, stage, ctype) in enumerate(headers):
        end = headers[i + 1][0] if i + 1 < len(headers) else len(src)
        region = src[pos:end]
        opts = []
        for om in opt_re.finditer(region):
            opts.append({
                "label": om.group(1),
                "effects": parse_effects(om.group(2)),
                "cost": int(om.group(3)),
            })
        # 是否 triggerOnly（系列/插入，不进随机池）
        trigger_only = "triggerOnly: true" in region
        # 按选项标签把 region 切成两段，避免 followups/stageEffects 串到相邻选项。
        label_pos = [region.find('"' + opt["label"] + '"') for opt in opts]
        for idx, opt in enumerate(opts):
            start = label_pos[idx] if label_pos[idx] >= 0 else 0
            nxt = label_pos[idx + 1] if idx + 1 < len(label_pos) and label_pos[idx + 1] >= 0 else len(region)
            sub = region[start:nxt]
            fm = re.search(r'followups:\s*\[([^\]]*)\]', sub)
            opt["followups"] = re.findall(r'"([\w-]+)"', fm.group(1)) if fm else []
            # 机制9（阶段卡池演化）：解析选项的阶段变体，供模拟器忠实结算。
            opt["stageEffects"] = parse_stage_effects(sub)
        if len(opts) >= 2:
            cards.append({
                "id": cid, "stage": stage, "type": ctype,
                "left": opts[0], "right": opts[1],
                "triggerOnly": trigger_only,
                "is_crisis": ctype in ("危机", "风声"),
            })
    return cards


def parse_effects(block):
    eff = {"council": 0, "people": 0, "military": 0, "livelihood": 0, "wind": 0}
    for k, v in re.findall(r'(\w+)\s*:\s*(-?\d+)', block):
        if k in eff:
            eff[k] = int(v)
    return eff


def parse_stage_effects(sub):
    """机制9：从选项文本中解析 stageEffects: { landing:{...}, stable:{...} }。
    返回 {stageId: effects} 映射；无则空 dict。"""
    m = re.search(r'stageEffects:\s*\{(.*)\}\s*,?\s*\}?\s*\)?', sub, re.S)
    if not m:
        return {}
    body = m.group(1)
    variants = {}
    for vm in re.finditer(r'(landing|foothold|build|stable)\s*:\s*(\{[^{}]*\})', body):
        variants[vm.group(1)] = parse_effects(vm.group(2))
    return variants


def pillar_sum(eff):
    return sum(eff[p] for p in PILLARS)


def budget(opt):
    """一个选项允许的四柱净收益预算 = 风声成本 + 天数成本。"""
    return max(0, opt["effects"]["wind"]) * WIND_WEIGHT + opt["cost"] * COST_WEIGHT


# ============ 功能一：静态 lint ============
def run_lint(cards):
    print("=" * 60)
    print("静态校验 (lint)  —— 规则：四柱净收益必须由风声/天数支付")
    print("=" * 60)

    graded = [c for c in cards if not c["is_crisis"]]
    total_avg = 0.0
    inflation_hits = []
    hedge_hits = []

    for c in graded:
        for side in ("left", "right"):
            opt = c[side]
            net = pillar_sum(opt["effects"])
            over = net - budget(opt)
            if over > INFLATION_TOL:
                inflation_hits.append((c["id"], side, net, round(budget(opt), 1), round(over, 1)))

        ls, rs = pillar_sum(c["left"]["effects"]), pillar_sum(c["right"]["effects"])
        total_avg += (ls + rs) / 2.0
        # 无对冲：两侧四柱净值同号且都明显为正/负
        if ls > HEDGE_MIN and rs > HEDGE_MIN:
            hedge_hits.append((c["id"], ls, rs, "双正"))
        elif ls < -HEDGE_MIN and rs < -HEDGE_MIN:
            hedge_hits.append((c["id"], ls, rs, "双负"))

    print(f"\n非危机卡总数: {len(graded)}")
    print(f"全池 Σ(每卡两侧四柱净值均值) = {total_avg:+.1f}   (目标: |值| < 40，越接近 0 越守恒)")

    # 分维漂移：每张卡两侧均值在每个维度上的累加，反映随机玩法下各柱的整体走向。
    pillar_drift = {p: 0.0 for p in PILLARS + ["wind"]}
    for c in graded:
        for p in PILLARS + ["wind"]:
            pillar_drift[p] += (c["left"]["effects"][p] + c["right"]["effects"][p]) / 2.0
    print("\n[分维漂移] 全池每维两侧均值累加 (目标: 四柱各自趋近 0):")
    for p in PILLARS + ["wind"]:
        print(f"  {PILLAR_CN[p]:<6}{pillar_drift[p]:+.1f}")

    print(f"\n[通胀卡] 收益远超预算的选项，共 {len(inflation_hits)} 个 (阈值 +{INFLATION_TOL}):")
    print(f"  {'卡ID':<16}{'侧':<6}{'四柱净':>7}{'预算':>7}{'超额':>7}")
    for cid, side, net, bud, over in sorted(inflation_hits, key=lambda x: -x[4]):
        print(f"  {cid:<16}{side:<6}{net:>7}{bud:>7}{over:>7}")

    print(f"\n[无对冲卡] 两侧四柱同向，缺乏两难，共 {len(hedge_hits)} 张:")
    print(f"  {'卡ID':<16}{'左净':>6}{'右净':>6}  类型")
    for cid, ls, rs, kind in hedge_hits:
        print(f"  {cid:<16}{ls:>6}{rs:>6}  {kind}")

    return inflation_hits, hedge_hits, total_avg


# ============ 功能二：蒙特卡洛模拟 ============
STAGES = [
    ("landing", 1, 15), ("foothold", 16, 40),
    ("build", 41, 70), ("stable", 71, 100),
]

# 与 engine/crisis.js 一致：指标进入危险区时，触发的是"针对该柱的纠偏危机卡"，
# 而非随机危机。低位触发 *-LOW（回补该柱），高位触发 *-HIGH（回落该柱）。
DANGER_MAP = [
    ("livelihood", "low", "CR-LIV-LOW"), ("livelihood", "high", "CR-LIV-HIGH"),
    ("military", "low", "CR-MIL-LOW"), ("military", "high", "CR-MIL-HIGH"),
    ("people", "low", "CR-PEO-LOW"), ("people", "high", "CR-PEO-HIGH"),
    ("council", "low", "CR-COU-LOW"), ("council", "high", "CR-COU-HIGH"),
]
WIND_THRESHOLDS = [40, 60, 80, 92]

# 机制2（角色回归）：对齐 data/characters.js —— 某维被持续偏袒(favor 累加>=阈值)则注入反噬卡。
CHARACTERS = [
    ("livelihood", 22, "BL-LIV"),
    ("people", 22, "BL-PEO"),
    ("military", 22, "BL-MIL"),
    ("council", 22, "BL-COU"),
]

# 机制5（任务/隐藏目标）：对齐 data/quests.js —— 进入新阶段时结算已结束阶段的隐藏 KPI。
STAGE_ORDER = ["landing", "foothold", "build", "stable"]
QUESTS = [
    ("landing", "livelihood", 40, "QT-LAND-OK", "QT-LAND-BAD"),
    ("foothold", "people", 40, "QT-FOOT-OK", "QT-FOOT-BAD"),
    ("build", "council", 40, "QT-BUILD-OK", "QT-BUILD-BAD"),
]


def stage_of(day):
    for sid, s, e in STAGES:
        if s <= day <= e:
            return sid
    return "stable"


def clamp(v):
    return max(0, min(100, round(v)))


def resolve_effects(opt, stage_id):
    """机制9：对齐 state.js resolveEffects —— 命中阶段变体则覆盖基础 effects。"""
    variants = opt.get("stageEffects") or {}
    return variants.get(stage_id, opt["effects"])


def apply_side(stats, opt, stage_id):
    eff = resolve_effects(opt, stage_id)
    for p in PILLARS:
        stats[p] = clamp(stats[p] + eff[p])
    stats["wind"] = clamp(stats["wind"] + eff["wind"])


def is_dead(stats):
    for p in PILLARS:
        if stats[p] <= 0 or stats[p] >= 100:
            return True
    return stats["wind"] >= 100


def simulate_once(cards, strategy):
    """简化版游戏循环，贴近 engine.js 的抽卡与结算。"""
    stats = {"council": 50, "people": 50, "military": 50, "livelihood": 50, "wind": 15}
    day = 1
    used = set()
    pending = []
    by_id = {c["id"]: c for c in cards}
    recent_crisis = []
    wind_events = []
    last_crisis_day = -1
    favor = {stat: 0 for stat, _, _ in CHARACTERS}
    backlash_done = set()
    quests_done = set()
    shown_stages = set()

    def settle_quests(new_stage):
        """对齐 systems/quests.js：进入新阶段时结算阶段顺序早于当前阶段的未结算任务。"""
        new_index = STAGE_ORDER.index(new_stage) if new_stage in STAGE_ORDER else len(STAGE_ORDER)
        for qstage, qstat, qmin, ok_card, bad_card in QUESTS:
            if qstage in quests_done:
                continue
            q_index = STAGE_ORDER.index(qstage) if qstage in STAGE_ORDER else -1
            if q_index < 0 or q_index >= new_index:
                continue
            quests_done.add(qstage)
            pending.append(ok_card if stats[qstat] >= qmin else bad_card)

    def pool(stage):
        return [c for c in cards
                if not c["triggerOnly"] and not c["is_crisis"] and c["type"] != "插入"
                and (c["stage"] == stage or c["stage"] == "all")
                and not (c["id"] in used)]

    def danger_crisis():
        """对齐 crisis.js：针对越界的柱触发纠偏危机卡，带近期去重。"""
        nonlocal last_crisis_day
        if last_crisis_day == day:
            return None
        raw = [cid for (stat, direction, cid) in DANGER_MAP
               if (stats[stat] <= 18 if direction == "low" else stats[stat] >= 82)]
        if not raw:
            return None
        fresh = [cid for cid in raw if cid not in recent_crisis]
        pick = random.choice(fresh if fresh else raw)
        last_crisis_day = day
        recent_crisis.insert(0, pick)
        del recent_crisis[3:]
        return by_id.get(pick)

    def wind_crisis():
        """对齐 crisis.js：风声达阈值触发 CR-WIND，每档一次。"""
        for t in WIND_THRESHOLDS:
            if stats["wind"] >= t and t not in wind_events:
                wind_events.append(t)
                return by_id.get("CR-WIND")
        return None

    guard = 0
    while day <= 100 and guard < 400:
        guard += 1
        if is_dead(stats):
            return stats, day, "fail"

        # 机制5（任务/隐藏目标）：对齐 engine.js —— 进入新阶段(首次)时先结算已结束阶段的 KPI。
        cur_stage = stage_of(day)
        if cur_stage not in shown_stages:
            shown_stages.add(cur_stage)
            settle_quests(cur_stage)

        # 抽卡顺序对齐 engine.js：pending → 危机(纠偏) → 风声 → 普通池
        card = None
        if pending:
            card = by_id.get(pending.pop(0))
        if card is None:
            card = danger_crisis() or wind_crisis()
        if card is None:
            p = pool(stage_of(day))
            if not p:
                p = [c for c in cards if not c["triggerOnly"] and not c["is_crisis"] and c["type"] != "插入"]
            card = random.choice(p)

        # 选边
        if strategy == "greedy":
            side = "left" if pillar_sum(card["left"]["effects"]) >= pillar_sum(card["right"]["effects"]) else "right"
        else:  # random
            side = random.choice(["left", "right"])
        opt = card[side]

        eff = resolve_effects(opt, stage_of(day))
        apply_side(stats, opt, stage_of(day))

        # 机制2（角色回归）：对齐 systems/characters.js —— 用结算后的效果累加 favor，
        # 坐大则把反噬卡压入 pending，并把该维 favor 清零。
        for stat, threshold, bl in CHARACTERS:
            favor[stat] += eff[stat]
        for stat, threshold, bl in CHARACTERS:
            if favor[stat] >= threshold and bl not in backlash_done:
                backlash_done.add(bl)
                pending.append(bl)
                favor[stat] = 0

        # 对齐 engine.js：once !== false 才计入 used（危机卡 once=false，不去重）。
        if not card["is_crisis"]:
            used.add(card["id"])
        pending.extend(opt.get("followups", []))
        day += opt["cost"]  # 对齐 engine.js：state.day += cost（0 成本不推进天数）

    return stats, min(day, 100), "survive"


def run_simulate(cards, n=10000):
    print("=" * 60)
    print(f"蒙特卡洛模拟  —— 每策略 {n} 局")
    print("=" * 60)
    for strategy in ("random", "greedy"):
        finals = {p: [] for p in PILLARS + ["wind"]}
        fails = 0
        for _ in range(n):
            stats, day, res = simulate_once(cards, strategy)
            if res == "fail":
                fails += 1
            for p in PILLARS + ["wind"]:
                finals[p].append(stats[p])
        print(f"\n--- {strategy} 玩家 ---")
        print(f"  失败率: {fails / n:.1%}")
        print(f"  {'指标':<8}{'均值':>8}{'中位':>8}{'P10':>7}{'P90':>7}")
        for p in PILLARS + ["wind"]:
            arr = sorted(finals[p])
            mean = statistics.mean(arr)
            med = statistics.median(arr)
            p10 = arr[int(0.1 * len(arr))]
            p90 = arr[int(0.9 * len(arr))]
            print(f"  {PILLAR_CN[p]:<8}{mean:>8.1f}{med:>8.0f}{p10:>7}{p90:>7}")
    print("\n判读：健康卡池里 random 玩家四柱应围绕 40~60，"
          "greedy 玩家也难以把某维长期顶到 85+ 而不拖垮其它维。")


def main():
    args = sys.argv[1:]
    cards = load_cards()
    print(f"解析到 {len(cards)} 张卡（含危机卡）\n")

    mode = args[0] if args else "all"
    if mode in ("lint", "all"):
        run_lint(cards)
        print()
    if mode in ("simulate", "all"):
        n = int(args[1]) if len(args) > 1 else 10000
        run_simulate(cards, n)


if __name__ == "__main__":
    main()
