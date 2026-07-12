/**
 * PDF Sentence Navigator — Viewer Logic
 *
 * Renders a PDF using PDF.js, extracts text, splits it into sentences,
 * and allows keyboard navigation (TAB / SHIFT+TAB) with visual highlighting
 * via the CSS Custom Highlight API (with a Selection-based fallback).
 */

// ── Interfaces ───────────────────────────────────────────────────

/** Maps a rendered text span to its position in the concatenated global text. */
interface TextSpanMapping {
  node: Text;
  globalStart: number;
  length: number;
}

/** A sentence defined by its character range in the global text. */
interface SentenceRange {
  start: number;
  end: number;
}

/** Resolved DOM position for a global character offset. */
interface NodeOffset {
  node: Text;
  offset: number;
}

/** Status bar display types. */
type StatusType = 'loading' | 'error' | 'success';

// ── State ────────────────────────────────────────────────────────

let sentences: SentenceRange[] = [];
let textSpansStore: TextSpanMapping[] = [];
let globalTextStore = '';
let currentSentenceIndex = -1;

// ── DOM References ───────────────────────────────────────────────

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

// ── Common Abbreviations ─────────────────────────────────────────

const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  'vs', 'etc', 'inc', 'ltd', 'co', 'corp',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'fig', 'eq', 'no', 'vol', 'dept', 'univ', 'approx',
  'govt', 'assn', 'bros', 'gen', 'rep', 'sen',
]);

// ── Initialization ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', (): void => {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

  const fileInput = getElement<HTMLInputElement>('file-input');
  const pdfContainer = getElement<HTMLDivElement>('pdf-container');
  const statusBar = getElement<HTMLDivElement>('status-bar');
  const sentenceCounter = getElement<HTMLDivElement>('sentence-counter');

  // ── Status Helpers ───────────────────────────────────────────

  function showStatus(message: string, type: StatusType): void {
    statusBar.textContent = message;
    statusBar.className = type;
  }

  function hideStatus(): void {
    statusBar.className = '';
    statusBar.textContent = '';
  }

  function updateCounter(): void {
    if (sentences.length === 0) {
      sentenceCounter.textContent = '';
      return;
    }
    if (currentSentenceIndex < 0) {
      sentenceCounter.textContent = `Press TAB to start · ${sentences.length} sentences`;
      return;
    }
    sentenceCounter.textContent = `Sentence ${currentSentenceIndex + 1} / ${sentences.length}`;
  }

  // ── Auto-Load from URL Parameter ─────────────────────────────

  const params = new URLSearchParams(window.location.search);
  const pdfUrl: string | null = params.get('file');

  if (pdfUrl) {
    // Hide the file input if we are auto-loading from a URL
    fileInput.style.display = 'none';
    loadPdfFromUrl(pdfUrl);
  }

  async function loadPdfFromUrl(url: string): Promise<void> {
    showStatus(`Loading PDF from: ${url}`, 'loading');
    try {
      const response: Response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF (HTTP ${response.status})`);
      }
      const arrayBuffer: ArrayBuffer = await response.arrayBuffer();
      await loadPdf(arrayBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showStatus(`Error loading PDF: ${message}`, 'error');
      console.error('Failed to load PDF from URL:', err);
    }
  }

  // ── Manual File Picker ───────────────────────────────────────

  fileInput.addEventListener('change', async (e: Event): Promise<void> => {
    const target = e.target as HTMLInputElement;
    const file: File | undefined = target.files?.[0];
    if (!file) return;

    showStatus('Loading PDF…', 'loading');
    try {
      const arrayBuffer: ArrayBuffer = await file.arrayBuffer();
      await loadPdf(arrayBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showStatus(`Error reading file: ${message}`, 'error');
      console.error('Failed to read file:', err);
    }
  });

  // ── Core PDF Loading & Rendering ─────────────────────────────

  async function loadPdf(arrayBuffer: ArrayBuffer): Promise<void> {
    pdfContainer.innerHTML = '';
    sentences = [];
    textSpansStore = [];
    globalTextStore = '';
    currentSentenceIndex = -1;

    // Clear existing highlights
    if (CSS.highlights) {
      CSS.highlights.clear();
    }

    let pdf: pdfjsLib.PDFDocumentProxy;
    try {
      const loadingTask: pdfjsLib.PDFLoadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      pdf = await loadingTask.promise;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showStatus(`Error: Could not open PDF — ${message}`, 'error');
      console.error('PDF.js getDocument error:', err);
      return;
    }

    const textSpans: TextSpanMapping[] = [];
    let globalText = '';

    try {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page: pdfjsLib.PDFPageProxy = await pdf.getPage(pageNum);
        const scale = 1.5;
        const viewport: pdfjsLib.PDFPageViewport = page.getViewport({ scale });

        // Page container
        const pageContainer: HTMLDivElement = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;

        // 1. Render PDF visual canvas
        const canvas: HTMLCanvasElement = document.createElement('canvas');
        const context: CanvasRenderingContext2D = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageContainer.appendChild(canvas);

        // 2. Setup structural text layer
        const textLayerDiv: HTMLDivElement = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        pageContainer.appendChild(textLayerDiv);

        pdfContainer.appendChild(pageContainer);

        await page.render({ canvasContext: context, viewport }).promise;

        // 3. Extract text content and build DOM-to-text mapping
        const textContent: pdfjsLib.TextContent = await page.getTextContent();
        const items: pdfjsLib.TextItem[] = textContent.items;

        for (let idx = 0; idx < items.length; idx++) {
          const item: pdfjsLib.TextItem = items[idx];
          if (!item.str && !item.hasEOL) continue;

          // Build the text string for this span.
          // Append spaces between items to prevent word merging —
          // PDF.js often splits a line into items without whitespace between them.
          let textStr: string = item.str || '';

          if (item.hasEOL) {
            textStr += ' ';
          } else if (idx < items.length - 1) {
            const nextItem: pdfjsLib.TextItem = items[idx + 1];
            if (nextItem?.str && textStr.length > 0) {
              const lastChar: string = textStr[textStr.length - 1];
              const nextFirstChar: string = nextItem.str[0];
              if (lastChar !== ' ' && nextFirstChar !== ' ') {
                textStr += ' ';
              }
            }
          }

          if (textStr.length === 0) continue;

          // Create the DOM span for the text layer
          const span: HTMLSpanElement = document.createElement('span');
          span.textContent = textStr;

          // Position the span using PDF.js transform data
          const transform: number[] = pdfjsLib.Util.transform(
            viewport.transform,
            item.transform
          );
          const fontHeight: number = Math.sqrt(
            transform[2] * transform[2] + transform[3] * transform[3]
          );

          span.style.left = `${transform[4]}px`;
          span.style.top = `${transform[5] - fontHeight}px`;
          span.style.fontSize = `${fontHeight}px`;
          span.style.fontFamily = item.fontName || 'sans-serif';

          textLayerDiv.appendChild(span);

          // Map this span to its position in the global text
          const textNode: Text = span.firstChild as Text;
          textSpans.push({
            node: textNode,
            globalStart: globalText.length,
            length: textStr.length,
          });
          globalText += textStr;
        }

        // Insert a space between pages to prevent cross-page word merging.
        // Attach it to the last span's DOM node to keep the mapping consistent.
        if (pageNum < pdf.numPages && globalText.length > 0) {
          const lastChar: string = globalText[globalText.length - 1];
          if (lastChar !== ' ' && lastChar !== '\n') {
            if (textSpans.length > 0) {
              const lastSpan: TextSpanMapping = textSpans[textSpans.length - 1];
              lastSpan.node.textContent += ' ';
              lastSpan.length += 1;
            }
            globalText += ' ';
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showStatus(`Error rendering page: ${message}`, 'error');
      console.error('Page render error:', err);
      return;
    }

    // Store for use by highlighting
    textSpansStore = textSpans;
    globalTextStore = globalText;

    parseSentences(globalText);
    updateCounter();

    if (sentences.length > 0) {
      showStatus(
        `PDF loaded — ${sentences.length} sentences found. Press TAB to navigate.`,
        'success'
      );
      setTimeout(hideStatus, 3000);
    } else {
      showStatus('PDF loaded but no sentences were detected.', 'error');
    }
  }

  // ── Keyboard Navigation ──────────────────────────────────────

  document.addEventListener('keydown', (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;

    // Only intercept Tab when we have sentences to navigate.
    // Otherwise let it work normally for focus navigation.
    if (sentences.length === 0) return;

    e.preventDefault();

    if (e.shiftKey) {
      if (currentSentenceIndex <= 0) {
        currentSentenceIndex = sentences.length - 1;
      } else {
        currentSentenceIndex--;
      }
    } else {
      currentSentenceIndex = (currentSentenceIndex + 1) % sentences.length;
    }

    highlightCurrentSentence();
    updateCounter();
  });
});

// ── Sentence Parsing ───────────────────────────────────────────

/**
 * Determine whether a period at `dotIndex` in `text` is a real sentence boundary
 * (as opposed to an abbreviation, decimal number, or dotted acronym).
 */
function isSentenceBoundary(text: string, dotIndex: number): boolean {
  const afterDot: number = dotIndex + 1;

  // Find the next non-whitespace character
  let nextNonSpace: number = afterDot;
  while (nextNonSpace < text.length && /\s/.test(text[nextNonSpace])) {
    nextNonSpace++;
  }

  // End of text → boundary
  if (nextNonSpace >= text.length) return true;

  // If the next visible character isn't uppercase or a quote/bracket, probably not a boundary
  const nextChar: string = text[nextNonSpace];
  if (!/[A-Z"'\u201C\u201D([]/.test(nextChar)) return false;

  // Extract the word immediately before the period
  let wordStart: number = dotIndex - 1;
  while (wordStart >= 0 && /[a-zA-Z]/.test(text[wordStart])) {
    wordStart--;
  }
  wordStart++;

  const wordBeforeDot: string = text.substring(wordStart, dotIndex).toLowerCase();

  // Known abbreviation
  if (ABBREVIATIONS.has(wordBeforeDot)) return false;

  // Single-letter abbreviation patterns (e.g., "U.S.", "e.g.", "i.e.")
  if (wordBeforeDot.length <= 1) {
    if (dotIndex >= 2 && text[dotIndex - 2] === '.') return false;
    if (dotIndex + 2 < text.length && text[dotIndex + 2] === '.') return false;
  }

  // Decimal numbers (e.g., "3.14", "$2.50")
  if (wordStart > 0) {
    const charBeforeWord: string = text[wordStart - 1];
    if (/[0-9.]/.test(charBeforeWord) || charBeforeWord === '$') return false;
  }
  if (/^[0-9]+$/.test(wordBeforeDot)) return false;

  return true;
}

/**
 * Parse the global concatenated text into sentence ranges.
 * Handles abbreviations, decimals, and trailing text without terminal punctuation.
 */
function parseSentences(text: string): void {
  sentences = [];
  if (text.trim().length === 0) return;

  // Find all sentence boundary positions
  const boundaries: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch: string = text[i];
    if (ch === '!' || ch === '?') {
      boundaries.push(i);
    } else if (ch === '.') {
      if (isSentenceBoundary(text, i)) {
        boundaries.push(i);
      }
    }
  }

  // Build sentence ranges from boundary positions
  let sentenceStart = 0;

  // Skip leading whitespace
  while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
    sentenceStart++;
  }

  for (const boundaryEnd of boundaries) {
    let start: number = sentenceStart;

    // Trim leading whitespace
    while (start <= boundaryEnd && /\s/.test(text[start])) {
      start++;
    }

    if (start <= boundaryEnd) {
      sentences.push({ start, end: boundaryEnd });
    }

    sentenceStart = boundaryEnd + 1;
  }

  // Capture trailing text without terminal punctuation
  if (sentenceStart < text.length) {
    let start: number = sentenceStart;
    let end: number = text.length - 1;

    while (start <= end && /\s/.test(text[start])) start++;
    while (end >= start && /\s/.test(text[end])) end--;

    if (start <= end) {
      sentences.push({ start, end });
    }
  }
}

// ── Highlighting ─────────────────────────────────────────────────

/**
 * Binary-search the textSpans array to find the DOM TextNode and local offset
 * for a given global character position.
 */
function findNodeAtGlobalOffset(
  textSpans: TextSpanMapping[],
  globalOffset: number
): NodeOffset | null {
  let lo = 0;
  let hi: number = textSpans.length - 1;

  while (lo <= hi) {
    const mid: number = (lo + hi) >> 1;
    const span: TextSpanMapping = textSpans[mid];

    if (globalOffset < span.globalStart) {
      hi = mid - 1;
    } else if (globalOffset >= span.globalStart + span.length) {
      lo = mid + 1;
    } else {
      return {
        node: span.node,
        offset: globalOffset - span.globalStart,
      };
    }
  }

  return null;
}

/**
 * Highlight the current sentence using the CSS Custom Highlight API,
 * falling back to window.getSelection() for older browsers.
 */
function highlightCurrentSentence(): void {
  if (currentSentenceIndex < 0 || currentSentenceIndex >= sentences.length) return;

  const sentence: SentenceRange = sentences[currentSentenceIndex];
  const textSpans: TextSpanMapping[] = textSpansStore;

  const startMapping: NodeOffset | null = findNodeAtGlobalOffset(textSpans, sentence.start);
  const endMapping: NodeOffset | null = findNodeAtGlobalOffset(textSpans, sentence.end);

  if (!startMapping || !endMapping) {
    console.error('Could not map sentence to DOM nodes', sentence);
    return;
  }

  if (CSS.highlights) {
    // Build highlight ranges spanning multiple text nodes
    const ranges: Range[] = [];

    for (const span of textSpans) {
      const spanEnd: number = span.globalStart + span.length - 1;
      if (spanEnd < sentence.start) continue;
      if (span.globalStart > sentence.end) break;

      const rangeStartInSpan: number = Math.max(0, sentence.start - span.globalStart);
      const rangeEndInSpan: number = Math.min(span.length, sentence.end - span.globalStart + 1);

      if (rangeStartInSpan < rangeEndInSpan && rangeEndInSpan <= span.node.length) {
        const range: Range = new Range();
        try {
          range.setStart(span.node, rangeStartInSpan);
          range.setEnd(span.node, rangeEndInSpan);
          ranges.push(range);
        } catch {
          // Skip invalid ranges (e.g., detached nodes)
        }
      }
    }

    if (ranges.length > 0) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set('sentence-highlight', highlight);
    }

    startMapping.node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    // Fallback: standard Selection API
    const selection: Selection | null = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    const range: Range = document.createRange();

    try {
      range.setStart(startMapping.node, startMapping.offset);
      const endOffset: number = Math.min(endMapping.offset + 1, endMapping.node.length);
      range.setEnd(endMapping.node, endOffset);
      selection.addRange(range);
      startMapping.node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      console.error('Error creating selection range:', err);
    }
  }
}
