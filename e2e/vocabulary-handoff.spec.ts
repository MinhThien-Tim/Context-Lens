import { test, expect } from '@playwright/test';
// Runtime import keeps browser app types out of the separate Node TS project.
const exporterPath = '../src/vocabulary/export.ts';

test('Context Lens V2 handoff to English101 persists cards and review state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8011/Vocabulary/personal-flashcards.html');
  const { buildEnglish101Export } = await import(exporterPath);
  const payload = buildEnglish101Export([{ id:'handoff',collectionId:'book',collectionTitle:'Reading Book',lemma:'indicate',surface:'indicated',pos:'verb',ipa:null,contextualMeaning:'show',meaningVi:['chỉ ra'],lexicalUnit:null,originalSentence:'The evidence indicated that.',source:{document:'Reading Book',page:83,location:'page 83'},createdAt:1 }]);
  await page.locator('#import').setInputFiles({name:'vocabulary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
  await expect(page.locator('#counts')).toHaveText('1 cards · 1 collections');
  await page.getByRole('button',{name:'Reading Book',exact:true}).click();
  await expect(page.locator('#cards')).toContainText('p.83');
  await page.getByRole('button',{name:'Study',exact:true}).click();
  await expect(page.locator('#front')).toHaveText('indicate');
  await page.locator('#flashcard').press('Enter');
  await expect(page.locator('#answer')).toBeVisible();
  await page.getByRole('button',{name:'Known',exact:true}).click();
  await page.reload();
  await expect(page.locator('#collections')).toContainText('0 to learn / review');
  await page.locator('#study').click();
  await page.locator('#mode').selectOption('cloze');
  await expect(page.locator('#front')).toHaveText('The evidence ______ that.');
  await page.locator('#flashcard').focus();
  await page.locator('#flashcard').dispatchEvent('keydown',{key:'Enter',isComposing:true});
  await expect(page.locator('#answer')).toBeHidden();
  await page.locator('#flashcard').press('Enter');
  await expect(page.locator('#answer-text')).toHaveText('indicated');
  await page.locator('#flashcard').press('Enter');
  await expect(page.locator('#overview')).toBeVisible();
  await page.getByRole('button',{name:'Reading Book',exact:true}).click();
  page.once('dialog',dialog => dialog.accept());
  await page.getByRole('button',{name:'Delete card',exact:true}).click();
  await expect(page.locator('#counts')).toHaveText('0 cards · 1 collections');
  await page.reload();
  await expect(page.locator('#counts')).toHaveText('0 cards · 1 collections');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: `tmp/personal-flashcards-${page.viewportSize()?.width}.png`,fullPage:true});
  expect(errors).toEqual([]);
});


test('V1 import, invalid files, duplicate import, rename, and collection deletion', async ({page}) => {
  await page.goto('http://127.0.0.1:8011/Vocabulary/personal-flashcards.html');
  const v1 = {schema:'english101.context-vocabulary',version:1,exportedAt:new Date().toISOString(),entries:[{id:'legacy',lemma:'read',surface:'read',partOfSpeech:null,ipa:null,meaningEn:'read',meaningsVi:['read VI'],lexicalUnit:null,sentence:'I read books.',source:{document:'Legacy',location:'0%'},createdAt:new Date().toISOString()}]};
  const upload = async (value: unknown) => page.locator('#import').setInputFiles({name:'vocab.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await upload(v1);
  await expect(page.locator('#counts')).toHaveText('1 cards \u00b7 1 collections');
  await upload(v1);
  await expect(page.locator('#counts')).toHaveText('1 cards \u00b7 1 collections');
  await upload({...v1,entries:[{}]});
  await expect(page.locator('#message')).toContainText('Invalid vocabulary file');
  await expect(page.locator('#counts')).toHaveText('1 cards \u00b7 1 collections');
  page.once('dialog',dialog => dialog.accept('Renamed'));
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(page.getByRole('button',{name:'Renamed',exact:true})).toBeVisible();
  await page.locator('#study').click();
  await page.locator('#mode').selectOption('vi-en');
  await expect(page.locator('#front')).toHaveText('read VI');
  await page.locator('#primary').click();
  await expect(page.locator('#answer-text')).toHaveText('read');
  await page.locator('#finish').click();
  page.once('dialog',dialog => dialog.accept());
  await page.getByRole('button',{name:'Delete collection',exact:true}).click();
  await expect(page.locator('#counts')).toHaveText('0 cards \u00b7 0 collections');
});
