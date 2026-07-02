"""Build a compact WOFF2 font for the UI and bundled vocabulary.

Requires fonttools and brotli:
  python -m pip install fonttools brotli
  python scripts/build-font-subset.py
"""

from pathlib import Path

from fontTools import subset


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/fonts/AlimamaDongFangDaKai-Regular.ttf"
OUTPUT = ROOT / "public/fonts/DongFangDaKai-ui.woff2"


def collect_characters() -> str:
    text = "".join(chr(codepoint) for codepoint in range(0x20, 0x7F))
    text += "，。！？；：、“”‘’（）《》【】·—…￥"
    paths = [ROOT / "index.html"]
    for extension in ("*.js", "*.jsx", "*.css", "*.json"):
        paths.extend((ROOT / "src").rglob(extension))
    for path in paths:
        text += path.read_text(encoding="utf-8")
    return "".join(sorted(set(text)))


def main() -> None:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    options.name_legacy = True
    options.name_languages = [0x409, 0x804]

    font = subset.load_font(str(SOURCE), options)
    subsetter = subset.Subsetter(options=options)
    characters = collect_characters()
    subsetter.populate(text=characters)
    subsetter.subset(font)
    subset.save_font(font, str(OUTPUT), options)
    print(
        f"Wrote {OUTPUT.name}: {OUTPUT.stat().st_size:,} bytes, "
        f"{len(characters):,} requested characters"
    )


if __name__ == "__main__":
    main()
