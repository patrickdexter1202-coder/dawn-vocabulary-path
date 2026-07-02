import { describe, expect, it } from "vitest";
import { buildSessionPlan, createEmptyProgress, deleteSession, deleteWrongWord, migrateProgress, recordAttempt } from "./sessionPlanner.js";

const words = Array.from({ length: 8 }, (_, index) => ({
  id: `word-${index + 1}`,
  word: `word${index + 1}`,
  libraries: ["grade6"],
}));

describe("动态每日选词", () => {
  it("活跃高频错词无论是否到期都必须出现", () => {
    const progress = createEmptyProgress();
    progress.wordStats["word-7"] = {
      attempts: 5,
      correctCount: 2,
      wrongCount: 3,
      correctStreak: 1,
      lastAttemptAt: "2026-06-29T10:00:00.000Z",
      nextReviewAt: "2026-07-20T00:00:00.000Z",
    };

    const plan = buildSessionPlan({ pool: words, progress, now: new Date("2026-06-30T08:00:00.000Z"), size: 4 });
    expect(plan.map((word) => word.id)).toContain("word-7");
  });

  it("高频错词数量超过基础计划时仍全部出现", () => {
    const progress = createEmptyProgress();
    for (const word of words.slice(0, 5)) {
      progress.wordStats[word.id] = { attempts: 3, correctCount: 0, wrongCount: 3, correctStreak: 0 };
    }
    const plan = buildSessionPlan({ pool: words, progress, now: new Date("2026-06-30T08:00:00.000Z"), size: 3 });
    expect(plan).toHaveLength(5);
    expect(plan.map((word) => word.id)).toEqual(expect.arrayContaining(words.slice(0, 5).map((word) => word.id)));
  });

  it("优先到期巩固，再补充未学新词，并避开当天已安排的新词", () => {
    const progress = createEmptyProgress();
    progress.wordStats["word-2"] = {
      attempts: 1,
      correctCount: 0,
      wrongCount: 1,
      correctStreak: 0,
      lastAttemptAt: "2026-06-28T08:00:00.000Z",
      nextReviewAt: "2026-06-29T08:00:00.000Z",
    };
    progress.wrongWords["word-2"] = { id: "word-2", word: "word2", errorCount: 1, active: true };
    progress.sessions.push({ date: "2026-06-30", plannedWordIds: ["word-1", "word-3"] });

    const plan = buildSessionPlan({ pool: words, progress, now: new Date("2026-06-30T08:00:00.000Z"), size: 3 });
    expect(plan[0].id).toBe("word-2");
    expect(plan.map((word) => word.id)).not.toContain("word-1");
  });

  it("不是错词的已学单词不再进入后续轮次，即使复习日期已到", () => {
    const progress = createEmptyProgress();
    progress.wordStats["word-1"] = {
      attempts: 2,
      correctCount: 2,
      wrongCount: 0,
      correctStreak: 2,
      lastAttemptAt: "2026-06-28T08:00:00.000Z",
      nextReviewAt: "2026-06-29T08:00:00.000Z",
    };

    const plan = buildSessionPlan({ pool: words.slice(0, 4), progress, now: new Date("2026-06-30T08:00:00.000Z"), size: 4, rng: () => 0 });
    expect(plan.map((word) => word.id)).not.toContain("word-1");
    expect(plan).toHaveLength(3);
  });

  it("同优先级新词会随机打乱，不沿用字母或词库顺序", () => {
    const progress = createEmptyProgress();
    const plan = buildSessionPlan({ pool: words, progress, now: new Date("2026-06-30T08:00:00.000Z"), size: 8, rng: () => 0 });
    expect(plan.map((word) => word.id)).not.toEqual(words.map((word) => word.id));
  });

  it("前序轮次已经答对且尚未到期的词会让位给其他候选词", () => {
    const progress = createEmptyProgress();
    progress.sessions.push({
      id: "previous-session",
      date: "2026-06-30",
      attempts: [{ wordId: "word-1", correct: true, attemptedAt: "2026-06-30T07:30:00.000Z" }],
    });
    progress.wordStats["word-1"] = {
      attempts: 1,
      correctCount: 1,
      wrongCount: 0,
      correctStreak: 1,
      lastAttemptAt: "2026-06-30T07:30:00.000Z",
      nextReviewAt: "2026-07-01T07:30:00.000Z",
    };

    const plan = buildSessionPlan({ pool: words, progress, now: new Date("2026-06-30T08:00:00.000Z"), size: 4, rng: () => 0 });
    expect(plan.map((word) => word.id)).not.toContain("word-1");
  });

  it("随机组词时只要存在其他选择，就避免相邻单词使用相同首字母", () => {
    const clusteredWords = [
      { id: "a-1", word: "apple" },
      { id: "a-2", word: "ant" },
      { id: "a-3", word: "arm" },
      { id: "b-1", word: "book" },
      { id: "c-1", word: "cat" },
    ];
    const plan = buildSessionPlan({ pool: clusteredWords, progress: createEmptyProgress(), now: new Date("2026-06-30T08:00:00.000Z"), size: 5, rng: () => 0 });
    const initials = plan.map((word) => word.word[0].toLowerCase());
    expect(initials.every((initial, index) => index === 0 || initial !== initials[index - 1])).toBe(true);
  });

  it("答错会累计错误并立即进入后续巩固", () => {
    const progress = createEmptyProgress();
    const updated = recordAttempt(progress, {
      sessionId: "session-1",
      word: words[0],
      answer: "wrong",
      correct: false,
      hintUsed: false,
      attemptedAt: "2026-06-30T08:10:00.000Z",
    });

    expect(updated.wordStats["word-1"]).toMatchObject({ wrongCount: 1, correctStreak: 0 });
    expect(updated.wrongWords["word-1"]).toMatchObject({ word: "word1", errorCount: 1 });
  });

  it("删除一次会话后会从剩余会话重算单词统计", () => {
    const progress = createEmptyProgress();
    progress.sessions = [
      { id: "keep", attempts: [{ wordId: "word-1", word: "word1", meaning: "一", answer: "word1", correct: true, hintUsed: false, attemptedAt: "2026-06-29T08:00:00.000Z" }] },
      { id: "remove", attempts: [{ wordId: "word-2", word: "word2", meaning: "二", answer: "wrong", correct: false, hintUsed: false, attemptedAt: "2026-06-30T08:00:00.000Z" }] },
    ];
    progress.wordStats = { stale: { attempts: 99 } };
    progress.wrongWords = { stale: { errorCount: 99 } };

    const updated = deleteSession(progress, "remove");
    expect(updated.sessions.map((session) => session.id)).toEqual(["keep"]);
    expect(updated.wordStats["word-1"]).toMatchObject({ attempts: 1, correctCount: 1 });
    expect(updated.wordStats["word-2"]).toBeUndefined();
    expect(updated.wrongWords).toEqual({});
  });

  it("删除错词状态后保留历史会话，但旧错误不会在重算时复活", () => {
    const progress = createEmptyProgress();
    progress.sessions = [{ id: "history", attempts: [{ wordId: "word-1", word: "word1", meaning: "一", answer: "wrong", correct: false, hintUsed: false, attemptedAt: "2026-06-29T08:00:00.000Z" }] }];
    progress.wordStats["word-1"] = { attempts: 1, wrongCount: 1 };
    progress.wrongWords["word-1"] = { id: "word-1", word: "word1", errorCount: 1, active: true };

    const updated = deleteWrongWord(progress, "word-1", "2026-06-30T08:00:00.000Z");
    const recalculated = deleteSession({ ...updated, sessions: [...updated.sessions, { id: "remove", attempts: [] }] }, "remove");
    expect(recalculated.sessions).toHaveLength(1);
    expect(recalculated.wordStats["word-1"]).toBeUndefined();
    expect(recalculated.wrongWords["word-1"]).toBeUndefined();
  });

  it("保留并迁移旧版每日记录和错词", () => {
    const migrated = migrateProgress({
      version: 1,
      daily: { "2026-06-29": { attempts: [{ wordId: "word-1", correct: false }] } },
      wrongWords: { "word-1": { word: "word1", meaning: "测试词", errorCount: 2, lastWrongAt: "2026-06-29T08:00:00.000Z" } },
    });
    expect(migrated.version).toBe(2);
    expect(migrated.sessions).toHaveLength(1);
    expect(migrated.wordStats["word-1"].wrongCount).toBe(2);
  });
});
