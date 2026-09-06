# 构建发布产物：复制 game/ 到 dist/ 并注入缓存版本号。
# 用法：python tools/build.py --out dist [--version <id>]
# 版本号默认取 git 短哈希（无 git 时用时间戳）。
import argparse
import datetime
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "game")
TEXT_EXT = {".html", ".js", ".mjs", ".css", ".json"}
SKIP_DIRS = {"tests", "node_modules", "__pycache__"}
SKIP_FILES = {"serve.py", "package.json"}


def git_short_sha():
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return datetime.datetime.now().strftime("%Y%m%d%H%M%S")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="dist")
    parser.add_argument("--version", default=None)
    args = parser.parse_args()

    version = args.version or git_short_sha()
    out_dir = os.path.join(ROOT, args.out)
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)

    replaced = 0
    for root, dirs, files in os.walk(SRC):
        rel = os.path.relpath(root, SRC)
        parts = [] if rel == "." else rel.split(os.sep)
        if any(p in SKIP_DIRS for p in parts):
            continue
        dst_root = os.path.join(out_dir, rel) if rel != "." else out_dir
        os.makedirs(dst_root, exist_ok=True)
        for name in files:
            if name in SKIP_FILES:
                continue
            src_file = os.path.join(root, name)
            dst_file = os.path.join(dst_root, name)
            ext = os.path.splitext(name)[1].lower()
            if ext in TEXT_EXT:
                with open(src_file, encoding="utf-8") as f:
                    text = f.read()
                replaced += text.count("?v=1")
                text = text.replace("?v=1", f"?v={version}")
                with open(dst_file, "w", encoding="utf-8", newline="\n") as f:
                    f.write(text)
            else:
                shutil.copy2(src_file, dst_file)

    print(f"构建完成：{out_dir}  版本 ?v={version}  替换 {replaced} 处")


if __name__ == "__main__":
    sys.exit(main())
