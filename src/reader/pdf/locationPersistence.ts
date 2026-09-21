import type { DocumentLocation } from '../../documents/location';
import { debounce } from '../../utils/debounce';

export function createLocationPersistence(write: (location: DocumentLocation) => void, delay = 350) {
  let latest: DocumentLocation | undefined;
  let signature = '';
  const task = debounce(() => { if (latest) write(latest); }, delay);
  return {
    update(location: DocumentLocation) {
      const key = JSON.stringify({ ...location, updatedAt: 0 });
      if (key === signature) return;
      signature = key;
      latest = location;
      task.run();
    },
    flush: task.flush,
    cancel: task.cancel,
  };
}
