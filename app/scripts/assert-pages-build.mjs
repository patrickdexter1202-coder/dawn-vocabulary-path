import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const dist = new URL("dist/", root);
const distPath = fileURLToPath(dist);
const html = await readFile(new URL("index.html", dist), "utf8");
const basePath = process.env.VITE_BASE_PATH
  || (process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/` : "/");

if (!html.includes(`${basePath}assets/`)) {
  throw new Error(`构建产物没有使用预期的 GitHub Pages 子路径：${basePath}`);
}
if (/(["'(])\/fonts\//.test(html)) {
  throw new Error("构建产物仍引用域名根路径 /fonts/，GitHub Pages 项目站点会加载失败");
}

const assetMatches = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => value.includes("/assets/"));
for (const assetUrl of assetMatches) {
  const relativePath = assetUrl.slice(assetUrl.indexOf("assets/"));
  await stat(join(distPath, relativePath));
}

console.log(`GitHub Pages 构建断言通过：${basePath}，校验 ${assetMatches.length} 个入口资源。`);
