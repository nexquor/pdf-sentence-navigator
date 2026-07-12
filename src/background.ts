/**
 * Background service worker for the PDF Sentence Navigator extension.
 *
 * Responsibilities:
 * 1. Intercept navigations to .pdf URLs and redirect them to the extension's
 *    custom viewer (viewer.html) with the original URL as a query parameter.
 * 2. Open the viewer for manual file upload when the extension icon is clicked.
 */

// ── PDF URL Interception ─────────────────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener(
  (details: chrome.webNavigation.WebNavigationParentedCallbackDetails) => {
    // Only intercept top-level frame navigations (not iframes)
    if (details.frameId !== 0) return;

    const url: string = details.url;

    // Skip if this is already our viewer page
    if (url.startsWith(chrome.runtime.getURL(''))) return;

    // Check if the URL ends with .pdf (case-insensitive), ignoring query/hash
    try {
      const parsed = new URL(url);
      const pathname: string = parsed.pathname.toLowerCase();

      if (pathname.endsWith('.pdf')) {
        const viewerUrl: string =
          chrome.runtime.getURL('viewer.html') +
          '?file=' +
          encodeURIComponent(url);

        chrome.tabs.update(details.tabId, { url: viewerUrl });
      }
    } catch {
      // Invalid URL — ignore silently
    }
  },
  { url: [{ schemes: ['http', 'https', 'file'] }] }
);

// ── Extension Icon Click ─────────────────────────────────────────

chrome.action.onClicked.addListener((): void => {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
});
