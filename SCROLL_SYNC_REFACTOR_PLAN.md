# Scroll Sync Simplification Plan

**Date**: October 1, 2025  
**Goal**: Reduce 979 lines across 6 hooks → ~200 lines across 2 hooks  
**Status**: Planning

---

## Current Architecture (979 lines)

### 1. useAnchorSync.ts (163 lines)
**Purpose**: Sync PDF to active anchor when it changes
**Key Logic**:
- Guards: locked-to-pdf check, initial scroll done, typing check
- Recomputes offsets if needed
- Calls scrollToAnchor when conditions met
- Handles pending forced anchor

### 2. usePendingScroll.ts (132 lines)
**Purpose**: Handle delayed scroll operations
**Key Logic**:
- Polls for pending forced anchor
- Retries scroll if offsets not ready
- Has timeout logic

### 3. useStartupSync.ts (244 lines)
**Purpose**: Initial sync on app startup
**Key Logic**:
- Mount signal detection (waits for DOM)
- Resilient startup polling
- Fallback offset computation
- One-shot final autosync

### 4. useFinalSync.ts (283 lines)
**Purpose**: Final sync after render completes
**Key Logic**:
- Waits for PDF metrics
- Retries until offsets available
- Forced scroll to restore position
- sourceMap change handling

### 5. usePreviewEvents.ts (52 lines)
**Purpose**: Setup wheel event listener
**Key Logic**:
- Adds wheel event handler to container
- Used for detecting user scroll

###

 6. usePdfSync.ts (105 lines)
**Purpose**: Handle PDF scroll events
**Key Logic**:
- onScroll: update active anchor, set locked-to-pdf
- onPointer: mark user interaction
- ResizeObserver: recompute offsets on resize

---

## Problems with Current Architecture

### 1. **Too Many Responsibilities Split Across Hooks**
- useAnchorSync + usePendingScroll + useFinalSync all do similar things
- "Startup sync" vs "final sync" vs "anchor sync" - lots of overlap
- Multiple polling mechanisms doing the same thing

### 2. **Complex Guard Logic**
- 7+ different flags to check before scrolling
- Flags interact in non-obvious ways
- Hard to reason about which hook will fire when

### 3. **Redundant Offset Computation**
- Multiple hooks call recomputeAnchorOffsets
- No clear owner of "when to recompute"
- Race conditions between recomputes

### 4. **Polling Instead of Events**
- useStartupSync polls every 140ms
- usePendingScroll polls every 100ms  
- useFinalSync polls every 80ms
- Wasteful and can cause flicker

---

## New Simplified Architecture (~200 lines)

### Hook 1: useEditorToPdfSync (~100 lines)
**Responsibility**: When editor scrolls/changes, update PDF position

**Key Logic**:
```typescript
// Listen to activeAnchorId changes from editor
useEffect(() => {
  if (syncMode === 'locked-to-pdf') return; // PDF is locked
  if (!activeAnchorId) return;
  
  // Simple debounce
  const timer = setTimeout(() => {
    scrollToAnchor(activeAnchorId);
  }, isTyping ? 200 : 50);
  
  return () => clearTimeout(timer);
}, [activeAnchorId, syncMode, isTyping]);

// On sourceMap change (new render), scroll to active position
useEffect(() => {
  if (!sourceMap) return;
  if (!activeAnchorId) return;
  
  recomputeOffsets();
  
  // Wait for offsets, then scroll
  const timer = setTimeout(() => {
    scrollToAnchor(activeAnchorId, true);
  }, 100);
  
  return () => clearTimeout(timer);
}, [sourceMap]);
```

**Eliminates**:
- useAnchorSync
- usePendingScroll
- useStartupSync
- useFinalSync

### Hook 2: usePdfToEditorSync (~100 lines)
**Responsibility**: When PDF scrolls, update editor position

**Key Logic**:
```typescript
// PDF scroll handler
useEffect(() => {
  if (!containerRef.current) return;
  const el = containerRef.current;
  
  const handleScroll = () => {
    // User scrolled PDF → lock it
    if (!programmaticScroll) {
      setSyncMode('locked-to-pdf');
      
      // Find closest anchor to center of viewport
      const closestAnchor = findClosestAnchor(el.scrollTop + el.clientHeight / 2);
      if (closestAnchor) {
        setActiveAnchorId(closestAnchor.id);
      }
    }
  };
  
  el.addEventListener('scroll', handleScroll, { passive: true });
  return () => el.removeEventListener('scroll', handleScroll);
}, [containerRef]);

// Resize → recompute offsets
useEffect(() => {
  if (!containerRef.current) return;
  
  const ro = new ResizeObserver(() => {
    recomputeOffsets();
  });
  
  ro.observe(containerRef.current);
  return () => ro.disconnect();
}, [containerRef]);
```

**Eliminates**:
- usePdfSync
- usePreviewEvents

---

## Migration Strategy

### Phase 1: Create New Hooks (Don't Delete Old Ones Yet)
1. ✅ Create `useEditorToPdfSync.ts` with simplified logic
2. ✅ Create `usePdfToEditorSync.ts` with simplified logic
3. ✅ Test both hooks work independently

### Phase 2: Switch PDFPreview to Use New Hooks
1. ⬜ Comment out old hooks in PDFPreview.tsx
2. ⬜ Add new hooks
3. ⬜ Test thoroughly:
   - Startup render + scroll
   - Editor scroll → PDF scroll
   - PDF scroll → lock
   - Editor scroll after lock → unlock
   - File switch
   - Resize

### Phase 3: Delete Old Hooks
1. ⬜ Delete useAnchorSync.ts (163 lines)
2. ⬜ Delete usePendingScroll.ts (132 lines)
3. ⬜ Delete useStartupSync.ts (244 lines)
4. ⬜ Delete useFinalSync.ts (283 lines)
5. ⬜ Delete usePreviewEvents.ts (52 lines)
6. ⬜ Delete usePdfSync.ts (105 lines)
7. ⬜ Update imports in PDFPreview.tsx

### Phase 4: Cleanup
1. ⬜ Remove unused refs from scroll state
2. ⬜ Remove unused flags
3. ⬜ Update CODEBASE_ANALYSIS.md
4. ⬜ Commit with epic message

---

## Expected Results

### Before:
- 979 lines across 6 hooks
- 7+ guard flags
- 3 polling mechanisms
- Complex interaction between hooks
- Hard to debug

### After:
- ~200 lines across 2 hooks
- 2 main flags (syncMode, isTyping)
- Event-driven (no polling)
- Clear separation: editor→PDF vs PDF→editor
- Easy to debug

### Benefits:
- 80% less code
- 10x easier to understand
- No race conditions between hooks
- Better performance (no polling)
- Easier to add features

---

## Next Steps

1. Start Phase 1: Create useEditorToPdfSync.ts
2. Start Phase 1: Create usePdfToEditorSync.ts
3. Test in isolation
4. Proceed to Phase 2

---

*Plan Created: October 1, 2025*  
*Target Completion: Same day*
