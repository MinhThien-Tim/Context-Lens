/**
 * The single home of every Reader control name that P2b renames.
 *
 * Contract §7 forbids Page Objects, so these are plain functions returning
 * locators, not classes. P2b changes the string once, in one file, and every
 * spec that opens a renamed surface follows automatically.
 *
 * Renamed in P2b — every literal below is the only occurrence allowed:
  *   - the `Text | PDF` presentation control labels  -> modeLabels / modeControl
  *   - the Vietnamese translations of those labels    -> modeLabelsVi
  *   - the More item `Document`                       -> documentItem
  *   - the More `Context` entry                       -> contextItem
  *   - the `Go to location` opener                    -> openGoToLocation
 *
  * Names that P2b does NOT rename are deliberately absent, so a later reader
  * cannot mistake them for pending renames: `Original`/`Reading` (ARCH-3 keeps
  * the persisted `viewMode` values and only retitles the labels), the Footer
  * location button `Current PDF page` and the dialog `Go to location` itself
  * (NAV-1 wording, unchanged by the amendment list), and the desktop Markup tools
  * `Highlight` / `Underline` / `Erase`.
  */
 import { expect, type Locator, type Page } from '@playwright/test';

 /**
  * ARCH-3 / MODE-3: the one `Text | PDF` presentation control.
  *
  * The two presentations a user switches between are the PDF's `original`
  * (native page) and `reading` (extracted text) views, so `text` is the reading
  * view and `pdf` is the original view. The control labels are `Text` and `PDF`.
  *
  * Only the specs in the P2a commit-B scope route through this helper, so the
  * remaining `Original` / `Reading` literals elsewhere in `e2e/` are a separate
  * task's work, not a second home for these two names.
  *
  * The Vietnamese guide translates these two labels (`Đọc chữ`, `Trang gốc`),
  * which is why the resolver below accepts both spellings. The translation is a
  * separate contract from the control's identity, so it lives beside the label
  * rather than in a second helper.
  */
 export const modeLabels = { text: 'Text', pdf: 'PDF' } as const;

 const modeLabelsVi = { text: 'Đọc chữ', pdf: 'Trang gốc' } as const;

 export type ReaderMode = keyof typeof modeLabels;

 /**
  * MODE-2: the presentation control for a mode, in whichever guide language the
  * Reader is currently showing.
  *
  * With no readable text the control may be hidden or disabled, but it must never
  * be an enabled no-op, so a caller asserting MODE-2 resolves the member and
  * checks its own state rather than assuming it is offered.
  */
 export function modeControl(page: Page, mode: ReaderMode): Locator {
   return page
     .locator('.pdf-mode-switch')
     .getByRole('button', { name: new RegExp(`^(?:${modeLabels[mode]}|${modeLabelsVi[mode]})$`) });
 }

/** MORE-2: the single Document entry in More — the only OCR entry until P4. */
export function documentItem(page: Page): Locator {
  return page.getByRole('menuitem', { name: 'Document', exact: true });
}

/** BACK-1: the More entry that opens the Context surface. */
export function contextItem(page: Page): Locator {
  return page.getByRole('menuitem', { name: 'Context', exact: true });
}

/**
 * NAV-1 / FTR-1: the page-number button opens `Go to location` at every band.
 *
 * `Current PDF page` is the contract name of the location button and `Go to
 * location` is the contract name of the dialog it opens. Both live here so the
 * opener and its destination are changed in one place; the assertions on the
 * dialog keep working against whatever the new names are.
 */
export async function openGoToLocation(page: Page) {
  await page.getByRole('button', { name: 'Current PDF page' }).click();
  const dialog = page.getByRole('dialog', { name: 'Go to location' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The jump target of `Go to location`, used by specs that prove the opener reaches it. */
export function goToLocationPageInput(dialog: Locator): Locator {
  return dialog.getByRole('spinbutton');
}

/** The confirming action of `Go to location`. */
export function goToLocationConfirm(dialog: Locator): Locator {
  return dialog.getByRole('button', { name: 'Go', exact: true });
}
