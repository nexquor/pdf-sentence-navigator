# PDF Sentence Navigator

A Chrome Extension for navigating and highlighting sentences in PDF documents using the keyboard.

## Quick Start (How to Test)

1. **Build the extension**:
   ```bash
   npm install
   npm run build
   ```
2. **Load into Chrome**:
   - Go to `chrome://extensions/`
   - Turn on **Developer mode** (top right)
   - Click **Load unpacked** and select the `dist/` folder inside this project.
3. **Allow Local File Access (Crucial for testing local PDFs)**:
   - On the extensions page, click **Details** under PDF Sentence Navigator.
   - Toggle on **Allow access to file URLs**.

## Testing the Features

The extension is designed to automatically intercept `.pdf` URLs and render them in a premium custom UI.

### 1. Loading PDFs
- **Online PDF**: Navigate to any `.pdf` link (e.g. `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`). It should instantly open in our custom viewer instead of the default Chrome PDF viewer.
- **Local PDF**: Drag a `.pdf` file into Chrome (or open a `file:///...pdf` URL). It should also open in our custom viewer.
- **Manual Upload**: Click the Extension icon in the Chrome toolbar to open the viewer manually. You can use the **Open PDF** button in the top-left corner to upload any PDF file from your computer.

### 2. Sentence Navigation (The Core Feature)
- Press **`TAB`** to highlight and jump to the next sentence.
- Press **`SHIFT + TAB`** to highlight and jump to the previous sentence.
- **Advanced Sentence Detection**: The app uses `Intl.Segmenter` combined with **Layout Boundary detection** (analyzing Y-axis jumps and X-axis indents in the PDF structure). Test this by navigating through a PDF with **bullet points, lists, or headings**. It successfully treats bullets as separate sentences even if they lack terminal punctuation!

### 3. Exploring the UI
- **Two-Pane Layout**: Notice the clean PDF viewing area on the right and the persistent statistics sidebar on the left.
- **Sidebar Toggle**: Click the `≡` button in the top left to cleanly collapse and expand the sidebar.
- **Document Stats**: 
  - The sidebar displays your exact sentence progress.
  - A floating page indicator in the top right (`Page X / Y`) updates dynamically as you scroll through the document!
- **Active Sentence Preview**: The bottom of the sidebar automatically extracts and displays the text of the sentence you currently have highlighted.
- **PDF Navigator Popover**: Click the "PDF Navigator" button in the top right to open the control widget:
  - **Dark Theme Toggle**: Seamlessly switch the entire application between Light and Dark mode.
  - **Highlight Color Picker**: Click the color swatches (Blue, Yellow, Green, Red) to instantly change the active sentence highlight color!
  - **Copy URL**: Hover over the "Current Source" link and click the copy icon to instantly copy the PDF's URL to your clipboard.

## Technical Notes for Reviewers
- Code is compiled from `src/` (TypeScript) to `dist/`.
- We use the modern **CSS Custom Highlight API** for high-performance, non-destructive DOM highlighting.
- All PDF parsing, text extraction, and sentence boundary detection is performed 100% locally in the browser using the bundled `pdf.js`. No external servers are used.