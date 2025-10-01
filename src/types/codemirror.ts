/**
 * CodeMirror type extensions for internal properties
 * These types extend the official CodeMirror types with undocumented properties
 * that we use for scroll handling and event management.
 */

import type { EditorView } from '@codemirror/view';

/**
 * Extended EditorView with access to the scroll DOM element
 */
export interface EditorViewWithScrollDOM extends EditorView {
  scrollDOM: HTMLElement;
}

/**
 * HTMLElement with optional Tideflow scroll handler attached
 */
export interface ScrollElementWithHandler extends HTMLElement {
  _tideflowScrollHandler?: () => void;
}

/**
 * EditorView with optional scroll DOM that has an attached handler
 */
export interface EditorViewWithHandler {
  scrollDOM?: ScrollElementWithHandler;
}

/**
 * Type guard to check if an EditorView has a scrollDOM property
 */
export function hasScrollDOM(view: EditorView): view is EditorViewWithScrollDOM {
  return 'scrollDOM' in view && view.scrollDOM instanceof HTMLElement;
}

/**
 * Safely get the scroll element from an EditorView
 */
export function getScrollElement(view: EditorView): HTMLElement | null {
  if (hasScrollDOM(view)) {
    return view.scrollDOM;
  }
  return null;
}

/**
 * Get scroll element with handler support
 * Returns an object with scrollDOM property for compatibility
 */
export function getScrollElementWithHandler(view: EditorView): { scrollDOM?: ScrollElementWithHandler } {
  const scrollEl = getScrollElement(view);
  return { scrollDOM: scrollEl ? (scrollEl as ScrollElementWithHandler) : undefined };
}
