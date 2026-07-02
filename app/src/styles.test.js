import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("响应式界面约束", () => {
  it("手机端今日统计使用紧凑双列布局", () => {
    expect(styles).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.daily-primary-stats\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("个人菜单文字保持单行", () => {
    expect(styles).toMatch(/\.profile-menu a,[\s\S]*?\.profile-menu button\s*\{[^}]*white-space:\s*nowrap/);
  });

  it("本地数据卡片用弹性内容行对齐底部文件按钮", () => {
    expect(styles).toMatch(/\.data-card\s*\{[^}]*grid-template-rows:\s*1fr auto/);
  });

  it("品牌字体使用压缩后的 WOFF2 资源", () => {
    expect(styles).toMatch(/src:\s*url\([^)]*\.woff2["']?\)\s*format\(["']woff2["']\)/);
    expect(styles).not.toMatch(/AlimamaDongFangDaKai-Regular\.ttf/);
  });
});
