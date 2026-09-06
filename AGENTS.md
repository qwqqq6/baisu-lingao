# AGENTS.md

《临高启明》同人卡牌决策游戏（人物执政/势力继任版）。项目工作语言是中文：文档、代码注释、卡牌文本均用中文。

## 项目结构

- `docs/` — 设计文档（本项目的权威规格，先读再改）：
  - `重做规划_人物与势力继任_v0.2.md` — 总体玩法与数据结构规划：人物执政/继任、隐藏势力、卡池分层（池/系列/变体）、状态库、Mod 支持、卡牌编号规则
  - `状态管理类说明.md` — StateManager 设计：状态定义、变更操作、条件判断、计时器、存档快照
- `game/index.html` + `game/css/` — 游戏页面与纸墨风样式
- `game/content/` — JSON 内容包（官方内容与未来 Mod 同构）：`states/`、`forces/`、`series/`、`characters/`、`cards/`
- `game/src/engine/` — 纯逻辑引擎（ES Module，JS + JSDoc）：`state.js`（StateManager+条件+加权随机）、`forces.js`、`character.js`（数据驱动继任）、`draw.js`（系列加权抽卡/变体）、`effects.js`（效果结算+崩局判定）、`save.js`、`content.js`（内容包加载器）
- `game/src/app/` — 流程控制与界面：`game.js`（回合循环/倒台继任/崩局/存档）、`ui.js`（中文 UI）、`main.js`（入口编排，暴露 `window.__game` 调试句柄）
- `tools/validate_content.py` — 内容包校验脚本（Python 3）

## 运行与验证

- 没有 package.json / 构建工具链，**本机没有 Node.js，只有 Python 3.12**；代码是浏览器原生 ES Module（JS 而非 TS，因为没有 tsc）。
- 运行：`cd game && python serve.py 8080` → http://localhost:8080 （serve.py 带 no-cache 响应头；`file://` 直接打开会被浏览器拦 JSON，不可用）。
- **浏览器缓存纪元**：模块/内容/样式 URL 带统一版本号 `?v=1`（index.html 的入口 script 与 css link、各 js 的 import、content.js 的 CACHE 常量）。改动代码或样式后若页面不更新，把所有 `?v=1` 递增成 `?v=2`（一次性全局替换即可）。
- 内容校验：`python tools/validate_content.py`（改任何内容包后必跑）。
- UI 无法自动化点击时，可在浏览器控制台用 `window.__game` 直接驱动引擎调试。

## 当前状态

- v0.2 重做已完成第一版可玩实现（142 张卡、5 人物、8 系列、7 势力、52 状态），文案按原著设定落地（髡贼、澳洲人、首长、百仞城、糖寮、伏波军、米尼铳、流通券、马袅盐场、东门市点券市井等），已通过内容校验与浏览器实测（含倒台→强行挽留（架空）→二次倒台→继任全链路、阶段报告、链式事件弧、后果纪事、重复率实测（60 回合 0 重复）、存读档、200+ 回合压力测试）。git 中旧 100 天版代码的删除尚未提交。

## 架构与约定（实现必须与文档一致）

- 数据驱动：人物继任、卡牌变体、势力行为全部由 JSON 内容定义；程序只实现通用流程（读候选、判条件、加权抽取）。禁止把具体人物/卡牌/势力逻辑写死在引擎里。
- 引擎只读取校验后的结构化数据；官方内容本身就是内置内容包，与 Mod 同构。
- 状态 id 用英文命名空间（如 `core.pillar.livelihood`、`farm.established`），中文放 `name`/`desc` 字段。
- `immutable` / `terminal` 状态不可回滚；剧情反转应新增后果状态（如 `farm.destroyed`），不得改回历史事实。
- 四柱（people/livelihood/military/council）是状态库中四个公开核心状态；风声、势力数值、人物压力全部隐藏，不进公开 UI——隐藏局势只能通过卡牌文本、来源与每十天的「阶段报告」（引擎生成，type=report，单选项）暗示。
- 卡牌编号按主题池：`CORE-`、`FARM-`、`CIV-`、`SEC-`、`PLAN-`、`TRADE-`、`EXT-`，人物卡 `CHAR-WNH/WD/BW/MQZ/WDS-`。
- 强制事件卡（`succession`/`downfall`/`opening`/`collapse` 类型）绝不进入常规抽卡池；倒台卡只有真正下台才消耗，拒绝（强行续任）后可再次触发；本命势力（HOME_FORCE）足够强势时倒台会转化为「架空」（weakened 状态），随后 `CHAR-*-FALL2-001` 二次倒台卡接管。
- **倒台结局**：人物定义里的 `fates` 表按倒台原因（`fall.last_reason` 的枚举值，缺省用 `default`）给出 `{title, text, fateLabel, option}`；真正下台时引擎由此生成 type=epilogue 的结局卡（单选项、engine 生成不进内容池），在 `nextTurn` 里**先于继任**呈现。新增倒台原因时要同步补 fates 条目，否则落到 default。
- 变体 `when` 支持 `ruler`、`chance`、`tagsAny`、`conditions`（通用条件数组），kind 分 character/force/stage/history 四类；一次只应用一个变体。
- followups 写在选项层（不是 effects 内），结算后注入待处理队列；队列 FIFO，下一回合优先弹出（这是链式事件弧的实现方式：前因卡选完，后果卡立即顶上）；出队时重新校验 requires，且已消耗的非日常卡不重复出队。
- 抽卡防重复三件套：每张卡记录出现次数（cardSeen，出现越多权重越低，除数 1+0.6×次数）、recentCards 冷却窗 8 张、相邻两张必不重复（lastDrawnCardId）。三者都随存档序列化。
- 选项导致 boolean/set/immutable/terminal/enum/level 状态变化时，自动写「【此后】×××」进纪事（counter 不记，避免泄露隐藏压力）；这是"后果可见"的兜底机制，优先用 followup 链卡表达后果。
- 公用卡只保留左右二选一；人物专属内容通过变体替换其中一侧或加提示（type=exclusive 的整卡专属为辅助手段）。
- **批牍体是硬性文风**：卡面 text 一律是各口递上的呈文短笺（「呈：……请示下」「急呈：……」，两三行为止，禁止长篇叙事）；选项 label 是首长的批复指令（短促、可执行）；结算反馈 = 「照批」+ 四柱增减 + 至多两条隐晦注脚，长反馈只进纪事。改文案时保持这个体例。
- UI 用原生 HTML/CSS/JS，不引入重型框架；引擎保持纯逻辑模块，供 Web/PWA、Tauri、Capacitor 复用。
- Mod 是数据包，不执行任意 JS；同 id 禁止重复定义，覆盖须显式 `patch` 操作。
- Windows + Git Bash；路径含中文，注意编码；工作区经 OneDrive 同步，避免大量临时文件。
