// PDF.js DOM order and canonical reading text differ at line breaks, ligatures and headers.
// Keep explicit text-node boundaries; normalization is only used for alignment, never offsets.
function normalized(text: string) {
  const offsets: number[] = [], ends: number[] = [];
  let value = '';
  for (let i = 0; i < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(i)!);
    for (const next of char.normalize('NFKC')) {
      if (/[\s\u00ad-]/u.test(next)) continue;
      value += next;
      offsets.push(i); ends.push(i + char.length);
    }
    i += char.length;
  }
  return { value, offsets, ends };
}

export class PdfTextIndex {
  private nodes: { node: Text; start: number; end: number }[] = [];
  private raw = '';
  private canonical;
  private dom;
  constructor(readonly root: HTMLElement, readonly text: string, readonly start: number, readonly end = text.length) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node.parentElement?.closest('.endOfContent, [role="img"]'))) continue;
      const start = this.raw.length;
      this.raw += node.textContent ?? '';
      this.nodes.push({ node: node as Text, start, end: this.raw.length });
    }
    this.canonical = normalized(text.slice(start, end));
    this.dom = normalized(this.raw);
  }
  private boundary(node: Node, offset: number): number | undefined {
    const direct = this.nodes.find(item => item.node === node);
    if (direct) return direct.start + Math.min(offset, direct.end - direct.start);
    if (node.nodeType !== Node.ELEMENT_NODE || !this.root.contains(node)) return;
    const child = node.childNodes[offset];
    if (child) return this.nodes.find(item => item.node === child || child.contains(item.node))?.start;
    const contained = this.nodes.filter(item => node.contains(item.node));
    return contained.at(-1)?.end;
  }
  map(range: Range) {
    const rawStart = this.boundary(range.startContainer, range.startOffset);
    const rawEnd = this.boundary(range.endContainer, range.endOffset);
    if (rawStart === undefined || rawEnd === undefined || rawEnd <= rawStart) return null;
    const query = normalized(this.raw.slice(rawStart, rawEnd)).value;
    if (!query || !this.canonical.value) return null;
    const foundPosition = this.dom.offsets.findIndex(offset => offset >= rawStart);
    const domPosition = foundPosition < 0 ? this.dom.value.length : foundPosition;
    // Both sides disambiguate repeated phrases without assuming DOM length equals canonical length.
    const prefix = this.dom.value.slice(Math.max(0, domPosition - 40), domPosition);
    const suffix = this.dom.value.slice(domPosition + query.length, domPosition + query.length + 40);
    let best = -1, score = Infinity;
    for (let at = this.canonical.value.indexOf(query); at >= 0; at = this.canonical.value.indexOf(query, at + 1)) {
      const left = commonSuffix(prefix, this.canonical.value.slice(Math.max(0, at - prefix.length), at));
      const right = commonPrefix(suffix, this.canonical.value.slice(at + query.length, at + query.length + suffix.length));
      const candidateScore = Math.abs(at - domPosition) - (left + right) * (this.canonical.value.length + 1);
      if (candidateScore < score) { score = candidateScore; best = at; }
    }
    // An invented proportional offset can attach lookup, notes, and highlights to the
    // wrong sentence. Only publish offsets backed by canonical text.
    if (best < 0) return null;
    const offset = this.start + this.canonical.offsets[best];
    const endOffset = this.start + this.canonical.ends[Math.min(this.canonical.ends.length - 1, best + query.length - 1)];
    return { offset, endOffset, confidence: 'exact' as const };
  }
  ranges(start: number, end: number): Range[] {
    const result: Range[] = [];
    // Span-local ranges keep highlights attached to the correct rendered words.
    for (const item of this.nodes) {
      const range = document.createRange(); range.selectNodeContents(item.node);
      const mapped = this.map(range);
      if (!mapped || mapped.endOffset <= start || mapped.offset >= end) continue;
      const local = normalized(item.node.data);
      const from = normalized(this.text.slice(mapped.offset, Math.max(mapped.offset, start))).value.length;
      const to = normalized(this.text.slice(mapped.offset, Math.min(mapped.endOffset, end))).value.length;
      if (to <= from) continue;
      range.setStart(item.node, local.offsets[Math.min(local.offsets.length - 1, from)]);
      range.setEnd(item.node, local.ends[Math.min(local.ends.length - 1, to - 1)]);
      result.push(range);
    }
    return result;
  }
}

function commonPrefix(left: string, right: string) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length++;
  return length;
}

function commonSuffix(left: string, right: string) {
  let length = 0;
  while (length < left.length && length < right.length && left[left.length - 1 - length] === right[right.length - 1 - length]) length++;
  return length;
}
