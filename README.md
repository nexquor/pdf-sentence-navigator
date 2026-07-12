# PDF Sentence Navigator (Chrome Extension)

A Manifest V3 Chrome Extension that allows users to locally navigate and highlight sentences inside PDF documents using the keyboard. 

**Features:**
- **Local execution:** Text is evaluated safely right inside the browser. No external servers are used.
- **`TAB`:** Highlights and jumps to the next sentence.
- **`SHIFT + TAB`:** Highlights and jumps to the previous sentence.
- Built using **PDF.js** and the modern **CSS Custom Highlight API** to ensure uncorrupted DOM mapping.

## Setup Instructions

1. Clone or download this repository to your local machine.
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select this folder

The required PDF.js library files are already included in the repository:
```text
/pdf-sentence-navigator
│── manifest.json
│── background.js
│── viewer.html
│── viewer.js
│── pdf.min.js
│── pdf.worker.min.js
└── README.md