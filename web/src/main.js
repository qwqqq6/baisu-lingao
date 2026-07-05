// 入口：装配交互，加载存档或开新局。
import { bindEvents } from "./ui/input.js";
import { load } from "./core/storage.js";
import { newGame } from "./core/engine.js";

function boot() {
  bindEvents();
  if (!load()) newGame();
}

boot();
