import { PROGRESS_STORAGE_KEY } from "./sessionPlanner.js";

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_META_KEY = "dawn-vocabulary-backup-meta-v1";
export const DATABASE_NAME = "dawn-vocabulary-local-v1";
const DATABASE_VERSION = 1;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;
const LIBRARY_STORE = "libraries";
const ENTRY_STORE = "entries";

const FIELD_ALIASES = {
  word: ["word", "单词", "英文", "english"],
  meaning: ["meaning", "释义", "中文", "中文释义", "chinese"],
  phonetic: ["phonetic", "音标"],
  example: ["example", "例句", "sentence"],
  answer: ["answer", "答案"],
  grade: ["grade", "年级"],
  book: ["book", "册次", "教材"],
  unit: ["unit", "单元"],
  source: ["source", "来源"],
  tags: ["tags", "标签"],
  notes: ["notes", "备注"],
};

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("浏览器本地数据库操作失败"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("浏览器本地数据库事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("浏览器本地数据库事务已回滚"));
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("当前浏览器不支持 IndexedDB"));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
          database.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(ENTRY_STORE)) {
          const entries = database.createObjectStore(ENTRY_STORE, { keyPath: "id" });
          entries.createIndex("libraryId", "libraryId", { unique: false });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => {
        databasePromise = undefined;
        reject(request.error ?? new Error("无法打开浏览器本地数据库"));
      };
    });
  }
  return databasePromise;
}

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeWord(value) {
  return clean(value).toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function canonicalField(name) {
  const normalized = clean(name).toLocaleLowerCase("zh-CN").replace(/[\s_-]+/g, "");
  return Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.some((alias) => alias.toLocaleLowerCase("zh-CN").replace(/[\s_-]+/g, "") === normalized))?.[0] ?? clean(name);
}

export function mapImportedRow(row) {
  return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [canonicalField(key), value]));
}

export function parseCsvText(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const matrix = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) matrix.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => clean(value))) matrix.push(row);
  if (!matrix.length) return [];
  const headers = matrix[0].map(canonicalField);
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function readAsArrayBuffer(file) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsArrayBuffer(file);
  });
}

export function readFileText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsText(file, "UTF-8");
  });
}

export async function parseImportFile(file) {
  if (!file) throw new Error("请先选择词库文件");
  if (file.size > MAX_FILE_SIZE) throw new Error("文件不能超过 10 MB");
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("en");
  let sheets;
  if (extension === "csv") {
    sheets = [{ name: "CSV", rows: parseCsvText(await readFileText(file)).map(mapImportedRow) }];
  } else if (extension === "json") {
    const parsed = JSON.parse(await readFileText(file));
    const rows = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(rows)) throw new Error("JSON 词库必须是数组，或包含 entries 数组");
    sheets = [{ name: "JSON", rows: rows.map(mapImportedRow) }];
  } else if (extension === "xlsx" || extension === "xls") {
    const ExcelJSImport = await import("exceljs");
    const ExcelJS = ExcelJSImport.default ?? ExcelJSImport;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readAsArrayBuffer(file));
    sheets = workbook.worksheets.map((worksheet) => {
      const columnCount = worksheet.columnCount;
      const headers = Array.from({ length: columnCount }, (_, index) => canonicalField(worksheet.getRow(1).getCell(index + 1).text));
      const rows = [];
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const values = headers.map((header, index) => [header, worksheet.getRow(rowNumber).getCell(index + 1).text]);
        if (values.some(([, value]) => clean(value))) rows.push(mapImportedRow(Object.fromEntries(values)));
      }
      return { name: worksheet.name, rows };
    });
  } else {
    throw new Error("仅支持 CSV、JSON、XLSX 文件");
  }
  if (sheets.some((sheet) => sheet.rows.length > MAX_ROWS)) throw new Error("单次导入不能超过 20,000 行");
  return { fileName: file.name, sheets };
}

function normalizeEntry(row, libraryId, now, rowNumber) {
  const mapped = mapImportedRow(row);
  const word = clean(mapped.word);
  const meaning = clean(mapped.meaning);
  if (!word || !meaning) return { error: `第 ${rowNumber} 行缺少 word/meaning` };
  if (word.length > 160 || meaning.length > 600) return { error: `第 ${rowNumber} 行内容过长` };
  return {
    entry: {
      id: clean(mapped.id) || makeId("custom"),
      libraryId,
      word,
      normalizedWord: normalizeWord(word),
      answer: clean(mapped.answer) || word,
      meaning,
      phonetic: clean(mapped.phonetic),
      example: clean(mapped.example) || "（自定义词库未提供例句）",
      unit: clean(mapped.unit),
      unitLabel: clean(mapped.unit) || "自定义词库",
      sourceType: clean(mapped.source) || "当前浏览器本地词库",
      tags: Array.isArray(mapped.tags) ? mapped.tags.map(clean).filter(Boolean) : clean(mapped.tags).split(/[,，]/).map(clean).filter(Boolean),
      enabled: mapped.enabled !== false,
      createdAt: clean(mapped.createdAt) || now,
      updatedAt: now,
    },
  };
}

export async function importCustomLibrary({ name, description = "", rows, duplicateStrategy = "skip", libraryId } = {}) {
  const libraryName = clean(name);
  if (!libraryName) throw new Error("请填写词库名称");
  if (!Array.isArray(rows) || !rows.length) throw new Error("词库中没有可导入的词条");
  if (rows.length > MAX_ROWS) throw new Error("单次导入不能超过 20,000 行");
  const now = new Date().toISOString();
  const id = libraryId || makeId("library");
  const unique = new Map();
  const errors = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    const result = normalizeEntry(row, id, now, index + 2);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    const key = `${result.entry.normalizedWord}\u0000${result.entry.meaning}`;
    if (unique.has(key)) {
      if (duplicateStrategy === "replace") unique.set(key, { ...result.entry, id: unique.get(key).id });
      else skipped += 1;
    } else {
      unique.set(key, result.entry);
    }
  });
  const entries = [...unique.values()];
  if (!entries.length) throw new Error(errors[0] ?? "没有可导入的有效词条");
  const database = await openDatabase();
  const transaction = database.transaction([LIBRARY_STORE, ENTRY_STORE], "readwrite");
  transaction.objectStore(LIBRARY_STORE).put({
    id,
    name: libraryName,
    description: clean(description),
    contentVersion: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });
  for (const entry of entries) transaction.objectStore(ENTRY_STORE).put(entry);
  await transactionDone(transaction);
  return { libraryId: id, imported: entries.length, skipped, failed: errors.length, errors };
}

async function readAllData() {
  const database = await openDatabase();
  const transaction = database.transaction([LIBRARY_STORE, ENTRY_STORE], "readonly");
  const librariesRequest = transaction.objectStore(LIBRARY_STORE).getAll();
  const entriesRequest = transaction.objectStore(ENTRY_STORE).getAll();
  const [libraries, entries] = await Promise.all([requestResult(librariesRequest), requestResult(entriesRequest)]);
  await transactionDone(transaction);
  return { libraries, entries };
}

export async function listCustomLibraries({ includeArchived = false } = {}) {
  const { libraries, entries } = await readAllData();
  return libraries
    .filter((library) => includeArchived || !library.archivedAt)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((library) => ({ ...library, entries: entries.filter((entry) => entry.libraryId === library.id && entry.enabled !== false) }));
}

export async function archiveCustomLibrary(libraryId) {
  const database = await openDatabase();
  const transaction = database.transaction(LIBRARY_STORE, "readwrite");
  const store = transaction.objectStore(LIBRARY_STORE);
  const library = await requestResult(store.get(libraryId));
  if (!library) throw new Error("未找到这个自定义词库");
  store.put({ ...library, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
}

export async function createBackup(progress, exportedAt = new Date()) {
  const customLibraries = await listCustomLibraries({ includeArchived: true });
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: "晨光词径",
    exportedAt: exportedAt.toISOString(),
    progress,
    customLibraries: customLibraries.map(({ entries, ...library }) => ({ library, entries })),
  };
}

function validateBackup(backup) {
  if (!backup || backup.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error("备份版本不受支持或文件已损坏");
  if (!backup.progress || backup.progress.version !== 2) throw new Error("备份中的学习记录无效");
  if (!Array.isArray(backup.customLibraries)) throw new Error("备份中的自定义词库无效");
  for (const item of backup.customLibraries) {
    if (!item?.library?.id || !Array.isArray(item.entries)) throw new Error("备份中的词库数据不完整");
  }
}

export async function restoreBackup(backup, storage = window.localStorage) {
  validateBackup(backup);
  const database = await openDatabase();
  const transaction = database.transaction([LIBRARY_STORE, ENTRY_STORE], "readwrite");
  const libraryStore = transaction.objectStore(LIBRARY_STORE);
  const entryStore = transaction.objectStore(ENTRY_STORE);
  libraryStore.clear();
  entryStore.clear();
  let entryCount = 0;
  for (const item of backup.customLibraries) {
    libraryStore.put(item.library);
    for (const entry of item.entries) {
      if (!entry.id || entry.libraryId !== item.library.id) {
        transaction.abort();
        throw new Error("备份中的词条关联无效");
      }
      entryStore.put(entry);
      entryCount += 1;
    }
  }
  await transactionDone(transaction);
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(backup.progress));
  storage.setItem(BACKUP_META_KEY, JSON.stringify({ lastRestoredAt: new Date().toISOString(), sourceExportedAt: backup.exportedAt }));
  return { libraries: backup.customLibraries.length, entries: entryCount, progress: backup.progress };
}

export async function clearLocalDatabase() {
  if (!globalThis.indexedDB) return;
  if (databasePromise) {
    try {
      (await databasePromise).close();
    } catch {
      // The database may already be closing after a failed test or upgrade.
    }
  }
  databasePromise = undefined;
  await new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("无法清空浏览器本地数据库"));
    request.onblocked = () => reject(new Error("本地数据库正在被其他页面使用，请关闭其他页面后重试"));
  });
}
