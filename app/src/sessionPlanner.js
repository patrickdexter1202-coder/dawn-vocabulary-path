export const PROGRESS_STORAGE_KEY = "dawn-vocabulary-progress-v2";
export const LEGACY_STORAGE_KEY = "dawn-vocabulary-progress-v1";
export const DEFAULT_SESSION_SIZE = 30;
export const SESSION_HISTORY_DAYS = 90;

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

export function shiftDateKey(day, days) {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, date));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getSessionHistoryRange(value = new Date(), days = SESSION_HISTORY_DAYS) {
  const max = dateKey(value);
  return { min: shiftDateKey(max, -(days - 1)), max };
}

export function createEmptyProgress() {
  return { version: 2, sessions: [], wordStats: {}, wrongWords: {}, dismissedWrongWords: {} };
}

export function migrateProgress(value) {
  if (value?.version === 2 && Array.isArray(value.sessions)) {
    return { ...value, wordStats: value.wordStats ?? {}, wrongWords: value.wrongWords ?? {}, dismissedWrongWords: value.dismissedWrongWords ?? {} };
  }
  if (value?.version !== 1) return createEmptyProgress();

  const migrated = createEmptyProgress();
  for (const [day, record] of Object.entries(value.daily ?? {})) {
    const attempts = (record.attempts ?? []).map((attempt) => ({
      ...attempt,
      word: value.wrongWords?.[attempt.wordId]?.word ?? attempt.wordId,
      meaning: value.wrongWords?.[attempt.wordId]?.meaning ?? "",
    }));
    migrated.sessions.push({
      id: `legacy-${day}`,
      date: day,
      libraryId: "bridge",
      startedAt: `${day}T00:00:00.000Z`,
      endedAt: `${day}T00:00:00.000Z`,
      plannedWordIds: [],
      attempts,
      migrated: true,
    });
  }
  for (const [wordId, item] of Object.entries(value.wrongWords ?? {})) {
    migrated.wrongWords[wordId] = { ...item, active: true };
    migrated.wordStats[wordId] = {
      attempts: item.errorCount ?? 1,
      correctCount: 0,
      wrongCount: item.errorCount ?? 1,
      assistedCount: 0,
      correctStreak: 0,
      lastAttemptAt: item.lastWrongAt,
      nextReviewAt: item.nextReviewAt ? `${item.nextReviewAt}T00:00:00.000Z` : item.lastWrongAt,
    };
  }
  return migrated;
}

function weaknessScore(stat = {}) {
  return (stat.wrongCount ?? 0) * 10 - (stat.correctStreak ?? 0) * 2 + (stat.assistedCount ?? 0);
}

function shuffled(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function firstLetter(word) {
  return word.word?.trim().match(/[a-z]/i)?.[0].toLowerCase() ?? "";
}

export function buildSessionPlan({ pool, progress, now = new Date(), size = DEFAULT_SESSION_SIZE, rng = Math.random }) {
  const nowIso = now.toISOString();
  const today = dateKey(now);
  const stats = progress.wordStats ?? {};
  const wrongWords = progress.wrongWords ?? {};
  const isActiveWrong = (word) => {
    const stat = stats[word.id];
    return (stat?.wrongCount ?? 0) > 0
      && wrongWords[word.id]?.active !== false
      && (stat?.correctStreak ?? 0) < 3;
  };
  const scheduledToday = new Set(
    (progress.sessions ?? [])
      .filter((session) => session.date === today)
      .flatMap((session) => session.plannedWordIds ?? []),
  );
  const byWeakness = (left, right) => {
    return weaknessScore(stats[right.id]) - weaknessScore(stats[left.id]);
  };

  const highWrong = shuffled(pool
    .filter((word) => isActiveWrong(word) && (stats[word.id]?.wrongCount ?? 0) >= 2)
    , rng).sort(byWeakness);
  const targetSize = Math.max(size, highWrong.length);
  const chosen = [];
  const chosenIds = new Set();
  let previousInitial = "";
  const add = (items, limit = targetSize) => {
    const remaining = items.filter((word) => !chosenIds.has(word.id));
    while (remaining.length && chosen.length < limit && chosen.length < targetSize) {
      const differentInitialIndex = remaining.findIndex((word) => {
        const initial = firstLetter(word);
        return !previousInitial || !initial || initial !== previousInitial;
      });
      const index = differentInitialIndex >= 0 ? differentInitialIndex : 0;
      const [word] = remaining.splice(index, 1);
      chosen.push(word);
      chosenIds.add(word.id);
      previousInitial = firstLetter(word);
    }
  };
  const due = shuffled(pool
    .filter((word) => {
      const stat = stats[word.id];
      return isActiveWrong(word) && stat.nextReviewAt && stat.nextReviewAt <= nowIso && !highWrong.includes(word);
    })
    , rng).sort((left, right) => (stats[left.id].nextReviewAt ?? "").localeCompare(stats[right.id].nextReviewAt ?? "") || byWeakness(left, right));
  const reinforcement = shuffled(pool
    .filter((word) => {
      const stat = stats[word.id];
      return isActiveWrong(word) && stat?.correctStreak === 0 && !highWrong.includes(word) && !due.includes(word);
    })
    , rng).sort(byWeakness);
  const unseenFresh = shuffled(pool.filter((word) => !stats[word.id]?.attempts && !scheduledToday.has(word.id)), rng);
  const unseenRepeated = shuffled(pool.filter((word) => !stats[word.id]?.attempts && scheduledToday.has(word.id)), rng);

  add(highWrong);
  add(due);
  const reviewTarget = Math.max(chosen.length, Math.round(targetSize * 0.4));
  add(reinforcement, reviewTarget);
  add(unseenFresh);
  add(unseenRepeated);
  add(reinforcement);

  return chosen;
}

export function startSession(progress, { libraryId, plannedWordIds, startedAt }) {
  const next = structuredClone(progress);
  for (const session of next.sessions) {
    if (!session.endedAt) session.endedAt = startedAt;
  }
  const id = `session-${startedAt}-${next.sessions.length + 1}`;
  next.sessions.push({
    id,
    date: dateKey(startedAt),
    libraryId,
    startedAt,
    endedAt: null,
    plannedWordIds,
    attempts: [],
  });
  return { progress: next, sessionId: id };
}

export function finishSession(progress, sessionId, endedAt) {
  const next = structuredClone(progress);
  const session = next.sessions.find((item) => item.id === sessionId);
  if (session) session.endedAt = endedAt;
  return next;
}

export function recordAttempt(progress, { sessionId, word, answer, correct, hintUsed, attemptedAt }) {
  const next = structuredClone(progress);
  next.dismissedWrongWords ??= {};
  const attempt = {
    wordId: word.id,
    word: word.word,
    meaning: word.meaning ?? "",
    answer,
    correct,
    hintUsed,
    attemptedAt,
  };
  const session = next.sessions.find((item) => item.id === sessionId);
  if (session) session.attempts.push(attempt);

  const previous = next.wordStats[word.id] ?? {
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    assistedCount: 0,
    correctStreak: 0,
    lastAttemptAt: null,
    nextReviewAt: attemptedAt,
  };
  const correctStreak = correct ? previous.correctStreak + 1 : 0;
  const intervalDays = hintUsed ? 1 : [1, 3, 7, 14, 30][Math.min(Math.max(correctStreak - 1, 0), 4)];
  next.wordStats[word.id] = {
    attempts: previous.attempts + 1,
    correctCount: previous.correctCount + (correct ? 1 : 0),
    wrongCount: previous.wrongCount + (correct ? 0 : 1),
    assistedCount: previous.assistedCount + (hintUsed ? 1 : 0),
    correctStreak,
    lastAttemptAt: attemptedAt,
    nextReviewAt: correct ? addDays(attemptedAt, intervalDays) : attemptedAt,
  };

  if (!correct) {
    const existing = next.wrongWords[word.id];
    next.wrongWords[word.id] = {
      id: word.id,
      word: word.word,
      meaning: word.meaning ?? "",
      errorCount: (existing?.errorCount ?? 0) + 1,
      lastWrongAt: attemptedAt,
      active: true,
    };
  } else if (next.wrongWords[word.id] && correctStreak >= 3) {
    next.wrongWords[word.id].active = false;
    next.wrongWords[word.id].masteredAt = attemptedAt;
  }
  return next;
}

function applyHistoricalAttempt(next, attempt) {
  const previous = next.wordStats[attempt.wordId] ?? {
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    assistedCount: 0,
    correctStreak: 0,
    lastAttemptAt: null,
    nextReviewAt: attempt.attemptedAt,
  };
  const correctStreak = attempt.correct ? previous.correctStreak + 1 : 0;
  const intervalDays = attempt.hintUsed ? 1 : [1, 3, 7, 14, 30][Math.min(Math.max(correctStreak - 1, 0), 4)];
  next.wordStats[attempt.wordId] = {
    attempts: previous.attempts + 1,
    correctCount: previous.correctCount + (attempt.correct ? 1 : 0),
    wrongCount: previous.wrongCount + (attempt.correct ? 0 : 1),
    assistedCount: previous.assistedCount + (attempt.hintUsed ? 1 : 0),
    correctStreak,
    lastAttemptAt: attempt.attemptedAt,
    nextReviewAt: attempt.correct ? addDays(attempt.attemptedAt, intervalDays) : attempt.attemptedAt,
  };
  if (!attempt.correct) {
    const existing = next.wrongWords[attempt.wordId];
    next.wrongWords[attempt.wordId] = {
      id: attempt.wordId,
      word: attempt.word,
      meaning: attempt.meaning ?? "",
      errorCount: (existing?.errorCount ?? 0) + 1,
      lastWrongAt: attempt.attemptedAt,
      active: true,
    };
  } else if (next.wrongWords[attempt.wordId] && correctStreak >= 3) {
    next.wrongWords[attempt.wordId].active = false;
    next.wrongWords[attempt.wordId].masteredAt = attempt.attemptedAt;
  }
}

export function rebuildDerivedProgress(progress) {
  const next = structuredClone(progress);
  next.wordStats = {};
  next.wrongWords = {};
  next.dismissedWrongWords ??= {};
  for (const session of next.sessions ?? []) {
    for (const attempt of session.attempts ?? []) {
      const cutoff = next.dismissedWrongWords[attempt.wordId];
      if (cutoff && attempt.attemptedAt <= cutoff) continue;
      applyHistoricalAttempt(next, attempt);
    }
  }
  return next;
}

export function deleteSession(progress, sessionId) {
  const next = structuredClone(progress);
  next.sessions = next.sessions.filter((session) => session.id !== sessionId);
  return rebuildDerivedProgress(next);
}

export function deleteWrongWord(progress, wordId, deletedAt = new Date().toISOString()) {
  const next = structuredClone(progress);
  next.dismissedWrongWords ??= {};
  next.dismissedWrongWords[wordId] = deletedAt;
  delete next.wordStats[wordId];
  delete next.wrongWords[wordId];
  return next;
}

export function summarizeSessions(progress, day) {
  const sessions = (progress.sessions ?? []).filter((session) => session.date === day);
  const attempts = sessions.flatMap((session) => session.attempts ?? []);
  return {
    sessions,
    attempts,
    tested: attempts.length,
    uniqueWords: new Set(attempts.map((attempt) => attempt.wordId)).size,
    correct: attempts.filter((attempt) => attempt.correct).length,
    wrong: attempts.filter((attempt) => !attempt.correct).length,
    hinted: attempts.filter((attempt) => attempt.hintUsed).length,
  };
}

export function summarizeSession(session) {
  const attempts = session?.attempts ?? [];
  return {
    tested: attempts.length,
    correct: attempts.filter((attempt) => attempt.correct).length,
    wrong: attempts.filter((attempt) => !attempt.correct).length,
    hinted: attempts.filter((attempt) => attempt.hintUsed).length,
    errors: attempts.filter((attempt) => !attempt.correct),
  };
}

export function formatDuration(startedAt, endedAt) {
  if (!startedAt) return "0分00秒";
  const milliseconds = Math.max(0, new Date(endedAt ?? startedAt).getTime() - new Date(startedAt).getTime());
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}

export function getLocalDateKey(value = new Date()) {
  return dateKey(value);
}
