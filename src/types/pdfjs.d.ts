/**
 * Type declarations for PDF.js (pdfjs-dist) — subset used by this extension.
 * We only declare what we actually use rather than pulling in the full pdfjs-dist types.
 */

declare namespace pdfjsLib {
  interface GlobalWorkerOptionsType {
    workerSrc: string;
  }

  const GlobalWorkerOptions: GlobalWorkerOptionsType;

  interface DocumentInitParameters {
    data: ArrayBuffer;
  }

  interface PDFLoadingTask {
    promise: Promise<PDFDocumentProxy>;
  }

  interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  interface PDFPageProxy {
    getViewport(params: { scale: number }): PDFPageViewport;
    render(params: RenderParameters): { promise: Promise<void> };
    getTextContent(): Promise<TextContent>;
  }

  interface PDFPageViewport {
    width: number;
    height: number;
    transform: number[];
  }

  interface RenderParameters {
    canvasContext: CanvasRenderingContext2D;
    viewport: PDFPageViewport;
  }

  interface TextContent {
    items: TextItem[];
  }

  interface TextItem {
    str: string;
    hasEOL: boolean;
    transform: number[];
    fontName: string;
    width: number;
    height: number;
  }

  interface UtilType {
    transform(transform1: number[], transform2: number[]): number[];
  }

  const Util: UtilType;

  function getDocument(params: DocumentInitParameters): PDFLoadingTask;
}
