/**
 * Type declarations for the CSS Custom Highlight API.
 */

declare class Highlight {
  constructor(...ranges: Range[]);
}

interface HighlightRegistry {
  set(name: string, highlight: Highlight): void;
  clear(): void;
  delete(name: string): boolean;
  has(name: string): boolean;
}

interface CSS {
  highlights?: HighlightRegistry;
}
