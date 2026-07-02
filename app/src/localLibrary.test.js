import "fake-indexeddb/auto";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  clearLocalDatabase,
  createBackup,
  importCustomLibrary,
  listCustomLibraries,
  parseCsvText,
  parseImportFile,
  restoreBackup,
} from "./localLibrary.js";

describe("浏览器本地词库", () => {
  beforeEach(async () => {
    await clearLocalDatabase();
    window.localStorage.clear();
  });

  it("解析带引号、逗号和换行的 UTF-8 CSV", () => {
    const rows = parseCsvText('word,meaning,example\nhello,"你好，您好","Say ""hello"".\nThen smile."');
    expect(rows).toEqual([{ word: "hello", meaning: "你好，您好", example: 'Say "hello".\nThen smile.' }]);
  });

  it("读取 JSON 与 XLSX，并保留可选择的工作表", async () => {
    const jsonFile = new File([JSON.stringify([{ word: "sun", meaning: "太阳" }])], "words.json", { type: "application/json" });
    const parsedJson = await parseImportFile(jsonFile);
    expect(parsedJson.sheets[0].rows[0]).toMatchObject({ word: "sun", meaning: "太阳" });

    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("六上").addRows([["word", "meaning"], ["moon", "月亮"]]);
    workbook.addWorksheet("补充").addRows([["word", "meaning"], ["star", "星星"]]);
    const bytes = await workbook.xlsx.writeBuffer();
    const xlsxFile = new File([bytes], "words.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const parsedXlsx = await parseImportFile(xlsxFile);
    expect(parsedXlsx.sheets.map((sheet) => sheet.name)).toEqual(["六上", "补充"]);
    expect(parsedXlsx.sheets[1].rows[0]).toMatchObject({ word: "star", meaning: "星星" });
  });

  it("在一个事务中保存词库与稳定词条，并跳过完全重复项", async () => {
    const report = await importCustomLibrary({
      name: "家庭词表",
      rows: [
        { word: " Apple ", meaning: "苹果", phonetic: "/ˈæpəl/" },
        { word: "apple", meaning: "苹果" },
        { word: "pear", meaning: "梨" },
      ],
      duplicateStrategy: "skip",
    });
    expect(report).toMatchObject({ imported: 2, skipped: 1, failed: 0 });

    const libraries = await listCustomLibraries();
    expect(libraries).toHaveLength(1);
    expect(libraries[0].entries).toHaveLength(2);
    expect(libraries[0].entries[0].id).toMatch(/^custom-/);
    expect(libraries[0].entries.find((entry) => entry.word === "Apple")).toMatchObject({ answer: "Apple", meaning: "苹果" });
  });

  it("导入 1,000 个词后重新读取仍完整", async () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({ word: `word-${index + 1}`, meaning: `释义 ${index + 1}` }));
    await importCustomLibrary({ name: "千词验收", rows });
    const [library] = await listCustomLibraries();
    expect(library.entries).toHaveLength(1_000);
    expect(new Set(library.entries.map((entry) => entry.id)).size).toBe(1_000);
  });

  it("统一导出并恢复学习记录和 IndexedDB 自定义词库", async () => {
    await importCustomLibrary({ name: "旅行英语", rows: [{ word: "ticket", meaning: "票" }] });
    const progress = { version: 2, sessions: [{ id: "session-1" }], wordStats: {}, wrongWords: {} };
    window.localStorage.setItem("dawn-vocabulary-progress-v2", JSON.stringify(progress));

    const backup = await createBackup(progress, new Date("2026-07-02T06:00:00.000Z"));
    expect(backup).toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: "2026-07-02T06:00:00.000Z", progress });
    expect(backup.customLibraries[0].entries[0].word).toBe("ticket");

    await clearLocalDatabase();
    window.localStorage.clear();
    const restored = await restoreBackup(backup);
    expect(restored).toMatchObject({ libraries: 1, entries: 1 });
    expect(JSON.parse(window.localStorage.getItem("dawn-vocabulary-progress-v2"))).toEqual(progress);
    expect((await listCustomLibraries())[0].entries[0].word).toBe("ticket");
  });

  it("拒绝损坏备份且不覆盖现有数据", async () => {
    await importCustomLibrary({ name: "保留词库", rows: [{ word: "keep", meaning: "保留" }] });
    window.localStorage.setItem("dawn-vocabulary-progress-v2", JSON.stringify({ version: 2, sessions: [] }));

    await expect(restoreBackup({ schemaVersion: 999, progress: null })).rejects.toThrow("备份版本");
    expect((await listCustomLibraries())[0].name).toBe("保留词库");
    expect(window.localStorage.getItem("dawn-vocabulary-progress-v2")).toContain('"version":2');
  });
});
