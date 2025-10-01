# PDF Rendering System - Comprehensive Analysis

## Executive Summary

This document provides a deep dive into the PDF rendering and synchronization system in the Md-to-PDF application. It covers the architecture, data flow, performance optimizations, and common pitfalls.

---

## 1. System Architecture Overview

### High-Level Components

```
┌─────────────┐
│   Editor    │ ──────┐
│ (CodeMirror)│       │
└─────────────┘       │
                      ▼
                ┌──────────┐
                │  Store   │ (Zustand)
                │ (State)  │
                └──────────┘
                      │
                      ▼
┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│ PDFPreview  │◄─┤ Rust Backend │◄─┤   Typst     │
│  Component  │  │   (Tauri)    │  │  Compiler   │
└─────────────┘  └──────────────┘  └─────────────┘
```

### Key State Flow

1. **User types in Editor** → 
2. **Content debounced & sent to Rust** → 
3. **Typst compiles to PDF** → 
4. **PDF path returned to frontend** → 
5. **usePdfRenderer triggers** → 
6. **PDF.js renders pages** → 
7. **Anchor offsets computed** → 
8. **Scroll sync activated**

---

## 2. Core Hooks & Their Responsibilities

### 2.1 `usePdfRenderer` (Master Orchestrator)

**Location:** `src/hooks/usePdfRenderer.ts`

**Purpose:** Handles the entire PDF rendering lifecycle when a new PDF is compiled.

**Trigger Conditions:**
- `compileStatus.status` changes
- `compileStatus.pdf_path` changes
- Memoized callbacks change (should be rare)

**Key Operations:**
1. Clears old PDF from DOM
2. Converts file path to browser-loadable URL
3. Calls `renderPdfPages()` to render all pages
4. Stores page metrics (height, scale, page number)
5. Calls `recomputeAnchorOffsets()` to map anchors to Y positions
6. Attempts PDF text extraction if Typst query failed
7. Creates fallback offsets if extraction fails
8. Registers pending scroll to sync on first render

**Critical Dependencies:**
```typescript
useEffect(..., [
  compileStatus.status,
  compileStatus.pdf_path,
  recomputeAnchorOffsets,    // Must be memoized!
  scrollToAnchor,            // Must be memoized!
  setRendering,
  setPdfError,
  consumePendingAnchor,      // Must be memoized!
  registerPendingAnchor,     // Must be memoized!
  args.mountSignal,
])
```

**Performance Notes:**
- ⚠️ **NEVER include refs in dependency array** - they're stable and don't need to trigger re-renders
- ✅ All function callbacks MUST be wrapped in `useCallback` with stable dependencies
- ✅ Effect should only run when PDF actually changes

---

### 2.2 `useOffsetManager` (Anchor Position Calculator)

**Location:** `src/hooks/useOffsetManager.ts`

**Purpose:** Manages the mapping between markdown anchor IDs and their Y-position in the PDF.

**Key Data Structures:**
```typescript
anchorOffsetsRef: Map<string, number>  // anchor ID → Y pixel offset
pdfMetricsRef: Array<{page, height, scale}>
sourceMapRef: SourceMap | null
```

**Main Function: `recomputeAnchorOffsets(map)`**

**Algorithm:**
1. Sorts pages by page number
2. For each anchor in source map:
   - If anchor has PDF position data (from Typst query):
     - Finds the page containing the anchor
     - Calculates cumulative Y offset: `sum of previous page heights + (anchor.y * page.scale)`
   - If no PDF position: skips (will use fallback later)
3. Returns computed offsets Map

**Performance:**
- Uses `useCallback` with `[scrollStateRefs, registerPendingAnchor]` dependencies
- Only recomputes when explicitly called (not automatic)
- Logs samples for debugging: first 5 anchors and whether they have PDF positions

**Edge Cases:**
- If metrics are empty: returns empty offsets, keeps existing map
- If anchor has no page match: skips that anchor
- On first populate: registers pending forced scroll for initial sync

---

### 2.3 `useEditorToPdfSync` (Editor → PDF Scroll Sync)

**Location:** `src/hooks/useEditorToPdfSync.ts`

**Purpose:** Syncs PDF scroll position when user scrolls or types in the editor.

**Key Logic:**

#### A. Active Anchor Effect (Lines 50-68)
```typescript
useEffect(() => {
  if (activeAnchorId === lastActiveAnchorIdRef.current) return; // Prevent feedback loop
  
  lastActiveAnchorIdRef.current = activeAnchorId;
  
  const timerId = setTimeout(() => {
    scrollToAnchor(activeAnchorId, false, false);
  }, debounceMs);
  
  return () => clearTimeout(timerId);
}, [activeAnchorId, debounceMs, scrollToAnchor]);
```

**Optimizations:**
- **Feedback loop prevention:** Uses `lastActiveAnchorIdRef` to skip if same anchor
- **Debouncing:** 100ms delay before scrolling (configurable)
- **Guards:** Checks if offsets exist, respects sync mode

#### B. ResizeObserver Effect (Lines 217-257)
```typescript
const resizeObserver = new ResizeObserver(() => {
  const newWidth = el.clientWidth;
  const newHeight = el.clientHeight;
  
  // Only recompute if size changed significantly (>5px)
  if (Math.abs(newWidth - lastWidth) < 5 && Math.abs(newHeight - lastHeight) < 5) {
    return;
  }
  
  lastWidth = newWidth;
  lastHeight = newHeight;
  
  if (resizeTimeout) window.clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    recomputeAnchorOffsets(sourceMapRef.current);
    // Re-sync after resize...
  }, 150);
});
```

**Optimizations:**
- **Size threshold:** Ignores changes <5px (prevents micro-resize spam)
- **Debouncing:** 150ms delay before recomputing
- **Size tracking:** Remembers last width/height to detect actual changes

---

### 2.4 `usePdfToEditorSync` (PDF → Editor Scroll Sync)

**Location:** `src/hooks/usePdfToEditorSync.ts`

**Purpose:** Updates active anchor when user manually scrolls the PDF.

**Key Logic:**
```typescript
const handleScroll = () => {
  programmaticScrollRef.current = false;
  userInteractedRef.current = true;
  
  if (scrollTimeout) window.clearTimeout(scrollTimeout);
  scrollTimeout = window.setTimeout(updateActiveAnchor, TIMING.SCROLL_DEBOUNCE_MS);
};

const updateActiveAnchor = () => {
  const center = el.scrollTop + el.clientHeight / 2;
  const closestId = findClosestAnchor(center);
  if (closestId && activeAnchorRef.current !== closestId) {
    setActiveAnchorId(closestId);
  }
};
```

**Optimizations:**
- **Debouncing:** 80ms delay before updating anchor (prevents spam during scroll)
- **Center-based:** Finds anchor closest to viewport center
- **Guard check:** Only updates if anchor actually changed

**Sync Mode Logic:**
- `editor-to-pdf`: PDF scroll updates editor
- `locked-to-pdf`: Editor updates are blocked
- `editor-to-pdf` (default): Bidirectional sync

---

### 2.5 `scrollToAnchor` (PDF Scroll Controller)

**Location:** `src/components/PDFPreview.tsx` (Lines 103-223)

**Purpose:** Programmatically scrolls PDF to a specific anchor position.

**Signature:**
```typescript
scrollToAnchor(anchorId: string, center: boolean = false, force: boolean = false)
```

**Guards & Checks:**
1. **DOM check:** Element exists and is connected
2. **Offset check:** Anchor has computed offset
3. **Typing check:** Skip if user is typing (unless forced)
4. **Near-top guard:** Avoid jumping to near-top positions
5. **Already-there check:** Skip if within 10px of target position
6. **One-shot forced scroll:** Only allow one forced startup scroll

**Scroll Calculation:**
```typescript
const bias = center ? el.clientHeight / 2 : el.clientHeight * 0.3;
const target = Math.max(0, offset - bias);
```
- `center=true`: Centers anchor in viewport
- `center=false`: Places anchor at 30% from top (default)

**Position Tolerance:**
```typescript
if (Math.abs(currentTop - target) <= UI.SCROLL_POSITION_TOLERANCE_PX) {
  return; // Skip redundant scroll
}
```
- Threshold: 10px
- Prevents infinite scroll loops

**Programmatic Scroll Tracking:**
```typescript
programmaticScrollRef.current = true;
lastProgrammaticScrollAt.current = Date.now();
el.scrollTo({ top: target, behavior: 'auto' });

requestAnimationFrame(() => {
  setTimeout(() => {
    programmaticScrollRef.current = false;
  }, 60);
});
```
- Sets flag BEFORE scroll
- Clears flag after 60ms
- Prevents PDF-to-Editor sync during programmatic scroll

---

## 3. Data Flow: Complete Lifecycle

### 3.1 Initial Load Sequence

```
1. [App.tsx] Mounts
   └─> [Editor.tsx] Mounts
       └─> Loads sample document
       └─> [useEditorSync] Computes initial active anchor
       └─> setActiveAnchorId("tf-719-6")

2. [Rust Backend] Auto-compiles on load
   └─> Typst generates PDF
   └─> Returns { status: "ok", pdf_path: "..." }

3. [usePdfRenderer] Effect triggers
   └─> renderPdfPages() renders all pages
   └─> pdfMetricsRef updated with page heights
   └─> recomputeAnchorOffsets() called
       └─> Iterates through sourceMap.anchors
       └─> Maps each anchor to Y pixel position
       └─> anchorOffsetsRef updated (0 → 107 offsets)
   └─> Registers pending forced scroll

4. [useEditorToPdfSync] Effect triggers
   └─> Waits for offsets (offsets=0 initially)
   └─> After offsets computed: performs initial sync
   └─> scrollToAnchor("tf-719-6", false, true)
       └─> Scrolls PDF to editor's position
```

### 3.2 User Types in Editor

```
1. [Editor] User types → content changes
   └─> [useEditorSync] Detects scroll position
   └─> Computes closest anchor to cursor
   └─> setActiveAnchorId("new-anchor-id")

2. [useEditorToPdfSync] activeAnchorId effect triggers
   └─> Checks lastActiveAnchorIdRef (feedback loop guard)
   └─> Sets lastActiveAnchorIdRef = new-anchor-id
   └─> setTimeout(() => scrollToAnchor("new-anchor-id"), 100ms)

3. [scrollToAnchor] Executes after debounce
   └─> Checks if offset exists
   └─> Checks if already at position (within 10px)
   └─> If not: scrolls PDF to anchor
   └─> Sets programmaticScrollRef = true
   └─> After 60ms: clears programmaticScrollRef

4. [Rust Backend] Content debounced (300ms)
   └─> Typst recompiles
   └─> Returns new pdf_path

5. [usePdfRenderer] Effect triggers (new PDF)
   └─> Clears old pages
   └─> Renders new pages
   └─> Recomputes offsets
   └─> Attempts initial sync if needed
```

### 3.3 User Scrolls PDF Manually

```
1. [usePdfToEditorSync] PDF scroll event fires
   └─> Sets programmaticScrollRef = false
   └─> Sets userInteractedRef = true
   └─> Clears existing timeout
   └─> setTimeout(() => updateActiveAnchor(), 80ms)

2. [updateActiveAnchor] Executes after debounce
   └─> Calculates center of viewport
   └─> Finds closest anchor to center
   └─> If different: setActiveAnchorId(closestId)

3. [useEditorSync] (In Editor.tsx)
   └─> Listens to activeAnchorId changes
   └─> Scrolls editor to matching line
   └─> Updates editor view
```

---

## 4. Performance Optimizations

### 4.1 Debouncing Strategy

| Event | Debounce | Purpose |
|-------|----------|---------|
| Editor scroll | 100ms | Prevent excessive PDF updates while scrolling |
| PDF scroll | 80ms | Prevent excessive anchor updates while scrolling |
| ResizeObserver | 150ms | Prevent excessive offset recomputation |
| Content changes | 300ms | Prevent excessive recompilations |

### 4.2 Position Tolerance

**Problem:** Small floating-point differences cause infinite scroll loops.

**Solution:** 10px tolerance zone
```typescript
if (Math.abs(currentTop - target) <= 10) {
  return; // Already at target
}
```

### 4.3 Feedback Loop Prevention

**Problem:** Editor → PDF sync triggers PDF → Editor sync, creating loop.

**Solutions:**
1. **programmaticScrollRef:** Skip PDF-to-Editor sync during programmatic scroll
2. **lastActiveAnchorIdRef:** Skip Editor-to-PDF sync if same anchor
3. **userInteractedRef:** Track manual vs automatic interactions

### 4.4 Ref-Based Optimization

**Critical Rule:** ⚠️ **NEVER put refs in useEffect dependency arrays!**

```typescript
// ❌ WRONG - Causes infinite re-renders
}, [containerRef, anchorOffsetsRef, isTypingRef]);

// ✅ CORRECT - Refs are stable, don't need to be in deps
}, []);
```

**Why?**
- Refs are stable objects that never change
- React may compare ref objects and think they changed
- Including refs triggers unnecessary effect re-runs
- Access refs via `.current` inside effect (not in deps)

### 4.5 Function Memoization

**Critical Rule:** ✅ **All callbacks in effect deps must be memoized with useCallback!**

```typescript
// ❌ WRONG - Creates new function every render
const offsetManager = useOffsetManager({
  registerPendingAnchor: (anchorId) => {
    doSomething(anchorId);
  },
});

// ✅ CORRECT - Stable function reference
const callback = useCallback((anchorId) => {
  doSomething(anchorId);
}, []); // Empty deps if only using refs

const offsetManager = useOffsetManager({
  registerPendingAnchor: callback,
});
```

**Why?**
- Inline arrow functions create new instances every render
- `useCallback` dependencies see function change → re-memoize → effect re-runs
- Chain reaction: callback changes → `recomputeAnchorOffsets` changes → `usePdfRenderer` effect re-runs

---

## 5. Common Pitfalls & Solutions

### 5.1 Infinite Re-Render Loop

**Symptoms:**
```
[usePdfRenderer] post-render check
[useOffsetManager] recomputeAnchorOffsets done: offsets=0, totalOffsets=107
[usePdfRenderer] post-render check
[useOffsetManager] recomputeAnchorOffsets done: offsets=0, totalOffsets=107
... (repeats 100+ times)
```

**Root Causes:**
1. ❌ Refs in dependency array
2. ❌ Unmemoized callback functions
3. ❌ Inline arrow functions passed to hooks

**Solution:**
```typescript
// Remove refs from deps
useEffect(() => {
  // Access refs via .current
  const value = myRef.current;
}, []); // ← Refs removed!

// Memoize all callbacks
const callback = useCallback(() => {
  // ...
}, []); // ← Stable deps only
```

### 5.2 Scroll Sync Not Working

**Symptoms:**
- Editing doesn't scroll PDF
- PDF scroll doesn't update editor

**Checklist:**
1. ✅ Check `anchorOffsetsRef.current.size > 0` (offsets computed?)
2. ✅ Check `syncMode !== 'locked-to-pdf'`
3. ✅ Check `activeAnchorId` is being set correctly
4. ✅ Check `scrollToAnchor` is being called
5. ✅ Check console for guard messages (typing, near-top, already-there)

### 5.3 Excessive Recomputations

**Symptoms:**
```
[useOffsetManager] recomputeAnchorOffsets done: offsets=0, samples=[...], totalOffsets=107
... (logs every scroll, every resize)
```

**Causes:**
- ResizeObserver firing on micro-changes
- Effect dependencies too broad
- No debouncing on resize events

**Solution:** See section 4.2 (ResizeObserver optimization)

### 5.4 Anchor Offsets Always Zero

**Symptoms:**
```
[useOffsetManager] recomputeAnchorOffsets done: offsets=0, samples=[...], totalOffsets=0
```

**Causes:**
1. Typst query failed (no position data in source map)
2. PDF metrics not loaded yet
3. Source map has no anchors

**Solutions:**
- Check `[TypstQuery] no positions found` message
- System automatically falls back to PDF text extraction
- If that fails: uses geometric fallback (evenly spaced)

---

## 6. Debug Logging Reference

### Key Log Messages

| Log Message | Location | Meaning |
|-------------|----------|---------|
| `[App] init start` | App.tsx | App mounting |
| `[Editor] Mounted generation X` | Editor.tsx | Editor instance created |
| `[usePdfRenderer] post-render check` | usePdfRenderer.ts:198 | PDF render cycle complete |
| `[useOffsetManager] recomputeAnchorOffsets done` | useOffsetManager.ts:77 | Anchor positions computed |
| `[EditorToPdfSync] syncing to anchor` | useEditorToPdfSync.ts:91 | Scrolling PDF to match editor |
| `[PDFPreview] scrollToAnchor requested` | PDFPreview.tsx:110 | Scroll function called |
| `[PDFPreview] already at target position` | PDFPreview.tsx:159 | Skipped redundant scroll |
| `[TypstQuery] no positions found` | App.tsx | Falling back to text extraction |

### Performance Monitoring

**What to Look For:**
- ✅ **Good:** `post-render check` appears 1-2 times per actual PDF change
- ❌ **Bad:** `post-render check` appears 10+ times in rapid succession
- ✅ **Good:** `recomputeAnchorOffsets` with `offsets=107` (actual new offsets)
- ❌ **Bad:** `recomputeAnchorOffsets` with `offsets=0` repeatedly (recomputing same data)

---

## 7. Architecture Decisions

### Why Refs Instead of State?

Many values use `useRef` instead of `useState`:
- **Performance:** Refs don't trigger re-renders when mutated
- **Timing:** Need immediate access to latest value without waiting for re-render
- **Guards:** Flags like `programmaticScrollRef` need instant read/write

**Rule of Thumb:**
- Use `useState` if UI needs to react to changes
- Use `useRef` if only code logic needs the value

### Why Three Separate Sync Hooks?

Instead of one giant sync hook:
1. **Separation of Concerns:** Each hook has single responsibility
2. **Composability:** Hooks can be used independently
3. **Testability:** Easier to test small focused hooks
4. **Debugging:** Logs clearly show which part is running

### Why Debouncing?

Without debouncing:
- Scrolling generates 60+ events/second
- Each event triggers state update → re-render → effect
- Result: Browser hangs, 100% CPU usage

With debouncing:
- Scrolling generates 60+ events/second
- Only 1 update fires after scroll stops
- Result: Smooth performance

---

## 8. Future Improvements

### Potential Optimizations

1. **Virtual Scrolling for Large PDFs**
   - Only render visible pages
   - Unload off-screen pages
   - Would reduce memory usage for 100+ page documents

2. **Worker Thread for Offset Computation**
   - Move `computeAnchorOffsets` to Web Worker
   - Prevents blocking main thread
   - Useful for documents with 1000+ anchors

3. **Incremental Offset Updates**
   - Instead of recomputing all offsets on resize
   - Only update offsets for visible pages
   - Would improve resize performance

4. **Anchor Caching**
   - Cache offset computations across PDF reloads
   - If anchor hasn't moved, reuse old offset
   - Would speed up recompilations

### Code Quality Improvements

1. **Type Safety**
   - Create stricter types for refs
   - Use discriminated unions for sync modes
   - Add runtime validation for offsets

2. **Testing**
   - Unit tests for offset computation
   - Integration tests for scroll sync
   - Performance benchmarks

3. **Documentation**
   - JSDoc comments on all hooks
   - Inline explanations for complex logic
   - Architecture diagrams

---

## 9. Conclusion

The rendering system is a carefully orchestrated dance between:
- PDF.js rendering
- Typst position data
- React lifecycle
- Scroll event handling
- State management

**Key Takeaways:**
1. ⚠️ Never put refs in dependency arrays
2. ✅ Always memoize callbacks passed to hooks
3. ✅ Use debouncing for high-frequency events
4. ✅ Add tolerance zones for floating-point comparisons
5. ✅ Use feedback loop prevention (refs + guards)

**Performance Checklist:**
- [ ] All callbacks wrapped in `useCallback`
- [ ] No refs in effect dependency arrays
- [ ] Debouncing on scroll/resize events
- [ ] Position tolerance checks in scroll logic
- [ ] Feedback loop guards (programmaticScrollRef, lastActiveAnchorIdRef)

---

**Last Updated:** October 1, 2025
**Author:** System Analysis
**Version:** 1.0
