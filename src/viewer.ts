/**
 * PDF Sentence Navigator — Viewer Logic
 *
 * Renders a PDF using PDF.js, extracts text, splits it into sentences,
 * and allows keyboard navigation (TAB / SHIFT+TAB) with visual highlighting
 */

import { LinePos, isLayoutBreak, mergeBoundaries } from './layoutBoundaries.js';

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
let totalPages = 0;

// ── DOM References ───────────────────────────────────────────────

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

// ── Initialization ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', (): void => {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

  const fileInput = getElement<HTMLInputElement>('file-input');
  const uploadBtn = getElement<HTMLButtonElement>('upload-btn');
  const pdfContainer = getElement<HTMLDivElement>('pdf-container');
  const toastContainer = getElement<HTMLDivElement>('toast-container');
  
  const sidebar = getElement<HTMLDivElement>('sidebar');
  const sidebarToggleMain = getElement<HTMLButtonElement>('sidebar-toggle-main');
  const sidebarToggleInside = getElement<HTMLButtonElement>('sidebar-toggle-inside');
  
  const progressText = getElement<HTMLDivElement>('progress-text');
  const progressFill = getElement<HTMLDivElement>('progress-fill');
  const activeSentenceText = getElement<HTMLDivElement>('active-sentence-text');
  
  const pageIndicator = getElement<HTMLDivElement>('page-indicator');
  
  const widgetToggle = getElement<HTMLButtonElement>('widget-toggle');
  const widgetMenu = getElement<HTMLDivElement>('widget-menu');
  const themeToggle = getElement<HTMLInputElement>('theme-toggle');
  const swatches = document.querySelectorAll('.swatch');
  
  const versionEl = getElement<HTMLSpanElement>('app-version');
  const pdfSourceUrl = getElement<HTMLSpanElement>('pdf-source-url');
  const copyUrlBtn = getElement<HTMLButtonElement>('copy-url-btn');

  // Trigger file input when custom button is clicked
  uploadBtn.addEventListener('click', () => fileInput.click());

  // Toggle Sidebar
  function toggleSidebar() {
    document.body.classList.toggle('sidebar-collapsed');
  }
  
  // Attach toggle to both buttons
  sidebarToggleInside.addEventListener('click', toggleSidebar);
  sidebarToggleMain.addEventListener('click', toggleSidebar);

  // ── Auto-Load from URL Parameter ─────────────────────────────

  try {
    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = `v${manifest.version} (Manifest V3)`;
  } catch (e) {
    versionEl.textContent = 'v1.1.0 (Manifest V3)'; // fallback
  }

  widgetToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    widgetMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!widgetMenu.contains(e.target as Node) && !widgetToggle.contains(e.target as Node)) {
      widgetMenu.classList.remove('open');
    }
  });

  themeToggle.addEventListener('change', (e) => {
    const isDark = (e.target as HTMLInputElement).checked;
    if (isDark) {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
  });

  swatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      const target = e.target as HTMLDivElement;
      const color = target.dataset.color;
      if (color) {
        document.documentElement.style.setProperty('--highlight-color', color);
        swatches.forEach(s => s.classList.remove('active'));
        target.classList.add('active');
      }
    });
  });

  // ── Status Helpers (Toasts) ──────────────────────────────────

  function showStatus(message: string, type: StatusType): void {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Trigger animation next frame
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto-remove success/error toasts after 4s
    if (type !== 'loading') {
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }
  }

  function hideStatus(): void {
    const toasts = toastContainer.querySelectorAll('.toast.loading');
    toasts.forEach(t => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    });
  }

  function updateCounter(): void {
    if (sentences.length === 0) {
      progressText.textContent = '0 / 0';
      progressFill.style.width = '0%';
      return;
    }

    const current = currentSentenceIndex + 1;
    progressText.textContent = `${current} / ${sentences.length}`;
    
    const percent = (current / sentences.length) * 100;
    progressFill.style.width = `${percent}%`;
  }

  // Update Page Indicator on Scroll
  pdfContainer.parentElement?.addEventListener('scroll', () => {
    if (totalPages === 0) return;
    
    const pages = document.querySelectorAll('.page-container');
    let visiblePageNum = 1;
    let minDistance = Infinity;
    const wrapperRect = pdfContainer.parentElement!.getBoundingClientRect();
    const wrapperCenter = wrapperRect.top + (wrapperRect.height / 2);

    pages.forEach(page => {
      const rect = page.getBoundingClientRect();
      const pageCenter = rect.top + (rect.height / 2);
      const distance = Math.abs(wrapperCenter - pageCenter);
      
      if (distance < minDistance) {
        minDistance = distance;
        visiblePageNum = parseInt(page.getAttribute('data-page-number') || '1', 10);
      }
    });

    pageIndicator.style.display = 'block';
    pageIndicator.textContent = `Page ${visiblePageNum} / ${totalPages}`;
  });

  // ── Auto-Load from URL Parameter ─────────────────────────────

  const params = new URLSearchParams(window.location.search);
  const pdfUrl: string | null = params.get('file');

  if (pdfUrl) {
    // Hide the file input buttons if we are auto-loading from a URL
    fileInput.style.display = 'none';
    uploadBtn.style.display = 'none';
    
    // Update popover URL info
    pdfSourceUrl.textContent = pdfUrl;
    pdfSourceUrl.title = pdfUrl;
    copyUrlBtn.style.display = 'block';
    copyUrlBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(pdfUrl).then(() => {
        showStatus('URL copied to clipboard!', 'success');
      });
    });

    loadPdfFromUrl(pdfUrl);
  }

  async function loadPdfFromUrl(url: string): Promise<void> {
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
    const layoutOffsets: number[] = [];
    let prevLinePos: LinePos | null = null;
    let minRecentX = Infinity;

    try {
      totalPages = pdf.numPages;
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page: pdfjsLib.PDFPageProxy = await pdf.getPage(pageNum);
        const scale = 1.5;
        const viewport: pdfjsLib.PDFPageViewport = page.getViewport({ scale });

        // Page container
        const pageContainer: HTMLDivElement = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.setAttribute('data-page-number', pageNum.toString());
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

          // ── Layout Break Detection ──
          const currLinePos: LinePos = { x: transform[4], y: transform[5], height: fontHeight };
          minRecentX = Math.min(minRecentX, currLinePos.x);

          if (isLayoutBreak(prevLinePos, currLinePos, minRecentX)) {
            layoutOffsets.push(globalText.length);
            minRecentX = currLinePos.x;
          }
          prevLinePos = currLinePos;
          // ────────────────────────────

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

    // 4. Parse sentences from the accumulated text
    parseSentences(globalText, layoutOffsets);
    updateCounter();

    if (sentences.length > 0) {
      showStatus(
        `PDF loaded — ${sentences.length} sentences found. Press TAB to navigate.`,
        'success'
      );
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
 * Parse the global concatenated text into sentence ranges
 * using the modern Intl.Segmenter API, combined with layout boundaries.
 */
function parseSentences(text: string, layoutOffsets: number[]): void {
  sentences = [];
  if (text.trim().length === 0) return;

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  const segments = segmenter.segment(text);
  
  // Extract segmenter boundary offsets (end of each sentence segment)
  const segmenterOffsets: number[] = [];
  for (const segment of segments) {
    segmenterOffsets.push(segment.index + segment.segment.length);
  }

  // Merge Intl boundaries with layout boundaries
  const allBoundaries = mergeBoundaries(segmenterOffsets, layoutOffsets);

  // Build sentence ranges from merged boundaries
  let sentenceStart = 0;
  
  // Skip leading whitespace initially
  while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
    sentenceStart++;
  }

  for (const boundaryEnd of allBoundaries) {
    let start: number = sentenceStart;
    let end: number = boundaryEnd - 1;

    // Trim leading whitespace
    while (start <= end && /\s/.test(text[start])) {
      start++;
    }

    // Trim trailing whitespace
    while (end >= start && /\s/.test(text[end])) {
      end--;
    }

    if (start <= end) {
      sentences.push({ start, end });
    }

    sentenceStart = boundaryEnd;
  }
  
  // Capture any remaining trailing text
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
    if (CSS.highlights) {
      CSS.highlights.clear();
    }
    if (currentSentenceIndex < 0 || currentSentenceIndex >= sentences.length) return;

    const sentence: SentenceRange = sentences[currentSentenceIndex];
    
    // Update active sentence text in sidebar
    const activeSentenceText = document.getElementById('active-sentence-text');
    if (activeSentenceText) {
      const sentenceText = globalTextStore.substring(sentence.start, sentence.end + 1);
      activeSentenceText.textContent = sentenceText.trim() ? `"${sentenceText.trim()}"` : '';
    }

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
      
      if (startMapping.node.parentElement) {
        startMapping.node.parentElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    } catch (err) {
      console.error('Error creating selection range:', err);
    }
  }
}
