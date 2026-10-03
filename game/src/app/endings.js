/**
 * 结局文案：倒台原因映射、总崩局文案、专属叙事结局。
 * 纯数据模块，不含逻辑。
 *
 * @module app/endings
 */

/** 倒台原因 id -> 中文（fall.last_reason 的展示映射）。 */
export const FALL_REASONS = {
  impeach: "罢免",
  purge: "清洗",
  assassinate: "刺杀",
  mutiny: "军变",
  health: "病退",
  farm_overreach: "农庄坐大",
  network_overreach: "网络失控",
  plan_failure: "计划失败",
  council_seizure: "会议夺权",
};

/**
 * 专属结局（effects.ending 触发）：非崩局、非下台的叙事终局。
 * id 与卡牌 effects.ending 的值对应；新增结局在此补条目。
 */
export const ENDING_TEXTS = {
  taiwan: {
    title: "终局：扬帆南渡",
    text: "船队在夜色里离开南寮海口，帆影连成一线，铁拳旗卷在桅杆上。没有人说话——大家沉默地看着临高在海上变成一道黑线。\n\n八年前，他们在「台湾还是海南」之间选了海南；八年后，海南站不住了，五百余人掉头向南，去大员驱逐红毛人，从一座叫台湾的岛从头再来。值班秘书在航海日志的末页写：崇祯二年，临高失守，全伙南渡台湾。八年前之争，至此有了答案。\n\n《临高启明·执政者》——另一个开头，等你再来书写。",
    button: "在另一个时空重新开始",
  },
  future: {
    title: "未完待续",
    text: "卷尾那页白，终究题了字。\n\n呈文批到没有字的地方，故事就走到了纸的边缘。海峡那边的货栈、五指山那边的黎峒、北边的朝廷，都还等在下一页上。搁笔的不是首长——是还没写完这段历史的人。\n\n《临高启明·执政者》——未完待续。",
    button: "在另一个时空重新开始",
  },
};

/** 总崩局文案（checkCollapse 返回的原因 id -> 终局画面文案）。 */
export const COLLAPSE_TEXTS = {
  livelihood: {
    title: "生产崩溃",
    text: "仓廪见底，灶冷烟稀。饥荒像潮水一样漫过营地，队伍在一夜之间散了。《临高启明》的第一页，翻不到这里。",
  },
  people: {
    title: "民变四起",
    text: "归化民跑了，劳工逃了，连跟了最久的老人也开始夜里磨刀。营地在大火中易主，史书里只留下一行'初，众不服'。",
  },
  military: {
    title: "军务失控",
    text: "枪杆子终于不再听命于会议。哨线之内是军营，哨线之外没有人说话——因为已经没有人需要被说服了。",
  },
  council: {
    title: "元老院分裂",
    text: "会议彻底破裂，各派各立山头、各征各粮。临高集团在一场没有枪声的内战里四分五裂。",
  },
  wind: {
    title: "外部围剿",
    text: "风声终于变成了刀兵。官军、海商、乡勇组成联军封锁了海岸，桅杆如林，旌旗蔽日——这片海摊再无宁日。",
  },
  legitimacy: {
    title: "执政失效",
    text: "没有人再执行来自上头的命令，不是因为反抗，而是因为无所谓。权力在无声无息中蒸发，营地仍在，'临高'已经不在了。",
  },
  succession: {
    title: "继任危机",
    text: "前任倒台，继任无人。各派相持不下，营地陷入漫长的空位期，直到外部势力不请自来。",
  },
};

/** 总崩局原因 -> 结局画面短标题。 */
export function collapseTitleOf(reason) {
  return COLLAPSE_TEXTS[reason]?.title || "终局";
}
