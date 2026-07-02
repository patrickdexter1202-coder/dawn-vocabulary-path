import { describe, expect, it, vi } from "vitest";
import { createPronunciationPlayer, getYoudaoAudioUrl } from "./wordAudio.js";

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

function makeAudio({ rejects = false } = {}) {
  return class FakeAudio {
    constructor(src) {
      this.src = src;
      this.pause = vi.fn();
      this.play = vi.fn(() => {
        if (rejects) return Promise.reject(new Error("offline"));
        this.onplaying?.();
        return Promise.resolve();
      });
    }
  };
}

describe("word pronunciation", () => {
  it("builds an encoded Youdao British-pronunciation URL", () => {
    expect(getYoudaoAudioUrl("ice cream")).toBe(
      "https://dict.youdao.com/dictvoice?audio=ice%20cream&type=1",
    );
  });

  it("prefers online audio and applies the selected speed", async () => {
    const AudioCtor = makeAudio();
    const speechSynthesis = { cancel: vi.fn(), speak: vi.fn() };
    const player = createPronunciationPlayer({ AudioCtor, speechSynthesis, UtteranceCtor: FakeUtterance });

    player.play({ word: "morning", rate: 0.75 });
    await Promise.resolve();

    expect(player.currentAudio.src).toContain("audio=morning&type=1");
    expect(player.currentAudio.playbackRate).toBe(0.75);
    expect(speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("falls back to local browser speech when online playback fails", async () => {
    const speechSynthesis = { cancel: vi.fn(), speak: vi.fn() };
    const player = createPronunciationPlayer({
      AudioCtor: makeAudio({ rejects: true }),
      speechSynthesis,
      UtteranceCtor: FakeUtterance,
    });

    player.play({ word: "morning", rate: 0.75 });
    await Promise.resolve();
    await Promise.resolve();

    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    expect(speechSynthesis.speak.mock.calls[0][0]).toMatchObject({
      text: "morning",
      lang: "en-GB",
      rate: 0.75,
    });
  });
});
