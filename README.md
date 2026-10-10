<div align="center">

<img src="icons/icon128.png" width="96" alt="Bidi Fixer icon">

# Bidi Fixer

**Make mixed Persian/English text readable on any web page.**

A lightweight Chrome/Chromium extension that gives each paragraph the right direction (RTL or LTR), so Farsi and English stop getting scrambled together. It works great on ChatGPT, Claude, Gemini, Google Translate, docs, and blogs.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)
![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
![No tracking](https://img.shields.io/badge/tracking-none-success)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

[فارسی](#فارسی) · [Install](#installation) · [How it works](#how-it-works) · [Contributing](#contributing)

</div>

---

## The problem

When an AI assistant translates a text into Persian, or when a Persian article mentions technical terms, most web pages still render the paragraph **left-to-right**. You end up with:

- paragraphs aligned to the left even though they are Farsi
- periods, colons and parentheses showing up on the wrong side
- English phrases like `React Native (v0.74)` broken apart and shuffled
- bullet points of Persian lists stuck on the left

Browsers have `dir="auto"`, but it only looks at the **first** strong character. A Persian sentence that starts with an English word (`ChatGPT یک مدل زبانی است`) is treated as English, and the whole line comes out wrong.

## The fix

Bidi Fixer looks at the **whole** text of every paragraph, counts Persian/Arabic/Hebrew letters against Latin letters, and sets the direction from the majority.

```
Before:  .ChatGPT یک مدل زبانی است که توسط OpenAI ساخته شده      ← aligned left, period jumps
After:        ChatGPT یک مدل زبانی است که توسط OpenAI ساخته شده.  ← right-aligned, correct order
```

## Features

- 🧠 **Per-paragraph direction by majority**, not by the first character
- 📋 **Lists and tables are mirrored**: bullets move to the right and table columns read right to left
- 💻 **Code stays LTR**: `<pre>`, `<code>`, `<kbd>` and similar tags are never touched
- ⌨️ **Smart input boxes**: textareas, search fields and rich editors (like the ChatGPT prompt box) pick a direction per line as you type
- 🌊 **Live and streaming content**: follows DOM changes, so answers that stream in word by word are fixed as they appear
- 🔁 **Works both ways**: on Persian (RTL) sites, English paragraphs are switched to LTR
- 🧱 **Doesn't break layouts**: only text blocks are changed. Page containers, flex rows and grids keep their direction
- 🎛️ **Per-site toggle** and a global on/off switch
- 🧪 **Optional phrase isolation**: wraps English phrases inside Persian sentences (and the reverse) in `<bdi>` so punctuation stays put
- 🔒 **Private**: no network requests, no analytics. The only permission is `storage`, used for your settings

## Installation

### From source (developer mode)

1. Download the code:
   ```bash
   git clone https://github.com/USERNAME/bidi-fixer.git
   ```
   or download the ZIP from GitHub and extract it.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `bidi-fixer` folder.
5. Pin the extension from the puzzle-piece menu if you want quick access to the popup.

It works in any Chromium-based browser: Chrome, Chromium, Edge, Brave, Opera and Vivaldi.

### Updating

Run `git pull` (or download the new ZIP), then click the **⟳ reload** button on the extension's card in `chrome://extensions`.

## Usage

There's nothing to set up. Open any page and mixed text is fixed automatically.

Click the toolbar icon to open the popup:

| Option | What it does |
| --- | --- |
| **فعال** (Enabled) | Global on/off switch |
| **فعال در این سایت** (Enabled on this site) | Turns the extension off for the current hostname only |
| **جداسازی عبارت‌های انگلیسی** (Isolate phrases) | *Experimental.* Wraps multi-word phrases of the other script in `<bdi>`. This is more accurate, but it changes the page's DOM. Off by default (see [Known limitations](#known-limitations)) |

Settings are saved with `chrome.storage.sync`, so they follow your browser profile. Changes take effect right away without a page reload.

## How it works

1. **Scan.** The content script walks text nodes that contain RTL characters. On RTL pages it also walks Latin text.
2. **Find the owning block.** For each text node it finds the nearest text block (`p`, `li`, `h1`–`h6`, `td`, `blockquote`, …). Generic containers (`div`, `section`, …) count only when they hold text directly and have **no block children** and are **not flex/grid**. This rule is what keeps page layouts intact.
3. **Count and decide.** It counts RTL letters (Hebrew, Arabic, Persian, Syriac, Thaana, NKo, presentation forms) and LTR letters (Latin, Greek, Cyrillic) in the block, skipping code and nested blocks. If **≥ 40%** are RTL, the block becomes RTL. Otherwise it becomes LTR.
4. **Apply.** If the result differs from the block's current direction, the block gets a `data-bidi-fix="rtl|ltr"` attribute, and `content.css` turns that into `direction` + `unicode-bidi: isolate`. Text alignment is flipped only when the block had its direction's *natural* alignment, so centered headings stay centered.
5. **Lists and tables first.** `ul`, `ol` and `table` are judged on all of their text, top-down, before their children. The list's padding is swapped so bullets get room on the correct side.
6. **Editables use pure CSS.** Inputs, textareas and `contenteditable` editors get `unicode-bidi: plaintext`, so each line picks its own direction without any DOM changes. This is safe for editors like ProseMirror.
7. **Watch.** A `MutationObserver` collects added and changed nodes and re-processes them in batches (every 250 ms at most), which covers streaming AI answers.

Turning the extension off removes every attribute it added and unwraps every `<bdi>`, so the page goes back to exactly how it was.

## Project structure

```
bidi-fixer/
├── manifest.json   # MV3 manifest
├── content.js      # detection + direction logic, MutationObserver
├── content.css     # styles driven by data-bidi-* attributes
├── popup.html      # settings popup (Persian UI)
├── popup.js        # popup logic (chrome.storage.sync)
└── icons/          # 16 / 32 / 48 / 128 px PNGs
```

There's no build step, bundler or dependencies. Edit a file and reload the extension.

## Tuning

These constants at the top of `content.js` can be adjusted:

| Constant | Default | Meaning |
| --- | --- | --- |
| `THRESHOLD` | `0.4` | Share of RTL letters needed for a block to become RTL |
| `TEXT_BLOCKS` | `P, LI, H1…` | Tags that are always judged on their own |
| `SKIP_TAGS` | `CODE, PRE, …` | Tags whose text is ignored and never changed |

## Known limitations

- **Phrase isolation and React apps.** The optional phrase-isolation mode splits text nodes. Frameworks like React keep references to those nodes, so on sites like ChatGPT this can occasionally cause duplicated or glitchy text while an answer is streaming. That's why it's off by default. Turn it off per site if you see issues.
- **Inline-only layouts.** Text inside a flex/grid container with no block wrapper is skipped on purpose, to protect the layout.
- **Canvas-based editors** (Google Docs, Figma, etc.) draw text on a `<canvas>`, which an extension can't change.
- **Closed shadow DOM** and cross-origin iframes the extension isn't allowed to run in can't be reached.
- **Firefox** isn't officially supported yet. The code is plain WebExtensions and should port easily (PRs welcome).

## Troubleshooting

<details>
<summary><b>Nothing changes on a page</b></summary>

- Check that the extension is enabled globally **and** for that site in the popup.
- Reload the page once after installing or updating. Content scripts don't run in tabs that were already open.
- `chrome://` pages, the Chrome Web Store and some built-in pages don't allow extensions.
</details>

<details>
<summary><b>A site's layout looks broken</b></summary>

Turn the extension off for that site from the popup, then [open an issue](../../issues) with the URL and a screenshot.
</details>

<details>
<summary><b>A paragraph got the wrong direction</b></summary>

It probably has close to 40% RTL letters. Try a different `THRESHOLD`, or open an issue with the exact text so the heuristic can be improved.
</details>

## Privacy

Bidi Fixer runs entirely in your browser. It makes **no network requests**, collects **no data**, and its only permission is `storage`, used to remember your settings. Everything in this repo is the code that runs. Nothing is minified and nothing is fetched remotely.

## Roadmap

- [ ] Optional Persian font override (e.g. Vazirmatn) for better-looking Farsi text
- [ ] Keyboard shortcut to toggle on the current tab
- [ ] Firefox build
- [ ] Chrome Web Store release
- [ ] Per-site custom threshold

## Contributing

Contributions are very welcome, especially bug reports with real pages where the direction comes out wrong.

1. Fork the repo and create a branch: `git checkout -b fix/my-change`
2. Make your change. Keep it dependency-free and readable.
3. Test it in the browser: load unpacked, then try ChatGPT plus at least one Persian site and one English site.
4. Open a pull request explaining what changed and why. Before/after screenshots help a lot.

When reporting a bug, please include the **URL**, your **browser and version**, a **screenshot**, and the **text** that was handled wrong.

## License

[MIT](LICENSE): free to use, modify and share.

---

<div dir="rtl">

## فارسی

### مشکل چیه؟

وقتی از ChatGPT یا هر هوش مصنوعی دیگه‌ای می‌خوای متنی رو به فارسی ترجمه کنه، یا یه مقاله‌ی فارسی پر از اصطلاح انگلیسیه، صفحه متن رو چپ‌به‌راست نشون می‌ده. نتیجه این می‌شه که کلمه‌های فارسی و انگلیسی قاطی می‌شن، نقطه و پرانتز سر جاشون نیستن و متن اصلاً خوانا نیست.

### Bidi Fixer چی کار می‌کنه؟

این افزونه برای هر پاراگراف حرف‌های فارسی و انگلیسی رو می‌شمره و جهت رو بر اساس اکثریت تعیین می‌کنه، نه فقط بر اساس اولین حرف. برای همین جمله‌ای مثل «ChatGPT یک مدل زبانی است» هم درست راست‌چین می‌شه.

- راست‌چین یا چپ‌چین خودکار هر پاراگراف
- لیست‌ها و جدول‌ها کامل برعکس می‌شن (بولت‌ها سمت راست)
- کدها همیشه چپ‌چین می‌مونن
- باکس‌های تایپ (مثل باکس چت ChatGPT) هر خط رو خودکار تنظیم می‌کنن
- با متنی که لحظه‌به‌لحظه تایپ می‌شه (استریم) هم کار می‌کنه
- تو سایت‌های فارسی، پاراگراف‌های انگلیسی رو چپ‌چین می‌کنه
- هیچ داده‌ای ارسال نمی‌کنه و هیچ درخواست شبکه‌ای نداره

### نصب

۱. کد رو دانلود کن (`git clone` یا فایل ZIP از گیت‌هاب).
۲. برو به `chrome://extensions`.
۳. **Developer mode** رو (بالا سمت راست) روشن کن.
۴. روی **Load unpacked** بزن و پوشه‌ی `bidi-fixer` رو انتخاب کن.

روی همه‌ی مرورگرهای مبتنی بر کرومیوم کار می‌کنه: Chrome، Edge، Brave، Opera و Vivaldi.

### تنظیمات

با کلیک روی آیکون افزونه:

- **فعال**: روشن یا خاموش کردن کلی
- **فعال در این سایت**: خاموش کردن فقط برای سایت فعلی
- **جداسازی عبارت‌های انگلیسی** (آزمایشی): عبارت‌هایی مثل `React Native (v0.74)` رو وسط جمله‌ی فارسی یک‌جا نگه می‌داره. ممکنه روی سایت‌هایی مثل ChatGPT گاهی مشکل درست کنه، برای همین پیش‌فرض خاموشه.

### مشارکت

اگه جایی دیدی جهت متن درست نشده، یه Issue باز کن و آدرس صفحه، اسکرین‌شات و متن مشکل‌دار رو بذار. Pull Request هم با کمال میل پذیرفته می‌شه 🙏

</div>
