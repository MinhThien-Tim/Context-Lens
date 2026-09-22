import { db } from '../db/database';

export const CONTEXT_LENS_ONBOARDING_KEY = 'onboarding.contextLensEnglish101.v1';

export async function hasSeenContextLensOnboarding(): Promise<boolean> {
  return (await db.settings.get(CONTEXT_LENS_ONBOARDING_KEY))?.value === true;
}

export async function markContextLensOnboardingSeen(): Promise<void> {
  await db.settings.put({ key: CONTEXT_LENS_ONBOARDING_KEY, value: true });
}
