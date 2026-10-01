# Context Lens Reader Render Flicker Investigation - Planner Report

## 1. Current Rendering Architecture Relevant to This Issue

### Original PDF Mode
- Uses PDF.js to render PDF pages into canvases with a text layer overlay
- Implements a virtualized rendering system that only keeps the current page and immediate neighbors (±1) active in the DOM
- Each `PdfPage` component manages:
  - A canvas element for visual rendering
  - A text layer div for text selection and highlighting
  - PDF.js rendering tasks for both visual and text content
- Rendering lifecycle is controlled by React's `useEffect` hooks that respond to:
  - Page object availability
  - Active state (based on proximity to visible page)
  - Scale changes
  - Document text changes

### Reading Mode
- Uses pre-extracted structured text rendered as DOM elements
- All document pages are rendered in the DOM simultaneously within a scroll container
- Text visibility relies on standard CSS styling (not transparent text like PDF.js text layer)
- Supports switching between native PDF text and OCR text per page via UI toggle

### Shared Infrastructure
- Both modes use `usePdfScroll` hook for scroll position tracking and page visibility calculation
- Both modes share document location state and lookup/popup systems
- CSS base styles in `styles.reader-base.css` define positioning and layering

## 2. Exact Render Lifecycle Observed

### Original PDF Mode Page Activation
1. Page becomes active (enters visibility window)
2. `PdfPage` component mounts or reactivates
3. `useEffect` triggers:
   - Requests PDF page object from PDF.js (cached in state)
   - Sets up canvas dimensions (clears canvas if size changed)
   - Starts visual rendering task (`page.render()`)
   - Fetches text content (`page.getTextContent()`)
   - Creates and starts text layer rendering
   - Waits for both rendering tasks to complete sequentially (text layer first, then visual)
   - Builds text index for selection
   - Renders annotations
4. During rendering:
   - Canvas starts blank (cleared by size setting)
   - Visual content appears progressively as PDF.js renders
   - Text layer remains empty until text rendering completes
   - Full text appearance delayed until both processes finish

### Page Deactivation
1. Page leaves visibility window (>1 offset from visible page)
2. `PdfPage` component unmounts
3. Cleanup occurs:
   - Rendering tasks cancelled
   - PDF page released
   - Canvas reset to 1x1 (clearing visual state)
   - DOM elements removed

### Reading Mode
- Initial load: All pages rendered as DOM elements
- Text immediately visible (no transparency)
- Page source switching (PDF ↔ OCR):
  - Triggers document record update
  - Recomputes visible pages memo
  - Unmounts current page component (PdfReadingPage or PdfOcrReadingPage)
  - Mounts alternative component
  - Causes brief blank state during component transition

## 3. Most Likely Root Cause(s)

### Primary Cause (Original PDF Mode)
**Sequential rendering dependency causing delayed text appearance**
- Evidence: In `PdfPage.tsx`, the effect awaits `textLayer.render()` before awaiting `renderTask.promise`
- This creates a waterfall where visual rendering must complete before text rendering can finish
- User sees partially rendered visual content without text, then text appears later
- Canvas clearing on size reset contributes to blank frames during transitions

### Secondary Cause
**Unnecessary canvas clearing during reactivation**
- Evidence: Canvas width/height reset occurs whenever the effect runs, even when backing dimensions haven't changed
- This clears the previously rendered state, forcing a full re-render
- Particularly noticeable when toggling active state rapidly (e.g., slow scrolling near visibility boundaries)

### Reading Mode Specific Cause
**Component unmount/mount during source switching**
- Evidence: Conditional rendering in `PdfReadingView.tsx` based on `selectedOcr()` and `hasOcr`
- Switching between `PdfOcrReadingPage` and `PdfReadingPage` causes DOM removal and recreation
- Results in layout thrashing and blank states during transition

## 4. Cross-Mode Causality Analysis

| Factor                | Original PDF Mode | Reading Mode | Shared Cause? |
|-----------------------|-------------------|--------------|---------------|
| Desktop vs Mobile     | Same rendering pipeline | Same DOM rendering | Yes (implementation identical) |
| Original vs Reading   | Different (canvas/text-layer vs structured DOM) | Different | No - fundamentally different pipelines |
| Primary Flicker Cause | Rendering waterfall + canvas clearing | Component unmount/mount | No - different mechanisms |
| Contributing Factors  | Virtualization lifecycle | Source toggle UI | No |

**Conclusion**: Desktop and mobile share the same underlying causes within each mode, but Original PDF Mode and Reading Mode have distinct root causes requiring separate solutions.

## 5. Existing Behavior Worth Preserving

- Virtualization efficiency (limiting active canvases to 3) for memory constraints
- Immediate visual feedback during rendering (progressive canvas drawing)
- Text selection and highlighting functionality
- Annotation rendering and interaction
- OCR text switching capability in Reading Mode
- Scroll position persistence and navigation
- Offline functionality and performance characteristics
- Current API contracts for hooks and components

## 6. Recommended Corrective Direction

### For Original PDF Mode
1. **Parallelize rendering completion waiting**
   - Change effect to await `Promise.all([visualRenderPromise, textRenderPromise])` instead of sequential awaiting
   - Reduces total wait time to max(duration) rather than sum(duration)

2. **Smart canvas clearing avoidance**
   - Compare requested backing dimensions with current canvas dimensions
   - Only reset canvas size when dimensions actually change
   - Preserve intermediate rendering state when possible

3. **Consider placeholder strategy for rapid reactivation**
   - For pages recently deactivated (<500ms), show last known frame while re-rendering in background
   - Implement simple timestamp-based cache with size limits

### For Reading Mode
1. **Eliminate unmount/mount during source switching**
   - Implement conditional rendering within stable component wrappers
   - Use CSS transforms/opacity for cross-fading between PDF and OCR text layers
   - Preserve DOM state to avoid layout thrashing

2. **Font loading optimization**
   - Preload and prioritize fonts used in structured text rendering
   - Consider font-display: optional for critical text

## 7. Alternative Approaches Considered

### Original PDF Mode Alternatives
| Approach | Strengths | Weaknesses | Why Not Selected |
|----------|-----------|------------|------------------|
| Increase virtualization buffer | Reduces mount/unmount frequency | Increases memory usage, violates budget | Contradicts core memory constraint |
| Double-buffering canvases | Eliminates blank states during reactivation | Doubles memory usage, complex state management | Overkill for observed issue magnitude |
| CSS opacity transitions | Masks transitions visually | Doesn't address root cause, adds complexity | Superficial fix that doesn't improve actual rendering |
| Service worker pre-rendering | Utilizes background threads | Significant architectural change, browser support issues | Out of scope for narrow fix |

### Reading Mode Alternatives
| Approach | Strengths | Weaknesses | Why Not Selected |
|----------|-----------|------------|------------------|
| Virtualized rendering | Reduces initial load | Reintroduces mount/unmount issues, loses benefits | Trade-off not justified for text-based content |
| Skeleton loaders | Improves perceived performance | Doesn't eliminate actual layout shifts | Addresses symptom not cause |
| CSS containment | Limits layout impact | Doesn't prevent component unmounting | Incomplete solution |

## 8. Minimal Files/Components Likely Involved

### Original PDF Mode Changes
- `src/reader/pdf/PdfPage.tsx` - Core rendering effect modifications
- Potentially `src/reader/pdf/usePdfScroll.ts` - If adjusting activation thresholds

### Reading Mode Changes
- `src/reader/pdf-reading/PdfReadingView.tsx` - Source switching logic
- `src/reader/pdf-reading/PdfOcrReadingPage.tsx` - If implementing conditional rendering
- `src/reader/pdf-reading/PdfReadingPage.tsx` - If implementing conditional rendering

### Shared Potential Changes
- `src/styles.reader-base.css` - If adjusting transition styles
- `src/reader/pdf/renderBudget.ts` - Only if reconsidering memory allocations (not recommended)

## 9. Regression Risks

### Original PDF Mode
- **Visual artifacts**: Preserving canvas state could show stale content if not properly invalidated
- **Memory leaks**: Improper canvas state retention could increase GPU memory usage
- **Selection inaccuracies**: Text index must align with final rendered state
- **Annotation misalignment**: Layer positioning must account for any preserved state
- **Performance degradation**: Smart dimension checking adds minimal overhead but must be optimized

### Reading Mode
- **Source switching delays**: Cross-fading may increase perceived switch time
- **Layout instability**: Conditional rendering within wrappers must maintain exact dimensions
- **Font loading issues**: Preloading may affect initial load metrics
- **Accessibility concerns**: Ensure text remains selectable and readable during transitions

## 10. Verification Strategy

### Manual Verification
- **Desktop Original Mode**:
  - Slow scroll near page boundaries (observe blank frames)
  - Fast scroll/jump between pages (measure time to stable content)
  - Zoom changes (verify no unnecessary clearing)
  - Text selection during rendering (verify correctness)
- **Mobile Original Mode**:
  - Touch scroll emulation (similar to desktop)
  - Device pixel ratio changes (test different DPR scenarios)
- **Reading Mode**:
  - PDF/OCR source switching (measure transition smoothness)
  - Font loading on first use (verify no FOIT)
  - Long documents (verify initial load performance)

### Automated Checks
- **Existing test suite**: Run `src/reader/pdf/stability.test.tsx` and related tests
- **Visual regression**: Consider adding screenshot tests for specific transition scenarios
- **Performance metrics**: Measure time from page activation to stable text appearance using performance API
- **Memory monitoring**: Verify canvas memory usage stays within budget during extended use

### Device Matrix
| Scenario | Desktop Chrome | Desktop Firefox | Mobile Chrome | Mobile Safari |
|----------|----------------|-----------------|---------------|---------------|
| Original PDF Slow Scroll | ✓ | ✓ | ✓ | ✓ |
| Original PDF Fast Jump | ✓ | ✓ | ✓ | ✓ |
| Reading Mode Source Switch | ✓ | ✓ | ✓ | ✓ |
| Zoom Change During Read | ✓ | ✓ | ✓ | ✓ |

## 11. IMPLEMENTER Task Spec

**Goal**: Reduce visual flicker and blank frames in Original PDF Mode by optimizing rendering pipeline and minimizing unnecessary state destruction.

### Changes to Make
1. Modify `src/reader/pdf/PdfPage.tsx`:
   - In the rendering effect:
     - Add backing dimension comparison before setting canvas width/height
     - Only reset canvas dimensions when backing width/height actually changes
     - Change rendering completion waiting from sequential to parallel using `Promise.all([renderedPromise, textRenderedPromise])`
   - Ensure text index creation happens after both rendering promises resolve
   - Preserve existing error handling and cleanup logic

2. Verify no changes to:
   - Virtualization logic (activation/deactivation thresholds)
   - Text selection and highlighting functionality
   - Annotation rendering
   - OCR queue integration
   - External APIs (props, hooks return values)

### Success Criteria
- **Primary**: Eliminate visible blank/black frames during normal scrolling transitions
- **Secondary**: Reduce time to stable text appearance by ≥30% on mid-range devices
- **Regression**: All existing unit tests pass
- **Memory**: Canvas memory usage remains within `MAX_CANVAS_PIXELS` budget
- **Functionality**: Text selection, highlighting, annotations, and lookup work correctly during and after rendering

### Non-Goals
- Do not change virtualization buffer size
- Do not alter Reading Mode rendering architecture
- Do not introduce animations or placeholder UI elements
- Do not modify PDF.js usage or upgrade dependencies
- Do not change document loading or persistence mechanisms

### Verification Steps for Implementer
1. Run existing PDF-related tests: `npm test -- src/reader/pdf`
2. Manual verification:
   - Open a multi-page PDF document
   - Scroll slowly near page transitions - verify no blank frames
   - Scroll quickly between distant pages - verify stable content appears quickly
   - Change zoom settings - verify no unnecessary clearing
   - Select text during rendering - verify correct selection behavior
   - Add/remove highlights - verify annotations render correctly
3. Confirm no test regressions in related modules
