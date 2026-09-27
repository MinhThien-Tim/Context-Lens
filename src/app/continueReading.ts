import { db } from '../db/database';

export function queryContinueReading() {
  return db.documents.orderBy('updatedAt').reverse()
    .filter(doc => doc.location.progress > 0 && !doc.continueReadingDismissed)
    .limit(16).toArray();
}

export async function dismissContinueReading(id: string) {
  await db.documents.update(id, { continueReadingDismissed: true });
}
