document.addEventListener('DOMContentLoaded', () => {
  // Point to the local PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

  let sentences = [];
  let currentSentenceIndex = -1;

  const fileInput = document.getElementById('file-input');
  const pdfContainer = document.getElementById('pdf-container');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      loadPdf(arrayBuffer);
    }
  });

  async function loadPdf(arrayBuffer) {
    pdfContainer.innerHTML = '';
    sentences = [];
    currentSentenceIndex = -1;
    
    // Clear existing highlights
    if (CSS.highlights) CSS.highlights.clear();

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const textNodesMapping = [];
    let globalText = "";

    // Render each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });

      const pageContainer = document.createElement('div');
      pageContainer.className = 'page-container';
      pageContainer.style.width = viewport.width + 'px';
      pageContainer.style.height = viewport.height + 'px';

      // 1. Render PDF visual canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      pageContainer.appendChild(canvas);

      // 2. Setup structural Text Layer
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = viewport.width + 'px';
      textLayerDiv.style.height = viewport.height + 'px';
      pageContainer.appendChild(textLayerDiv);

      pdfContainer.appendChild(pageContainer);

      await page.render({ canvasContext: context, viewport }).promise;

      // 3. Extract text content and map DOM nodes for highlighting
      const textContent = await page.getTextContent();
      
      for (const item of textContent.items) {
        if (!item.str) continue;

        const span = document.createElement('span');
        // Add a space if the item signals end of line to separate words
        const textStr = item.str + (item.hasEOL ? ' ' : '');
        span.textContent = textStr;
        
        // Calculate text positioning bounds natively
        const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.sqrt((transform[2] * transform[2]) + (transform[3] * transform[3]));
        
        span.style.left = transform[4] + 'px';
        span.style.top = (transform[5] - fontHeight) + 'px';
        span.style.fontSize = fontHeight + 'px';
        span.style.fontFamily = item.fontName || 'sans-serif';

        textLayerDiv.appendChild(span);

        // Keep a 1:1 map of text characters to their respective DOM offsets
        const textNode = span.firstChild;
        for (let i = 0; i < textStr.length; i++) {
          textNodesMapping.push({ node: textNode, offset: i });
        }
        globalText += textStr;
      }
    }
    parseSentences(globalText, textNodesMapping);
  }

  function parseSentences(text, mapping) {
    // Basic regex: capture sequences of characters ending with . ! or ?
    const sentenceRegex = /[^.!?]+[.!?]+/g;
    
    let match;
    while ((match = sentenceRegex.exec(text)) !== null) {
      let start = match.index;
      let end = match.index + match[0].length - 1;
      
      // Trim leading whitespace off the sentence
      while (start < end && /\s/.test(text[start])) {
        start++;
      }

      if (start <= end && mapping[start] && mapping[end]) {
        sentences.push({
          startMap: mapping[start],
          endMap: mapping[end]
        });
      }
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault(); // Stop standard tab focus switching
      if (sentences.length === 0) return;

      if (e.shiftKey) {
        // Move backward (with modulo wraparound)
        currentSentenceIndex = (currentSentenceIndex - 1 + sentences.length) % sentences.length;
      } else {
        // Move forward
        currentSentenceIndex = (currentSentenceIndex + 1) % sentences.length;
      }

      highlightCurrentSentence();
    }
  });

  function highlightCurrentSentence() {
    if (currentSentenceIndex < 0 || currentSentenceIndex >= sentences.length) return;
    const sentence = sentences[currentSentenceIndex];
    
    // Utilize modern CSS Custom Highlight API to avoid mutating DOM structure
    if (CSS.highlights) {
      const range = new Range();
      try {
        range.setStart(sentence.startMap.node, sentence.startMap.offset);
        const endOffset = sentence.endMap.offset + 1;
        
        if (endOffset <= sentence.endMap.node.length) {
          range.setEnd(sentence.endMap.node, endOffset);
        } else {
          range.setEnd(sentence.endMap.node, sentence.endMap.node.length);
        }

        const highlight = new Highlight(range);
        CSS.highlights.set('sentence-highlight', highlight);
        
        // Auto-scroll the page to show active sentence
        sentence.startMap.node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        console.error('Error highlighting range:', err);
      }
    } else {
      // Fallback: Use standard window selection API
      const selection = window.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.setStart(sentence.startMap.node, sentence.startMap.offset);
      range.setEnd(sentence.endMap.node, Math.min(sentence.endMap.offset + 1, sentence.endMap.node.length));
      selection.addRange(range);
      sentence.startMap.node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
});