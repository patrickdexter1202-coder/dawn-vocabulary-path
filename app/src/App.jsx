import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  LightbulbIcon,
  SpeakerHighIcon,
  SunHorizonIcon,
  XIcon,
} from "@phosphor-icons/react";
import { grade6Words, primaryWords, vocabularyMetadata } from "./vocabulary.generated.js";
import {
  DEFAULT_SESSION_SIZE,
  LEGACY_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  buildSessionPlan,
  deleteSession,
  deleteWrongWord,
  finishSession,
  formatDuration,
  getLocalDateKey,
  getSessionHistoryRange,
  migrateProgress,
  recordAttempt,
  startSession,
  shiftDateKey,
  summarizeSession,
  summarizeSessions,
} from "./sessionPlanner.js";
import { createPronunciationPlayer } from "./wordAudio.js";
import { listCustomLibraries } from "./localLibrary.js";
import { LocalDataPanel } from "./LocalDataPanel.jsx";

const PARENT_DELETE_PASSWORD = "99bill";

const LIBRARIES = {
  bridge: { label: "衔接混合", description: "小学基准 + 六年级新词" },
  primary: { label: "小学基准", description: `${vocabularyMetadata.primaryCount} 条课标基准` },
  grade6: { label: "六年级新词", description: `${vocabularyMetadata.grade6Count} 条可核实词` },
};

function normalizeAnswer(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeVocabulary() {
  const map = new Map();
  for (const word of [...grade6Words, ...primaryWords]) {
    const key = normalizeAnswer(word.word);
    if (!map.has(key)) {
      map.set(key, { ...word });
      continue;
    }
    const existing = map.get(key);
    existing.libraries = [...new Set([...existing.libraries, ...word.libraries])];
  }
  return [...map.values()];
}

const POOLS = {
  bridge: mergeVocabulary(),
  primary: primaryWords,
  grade6: grade6Words,
};

function loadProgress() {
  try {
    const current = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY));
    if (current) return migrateProgress(current);
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    return migrateProgress(legacy);
  } catch {
    return migrateProgress(null);
  }
}

function makeHint(word) {
  return word
    .split(" ")
    .map((part) => {
      const letters = [...part];
      const indexes = letters.map((letter, index) => (/^[a-z]$/i.test(letter) ? index : -1)).filter((index) => index >= 0);
      return letters.map((letter, index) => {
        if (!/^[a-z]$/i.test(letter)) return letter;
        return index === indexes[0] || index === indexes.at(-1) ? letter : "_";
      }).join(" ");
    })
    .join("   ");
}

function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function SelectLibrary({ libraryId, onChange, customLibraries }) {
  return (
    <label className="library-control">
      <span>本次使用词库</span>
      <span className="select-shell">
        <select aria-label="选择词库" value={libraryId} onChange={onChange}>
          {Object.entries(LIBRARIES).map(([id, item]) => (
            <option key={id} value={id}>{item.label} · {item.description}</option>
          ))}
          {customLibraries.map((library) => (
            <option key={library.id} value={library.id}>{library.name} · {library.entries.length} 个本地词</option>
          ))}
        </select>
        <CaretDownIcon className="select-caret" aria-hidden="true" weight="bold" />
      </span>
    </label>
  );
}

function DailyOverview({ todayStats, activeSession, sessionSize, onFinish }) {
  const current = summarizeSession(activeSession);
  return (
    <aside className="round-panel daily-panel" aria-label="今日和本次学习进度">
      <div className="daily-primary-stats">
        <section className="daily-primary-stat daily-session-stat" aria-label={`今日学习 ${todayStats.sessions.length} 次会话`}>
          <p className="eyebrow">今日学习</p>
          <h2>{todayStats.sessions.length} 次会话</h2>
        </section>
        <section className="daily-primary-stat daily-answer-stat" aria-label={`今日作答 ${todayStats.tested} 次，${todayStats.uniqueWords} 个词`}>
          <p className="eyebrow">今日作答</p>
          <div className="daily-score">
            <strong>{todayStats.tested}</strong>
            <span>次作答 · {todayStats.uniqueWords} 个词</span>
          </div>
        </section>
      </div>
      <dl className="daily-breakdown">
        <div><dt>答对</dt><dd>{todayStats.correct}</dd></div>
        <div><dt>答错</dt><dd>{todayStats.wrong}</dd></div>
        <div><dt>提示</dt><dd>{todayStats.hinted}</dd></div>
      </dl>
      {activeSession && (
        <div className="session-progress-card">
          <span>本次进度</span>
          <strong>{current.tested}/{sessionSize}</strong>
          <div className="progress-track"><i style={{ width: `${Math.min(100, (current.tested / sessionSize) * 100)}%` }} /></div>
          <button className="end-session-button" type="button" onClick={onFinish}>结束本次学习</button>
        </div>
      )}
    </aside>
  );
}

function StartScreen({ libraryId, onLibraryChange, onStart, todayStats, customLibraries }) {
  return (
    <>
      <DailyOverview todayStats={todayStats} activeSession={null} sessionSize={DEFAULT_SESSION_SIZE} />
      <section className="start-panel" aria-labelledby="start-title">
        <p className="eyebrow">DAILY SESSION</p>
        <h1 id="start-title">开始今日学习</h1>
        <p className="start-copy">系统会把高频错词、到期复习词和新词动态混合。每天可以开始多次，每次独立记录。</p>
        <SelectLibrary libraryId={libraryId} onChange={onLibraryChange} customLibraries={customLibraries} />
        <button className="start-button" type="button" aria-label="开始本次学习" onClick={onStart}>
          <span>开始本次学习</span><ArrowRightIcon weight="regular" />
        </button>
      </section>
      <section className="method-panel" aria-label="今日选词方法">
        <p className="eyebrow">智能配词</p>
        <h2>先巩固，再拓新</h2>
        <ol>
          <li><strong>必复习</strong><span>高频错词与到期词优先</span></li>
          <li><strong>再强化</strong><span>提示多、正确率低的词</span></li>
          <li><strong>学新词</strong><span>补足基础 30 词计划</span></li>
        </ol>
        <p>高频错词全部进入本次计划，不受 30 词上限影响；连续正确 3 次后转入 1、3、7、14、30 天间隔复习。</p>
      </section>
    </>
  );
}

function SummaryPanel({ kind, progress, today, onClose, onRequestDelete }) {
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const historyRange = getSessionHistoryRange(today);
  const selectedStats = summarizeSessions(progress, selectedDate);
  const allWrongWords = Object.values(progress.wrongWords ?? {}).sort((left, right) => right.errorCount - left.errorCount);
  const sessionsNewestFirst = [...selectedStats.sessions].reverse();
  const isToday = selectedDate === today;

  function changeRecordDate(nextDate) {
    if (nextDate < historyRange.min || nextDate > historyRange.max) return;
    setSelectedDate(nextDate);
    setExpandedSessionId(null);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="summary-panel" role="dialog" aria-modal="true" aria-labelledby="summary-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" aria-label="关闭" onClick={onClose}><XIcon weight="bold" /></button>
        {kind === "records" ? (
          <>
            <p className="eyebrow">近 90 天 · 当前浏览器</p>
            <h2 id="summary-title">{isToday ? "今日学习记录" : `${selectedDate} 学习记录`}</h2>
            <div className="record-date-navigation" aria-label="学习记录日期导航">
              <button type="button" aria-label="前一天" onClick={() => changeRecordDate(shiftDateKey(selectedDate, -1))} disabled={selectedDate === historyRange.min}><CaretLeftIcon weight="bold" /></button>
              <label><span className="sr-only">查询学习记录日期</span><input type="date" aria-label="查询学习记录日期" min={historyRange.min} max={historyRange.max} value={selectedDate} onChange={(event) => changeRecordDate(event.target.value)} /></label>
              <button type="button" aria-label="后一天" onClick={() => changeRecordDate(shiftDateKey(selectedDate, 1))} disabled={isToday}><CaretRightIcon weight="bold" /></button>
              <span className={`record-date-badge${isToday ? " is-today" : ""}`}>{isToday ? "今天" : `${selectedStats.sessions.length} 次学习`}</span>
            </div>
            <div className="record-grid is-compact">
              <div><strong>{selectedStats.correct}</strong><span>答对</span></div>
              <div><strong>{selectedStats.wrong}</strong><span>答错</span></div>
            </div>
            <div className="session-history">
              {sessionsNewestFirst.length ? sessionsNewestFirst.map((session, reverseIndex) => {
                const summary = summarizeSession(session);
                const order = selectedStats.sessions.length - reverseIndex;
                const expanded = expandedSessionId === session.id;
                return (
                  <article key={session.id} className="session-history-item">
                    <button
                      className="session-summary-button"
                      type="button"
                      aria-label={`${expanded ? "收起" : "展开"}第 ${order} 次学习明细`}
                      aria-expanded={expanded}
                      onClick={() => setExpandedSessionId(expanded ? null : session.id)}
                    >
                      <span><strong>第 {order} 次 · {LIBRARIES[session.libraryId]?.label ?? "历史学习"}</strong><small>{formatTime(session.startedAt)} 开始 · {formatDuration(session.startedAt, session.endedAt ?? new Date().toISOString())}</small></span>
                      <span className="session-summary-counts">答对 {summary.correct} · 答错 {summary.wrong}<CaretDownIcon weight="bold" /></span>
                    </button>
                    {expanded && (
                      <div className="session-detail">
                        <ul className="session-word-list">
                          {(session.attempts ?? []).map((attempt, index) => (
                            <li key={`${attempt.wordId}-${index}`} className={attempt.correct ? "is-correct" : "is-wrong"}>
                              <strong>{attempt.word}</strong>
                              <span>{attempt.meaning}</span>
                              <b>{attempt.correct ? "正确" : "错误"}</b>
                              <small>{attempt.correct ? `填写：${attempt.answer}` : `填写：${attempt.answer} · 正确：${attempt.word}`} · {formatTime(attempt.attemptedAt)}</small>
                            </li>
                          ))}
                        </ul>
                        {session.endedAt && <button className="delete-record-button" type="button" onClick={() => onRequestDelete({ kind: "session", id: session.id, label: `第 ${order} 次学习记录` })}>删除本次记录</button>}
                      </div>
                    )}
                  </article>
                );
              }) : <p className="empty-state">{isToday ? "今天还没有开始学习。" : "这一天还没有学习记录。"}</p>}
            </div>
            <p className="panel-note">可查询最近 90 天；所有会话、时间和错误明细仅保存在当前浏览器中，不会上传 GitHub。</p>
          </>
        ) : (
          <>
            <p className="eyebrow">历史错误 · 自动去重</p>
            <h2 id="summary-title">错词巩固清单</h2>
            <p className="wrong-count">待巩固 {allWrongWords.filter((item) => item.active !== false).length} 个</p>
            {allWrongWords.length ? (
              <ul className="wrong-list">
                {allWrongWords.map((item) => <li key={item.id}><strong>{item.word}</strong><span>{item.meaning}</span><small>累计答错 {item.errorCount} 次 · {item.active === false ? "已稳定" : "待巩固"}</small><button className="wrong-delete-button" type="button" aria-label={`删除错词 ${item.word}`} onClick={() => onRequestDelete({ kind: "wrong", id: item.id, label: `错词 ${item.word}` })}>删除</button></li>)}
              </ul>
            ) : <p className="empty-state">还没有错词，保持这个漂亮的开局。</p>}
          </>
        )}
      </section>
    </div>
  );
}

function PasswordConfirm({ request, onCancel, onConfirm }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (password !== PARENT_DELETE_PASSWORD) {
      setError("密码不正确");
      return;
    }
    onConfirm(request);
  }

  return (
    <div className="modal-backdrop password-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="password-panel" role="dialog" aria-modal="true" aria-labelledby="password-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="eyebrow">PARENT CHECK</p>
        <h2 id="password-title">家长验证</h2>
        <p>删除“{request.label}”后不可撤销，请输入家长密码。</p>
        <form onSubmit={submit}>
          <label htmlFor="parent-password">家长密码</label>
          <input id="parent-password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoFocus />
          {error && <span className="password-error" role="alert">{error}</span>}
          <div><button className="secondary-button" type="button" onClick={onCancel}>取消</button><button className="danger-button" type="submit">确认删除</button></div>
        </form>
      </section>
    </div>
  );
}

function SessionComplete({ session, onAgain, onRecords }) {
  const summary = summarizeSession(session);
  return (
    <section className="complete-panel" aria-labelledby="complete-title">
      <CheckCircleIcon weight="fill" />
      <p className="eyebrow">SESSION SAVED</p>
      <h1 id="complete-title">本次学习已记录</h1>
      <p>{formatTime(session?.startedAt)} 开始 · 用时 {formatDuration(session?.startedAt, session?.endedAt)}</p>
      <div className="complete-stats"><span>作答 <strong>{summary.tested}</strong></span><span>答对 <strong>{summary.correct}</strong></span><span>答错 <strong>{summary.wrong}</strong></span></div>
      <div className="complete-actions">
        <button className="start-button" type="button" onClick={onAgain}>再开始一次</button>
        <button className="secondary-button" type="button" onClick={onRecords}>查看学习记录</button>
      </div>
    </section>
  );
}

export function App() {
  const [libraryId, setLibraryId] = useState("bridge");
  const [screen, setScreen] = useState("ready");
  const [sessionWords, setSessionWords] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [phase, setPhase] = useState("study");
  const [answer, setAnswer] = useState("");
  const [hintUsed, setHintUsed] = useState(false);
  const [result, setResult] = useState(null);
  const [rate, setRate] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [summaryKind, setSummaryKind] = useState(null);
  const [localDataOpen, setLocalDataOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState(loadProgress);
  const [customLibraries, setCustomLibraries] = useState([]);
  const noticeTimer = useRef(null);
  const pronunciationPlayer = useRef(null);
  const today = getLocalDateKey();
  const todayStats = useMemo(() => summarizeSessions(progress, today), [progress, today]);
  const activeSession = progress.sessions.find((session) => session.id === sessionId);
  const sessionStats = summarizeSession(activeSession);
  const currentWord = sessionWords[wordIndex];
  const concealAnswer = screen === "study" && phase === "dictation";

  useEffect(() => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    let active = true;
    listCustomLibraries()
      .then((libraries) => { if (active) setCustomLibraries(libraries); })
      .catch(() => { if (active) showNotice("无法读取当前浏览器的自定义词库"); });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    window.clearTimeout(noticeTimer.current);
    pronunciationPlayer.current?.stop();
  }, []);

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2200);
  }

  function resetExercise() {
    setPhase("study");
    setAnswer("");
    setHintUsed(false);
    setResult(null);
  }

  function beginSession() {
    const startedAt = new Date().toISOString();
    const customLibrary = customLibraries.find((library) => library.id === libraryId);
    const pool = POOLS[libraryId] ?? customLibrary?.entries.map((entry) => ({ ...entry, libraries: [libraryId] })) ?? [];
    const plan = buildSessionPlan({ pool, progress, now: new Date(startedAt), size: DEFAULT_SESSION_SIZE });
    if (!plan.length) {
      showNotice("当前词库暂时没有新词或待巩固错词");
      return;
    }
    const started = startSession(progress, { libraryId, plannedWordIds: plan.map((word) => word.id), startedAt });
    setProgress(started.progress);
    setSessionId(started.sessionId);
    setSessionWords(plan);
    setWordIndex(0);
    resetExercise();
    setScreen("study");
  }

  function endCurrentSession() {
    if (!sessionId) return;
    setProgress((previous) => finishSession(previous, sessionId, new Date().toISOString()));
    pronunciationPlayer.current?.stop();
    setScreen("complete");
  }

  function playWord() {
    if (!currentWord) return;
    if (!pronunciationPlayer.current) {
      pronunciationPlayer.current = createPronunciationPlayer({
        AudioCtor: window.Audio,
        speechSynthesis: window.speechSynthesis,
        UtteranceCtor: window.SpeechSynthesisUtterance,
      });
    }
    pronunciationPlayer.current.play({
      word: currentWord.word,
      rate,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => {
        setIsSpeaking(false);
        showNotice("在线和本地语音都无法播放，请检查网络或系统语音设置");
      },
    });
  }

  function checkAnswer(event) {
    event.preventDefault();
    if (!answer.trim()) {
      showNotice("先写下你的答案吧");
      return;
    }
    const correct = normalizeAnswer(answer) === normalizeAnswer(currentWord.answer || currentWord.word);
    const attemptedAt = new Date().toISOString();
    setResult(correct ? "correct" : "wrong");
    setPhase("result");
    setProgress((previous) => recordAttempt(previous, { sessionId, word: currentWord, answer: answer.trim(), correct, hintUsed, attemptedAt }));
  }

  function goToNextWord() {
    pronunciationPlayer.current?.stop();
    setIsSpeaking(false);
    if (wordIndex < sessionWords.length - 1) {
      setWordIndex((index) => index + 1);
      resetExercise();
    } else {
      endCurrentSession();
    }
  }

  useEffect(() => {
    function handleEnter(event) {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (screen !== "study" || summaryKind || localDataOpen || deleteRequest || profileOpen) return;
      const target = event.target instanceof window.Element ? event.target : null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;

      if (phase === "study") {
        event.preventDefault();
        setPhase("dictation");
      } else if (phase === "result") {
        event.preventDefault();
        goToNextWord();
      }
    }

    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [screen, phase, summaryKind, localDataOpen, deleteRequest, profileOpen, wordIndex, sessionWords.length, sessionId]);

  function prepareAnotherSession() {
    setScreen("ready");
    setSessionId(null);
    setSessionWords([]);
    setWordIndex(0);
    resetExercise();
  }

  function confirmDelete(request) {
    if (request.kind === "session") {
      setProgress((previous) => deleteSession(previous, request.id));
    } else {
      setProgress((previous) => deleteWrongWord(previous, request.id));
    }
    setDeleteRequest(null);
  }

  function wordSizeClass(word) {
    if (word.length >= 16) return "is-extra-long";
    if (word.length >= 10) return "is-long";
    return "";
  }

  return (
    <main className="study-page">
      <header className="topbar">
        <a className="brand" href="#study" aria-label="晨光词径首页"><span className="brand-cn">晨光词径</span><span className="brand-en">DAWN VOCABULARY PATH</span></a>

        <div className="today-stats" aria-label="今日和本次学习统计">
          {screen === "study" && <span>本次 {sessionStats.tested}/{sessionWords.length}</span>}
          <span>今日 {todayStats.tested} 次作答</span>
          <span>今日错词 {todayStats.wrong} 个</span>
        </div>

        <div className="profile-wrap">
          <button className="profile-button" type="button" aria-label="打开个人菜单" aria-expanded={profileOpen} aria-controls="profile-menu" onClick={() => setProfileOpen((open) => !open)}>
            <span className="avatar">陆梵</span><CaretDownIcon aria-hidden="true" weight="bold" />
          </button>
          {profileOpen && (
            <nav className="profile-menu" id="profile-menu" aria-label="个人菜单">
              <a href="#study" onClick={() => setProfileOpen(false)}>今日学习</a>
              <button type="button" onClick={() => { setProfileOpen(false); setSummaryKind("records"); }}>学习记录</button>
              <button type="button" onClick={() => { setProfileOpen(false); setSummaryKind("wrong"); }}>错词巩固</button>
              <button type="button" onClick={() => { setProfileOpen(false); setLocalDataOpen(true); }}>本地词库与备份</button>
            </nav>
          )}
        </div>
      </header>

      <div className={`study-layout${screen === "ready" ? " is-start" : ""}${screen === "complete" ? " is-complete" : ""}${screen === "study" ? ` is-${phase}` : ""}`} id="study">
        {screen === "ready" && <StartScreen libraryId={libraryId} onLibraryChange={(event) => setLibraryId(event.target.value)} onStart={beginSession} todayStats={todayStats} customLibraries={customLibraries} />}

        {screen === "study" && currentWord && (
          <>
            <DailyOverview todayStats={todayStats} activeSession={activeSession} sessionSize={sessionWords.length} onFinish={endCurrentSession} />
            <section className="word-panel" aria-label={concealAnswer ? "默写中，答案信息已隐藏" : currentWord.word}>
              <div className="set-pill"><BookOpenIcon aria-hidden="true" weight="regular" /><span>{currentWord.unitLabel}</span><span aria-hidden="true">·</span><strong>{wordIndex + 1}/{sessionWords.length}</strong></div>
              <div className="word-content-shell">
                <div
                  className={`word-content${concealAnswer ? " is-concealed" : ""}`}
                  data-testid="word-answer-area"
                  aria-hidden={concealAnswer}
                  key={`${sessionId}-${wordIndex}`}
                >
                  <h1 id="current-word" className={wordSizeClass(currentWord.word)} data-testid="current-word-value">{currentWord.word}</h1>
                  <div className="pronunciation-row"><span>{currentWord.phonetic || "/待补充/"}</span></div>
                  <p className="meaning">{currentWord.meaning}</p>
                  <p className="source-note">{currentWord.sourceType}</p>
                </div>
                {concealAnswer && <div className="conceal-message"><LightbulbIcon weight="regular" /><strong>默写中，答案已隐藏</strong><span>提交后会重新显示</span></div>}
              </div>
            </section>

            {phase === "study" ? (
              <section className="action-panel" aria-label="跟读操作">
                <button className={`play-button${isSpeaking ? " is-speaking" : ""}`} type="button" aria-label="播放单词发音" onClick={playWord}><SpeakerHighIcon aria-hidden="true" weight="fill" /></button>
                <p className="play-caption" aria-live="polite">{isSpeaking ? "正在播放单词发音" : "播放单词发音"}</p>
                <div className="speed-control" aria-label="发音速度">
                  <button type="button" aria-label="1.0 倍正常" aria-pressed={rate === 1} onClick={() => setRate(1)}><strong>1.0x</strong><span>正常</span></button>
                  <button type="button" aria-label="0.75 倍慢速" aria-pressed={rate === 0.75} onClick={() => setRate(0.75)}><strong>0.75x</strong><span>慢速</span></button>
                </div>
                <button className="next-button" type="button" aria-label="我跟读好了，开始默写" onClick={() => setPhase("dictation")}><span>我跟读好了</span><ArrowRightIcon aria-hidden="true" weight="regular" /></button>
                <p className="next-hint">下一步：看中文，写出英文</p>
              </section>
            ) : (
              <section className="action-panel dictation-panel" aria-label="默写操作">
                <div className="dictation-card">
                  <p className="eyebrow">主动回忆 · 第 {wordIndex + 1} 词</p>
                  <h2>默写小考察</h2>
                  <p className="dictation-meaning">{currentWord.meaning}</p>
                  {phase === "dictation" ? (
                    <form onSubmit={checkAnswer}>
                      <label htmlFor="spelling-answer">看中文，填写英文</label>
                      <input id="spelling-answer" aria-label="填写英文单词" value={answer} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck="false" autoFocus />
                      {hintUsed && <p className="letter-hint">提示：{makeHint(currentWord.word)}</p>}
                      <div className="dictation-actions"><button className="hint-button" type="button" aria-label="给我一点字母提示" onClick={() => setHintUsed(true)} disabled={hintUsed}><LightbulbIcon weight="regular" />给一点提示</button><button className="check-button" type="submit">检查答案</button></div>
                    </form>
                  ) : (
                    <div className={`answer-result is-${result}`} aria-live="polite"><CheckCircleIcon weight={result === "correct" ? "fill" : "regular"} /><h3>{result === "correct" ? "写对了，很稳。" : "这次没写对，已经加入巩固清单。"}</h3><p>正确答案是 <strong>{currentWord.word}</strong></p><button className="check-button" type="button" aria-label="进入下一个单词" onClick={goToNextWord}>进入下一个单词</button></div>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {screen === "complete" && (
          <>
            <DailyOverview todayStats={todayStats} activeSession={null} sessionSize={DEFAULT_SESSION_SIZE} />
            <SessionComplete session={activeSession} onAgain={prepareAnotherSession} onRecords={() => setSummaryKind("records")} />
          </>
        )}
      </div>

      <footer className="study-tip"><SunHorizonIcon aria-hidden="true" weight="regular" /><span>{screen === "ready" ? "每次学习都按历史表现重新配词。" : "先跟读，再默写；错过的词会回来找你。"}</span></footer>
      {summaryKind && <SummaryPanel kind={summaryKind} progress={progress} today={today} onClose={() => setSummaryKind(null)} onRequestDelete={setDeleteRequest} />}
      {localDataOpen && <LocalDataPanel progress={progress} onClose={() => setLocalDataOpen(false)} onLibrariesChanged={(libraries) => { setCustomLibraries(libraries); if (libraryId !== "bridge" && !POOLS[libraryId] && !libraries.some((library) => library.id === libraryId)) setLibraryId("bridge"); }} onProgressRestored={(restoredProgress) => { setProgress(migrateProgress(restoredProgress)); prepareAnotherSession(); }} />}
      {deleteRequest && <PasswordConfirm request={deleteRequest} onCancel={() => setDeleteRequest(null)} onConfirm={confirmDelete} />}
      <div className={`toast${notice ? " is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}
