// 失败结局与百日成功结局。
// endings 中每项含 test(state) 判定函数，engine 逐一检测触发。
export const endings = [
  { id: "exposed", title: "过早暴露", test: s => s.wind >= 100, text: "临高的异常太快传了出去。官府、士绅和海上势力同时把目光转向这里，百日开局被迫进入外部危机。" },
  { id: "council_low", title: "被架空的裁断者", test: s => s.stats.council <= 0, text: "元老院已经不愿继续授予文德嗣临时裁断权。会议、部门和派系重新接管局面，百日计划失去速度。" },
  { id: "council_high", title: "会议吞没百日", test: s => s.stats.council >= 100, text: "每个部门都得到了安抚，每个元老都有理由发言。代价是裁断变慢，资源被内部需求切碎。" },
  { id: "people_low", title: "周边离心", test: s => s.stats.people <= 0, text: "村社、劳工和归化民开始用沉默、逃亡和告密回应临高。新秩序还没站稳，就已经失去了外部土壤。" },
  { id: "people_high", title: "让利失度", test: s => s.stats.people >= 100, text: "外部关系表面和顺，但规矩被反复讨价还价。执委会认为文德嗣过于软弱，临高权威被稀释。" },
  { id: "military_low", title: "营地失控", test: s => s.stats.military <= 0, text: "警戒、纪律和武备都没有形成可靠秩序。偷盗、冲突和外部试探接连发生，百日开局被安全危机击穿。" },
  { id: "military_high", title: "军管阴影", test: s => s.stats.military >= 100, text: "营地确实安静了，但那是恐惧带来的安静。元老院和民众都开始怀疑，这是否仍是共同事业。" },
  { id: "livelihood_low", title: "生计崩盘", test: s => s.stats.livelihood <= 0, text: "粮食、药品、住房和工程一起告急。没有任何路线能越过基本生存，百日开局失败。" },
  { id: "livelihood_high", title: "生产压倒一切", test: s => s.stats.livelihood >= 100, text: "工坊和工程飞快推进，却把人力、补给和耐心都压到极限。临高像机器一样运转，也像机器一样磨损所有人。" },
];

export const successEndings = [
  { id: "steady", title: "稳健立足", text: "四柱都没有失衡，风声仍可控制。文德嗣交出了一份不耀眼但扎实的百日答卷。" },
  { id: "low_profile", title: "低调潜伏", text: "临高的发展不算最快，却把外部风声压得很低。未来还有足够时间积蓄力量。" },
  { id: "iron", title: "铁腕百日", text: "军务和生计支撑起了秩序，代价是民望和内部空气都变得紧绷。大天使长的影子落在百仞滩上。" },
  { id: "workshop", title: "工坊路线", text: "生产能力成为百日最大的成果。工坊的火光已经亮起，但它还需要政治和民生为它供氧。" },
  { id: "civil", title: "民政优先", text: "村社、劳工和归化民愿意继续靠近临高。发展速度放慢了些，却换来了更厚的治理土壤。" },
  { id: "council", title: "会议政治", text: "元老院被稳住了，部门协同也有了章法。文德嗣保住了裁断权，但每一次推进都要付出更多协调成本。" },
];
