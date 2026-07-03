import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.jsx";
import { getLocalDateKey } from "./sessionPlanner.js";
import { grade6Words } from "./vocabulary.generated.js";
import { clearLocalDatabase } from "./localLibrary.js";

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
  }
}

class MockAudio {
  static instances = [];

  constructor(src) {
    this.src = src;
    this.pause = vi.fn();
    MockAudio.instances.push(this);
  }

  play() {
    this.onplaying?.();
    return Promise.resolve();
  }
}

describe("晨光词径每日学习会话", () => {
  beforeEach(async () => {
    await clearLocalDatabase();
    window.localStorage.clear();
    window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
    window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() };
    window.Audio = MockAudio;
    MockAudio.instances = [];
  });

  it("可预览并导入 CSV 到当前浏览器，随后用于学习", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开个人菜单" }));
    await user.click(screen.getByRole("button", { name: "本地词库与备份" }));
    const dialog = screen.getByRole("dialog", { name: "本地词库与备份" });
    const file = new File(["word,meaning,example\nsun,太阳,The sun is warm.\nmoon,月亮,The moon is bright."], "家庭天文词.csv", { type: "text/csv" });
    await user.upload(within(dialog).getByLabelText("选择词库文件"), file);

    expect(await within(dialog).findByText("导入预览")).toBeInTheDocument();
    expect(within(dialog).getByText("sun")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "导入 2 个词条" }));
    expect(await within(dialog).findByText(/已导入 2 个词条/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));

    const selector = screen.getByRole("combobox", { name: "选择词库" });
    expect(within(selector).getByRole("option", { name: /家庭天文词/ })).toBeInTheDocument();
    await user.selectOptions(selector, within(selector).getByRole("option", { name: /家庭天文词/ }));
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));
    expect(["sun", "moon"]).toContain(screen.getByTestId("current-word-value").textContent);
  });

  it("先选择词库，再点击按钮开始每日学习", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "开始今日学习" })).toBeInTheDocument();
    const selector = screen.getByRole("combobox", { name: "选择词库" });
    expect(selector).toHaveValue("bridge");
    expect(screen.queryByTestId("current-word-value")).not.toBeInTheDocument();

    await user.selectOptions(selector, "grade6");
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));

    expect(screen.getByText("六年级上册 · Unit 1")).toBeInTheDocument();
    expect(screen.getByText("本次 0/30")).toBeInTheDocument();
  });

  it("把今日会话与作答统计组织为同一组双列摘要", () => {
    const { container } = render(<App />);

    const summary = container.querySelector(".daily-primary-stats");
    expect(summary).toBeInTheDocument();
    expect(summary.children).toHaveLength(2);
    expect(summary).toHaveTextContent("今日学习");
    expect(summary).toHaveTextContent("0 次会话");
    expect(summary).toHaveTextContent("今日作答");
    expect(within(summary.children[1]).getByText("0", { selector: "strong" })).toBeInTheDocument();
    expect(summary).toHaveTextContent("次作答 · 0 个词");
  });

  it("显示陆梵，并省去音标旁的播放按钮", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("陆梵")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));

    expect(screen.queryByRole("button", { name: "播放音标发音" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放单词发音" })).toBeInTheDocument();
  });

  it("学习页不展示例句，并为跟读、默写和结果阶段提供布局状态", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));

    expect(screen.queryByRole("heading", { name: "例句" })).not.toBeInTheDocument();
    expect(container.querySelector(".example-block")).not.toBeInTheDocument();
    expect(container.querySelector(".study-layout")).toHaveClass("is-study");

    await user.click(screen.getByRole("button", { name: "我跟读好了，开始默写" }));

    expect(screen.getByRole("heading", { name: "默写小考察" })).toBeInTheDocument();
    expect(screen.getByTestId("word-answer-area")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("word-answer-area")).toHaveClass("is-concealed");
    expect(container.querySelector(".study-layout")).toHaveClass("is-dictation");

    await user.type(screen.getByRole("textbox", { name: "填写英文单词" }), "wrong");
    await user.click(screen.getByRole("button", { name: "检查答案" }));
    expect(container.querySelector(".study-layout")).toHaveClass("is-result");
  });

  it("优先使用有道在线发音并支持慢速", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));
    await user.click(screen.getByRole("button", { name: "0.75 倍慢速" }));
    await user.click(screen.getByRole("button", { name: "播放单词发音" }));

    expect(MockAudio.instances).toHaveLength(1);
    expect(MockAudio.instances[0].src).toContain("https://dict.youdao.com/dictvoice?");
    expect(MockAudio.instances[0].playbackRate).toBe(0.75);
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("跟读和答题结果阶段可按回车执行当前主操作", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));
    const firstWord = screen.getByTestId("current-word-value").textContent;

    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "默写小考察" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "填写英文单词" }), "wrong{Enter}");
    expect(screen.getByRole("heading", { name: "这次没写对，已经加入巩固清单。" })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "我跟读好了，开始默写" })).toBeInTheDocument();
    expect(screen.getByTestId("current-word-value").textContent).not.toBe(firstWord);
  });

  it("词库只有非错的已学词时不强行重复开启空白轮次", async () => {
    const user = userEvent.setup();
    const wordStats = Object.fromEntries(grade6Words.map((word) => [word.id, {
      attempts: 1,
      correctCount: 1,
      wrongCount: 0,
      assistedCount: 0,
      correctStreak: 1,
      lastAttemptAt: "2026-06-30T01:00:00.000Z",
      nextReviewAt: "2026-07-01T01:00:00.000Z",
    }]));
    window.localStorage.setItem("dawn-vocabulary-progress-v2", JSON.stringify({ version: 2, sessions: [], wordStats, wrongWords: {} }));
    render(<App />);
    await user.selectOptions(screen.getByRole("combobox", { name: "选择词库" }), "grade6");
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));

    expect(screen.getByRole("heading", { name: "开始今日学习" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("当前词库暂时没有新词或待巩固错词");
  });

  it("每次作答写入当前会话，并为家长保存错误单词明细", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));
    const wrongWord = screen.getByTestId("current-word-value").textContent;
    await user.click(screen.getByRole("button", { name: "我跟读好了，开始默写" }));
    await user.type(screen.getByRole("textbox", { name: "填写英文单词" }), "wrong");
    await user.click(screen.getByRole("button", { name: "检查答案" }));

    expect(screen.getByText("本次 1/30")).toBeInTheDocument();
    expect(screen.getByText("今日 1 次作答")).toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem("dawn-vocabulary-progress-v2"));
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].attempts[0]).toMatchObject({ word: wrongWord, correct: false });
    expect(saved.wordStats[saved.sessions[0].attempts[0].wordId].wrongCount).toBe(1);

    await user.click(screen.getByRole("button", { name: "打开个人菜单" }));
    await user.click(screen.getByRole("button", { name: "学习记录" }));
    expect(screen.getByRole("heading", { name: "今日学习记录" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开第 1 次学习明细" }));
    const recordDialog = screen.getByRole("dialog", { name: "今日学习记录" });
    expect(within(recordDialog).getByText(wrongWord)).toBeInTheDocument();
    expect(within(recordDialog).getByText("错误")).toBeInTheDocument();
  });

  it("同一天可结束当前会话并再次开始，分别保存开始和结束时间", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));
    await user.click(screen.getByRole("button", { name: "结束本次学习" }));
    expect(screen.getByRole("heading", { name: "本次学习已记录" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再开始一次" }));
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));

    const saved = JSON.parse(window.localStorage.getItem("dawn-vocabulary-progress-v2"));
    expect(saved.sessions).toHaveLength(2);
    expect(saved.sessions[0].startedAt).toBeTruthy();
    expect(saved.sessions[0].endedAt).toBeTruthy();
    expect(saved.sessions[1].startedAt).toBeTruthy();
    expect(saved.sessions[1].endedAt).toBeNull();
  });

  it("长单词使用紧凑字号，避免延展到播放区域", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("dawn-vocabulary-progress-v2", JSON.stringify({
      version: 2,
      sessions: [],
      wordStats: {
        "primary-0176": { attempts: 3, correctCount: 0, wrongCount: 3, assistedCount: 0, correctStreak: 0, nextReviewAt: "2099-01-01T00:00:00.000Z" },
      },
      wrongWords: {},
    }));
    render(<App />);
    await user.selectOptions(screen.getByRole("combobox", { name: "选择词库" }), "primary");
    await user.click(screen.getByRole("button", { name: "开始本次学习" }));

    expect(screen.getByRole("heading", { name: "grandmother" })).toHaveClass("is-long");
  });

  it("学习记录第一层只显示答对答错，展开后显示每个单词结果", async () => {
    const user = userEvent.setup();
    const day = getLocalDateKey();
    window.localStorage.setItem("dawn-vocabulary-progress-v2", JSON.stringify({
      version: 2,
      sessions: [{
        id: "saved-session",
        date: day,
        libraryId: "bridge",
        startedAt: `${day}T01:00:00.000Z`,
        endedAt: `${day}T01:10:00.000Z`,
        plannedWordIds: ["grade6-u1-001", "grade6-u1-002"],
        attempts: [
          { wordId: "grade6-u1-001", word: "life", meaning: "生活", answer: "life", correct: true, hintUsed: false, attemptedAt: `${day}T01:01:00.000Z` },
          { wordId: "grade6-u1-002", word: "break", meaning: "休息", answer: "brek", correct: false, hintUsed: false, attemptedAt: `${day}T01:02:00.000Z` },
        ],
      }],
      wordStats: {},
      wrongWords: { "grade6-u1-002": { id: "grade6-u1-002", word: "break", meaning: "休息", errorCount: 1, active: true } },
    }));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "打开个人菜单" }));
    await user.click(screen.getByRole("button", { name: "学习记录" }));

    const recordDialog = screen.getByRole("dialog", { name: "今日学习记录" });
    expect(within(recordDialog).getByText("答对")).toBeInTheDocument();
    expect(within(recordDialog).getByText("答错")).toBeInTheDocument();
    expect(within(recordDialog).queryByText("作答次数")).not.toBeInTheDocument();
    expect(within(recordDialog).queryByText("life")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开第 1 次学习明细" }));
    expect(screen.getByText("life")).toBeInTheDocument();
    expect(screen.getByText("break")).toBeInTheDocument();
    expect(screen.getByText("正确")).toBeInTheDocument();
    expect(screen.getByText("错误")).toBeInTheDocument();
  });

  it("删除学习会话必须输入家长密码，并在删除后重算记录", async () => {
    const user = userEvent.setup();
    const day = getLocalDateKey();
    window.localStorage.setItem("dawn-vocabulary-progress-v2", JSON.stringify({
      version: 2,
      sessions: [{ id: "delete-session", date: day, libraryId: "bridge", startedAt: `${day}T01:00:00.000Z`, endedAt: `${day}T01:10:00.000Z`, plannedWordIds: [], attempts: [] }],
      wordStats: {},
      wrongWords: {},
    }));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "打开个人菜单" }));
    await user.click(screen.getByRole("button", { name: "学习记录" }));
    await user.click(screen.getByRole("button", { name: "展开第 1 次学习明细" }));
    await user.click(screen.getByRole("button", { name: "删除本次记录" }));

    const passwordInput = screen.getByLabelText("家长密码");
    await user.type(passwordInput, "wrong");
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.getByText("密码不正确")).toBeInTheDocument();

    await user.clear(passwordInput);
    await user.type(passwordInput, "99bill");
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.queryByRole("button", { name: "展开第 1 次学习明细" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("dawn-vocabulary-progress-v2")).sessions).toHaveLength(0);
  });

  it("删除错词也必须通过家长密码，并清除其强制复习统计", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("dawn-vocabulary-progress-v2", JSON.stringify({
      version: 2,
      sessions: [],
      wordStats: { "grade6-u1-002": { attempts: 3, correctCount: 0, wrongCount: 3, correctStreak: 0 } },
      wrongWords: { "grade6-u1-002": { id: "grade6-u1-002", word: "break", meaning: "休息", errorCount: 3, active: true } },
    }));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "打开个人菜单" }));
    await user.click(screen.getByRole("button", { name: "错词巩固" }));
    await user.click(screen.getByRole("button", { name: "删除错词 break" }));
    await user.type(screen.getByLabelText("家长密码"), "99bill");
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByText("break")).not.toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem("dawn-vocabulary-progress-v2"));
    expect(saved.wrongWords["grade6-u1-002"]).toBeUndefined();
    expect(saved.wordStats["grade6-u1-002"]).toBeUndefined();
  });
});
