import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { ContextLensDatabase, db } from '../db/database';
import { collectionTitle, saveVocabulary } from './store';
import { validLookup } from '../test/fixtures';

it('migrates old vocabulary without losing documents or other stores', async () => {
  const name = `migration-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(10).stores({ documents:'id', vocabulary:'id', notes:'id', settings:'key', lookups:'key', dictionaryPacks:'id', translations:'key', contexts:'key', sentenceAnalyses:'key' });
  await old.table('vocabulary').put({id:'old',lemma:'word'});
  await old.table('documents').put({id:'book',title:'Book'});
  await old.table('notes').put({id:'note',text:'Keep'});
  old.close();
  const upgraded = new ContextLensDatabase(name);
  expect((await upgraded.vocabulary.get('old'))?.collectionId).toBe('saved-vocabulary');
  expect((await upgraded.vocabularyCollections.get('saved-vocabulary'))?.title).toBe('Saved vocabulary');
  expect(await upgraded.documents.count()).toBe(1);
  expect(await upgraded.notes.count()).toBe(1);
  await upgraded.delete();
});
it('creates and reuses collections, handles duplicates, and captures structured locations', async () => {
  await db.vocabulary.clear(); await db.vocabularyCollections.clear();
  const document = { id:'book',title:'Book',content:'',kind:'pdf' as const,createdAt:1,updatedAt:1,location:{kind:'pdf' as const,page:83,scrollY:0,progress:0,updatedAt:1} };
  const first = await saveVocabulary(document,validLookup);
  await saveVocabulary(document,validLookup);
  await saveVocabulary(document,{...validLookup,selection:{...validLookup.selection,lemma:'second'}});
  expect(await db.vocabulary.count()).toBe(2);
  expect(await db.vocabularyCollections.count()).toBe(1);
  expect((await db.vocabulary.get(first))?.source.page).toBe(83);
  const epub = await saveVocabulary({...document,id:'epub',kind:'epub',location:{kind:'epub',chapter:3,cfi:null,scrollY:0,progress:0,updatedAt:1}},validLookup);
  expect((await db.vocabulary.get(epub))?.source.chapter).toBe(3);
  await db.vocabulary.clear(); await db.vocabularyCollections.clear();
});
it('uses safe collection title fallbacks', () => {
  expect(collectionTitle({title:' ',filename:'book.pdf'})).toBe('book.pdf');
  expect(collectionTitle({title:42})).toBe('Saved vocabulary');
});

it.each(['text', 'markdown', 'article', 'docx'] as const)('captures %s documents in an automatic collection', async kind => {
  const id = `format-${kind}`;
  const resultId = await saveVocabulary({id,title:'  Source title  ',kind,content:'',createdAt:1,updatedAt:1,location:{kind:'text',scrollY:0,progress:0,updatedAt:1}},validLookup);
  const record = await db.vocabulary.get(resultId);
  expect(record?.collectionTitle).toBe('Source title');
  expect(record?.source.type).toBe(kind);
  await db.vocabulary.delete(resultId); await db.vocabularyCollections.delete(`document:${id}`);
});
