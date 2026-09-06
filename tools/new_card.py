# -*- coding: utf-8 -*-
"""交互式生成一张新卡牌骨架，追加到指定主题池文件。

用法：python tools/new_card.py
按提示逐项输入，生成后自动运行校验。
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "game" / "content" / "official" / "cards"

POOLS = {
    "1": ("core", "core.json", "CORE"),
    "2": ("external", "external.json", "EXT"),
    "3": ("farm", "farm.json", "FARM"),
    "4": ("civil", "civil.json", "CIV"),
    "5": ("security", "security.json", "SEC"),
    "6": ("planning", "planning.json", "PLAN"),
    "7": ("trade", "trade.json", "TRADE"),
}


def ask(prompt, default=""):
    v = input(f"{prompt}" + (f"（回车={default}）" if default else "") + "：").strip()
    return v or default


def main():
    print("选择主题池：")
    for k, (pool, _, _) in POOLS.items():
        print(f"  {k}. {pool}")
    key = ask("主题池", "1")
    pool, file, prefix = POOLS[key]

    path = CARDS / file
    with open(path, encoding="utf-8") as f:
        cards = json.load(f)
    series = pool if pool != "core" else "politics.council"

    cid = ask(f"卡牌 id（如 {prefix}-020）")
    title = ask("标题")
    text = ask("呈文正文（两三行）")
    weight = int(ask("权重", "20") or 20)
    requires = ask("requires（JSON 数组，回车=空）", "[]")

    def make_option(side):
        oid = ask(f"{side}选项 id（英文短横线）")
        label = ask(f"{side}选项批复台词")
        hint = ask(f"{side}提示（可空）")
        stats = ask(f"{side}四柱效果（如 people:2,council:-1，回车=无）")
        effects = {}
        if stats:
            effects["stats"] = {k.strip(): int(v) for k, v in (kv.split(":") for kv in stats.split(","))}
        days = ask(f"{side}消耗天数（回车=1）")
        if days and days != "1":
            effects["days"] = int(days)
        return {"id": oid, "label": label, **({"hint": hint} if hint else {}), "effects": effects}

    card = {
        "id": cid,
        "pool": pool,
        "series": series,
        "type": ask("类型（key/daily/crisis/price/benefit/backlash/omen/cleanup）", "daily"),
        "title": title,
        "source": {"kind": "character", "id": "any", "name": ask("来源（人物/机构名）", "值班秘书")},
        "tags": ask("标签（逗号分隔）", "会议").split(","),
        "requires": json.loads(requires),
        "excludes": [],
        "weight": weight,
        "text": text,
        "options": {"left": make_option("左"), "right": make_option("右")},
    }

    cards.append(card)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"已追加 {cid} 到 {path}，请运行 python tools/validate_content.py 检查。")


if __name__ == "__main__":
    sys.exit(main())
