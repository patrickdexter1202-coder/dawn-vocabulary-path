import { useEffect, useMemo, useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import {
  BACKUP_META_KEY,
  archiveCustomLibrary,
  createBackup,
  importCustomLibrary,
  listCustomLibraries,
  parseImportFile,
  readFileText,
  restoreBackup,
} from "./localLibrary.js";

function formatDate(value) {
  if (!value) return "尚未备份";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function downloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function LocalDataPanel({ progress, onClose, onLibrariesChanged, onProgressRestored }) {
  const [libraries, setLibraries] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [libraryName, setLibraryName] = useState("");
  const [duplicateStrategy, setDuplicateStrategy] = useState("skip");
  const [mapping, setMapping] = useState({ word: "word", meaning: "meaning", phonetic: "phonetic", example: "example" });
  const [report, setReport] = useState(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [backupMeta, setBackupMeta] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(BACKUP_META_KEY)) ?? {}; } catch { return {}; }
  });

  async function refreshLibraries() {
    const next = await listCustomLibraries();
    setLibraries(next);
    onLibrariesChanged?.(next);
  }

  useEffect(() => {
    refreshLibraries().catch((reason) => setError(reason.message));
  }, []);

  const activeSheet = useMemo(() => parsed?.sheets.find((sheet) => sheet.name === sheetName) ?? parsed?.sheets[0], [parsed, sheetName]);
  const rows = activeSheet?.rows ?? [];
  const columns = Object.keys(rows[0] ?? {});
  const mappedRows = rows.map((row) => ({
    ...row,
    word: row[mapping.word] ?? "",
    meaning: row[mapping.meaning] ?? "",
    phonetic: mapping.phonetic ? row[mapping.phonetic] ?? "" : "",
    example: mapping.example ? row[mapping.example] ?? "" : "",
  }));
  const validRows = mappedRows.filter((row) => String(row.word ?? "").trim() && String(row.meaning ?? "").trim());

  async function handleVocabularyFile(event) {
    const [file] = event.target.files ?? [];
    if (!file) return;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const result = await parseImportFile(file);
      setParsed(result);
      setSheetName(result.sheets[0]?.name ?? "");
      const initialColumns = Object.keys(result.sheets[0]?.rows[0] ?? {});
      setMapping({ word: initialColumns.includes("word") ? "word" : initialColumns[0] ?? "", meaning: initialColumns.includes("meaning") ? "meaning" : initialColumns[1] ?? "", phonetic: initialColumns.includes("phonetic") ? "phonetic" : "", example: initialColumns.includes("example") ? "example" : "" });
      setLibraryName(file.name.replace(/\.[^.]+$/, ""));
    } catch (reason) {
      setParsed(null);
      setError(reason.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleImport() {
    setBusy(true);
    setError("");
    try {
      const result = await importCustomLibrary({ name: libraryName, rows: mappedRows, duplicateStrategy });
      setReport({ ...result, message: `已导入 ${result.imported} 个词条${result.skipped ? `，跳过 ${result.skipped} 个重复项` : ""}${result.failed ? `，${result.failed} 行未通过校验` : ""}。请导出一次完整备份。` });
      setParsed(null);
      await refreshLibraries();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setError("");
    try {
      const backup = await createBackup(progress);
      const date = backup.exportedAt.slice(0, 10);
      downloadJson(backup, `晨光词径-完整备份-${date}.json`);
      const nextMeta = { ...backupMeta, lastExportedAt: backup.exportedAt };
      window.localStorage.setItem(BACKUP_META_KEY, JSON.stringify(nextMeta));
      setBackupMeta(nextMeta);
      setReport({ message: "完整备份已导出，请把文件保存到可靠位置。" });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBackupFile(event) {
    const [file] = event.target.files ?? [];
    if (!file) return;
    setError("");
    try {
      const payload = JSON.parse(await readFileText(file));
      if (!payload?.schemaVersion || !Array.isArray(payload.customLibraries) || !payload.progress) throw new Error("这不是有效的晨光词径完整备份");
      setRestorePreview(payload);
    } catch (reason) {
      setRestorePreview(null);
      setError(reason.message);
    } finally {
      event.target.value = "";
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError("");
    try {
      const result = await restoreBackup(restorePreview);
      onProgressRestored?.(result.progress);
      await refreshLibraries();
      setRestorePreview(null);
      setReport({ message: `已恢复 ${result.libraries} 个自定义词库、${result.entries} 个词条和学习记录。` });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(library) {
    if (!window.confirm(`归档“${library.name}”？历史学习记录会保留。`)) return;
    setBusy(true);
    try {
      await archiveCustomLibrary(library.id);
      await refreshLibraries();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop data-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="local-data-panel" role="dialog" aria-modal="true" aria-labelledby="local-data-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" aria-label="关闭" onClick={onClose}><XIcon weight="bold" /></button>
        <p className="eyebrow">只保存在当前浏览器</p>
        <h2 id="local-data-title">本地词库与备份</h2>
        <p className="data-intro">网页由 GitHub Pages 提供；学习记录和你导入的词库不会上传。换设备、换浏览器或清除网站数据前，请先导出完整备份。</p>

        {error && <div className="data-message is-error" role="alert">{error}</div>}
        {report && <div className="data-message" role="status">{report.message ?? `已导入 ${report.imported} 个词条${report.skipped ? `，跳过 ${report.skipped} 个重复项` : ""}。`}</div>}

        <div className="data-grid">
          <section className="data-card" aria-labelledby="import-title">
            <span className="data-number">01</span>
            <div><h3 id="import-title">导入自定义词库</h3><p>支持 UTF-8 CSV、JSON、XLSX；文件最大 10 MB、20,000 行。</p></div>
            <label className="file-button"><span>{busy ? "正在处理…" : "选择词库文件"}</span><input type="file" aria-label="选择词库文件" accept=".csv,.json,.xlsx,.xls" onChange={handleVocabularyFile} disabled={busy} /></label>
          </section>

          <section className="data-card" aria-labelledby="backup-title">
            <span className="data-number">02</span>
            <div><h3 id="backup-title">完整备份与恢复</h3><p>最近导出：{formatDate(backupMeta.lastExportedAt)}</p></div>
            <div className="data-card-actions"><button type="button" onClick={handleExport} disabled={busy}>导出完整备份</button><label className="text-file-button"><span>选择备份文件</span><input type="file" aria-label="选择备份文件" accept=".json,application/json" onChange={handleBackupFile} disabled={busy} /></label></div>
          </section>
        </div>

        {parsed && (
          <section className="import-preview" aria-labelledby="preview-title">
            <div className="preview-heading"><div><p className="eyebrow">{parsed.fileName}</p><h3 id="preview-title">导入预览</h3></div><strong>{validRows.length}/{rows.length} 行有效</strong></div>
            {parsed.sheets.length > 1 && <label>工作表<select aria-label="选择工作表" value={activeSheet?.name} onChange={(event) => { const name = event.target.value; const sheet = parsed.sheets.find((item) => item.name === name); const nextColumns = Object.keys(sheet?.rows[0] ?? {}); setSheetName(name); setMapping({ word: nextColumns.includes("word") ? "word" : nextColumns[0] ?? "", meaning: nextColumns.includes("meaning") ? "meaning" : nextColumns[1] ?? "", phonetic: nextColumns.includes("phonetic") ? "phonetic" : "", example: nextColumns.includes("example") ? "example" : "" }); }}>{parsed.sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</select></label>}
            <label>词库名称<input aria-label="词库名称" value={libraryName} onChange={(event) => setLibraryName(event.target.value)} /></label>
            <label>重复项处理<select aria-label="重复项处理" value={duplicateStrategy} onChange={(event) => setDuplicateStrategy(event.target.value)}><option value="skip">跳过完全重复项</option><option value="replace">以后出现的内容覆盖前项</option></select></label>
            <fieldset className="field-mapping"><legend>字段映射</legend>{[["word", "英文（必填）"], ["meaning", "中文释义（必填）"], ["phonetic", "音标"], ["example", "例句"]].map(([field, label]) => <label key={field}>{label}<select aria-label={`${label}字段`} value={mapping[field]} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}>{field !== "word" && field !== "meaning" && <option value="">不导入</option>}{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>)}</fieldset>
            <div className="preview-table-wrap"><table><thead><tr><th>行</th><th>单词</th><th>释义</th><th>音标 / 例句</th></tr></thead><tbody>{mappedRows.slice(0, 20).map((row, index) => <tr key={`${row.word}-${index}`} className={!row.word || !row.meaning ? "is-invalid" : ""}><td>{index + 2}</td><td>{String(row.word ?? "")}</td><td>{String(row.meaning ?? "")}</td><td>{String(row.phonetic || row.example || "—")}</td></tr>)}</tbody></table></div>
            {rows.length > 20 && <p className="preview-note">仅预览前 20 行；导入时会校验全部 {rows.length} 行。</p>}
            <button className="data-primary-button" type="button" onClick={handleImport} disabled={busy || !validRows.length || !libraryName.trim()}>导入 {validRows.length} 个词条</button>
          </section>
        )}

        {restorePreview && (
          <section className="restore-preview" aria-labelledby="restore-title"><div><p className="eyebrow">覆盖前请确认</p><h3 id="restore-title">恢复 {restorePreview.customLibraries.length} 个词库和 {restorePreview.progress.sessions?.length ?? 0} 次学习会话</h3><p>备份时间：{formatDate(restorePreview.exportedAt)}。恢复会覆盖当前浏览器中的学习记录与自定义词库。</p></div><div><button type="button" onClick={() => setRestorePreview(null)}>取消</button><button className="data-primary-button" type="button" onClick={handleRestore} disabled={busy}>确认恢复</button></div></section>
        )}

        <section className="library-list" aria-labelledby="library-list-title">
          <div className="preview-heading"><div><p className="eyebrow">IndexedDB</p><h3 id="library-list-title">当前浏览器的自定义词库</h3></div><strong>{libraries.length} 个</strong></div>
          {libraries.length ? <ul>{libraries.map((library) => <li key={library.id}><span><strong>{library.name}</strong><small>{library.entries.length} 个词 · {formatDate(library.createdAt)}</small></span><button type="button" onClick={() => handleArchive(library)} disabled={busy}>归档</button></li>)}</ul> : <p className="empty-state">还没有自定义词库。内置词库不会显示在这里。</p>}
        </section>
      </section>
    </div>
  );
}
