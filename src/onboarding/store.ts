import { db } from '../db/database';

export const CONTEXT_LENS_ONBOARDING_KEY = 'onboarding.contextLensEnglish101.v1';
export const CONTEXT_LENS_GUIDE_LANGUAGE_KEY = 'onboarding.contextLensEnglish101.language';
export type GuideLanguage = 'en' | 'vi';

export async function hasSeenContextLensOnboarding(): Promise<boolean> {
  return (await db.settings.get(CONTEXT_LENS_ONBOARDING_KEY))?.value === true;
}

export async function markContextLensOnboardingSeen(): Promise<void> {
  await db.settings.put({ key: CONTEXT_LENS_ONBOARDING_KEY, value: true });
}

export async function loadGuideLanguage(): Promise<GuideLanguage> {
  return (await db.settings.get(CONTEXT_LENS_GUIDE_LANGUAGE_KEY))?.value === 'vi' ? 'vi' : 'en';
}

export async function saveGuideLanguage(value: GuideLanguage): Promise<void> {
  await db.settings.put({ key: CONTEXT_LENS_GUIDE_LANGUAGE_KEY, value });
}
