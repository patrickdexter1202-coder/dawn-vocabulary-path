# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable product decisions

- 单词朗读优先调用有道在线英音音频（`dictvoice`，`type=1`）；3.5 秒未开始、加载或播放失败时，自动回退到浏览器/系统的 `speechSynthesis` 英文语音。在线音频与本地语音都服从页面的正常/慢速设置。

- Default vocabulary is `衔接混合`: verified Grade 6 Unit 1 words first, then deduplicated primary-baseline words.
- A Grade 6 label requires an explicit textbook version, book, and unit source. Never infer Grade 6 merely from “not in the primary baseline”.
- The current pilot contains 498 primary-baseline records and 44 deduplicated Grade 6 Unit 1 study entries.
- Each word follows `跟读 → 看中文默写 → 结果`; wrong answers enter a deduplicated local consolidation list.
- Pilot progress is local-only under `dawn-vocabulary-progress-v2`, with automatic migration from v1; do not imply cloud sync or cross-device migration.
- Custom vocabulary uses IndexedDB with stable word IDs, transactional import, archive semantics, and JSON backup/restore; do not store growing libraries as one localStorage JSON blob.
- The implemented vocabulary import contract is `docs/vocabulary-import-format-v1.md`: `word` and `meaning` are required; currently persisted optional fields are `answer`, `phonetic`, `example`, `unit`, `source`, and `tags`.
- Current deployment scope is a public GitHub Pages site with no accounts, backend, cloud database, or cross-device synchronization. Learning records and custom libraries stay in the current browser.
- Production URL is `https://patrickdexter1202-coder.github.io/dawn-vocabulary-path/`; repository is public and deploys from `main` through `.github/workflows/deploy-pages.yml`.
- iPhone support means responsive Safari access to the HTML page, not an IPA, Capacitor wrapper, or SwiftUI app. Preserve the existing 920px/680px/390px responsive breakpoints and require real-device Safari QA before claiming full iPhone support.
- Keep the existing Dawn Vocabulary Path visual system and responsive layouts when extending functionality.
- A study run is an explicit session: select a library, start, learn, then finish. Store each session's start/end time and attempts under `dawn-vocabulary-progress-v2`.
- Session planning priority is active high-frequency errors, due active errors, other active errors, then unseen words. Active high-frequency errors are mandatory and may expand a session beyond the 30-word baseline.
- During dictation input, conceal the answer-side word content both visually and from accessibility APIs; reveal it again after submission.
- Parent-facing records must preserve per-session error words, submitted answers, and timestamps.
- Within each planning priority, avoid alphabetical delivery: shuffle first, then retain only meaningful weakness/due-date ordering.
- A learned word with no error history must not appear in later sessions, even when its old review date arrives. Do not use correct-only words to fill a session to 30.
- If a library has neither unseen words nor active errors, remain on the start screen and explain that there are no new or consolidation words.
- While taking words from a candidate group, prefer an item with a different initial from the previous word whenever one is available.
- On the study screen, Enter advances from read-aloud to dictation and from result to the next word. Never intercept Enter from form controls, links, buttons, menus, or modals.
- Long vocabulary must never collide with the playback column; use tiered typography, safe wrapping, and the smaller primary playback control.
- Learning records use two levels: first-level correct/wrong summaries, then an expandable full per-word attempt list.
- Deleting one ended session or one wrong-word state requires the local parent password `99bill`. Session deletion rebuilds derived statistics; wrong-word deletion preserves historical sessions but dismisses old forced-review state.
- Learning records open on today and allow browser-local queries across today plus the previous 89 days. Keep older stored sessions intact so cumulative review statistics and complete backups are not silently damaged; do not imply that the 90-day UI window uploads or syncs data.
- On mobile, the native date input in learning-record navigation must shrink and clip inside the middle grid track; it must never overlap either 44px previous/next-day button, including on iPhone Safari.
