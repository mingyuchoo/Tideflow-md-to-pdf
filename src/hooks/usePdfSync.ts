import { useEffect } from 'react';
import type { SourceMap, SyncMode } from '../types';
import { TIMING } from '../constants/timing';

interface UsePdfSyncOpts {
  containerRef: React.RefObject<HTMLElement | null>;
  anchorOffsetsRef: React.MutableRefObject<Map<string, number>>;
  sourceMapRef: React.MutableRefObject<SourceMap | null>;
  renderingRef: React.MutableRefObject<boolean>;
  programmaticScrollRef: React.MutableRefObject<boolean>;
  lastProgrammaticScrollAt: React.MutableRefObject<number | null>;
  mountedAt: React.MutableRefObject<number>;
  userInteractedRef: React.MutableRefObject<boolean>;
  activeAnchorRef: React.MutableRefObject<string | null>;
  syncModeRef: React.MutableRefObject<SyncMode>;
  isTypingRef: React.MutableRefObject<boolean>;
  setActiveAnchorId: (id: string) => void;
  setSyncMode: (m: SyncMode) => void;
  scrollToAnchor: (id: string, center?: boolean, force?: boolean) => void;
  recomputeAnchorOffsets: (map: SourceMap | null) => void;
}

export function usePdfSync(opts: UsePdfSyncOpts) {
  const {
    containerRef,
    anchorOffsetsRef,
    renderingRef,
    programmaticScrollRef,
    lastProgrammaticScrollAt,
    mountedAt,
    userInteractedRef,
    activeAnchorRef,
    syncModeRef,
    setActiveAnchorId,
    setSyncMode,
    scrollToAnchor,
    recomputeAnchorOffsets,
    sourceMapRef,
  } = opts;

  // onScroll + pointer handlers: update active anchor and mark user interaction
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      if (renderingRef.current) return;
      userInteractedRef.current = true;
      const map = sourceMapRef.current;
      if (!map || map.anchors.length === 0) return;
      const center = el.scrollTop + el.clientHeight / 2;
      let closestId: string | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const anchor of map.anchors) {
        const offset = anchorOffsetsRef.current.get(anchor.id);
        if (offset === undefined) continue;
        const dist = Math.abs(offset - center);
        if (dist < bestDist) {
          bestDist = dist;
          closestId = anchor.id;
        }
      }
      if (!closestId) return;
      if (syncModeRef.current !== 'locked-to-pdf') {
        setSyncMode('locked-to-pdf');
      }
      if (activeAnchorRef.current !== closestId) {
        setActiveAnchorId(closestId);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    const onPointer = (ev: PointerEvent) => {
      const now = Date.now();
      const lastProg = lastProgrammaticScrollAt.current ?? 0;
      if (!ev.isTrusted) return;
      if (now - lastProg < TIMING.PROGRAMMATIC_SCROLL_GUARD_MS) return;
      if (now - mountedAt.current < TIMING.USER_INTERACTION_MOUNT_GUARD_MS) return;
      userInteractedRef.current = true;
    };
    el.addEventListener('pointerdown', onPointer);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointerdown', onPointer);
    };
  }, [containerRef, anchorOffsetsRef, programmaticScrollRef, renderingRef, sourceMapRef, lastProgrammaticScrollAt, mountedAt, userInteractedRef, activeAnchorRef, syncModeRef, setActiveAnchorId, setSyncMode]);

  // Resize observer: recompute offsets on container resize and keep view in sync
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      if (renderingRef.current) return;
      recomputeAnchorOffsets(sourceMapRef.current);
      if (syncModeRef.current !== 'locked-to-pdf' && activeAnchorRef.current) {
        scrollToAnchor(activeAnchorRef.current);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, recomputeAnchorOffsets, renderingRef, scrollToAnchor, sourceMapRef, syncModeRef, activeAnchorRef]);

}

export default usePdfSync;
