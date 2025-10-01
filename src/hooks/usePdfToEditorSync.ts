/**
 * Simplified hook to sync editor to PDF scroll position.
 * Handles: PDF manual scroll, pointer events, locking behavior.
 * 
 * Replaces: usePdfSync, usePreviewEvents
 */

import { useEffect } from 'react';
import { TIMING } from '../constants/timing';
import type { SourceMap, SyncMode } from '../types';

interface UsePdfToEditorSyncParams {
  // Refs
  containerRef: React.RefObject<HTMLDivElement | null>;
  anchorOffsetsRef: React.MutableRefObject<Map<string, number>>;
  sourceMapRef: React.MutableRefObject<SourceMap | null>;
  programmaticScrollRef: React.MutableRefObject<boolean>;
  lastProgrammaticScrollAt: React.MutableRefObject<number | null>;
  mountedAt: React.MutableRefObject<number>;
  userInteractedRef: React.MutableRefObject<boolean>;
  activeAnchorRef: React.MutableRefObject<string | null>;
  syncModeRef: React.MutableRefObject<SyncMode>;
  renderingRef: React.MutableRefObject<boolean>;
  
  // Actions
  setActiveAnchorId: (id: string) => void;
  setSyncMode: (mode: SyncMode) => void;
}

export function usePdfToEditorSync(params: UsePdfToEditorSyncParams): void {
  const {
    containerRef,
    anchorOffsetsRef,
    sourceMapRef,
    programmaticScrollRef,
    lastProgrammaticScrollAt,
    mountedAt,
    userInteractedRef,
    activeAnchorRef,
    syncModeRef,
    renderingRef,
    setActiveAnchorId,
    setSyncMode,
  } = params;

  // Effect: Handle PDF scroll events
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let scrollTimeout: number | null = null;

    // Find closest anchor to given scroll position
    const findClosestAnchor = (scrollPos: number): string | null => {
      const map = sourceMapRef.current;
      if (!map || map.anchors.length === 0) return null;

      let closestId: string | null = null;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const anchor of map.anchors) {
        const offset = anchorOffsetsRef.current.get(anchor.id);
        if (offset === undefined) continue;

        const dist = Math.abs(offset - scrollPos);
        if (dist < bestDist) {
          bestDist = dist;
          closestId = anchor.id;
        }
      }

      return closestId;
    };

    // Update active anchor (debounced logic)
    const updateActiveAnchor = () => {
      // Find closest anchor to center of viewport
      const center = el.scrollTop + el.clientHeight / 2;
      const closestId = findClosestAnchor(center);

      if (closestId && activeAnchorRef.current !== closestId) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PdfToEditorSync] updating active anchor', { closestId });
        }
        setActiveAnchorId(closestId);
      }
    };

    // Handle scroll event (debounced)
    const handleScroll = () => {
      // Ignore programmatic scrolls
      if (programmaticScrollRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PdfToEditorSync] ignoring programmatic scroll');
        }
        return;
      }

      // Ignore if still rendering
      if (renderingRef.current) return;

      // Mark as user interaction (immediate)
      userInteractedRef.current = true;

      // Lock PDF to prevent it from following editor (immediate)
      if (syncModeRef.current !== 'locked-to-pdf') {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PdfToEditorSync] locking PDF (user scrolled)');
        }
        setSyncMode('locked-to-pdf');
      }

      // Debounce the anchor update to avoid excessive state changes
      if (scrollTimeout) window.clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(updateActiveAnchor, TIMING.SCROLL_DEBOUNCE_MS);
    };

    // Attach scroll listener with passive flag for performance
    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (scrollTimeout) window.clearTimeout(scrollTimeout);
      el.removeEventListener('scroll', handleScroll);
    };
  }, [
    containerRef,
    anchorOffsetsRef,
    sourceMapRef,
    programmaticScrollRef,
    renderingRef,
    userInteractedRef,
    activeAnchorRef,
    syncModeRef,
    setActiveAnchorId,
    setSyncMode,
  ]);

  // Effect: Handle pointer events (clicks, drags)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handlePointer = (ev: PointerEvent) => {
      const now = Date.now();
      const lastProg = lastProgrammaticScrollAt.current ?? 0;

      // Only process trusted (real user) events
      if (!ev.isTrusted) return;

      // Ignore if within guard period after programmatic scroll
      if (now - lastProg < TIMING.PROGRAMMATIC_SCROLL_GUARD_MS) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PdfToEditorSync] ignoring pointer - within programmatic guard');
        }
        return;
      }

      // Ignore if within mount guard period
      if (now - mountedAt.current < TIMING.USER_INTERACTION_MOUNT_GUARD_MS) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PdfToEditorSync] ignoring pointer - within mount guard');
        }
        return;
      }

      // Mark as user interaction
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PdfToEditorSync] user pointer interaction');
      }
      userInteractedRef.current = true;
    };

    el.addEventListener('pointerdown', handlePointer);

    return () => {
      el.removeEventListener('pointerdown', handlePointer);
    };
  }, [containerRef, lastProgrammaticScrollAt, mountedAt, userInteractedRef]);

  // Effect: Handle wheel events (for detecting scroll intent)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (ev: WheelEvent) => {
      if (!ev.isTrusted) return;

      const now = Date.now();
      const lastProg = lastProgrammaticScrollAt.current ?? 0;

      // Ignore if within guard period
      if (now - lastProg < TIMING.PROGRAMMATIC_SCROLL_GUARD_MS) return;

      // Any wheel event is user interaction
      userInteractedRef.current = true;

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PdfToEditorSync] wheel event detected');
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef, lastProgrammaticScrollAt, userInteractedRef]);
}
