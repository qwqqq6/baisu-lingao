# -*- coding: utf-8 -*-
"""输出卡牌 followup 链关系图（Mermaid flowchart），便于审阅剧情链。

用法：python tools/graph_chains.py [--out docs/事件链.md]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "game" / "content" / "official" / "cards"
FILES = ["core.json", "external.json", "farm.json", "civil.json",
         "security.json", "planning.json", "trade.json", "characters.json"]


def main():
    cards = {}
    titles = {}
    for name in FILES:
        with open(CARDS / name, encoding="utf-8") as f:
            for c in json.load(f):
                cards[c["id"]] = c
                titles[c["id"]] = c["title"]

    lines = ["flowchart LR"]
    seen_edges = set()
    for cid, c in sorted(cards.items()):
        for side in ("left", "right"):
            opt = (c.get("options") or {}).get(side) or {}
            for fu in opt.get("followups", []):
                key = (cid, fu)
                if key in seen_edges:
                    continue
                seen_edges.add(key)
                lines.append(f"    {cid}[\"{cid} {titles.get(cid, '')}\"] --> {fu}")
    for cid in sorted(titles):
        if not any(a == cid for a, _ in seen_edges) and not any(b == cid for _, b in seen_edges):
            lines.append(f"    {cid}[\"{cid} {titles.get(cid, '')}\"]")

    out = "\n".join(["```mermaid"] + lines + ["```"])
    if "--out" in sys.argv:
        target = sys.argv[sys.argv.index("--out") + 1]
        (ROOT / target).write_text("# 事件链关系图\n\n" + out + "\n", encoding="utf-8")
        print(f"已写入 {target}")
    else:
        print(out)


if __name__ == "__main__":
    main()
