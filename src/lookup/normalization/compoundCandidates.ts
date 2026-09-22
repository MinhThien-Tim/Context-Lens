const MAX_PARTS = 4;

function splitKnown(value: string, exists: (candidate: string) => boolean): string[] | undefined {
  const memo = new Map<string, string[] | undefined>();
  const visit = (rest: string, depth: number): string[] | undefined => {
    if (exists(rest)) return [rest];
    if (depth >= MAX_PARTS) return undefined;
    if (memo.has(`${depth}:${rest}`)) return memo.get(`${depth}:${rest}`);
    const matches: string[][] = [];
    for (let index = 3; index <= rest.length - 3; index++) {
      const left = rest.slice(0, index);
      if (!exists(left)) continue;
      const right = visit(rest.slice(index), depth + 1);
      if (right) matches.push([left, ...right]);
    }
    const best = matches.sort((a, b) => a.length - b.length || Math.min(...b.map(part => part.length)) - Math.min(...a.map(part => part.length)))[0];
    memo.set(`${depth}:${rest}`, best);
    return best;
  };
  return visit(value, 1);
}

/** Produce a small, ordered set; dictionary evidence is required for glued-token splits. */
export function compoundCandidates(value: string, exists: (candidate: string) => boolean): string[] {
  const results = [value];
  if (value.includes('-')) results.push(value.replace(/-/g, ' '));
  const tokens = value.split(/[ -]+/).filter(Boolean);
  // A lone unknown token may be a PDF fragment. Only attempt glued-word splitting when
  // separators in the original selection provide evidence that it is a compound.
  const expanded = tokens.length > 1 ? tokens.flatMap(token => splitKnown(token, exists) ?? [token]) : tokens;
  if (expanded.length > tokens.length) results.push(expanded.join(' '));
  return [...new Set(results)].slice(0, 8);
}
