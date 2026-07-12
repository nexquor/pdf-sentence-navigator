# PDF Sentence Navigator (Chrome Extension)

A **Manifest V3** Chrome Extension written in **TypeScript** that allows users to locally navigate and highlight sentences inside PDF documents using the keyboard.

**Features:**
- **Automatic PDF interception:** When you navigate to any `.pdf` URL in Chrome (http, https, or local file), the extension automatically opens it in its own viewer — no manual upload needed.
- **Manual upload fallback:** Click the extension icon to open the viewer and pick a local PDF file.
- **Local execution:** Text is processed entirely within the browser. No data is sent to any external server.
- **`TAB`:** Highlights and jumps to the next sentence.
- **`SHIFT + TAB`:** Highlights and jumps to the previous sentence.
- Built using **PDF.js** (bundled) and the modern **CSS Custom Highlight API** for non-destructive DOM highlighting, with a `window.getSelection()` fallback for older browsers.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm (comes with Node.js)

## Build Instructions

```bash
# 1. Install dependencies (TypeScript, @types/chrome)
npm install

# 2. Compile TypeScript and copy static assets to dist/
npm run build
```

This produces a `dist/` directory containing all files needed by the extension:

```
dist/
├── background.js        ← compiled from src/background.ts
├── viewer.js            ← compiled from src/viewer.ts
├── manifest.json        ← copied from root
├── viewer.html          ← copied from root
├── pdf.min.js           ← copied from root
└── pdf.worker.min.js    ← copied from root
```

## Loading the Extension into Chrome

1. Run `npm run build` (see above).
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in top-right corner).
4. Click **Load unpacked** and select the **`dist/`** folder (not the project root).

### Enabling Local File Access (for `file:///` PDFs)

By default Chrome does not allow extensions to access `file://` URLs. To enable:

1. Go to `chrome://extensions/`.
2. Find **PDF Sentence Navigator** and click **Details**.
3. Enable **Allow access to file URLs**.

Without this toggle, you can still use the manual file picker to open local PDFs.

## How to Test

1. **Online PDF:** Navigate to any `.pdf` URL in Chrome (e.g., `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`). The extension should automatically redirect to its viewer and render the PDF.
2. **Local PDF:** Open a local PDF file in Chrome (e.g., drag a `.pdf` file into the browser, or use `file:///path/to/file.pdf`). Make sure **Allow access to file URLs** is enabled (see above).
3. **Manual upload:** Click the extension icon in the toolbar. The viewer opens with a file picker — select any PDF.
4. **Navigate sentences:**
   - Press **TAB** to highlight and jump to the next sentence.
   - Press **SHIFT + TAB** to highlight and jump to the previous sentence.
   - The sentence counter in the top-right shows your position (e.g., "Sentence 3 / 42").
   - Navigation wraps around: after the last sentence, TAB goes back to the first.
5. **Error handling:** Try loading a non-PDF or corrupt file — a user-visible error message should appear in the status bar.
6. **Tab key behavior:** With no PDF loaded, the TAB key works normally for browser focus navigation.

## Project Structure

```
pdf-sentence-navigator/
├── src/
│   ├── background.ts         # Service worker: PDF URL interception + icon click handler
│   ├── viewer.ts             # Core logic: rendering, sentence parsing, highlighting, navigation
│   └── types/
│       ├── pdfjs.d.ts        # Type declarations for PDF.js
│       └── highlight-api.d.ts # Type declarations for CSS Custom Highlight API
├── scripts/
│   └── copy-assets.js        # Build helper: copies static assets to dist/
├── dist/                     # Build output — load this folder as the Chrome extension
├── manifest.json             # Manifest V3 configuration
├── viewer.html               # Custom PDF viewer page
├── pdf.min.js                # PDF.js library (bundled)
├── pdf.worker.min.js         # PDF.js web worker (bundled)
├── tsconfig.json             # TypeScript configuration
├── package.json              # Project dependencies and build scripts
└── README.md
```

## Development

```bash
# Watch mode — recompiles on file changes (you still need to reload the extension in Chrome)
npm run watch

# Clean build output
npm run clean
```

## Known Limitations

- **Chrome's built-in PDF viewer is bypassed:** While the extension is enabled, all `.pdf` URLs are redirected to the extension's custom viewer instead of Chrome's native PDF viewer.
- **PDF URL detection is path-based:** The extension identifies PDFs by checking if the URL path ends with `.pdf`. PDFs served with a Content-Type header but without a `.pdf` extension in the URL will not be automatically intercepted (use the manual file picker in that case).
- **Sentence splitting is heuristic:** The extension handles common abbreviations (Mr., Dr., U.S., etc.) and decimal numbers, but edge cases in complex documents may occasionally produce imperfect sentence boundaries.