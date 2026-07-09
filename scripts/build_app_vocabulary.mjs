import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const curriculumPath = path.join(root, "data", "curriculum-vocabulary-raw.json");
const grade6Path = path.join(root, "data", "grade6-vocabulary-2024-unit1-6.json");
const ecdictPath = path.join(root, "data", "sources", "ecdict.csv");
const outputPath = path.join(root, "app", "src", "vocabulary.generated.js");

const curriculum = JSON.parse(await fs.readFile(curriculumPath, "utf8"));
const grade6 = JSON.parse(await fs.readFile(grade6Path, "utf8"));

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

async function loadDictionary() {
  const text = await fs.readFile(ecdictPath, "utf8");
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  const wordIndex = headers.indexOf("word");
  const phoneticIndex = headers.indexOf("phonetic");
  const records = new Map();
  for (const line of lines) {
    if (!line) continue;
    const values = parseCsvLine(line);
    const word = values[wordIndex]?.trim();
    if (!word) continue;
    records.set(word.toLowerCase(), {
      phonetic: values[phoneticIndex]?.trim() ?? "",
    });
  }
  return records;
}

const dictionary = await loadDictionary();

function cleanText(value, maxLength = 54) {
  return String(value ?? "")
    .replace(/\\r?\\n|\r?\n/g, "；")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizePhonetic(value) {
  const text = cleanText(value, 80);
  return text ? `/${text.replace(/^\/+|\/+$/g, "")}/` : "";
}

function cleanMeaning(value) {
  const firstSense = String(value ?? "")
    .replace(/\\r?\\n|\r?\n/g, "；")
    .split("；")[0];
  return cleanText(firstSense, 44) || "中文释义待复核";
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.'?!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const primaryWords = curriculum.primary_words.map((row, index) => ({
  id: `primary-${String(index + 1).padStart(4, "0")}`,
  word: cleanText(row.lemma, 80),
  answer: normalizeAnswer(row.lemma),
  phonetic: normalizePhonetic(row.phonetic_raw),
  meaning: cleanMeaning(row.meaning_zh_raw),
  example: `Let's learn how to use “${cleanText(row.lemma, 80)}”.`,
  libraries: ["primary"],
  unitLabel: "小学基准 · 课标二级",
  sourceType: "义务教育英语课程标准（2022年版）小学基准",
  reviewStatus: "试运行；中文释义待教研复核",
}));

const grade6Words = grade6.words.map((row, index) => ({
  id: `grade6-${row.unit.toLowerCase().replace(/\s+/g, "")}-${String(index + 1).padStart(3, "0")}`,
  word: row.word,
  answer: normalizeAnswer(row.answer || row.word),
  phonetic: row.phonetic || normalizePhonetic(dictionary.get(row.word.toLowerCase())?.phonetic),
  meaning: row.meaning,
  example: row.example || `Let's learn how to use “${row.word}”.`,
  libraries: ["grade6"],
  unitLabel: `六年级上册 · ${row.unit}`,
  sourceType: grade6.metadata.name,
  reviewStatus: grade6.metadata.reviewStatus,
}));

const output = `// 由 scripts/build_app_vocabulary.mjs 生成，请勿手工编辑。\n` +
  `export const primaryWords = ${JSON.stringify(primaryWords, null, 2)};\n\n` +
  `export const grade6Words = ${JSON.stringify(grade6Words, null, 2)};\n\n` +
  `export const vocabularyMetadata = ${JSON.stringify({
    primaryCount: primaryWords.length,
    grade6Count: grade6Words.length,
    grade6SourceRows: grade6.metadata.sourceRows,
    generatedAt: "2026-07-09",
    grade6Scope: grade6.metadata.scope,
  }, null, 2)};\n`;

await fs.writeFile(outputPath, output, "utf8");
console.log(JSON.stringify({ outputPath, primary: primaryWords.length, grade6: grade6Words.length }));
