// Копирует backend/Code.gs в public/mock/Code.gs.js.
// GitHub Pages отдаёт файлы .gs с неподходящим типом, поэтому в браузере
// тестового режима серверный код подключается как .js.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/mock", { recursive: true });
copyFileSync("backend/Code.gs", "public/mock/Code.gs.js");
console.log("backend/Code.gs -> public/mock/Code.gs.js");
