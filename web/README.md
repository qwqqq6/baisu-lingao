# 《百日临高：执委会裁断》网页原型

这是一个静态网页版本，不需要构建步骤，但使用了 ES 模块（`<script type="module">`）。

## 打开方式

因为使用 ES 模块，浏览器在 `file://` 协议下会因 CORS 限制无法加载模块，**必须通过本地静态服务器访问**。

在项目根目录执行：

```bash
python -m http.server 8123 --directory web
```

然后浏览器打开：

```text
http://localhost:8123/
```

（任意静态服务器均可，只要以 `web/` 为根目录提供服务。）

## 已实现内容

- 类《王权》的左右决策卡牌。
- 鼠标拖拽、触屏拖拽、按钮点击、键盘 `A` / `D` 操作。
- 100 天流程。
- 88 张卡牌定义：79 张流程卡与 9 张危机卡。
- 普通卡、特殊卡、系列卡、插入卡、重大行动卡、阶段报告、危机卡、风声卡、结局卡。
- 10 张特殊卡作为跨阶段突发事件，19 张系列卡作为前置选择触发的后续事件。
- 系列卡和插入卡不会随机抽到，只由具体选择推进，避免事件链断裂。
- 危机卡带近期去重，减少同一危机连续重复压垮开局。
- 四个明面指标：元老院、民望、军务、生计。
- 隐藏压力：风声。
- 四个阶段：登陆、立足、初期建设、稳定。
- 自动存档和继续游戏。
- 精确数值显示开关。
- 裁断记录。
- 响应式布局，支持桌面和手机宽度。

## 暂未做

- 卡面图和人物插画。
- 音效、音乐。
- 独立 JSON 数据文件。
- 更细的派系、人物关系、技术路线。

## 目录结构

```text
web/
  index.html        页面结构，入口引用 src/main.js（type="module"）
  styles.css        界面样式和卡牌动效
  src/
    main.js         入口：绑定事件，读档或开新局
    data/           游戏数据（按机制拆分）
      factory.js    卡牌/选项工厂函数 c() e()
      stats.js      四柱定义与初始状态
      stages.js     阶段划分与阶段报告
      endings.js    失败结局与成功结局
      crisisCards.js 危机卡与风声卡
      cards.js      主卡池（流程卡）
      index.js      聚合导出 GAME_DATA
    core/           核心逻辑（与 UI 无关）
      store.js      跨模块共享的可变状态
      state.js      初始状态、夹取、阶段查找、结算
      storage.js    存档读写
      engine.js     抽卡调度、结算、动画编排
    systems/        玩法系统
      crisis.js     危机/风声触发
      endingpicker.js 阶段报告卡与结局卡选择
    ui/             视图层
      dom.js        集中的 DOM 引用
      render.js     渲染卡牌与数值预览
      modal.js      帮助/弹窗
      input.js      按钮、键盘、指针拖拽绑定
```

## 平衡工具

`tools/balance_check.py` 对卡池做静态 lint 与蒙特卡洛模拟，用于每次改卡后的回归验证：

```bash
python tools/balance_check.py
```
