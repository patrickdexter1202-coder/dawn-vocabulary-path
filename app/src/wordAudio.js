const ONLINE_TIMEOUT_MS = 3500;

export function getYoudaoAudioUrl(word) {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`;
}

export function createPronunciationPlayer({
  AudioCtor,
  speechSynthesis,
  UtteranceCtor,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  timeoutMs = ONLINE_TIMEOUT_MS,
}) {
  let currentAudio = null;
  let timeoutId = null;
  let stopped = false;
  let fallbackStarted = false;

  function clearOnlineTimeout() {
    if (timeoutId !== null) clearTimeoutFn(timeoutId);
    timeoutId = null;
  }

  function stop() {
    stopped = true;
    clearOnlineTimeout();
    if (currentAudio) {
      currentAudio.pause?.();
      currentAudio.removeAttribute?.("src");
      currentAudio.load?.();
    }
    speechSynthesis?.cancel?.();
  }

  function play({ word, rate = 1, onStart = () => {}, onEnd = () => {}, onError = () => {} }) {
    stop();
    stopped = false;
    fallbackStarted = false;

    const finishWithError = () => {
      if (stopped) return;
      clearOnlineTimeout();
      onError();
    };

    const playLocally = () => {
      if (stopped || fallbackStarted) return;
      fallbackStarted = true;
      clearOnlineTimeout();
      currentAudio?.pause?.();

      if (!speechSynthesis?.speak || !UtteranceCtor) {
        finishWithError();
        return;
      }

      speechSynthesis.cancel?.();
      const utterance = new UtteranceCtor(word);
      utterance.lang = "en-GB";
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.onstart = onStart;
      utterance.onend = onEnd;
      utterance.onerror = finishWithError;
      speechSynthesis.speak(utterance);
    };

    if (!AudioCtor) {
      playLocally();
      return;
    }

    currentAudio = new AudioCtor(getYoudaoAudioUrl(word));
    currentAudio.preload = "auto";
    currentAudio.playbackRate = rate;
    currentAudio.onplaying = () => {
      if (stopped || fallbackStarted) return;
      clearOnlineTimeout();
      onStart();
    };
    currentAudio.onended = () => {
      if (stopped) return;
      clearOnlineTimeout();
      onEnd();
    };
    currentAudio.onerror = playLocally;
    currentAudio.onstalled = playLocally;
    timeoutId = setTimeoutFn(playLocally, timeoutMs);

    try {
      const playResult = currentAudio.play();
      playResult?.catch?.(playLocally);
    } catch {
      playLocally();
    }
  }

  return {
    play,
    stop,
    get currentAudio() {
      return currentAudio;
    },
  };
}
