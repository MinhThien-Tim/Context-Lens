/** Vietnamese glosses attached to this sense, independent of their source field. */
export function senseVietnameseMeanings(sense: { meaningVi?: string; meaningsVi?: string[] }): string[] {
  const values = [...(sense.meaningsVi ?? []), ...(sense.meaningVi ? sense.meaningVi.split(/\s*(?:\/|;|·)\s*/) : [])];
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    const key = value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
