/**
 * Type declarations for the CSS Custom Highlight API.
 * This API is relatively new and not yet in all @types/dom packages.
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
