# §C1 Packet: Mode-label migration inventories

## LIST A: modeControl/togglePdfMode call sites (to be flipped in step 3)

### mobile-chrome.spec.ts
- Test: `test('a tap does not toggle or reveal chrome (§5.3/§6.7/§15.11) @MOB-3 @INP-4', async ({ page }) => {`
  - Line 62: `await togglePdfMode(page, 'text');`
- Test: `test('the dedicated reveal control is a one-way, non-toggling escape (§6.5/§6.6/§6.7) @MOB-3 @INP-4', async ({ page }) => {`
  - Line 426: `await togglePdfMode(page, 'pdf');`
  - Line 428: `await togglePdfMode(page, 'text');`

### pdf-zoom-footer.spec.ts
- Test: `test('mobile Footer keeps a direct zoom stepper operable down to 320px', async ({ page }) => {`
  - Line 18: `await modeControl(page, 'text').click();`
- Test: `test('progress and location are owned by the Footer at every mobile width (§8.1/§8.5) @FTR-1', async ({ page }) => {`
  - Line 93: `await modeControl(page, 'text').click();`
  - Line 110: `await modeControl(page, 'text').click();`

### pdf-reader-chrome-a12.spec.ts
- Test: `test('quiet/reveal round trip keeps the viewport box and page identity (390) @pdf @CHR-2 @GEO-1 @GEO-2 @GEO-3', async ({ page }) => {`
  - Line 52: `await togglePdfMode(page, 'text');`

### pdf-ocr-queue.spec.ts
- Test: `test('OCRs only inked poor pages in bounded slices and clears their cache @pdf @heavy', async ({ page }) => {`
  - Line 73: `await modeControl(page, 'pdf').click();`
  - Line 86: `await modeControl(page, 'text').click();`
- Test: `test('reports low storage and canvas allocation failure before saving OCR @pdf @heavy', async ({ page }) => {`
  - Line 100: `await modeControl(page, 'pdf').click();`
  - Line 113: `await page.getByRole('button', { name: 'Text', exact: true }).click();`

### pdf-ocr.spec.ts
- Test: `test('lets a reader choose PDF or OCR text on a page with a text layer @pdf @heavy', async ({ page }) => {`
  - Line 86: `await modeControl(page, 'text').click();`
- Test: `test('keeps extracted and scanned pages separate across modes and reopening @pdf @heavy', async ({ page }) => {`
  - Line 109: `await modeControl(page, 'pdf').click();`
  - Line 136: `await modeControl(page, 'text').click();`
- Test: `test('recognizes one scanned page, reads and looks up its text, then reuses the saved result @pdf @heavy', async ({ page }) => {`
  - Line 162: `await modeControl(page, 'pdf').click();`
  - Line 189: `await modeControl(page, 'text').click();`
- Test: `test('cancels OCR and can retry the same scanned page @pdf @heavy', async ({ page }) => {`
  - Line 215: `await modeControl(page, 'pdf').click();`
  - Line 236: `await modeControl(page, 'pdf').click();`
- Test: `test('keeps a blurred two-column scan available beside its recognized text @pdf @heavy', async ({ page }) => {`
  - Line 262: `await modeControl(page, 'pdf').click();`

### reader-contract-surface.spec.ts
- Test: `test('the footer controls are reachable and usable at every band it presents (§9.2/§9.5/§9.6) @MORE-1 @MORE-4', async ({ page }) => {`
  - Line 40: `await modeControl(page, 'text').click();`
- Test: `test('a mode switch does not drive chrome state (§5.1/§10.2) @INP-1 @MODE-1', async ({ page }) => {`
  - Line 191: `await modeControl(page, 'pdf').click();`
  - Line 207: `await modeControl(page, 'text').click();`
- Test: `test('progress and location are owned by the Footer at every mobile width (§8.1/§8.5) @FTR-1', async ({ page }) => {`
  - Line 240: `const reading = modeControl(page, 'pdf');`

## LIST B: literals used as control names (to be replaced with modeControl in step 4)

### pdf-click-mobile.spec.ts
- Test: `test('clicking Original in mobile Header opens desktop PDF view @pdf', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### pdf-mobile-zoom.spec.ts
- Test: `test('mobile zoom-to-fit button works in Original view @pdf', async ({ page }) => {`
  - Line ?: `await page.locator('.pdf-mode-switch').getByRole('button', { name: /Original|Trang gốc/ }).click();`

### pdf-desktop-horizontal-scroll.spec.ts
- Test: `test('desktop Original PDF reaches both horizontal edges after zoom @${width} @pdf', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### pdf-original-first-render-footer.spec.ts
- Test: `test('first desktop canvas uses real bounds and dominant DPR before zoom @pdf', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### pdf-original-native-dpr.spec.ts
- Test: `test('Original PDF default page matches native mobile DPR within the pixel budget @pdf', async ({ page }, info) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### pdf-original-natural-scale.spec.ts
- Test: `test('desktop natural scale, explicit zoom, canvas resolution and text geometry @pdf', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### pdf-original-resolution.spec.ts
- Test: `test('Original PDF keeps the dominant page at display resolution @pdf', async ({ page }, info) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### pdf-real-samples.spec.ts
- Test: `test('real samples keep their intrinsic size and resolution across modes @pdf @heavy', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).click();`

### pdf-stability.spec.ts
- Test: `test('blank and rotated pages keep their page number across both views @pdf', async ({ page }) => {`
  - Line ?: `await expect(page.getByRole('button', { name: 'Original', exact: true }).first()).toBeVisible();`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`
- Test: `test('native forward/reverse selection, Define, Highlight restore, Note @pdf', async ({ page }, info) => {`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`
- Test: `test('50-page scroll has bounded canvases and no passive programmatic scrolls @pdf', async ({ page }, info) => {`
  - Line ?: `await expect(page.getByRole('button', { name: 'Original', exact: true }).first()).toBeVisible({ timeout: 90_000 });`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### pdf-zoom-actual-scale.spec.ts
- Test: `test('§3.1: Header Zoom in increases and Zoom out decreases the rendered slot width at 1280px @pdf', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`

### vocabulary-reader-flow.spec.ts
- Test: `test('save the same PDF word in both modes, reopen, and export once', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`

### reader-p0.spec.ts
- Test: `test('preserves zoom level and scroll percentage when switching modes @pdf', async ({ page }) => {`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`
  - Line ?: `await page.getByRole('button', { name: 'Original', exact: true }).first().click();`
  - Line ?: `await page.getByRole('button', { name: 'Reading', exact: true }).click();`

### pdf-ocr-queue.spec.ts
- Test: `test('reports low storage and canvas allocation failure before saving OCR @pdf @heavy', async ({ page }) => {`
  - Line 113: `await page.getByRole('button', { name: 'Text', exact: true }).click();`