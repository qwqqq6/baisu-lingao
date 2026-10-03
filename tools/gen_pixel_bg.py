# -*- coding: utf-8 -*-
"""生成像素风背景：7 档局内状态（随四柱切换）+ 2 张结局图。
输出 game/assets/bg/*.png，144x256（9:16），页面 pixelated 放大。"""
import math
import os
import random

from PIL import Image

W, H = 144, 256
OUT = os.path.join("game", "assets", "bg")
os.makedirs(OUT, exist_ok=True)
random.seed(20260903)


def dither(c1, c2, y, band=3):
    """抖动混色：按行噪声在两色间取一。"""
    return c1 if random.random() < ((y % band) / band) else c2


def sky_gradient(img, top, mid, bot, horizon):
    """竖向三段渐变 + 抖动。"""
    px = img.load()
    for y in range(horizon):
        if y < horizon * 0.5:
            t = y / (horizon * 0.5)
            base = tuple(int(top[i] + (mid[i] - top[i]) * t) for i in range(3))
        else:
            t = (y - horizon * 0.5) / (horizon * 0.5)
            base = tuple(int(mid[i] + (bot[i] - mid[i]) * t) for i in range(3))
        for x in range(W):
            jitter = random.choice(((0, 0, 0), (6, 6, 6), (-6, -6, -6)))
            px[x, y] = tuple(max(0, min(255, base[i] + jitter[i])) for i in range(3))


def sea(img, horizon, dark, light, wave_rows=40):
    """海面：横向波光线。"""
    px = img.load()
    for y in range(horizon, H):
        depth = (y - horizon) / max(1, H - horizon)
        base = tuple(int(dark[i] + (light[i] - dark[i]) * depth * 0.5) for i in range(3))
        for x in range(W):
            px[x, y] = base
    for i in range(wave_rows):
        y = horizon + random.randint(1, H - horizon - 2)
        x = random.randint(0, W - 14)
        ln = random.randint(4, 14)
        for dx in range(ln):
            px[x + dx, y] = light if random.random() < 0.7 else dark


def dryland(img, horizon, dark, light):
    """旱地滩涂：渐变土色 + 干裂口（荒年版，枯树立于地上而非海上）。"""
    px = img.load()
    for y in range(horizon, H):
        depth = (y - horizon) / max(1, H - horizon)
        base = tuple(int(dark[i] + (light[i] - dark[i]) * depth * 0.6) for i in range(3))
        for x in range(W):
            px[x, y] = base
    for _ in range(26):
        x = random.randint(2, W - 4)
        y = horizon + random.randint(2, H - horizon - 4)
        ln = random.randint(5, 16)
        for k in range(ln):
            if random.random() < 0.85:
                px[min(W - 1, x + k), y] = dark
            if random.random() < 0.3 and y + 1 < H:
                px[min(W - 1, x + k), y + 1] = dark


def stars(img, horizon, colors, count, min_y=2, max_y_frac=0.6):
    px = img.load()
    for _ in range(count):
        x = random.randint(0, W - 1)
        y = random.randint(min_y, int(horizon * max_y_frac))
        px[x, y] = random.choice(colors)
        if random.random() < 0.25 and y + 1 < horizon:
            px[x, y + 1] = random.choice(colors)


def moon(img, cx, cy, r, color, halo):
    px = img.load()
    for dy in range(-r - 2, r + 3):
        for dx in range(-r - 2, r + 3):
            d = math.hypot(dx, dy)
            x, y = cx + dx, cy + dy
            if not (0 <= x < W and 0 <= y < H):
                continue
            if d <= r:
                px[x, y] = color
            elif d <= r + 2 and random.random() < 0.5:
                px[x, y] = halo


def village(img, horizon, color, lamps, lamp_color, broken=False):
    """明末渔村与穿越营地剪影：茅草屋（人字顶）、椰树、木栅栏、哨塔、零星灯火。
    崇祯年间的临高没有高楼——登陆地博铺是海边一片村寨。"""
    px = img.load()
    rng = random.Random(1628)

    def hut(x, w, h):
        # 夯土墙
        top = horizon - h
        for yy in range(top, horizon):
            for xx in range(x, x + w):
                px[xx, yy] = color
        # 人字草顶，出檐
        roof = max(3, w // 2)
        for r in range(roof + 1):
            half = ((w // 2 + 2) * (roof - r)) // roof
            for xx in range(x - 1, x + w + 1):
                if abs(xx - (x + (w - 1) / 2)) <= half:
                    px[xx, top - r] = color
        if lamps and rng.random() < 0.75:
            lx = x + rng.randint(1, max(1, w - 3))
            px[lx, top + rng.randint(1, max(1, h - 2))] = lamp_color

    def palm(x, h, lean):
        # 弯干 + 顶端叶冠
        cx = float(x)
        for i in range(h):
            xi = int(round(cx))
            if 0 <= xi < W:
                px[xi, horizon - 1 - i] = color
            cx += lean
        tx, ty = int(round(cx)), horizon - h
        for dx in (-3, -2, 2, 3):
            for k in (0, 1):
                if 0 <= tx + dx < W and 0 <= ty + k < H:
                    px[tx + dx, ty + k] = color
        for dx in (-1, 0, 1):
            if 0 <= tx + dx < W:
                px[tx + dx, ty - 1] = color

    def tower(x, h):
        # 木哨塔：四腿脚手架 + 横撑 + 顶棚（营地标志）
        for i in range(h):
            y = horizon - 1 - i
            for xx in (x, x + 1, x + 5, x + 6):
                if 0 <= xx < W:
                    px[xx, y] = color
            if i in (h // 3, 2 * h // 3):
                for xx in range(x, x + 7):
                    if 0 <= xx < W:
                        px[xx, y] = color
        for xx in range(x - 1, x + 8):
            if 0 <= xx < W and horizon - h >= 0:
                px[xx, horizon - h] = color
                if rng.random() < 0.6 and horizon - h - 1 >= 0:
                    px[xx, horizon - h - 1] = color

    palm(8, 14, 0.18)
    x = 16
    plan = [(11, 8), (9, 6), (12, 9), (13, 7), (10, 6), (12, 8), (9, 5)]
    for j, (w, h) in enumerate(plan):
        if x + w > W - 12:
            break
        hh = max(4, h - (2 if broken and rng.random() < 0.4 else 0))
        hut(x, w, hh)
        x += w + rng.randint(2, 5)
        if j == 3:
            tower(x + 1, 13 if broken else 20)
            x += 10
    palm(min(W - 8, x + 3), 12, -0.15)
    # 岸线上的木栅栏
    for xx in range(2, W - 2):
        if rng.random() < 0.3:
            px[xx, horizon] = color
            if rng.random() < 0.35:
                px[xx, horizon - 1] = color


def smoke(img, x_top, horizon, color, columns=3):
    px = img.load()
    for c in range(columns):
        cx = x_top + c * 7
        y = horizon - 2
        drift = 0
        while y > 8:
            w = 1 + (horizon - y) // 14
            for dx in range(-w, w + 1):
                if random.random() < 0.72:
                    xx, yy = int(cx + dx + drift), y
                    if 0 <= xx < W:
                        px[xx, yy] = color
            drift += 0.28 if c % 2 == 0 else -0.24
            y -= 1
        x_top += 0


def fires(img, horizon, color_a, color_b, count=10):
    px = img.load()
    for _ in range(count):
        x = random.randint(6, W - 8)
        y = horizon + random.randint(1, 3)
        px[x, y] = color_a
        px[x + 1, y] = color_b
        if random.random() < 0.6:
            px[x, y - 1] = color_b


def dead_trees(img, horizon, color):
    px = img.load()
    for tx in (20, 46, 78, 108, 128):
        base_y = horizon + random.randint(4, 26)
        h = random.randint(12, 22)
        for i in range(h):
            px[tx, base_y - i] = color
        for _ in range(4):
            dy = random.randint(2, h - 1)
            dx = random.choice((-1, 1)) * random.randint(1, 3)
            for k in range(dx):
                px[tx + (k + 1 if dx > 0 else -k - 1), base_y - dy] = color


def ships(img, horizon, color, count=6, sails=True):
    """中式渔船剪影：两端翘头船体 + 单桅硬帆。"""
    px = img.load()
    for i in range(count):
        x = random.randint(4, W - 16)
        y = horizon + random.randint(2, 18)
        # 船体（翘头）
        for dx in range(10):
            px[x + dx, y] = color
        px[x, y - 1] = color
        px[x - 1, y - 1] = color
        px[x + 9, y - 1] = color
        px[x + 10, y - 1] = color
        # 单桅 + 硬帆面
        for k in range(6):
            px[x + 5, y - 1 - k] = color
        if sails:
            for k in range(1, 5):
                px[x + 4, y - k] = color
                px[x + 6, y - k] = color
                if k < 4:
                    px[x + 3, y - k] = color
                    px[x + 7, y - k] = color


def save(img, name):
    img.save(os.path.join(OUT, name))
    print("saved", name)


# ---------------- 1) calm：平衡之夜 ----------------
img = Image.new("RGB", (W, H))
HOR = 150
sky_gradient(img, (14, 12, 32), (32, 26, 56), (74, 52, 60), HOR)
stars(img, HOR, [(232, 224, 200), (201, 164, 92)], 42)
moon(img, 106, 36, 9, (232, 220, 180), (150, 128, 92))
sea(img, HOR, (12, 18, 30), (44, 52, 66), 46)
# 海面月光反射
px = img.load()
for i in range(60):
    y = HOR + random.randint(1, 70)
    w = max(1, (y - HOR) // 8)
    for dx in range(-w, w + 1):
        if random.random() < 0.6:
            px[min(W - 1, max(0, 106 + dx)), y] = (180, 160, 110)
village(img, HOR, (10, 8, 14), 3, (232, 182, 92))
save(img, "bg-calm.png")

# ---------------- 2) people：民怨之火 ----------------
img = Image.new("RGB", (W, H))
HOR = 150
sky_gradient(img, (30, 12, 12), (66, 24, 18), (110, 44, 26), HOR)
stars(img, HOR, [(240, 160, 90)], 8)
moon(img, 30, 30, 8, (150, 80, 50), (90, 50, 36))
sea(img, HOR, (20, 12, 14), (60, 30, 24), 36)
village(img, HOR, (12, 6, 8), 1, (240, 120, 60), broken=True)
smoke(img, 30, HOR, (70, 56, 52), 4)
smoke(img, 86, HOR, (60, 48, 46), 3)
fires(img, HOR, (240, 120, 50), (200, 60, 30), 14)
save(img, "bg-people.png")

# ---------------- 3) livelihood：荒年 ----------------
img = Image.new("RGB", (W, H))
HOR = 158
sky_gradient(img, (36, 32, 20), (56, 48, 30), (86, 72, 44), HOR)
stars(img, HOR, [(160, 150, 120)], 10)
dryland(img, HOR, (44, 36, 22), (74, 60, 34))
dead_trees(img, HOR, (34, 28, 20))
village(img, HOR, (16, 14, 10), 1, (160, 130, 70), broken=True)
# 地面裂纹
px = img.load()
for _ in range(9):
    x = random.randint(8, W - 10)
    y = HOR + 10
    while y < H - 6 and random.random() < 0.92:
        px[x, y] = (20, 18, 12)
        x += random.choice((-1, 0, 1))
        y += 2
save(img, "bg-livelihood.png")

# ---------------- 4) military：战云烽火 ----------------
img = Image.new("RGB", (W, H))
HOR = 148
sky_gradient(img, (20, 16, 28), (48, 26, 36), (96, 40, 32), HOR)
stars(img, HOR, [(200, 120, 90)], 8)
sea(img, HOR, (14, 14, 24), (48, 34, 38), 34)
village(img, HOR, (12, 8, 14), 2, (255, 140, 60))
# 烽燧冲天
smoke(img, 44, HOR, (140, 70, 40), 2)
smoke(img, 96, HOR, (120, 60, 36), 2)
fires(img, HOR, (255, 150, 60), (220, 70, 30), 10)
ships(img, HOR, (18, 12, 18), 5)
save(img, "bg-military.png")

# ---------------- 5) council：议会阴云 ----------------
img = Image.new("RGB", (W, H))
HOR = 152
sky_gradient(img, (16, 18, 26), (34, 36, 48), (58, 56, 62), HOR)
# 裂缝状冷光把天分成两半
px = img.load()
for y in range(6, HOR - 10):
    x = int(W * 0.52 + math.sin(y * 0.18) * 10)
    for k in (-1, 0, 1):
        if random.random() < 0.8:
            px[min(W - 1, max(0, x + k)), y] = (140, 150, 170)
    if random.random() < 0.3:
        px[x, y + 1] = (90, 96, 112)
sea(img, HOR, (16, 18, 24), (44, 46, 54), 30)
village(img, HOR, (10, 10, 14), 2, (150, 140, 100))
save(img, "bg-council.png")

# ---------------- 6) wind：风声之海 ----------------
img = Image.new("RGB", (W, H))
HOR = 130
sky_gradient(img, (16, 18, 30), (30, 34, 46), (52, 54, 60), HOR)
stars(img, HOR, [(180, 180, 190)], 6)
sea(img, HOR, (12, 16, 26), (40, 48, 60), 60)
ships(img, HOR, (14, 16, 22), 8, sails=True)
village(img, HOR, (10, 10, 16), 1, (200, 160, 90), broken=True)
save(img, "bg-wind.png")

# ---------------- 7) gold：全盛星夜 ----------------
img = Image.new("RGB", (W, H))
HOR = 150
sky_gradient(img, (12, 18, 44), (28, 40, 80), (66, 76, 116), HOR)
stars(img, HOR, [(240, 234, 210), (232, 200, 120), (180, 200, 240)], 110)
moon(img, 40, 34, 10, (240, 226, 180), (170, 150, 110))
sea(img, HOR, (14, 22, 44), (52, 66, 96), 52)
px = img.load()
for i in range(50):
    y = HOR + random.randint(1, 80)
    w = max(1, (y - HOR) // 7)
    for dx in range(-w, w + 1):
        if random.random() < 0.5:
            px[min(W - 1, max(0, 40 + dx)), y] = (200, 180, 120)
village(img, HOR, (10, 12, 22), 5, (255, 210, 120))
save(img, "bg-gold.png")

# ---------------- 8) end-collapse：终局余烬 ----------------
img = Image.new("RGB", (W, H))
HOR = 160
sky_gradient(img, (18, 6, 6), (44, 12, 8), (84, 24, 12), HOR)
stars(img, HOR, [(220, 90, 40)], 10)
sea(img, HOR, (16, 8, 8), (50, 20, 14), 26)
village(img, HOR, (10, 4, 4), 0, (200, 90, 40), broken=True)
smoke(img, 24, HOR, (52, 30, 26), 3)
smoke(img, 90, HOR, (44, 26, 22), 2)
fires(img, HOR, (230, 100, 40), (180, 50, 20), 16)
save(img, "end-collapse.png")

# ---------------- 9) end-taiwan：扬帆黎明 ----------------
img = Image.new("RGB", (W, H))
HOR = 140
sky_gradient(img, (24, 32, 60), (70, 70, 100), (200, 150, 90), HOR)
stars(img, int(HOR * 0.6), [(240, 230, 200)], 16, max_y_frac=0.5)
moon(img, 112, 30, 8, (250, 220, 160), (190, 150, 100))
sea(img, HOR, (26, 36, 58), (120, 110, 96), 56)
px = img.load()
for i in range(56):
    y = HOR + random.randint(1, 90)
    w = max(1, (y - HOR) // 6)
    for dx in range(-w, w + 1):
        if random.random() < 0.55:
            px[min(W - 1, max(0, 112 + dx)), y] = (220, 180, 120)
# 船队剪影（大帆船 + 铁拳旗）
fleet = Image.new("RGB", (W, H))
fpx = fleet.load()
def boat(x, y, s, mcolor):
    # 船体
    for dx in range(s * 2):
        fpx[x + dx, y] = mcolor
        if dx in range(0, s * 2, 3):
            fpx[x + dx, y + 1] = mcolor
    # 两端翘头（中式）
    for ex in (0, 1, s * 2 - 2, s * 2 - 1):
        fpx[x + ex, y - 1] = mcolor
    # 桅与帆
    for k in range(s + 4):
        fpx[x + s, y - k] = mcolor
    for k in range(2, s + 2):
        fpx[x + s + 1, y - k] = mcolor
        fpx[x + s + 2, y - k] = mcolor
    # 旗
    fpx[x + s, y - s - 4] = (158, 30, 20)
    fpx[x + s + 1, y - s - 4] = (158, 30, 20)
    fpx[x + s, y - s - 3] = (158, 30, 20)

boat(28, 176, 10, (16, 12, 16))
boat(64, 196, 13, (14, 10, 14))
boat(104, 184, 9, (16, 12, 16))
boat(46, 216, 11, (12, 9, 12))
img = Image.blend(img, fleet, 0)  # 占位
px = img.load()
for yy in range(H):
    for xx in range(W):
        c = fleet.getpixel((xx, yy))
        if c != (0, 0, 0):
            px[xx, yy] = c
save(img, "end-taiwan.png")

print("全部生成完毕 ->", OUT)
