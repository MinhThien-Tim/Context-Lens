import { rankedLemmaCandidates } from '../dictionary/seedDictionary';

export function morphologyCandidates(value: string): string[] {
  return rankedLemmaCandidates(value);
}
