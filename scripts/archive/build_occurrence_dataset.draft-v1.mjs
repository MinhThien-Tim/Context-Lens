/**
 * build_occurrence_dataset.mjs — frozen sampler for T1 Phase 5, T3, T4, T5
 * 
 * Rules frozen in SOURCE.md v2. Run exactly once with fixed seed.
 * Outputs: data/occurrences/occurrences.jsonl + dataset-manifest.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data", "occurrences");
const TMP = join(ROOT, "tmp", "corpus-cache");

// Frozen constants
const DATASET_VERSION = "1.0.0";
const SAMPLING_RULE_VERSION = "2.0.0"; // v2 per SOURCE.md amendments
const SEED = 0xC0FFEE; // fixed seed, recorded in manifest
const MIN_PER_LEMMA = 5;
const TARGET_PER_LEMMA = 10;
const MAX_PER_DOCUMENT = 3;
const MAX_PER_NEIGHBOUR = 2;
const MIN_DISTINCT_DOCUMENTS = 3;
const MIN_SENTENCE_WORDS = 6;
const MAX_SENTENCE_WORDS = 60;
const CONTEXT_CHARS = 400;
const POS_CAP_RATIO = 0.6; // ~60% per POS
const MAX_PER_AUTHOR = 2;
const NEAR_DUP_THRESHOLD = 0.85; // Jaccard on content words
const RESOLVER_FULL_MATCH_MIN_LEN = 20;
const STRATUM_C_SIZE = 200;

// Abbreviations for sentence splitting
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc",
  "i.e", "e.g", "cf", "ca", "fig", "pp", "vol", "ch", "no", "nos",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  "a.m", "p.m", "am", "pm", "est", "pst", "gmt", "utc",
  "u.s", "u.k", "e.u", "n.a", "s.a", "inc", "ltd", "corp", "co",
  "rev", "hon", "pres", "gov", "sen", "rep", "gen", "col", "maj", "capt", "lt", "sgt"
]);

// Deterministic pseudo-random (xorshift32)
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

const rng = makeRng(SEED);

// Normalization helpers
function normalize(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lemmaPattern(lemma) {
  // Unicode word boundaries, internal \s+ tolerance for line wrapping, case-insensitive
  const parts = lemma.split(/\s+/).map(escapeRe);
  return new RegExp(`(?:^|\\W)(${parts.join("\\s+")})(?:\\W|$)`, "i");
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function contentWords(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function jaccard(a, b) {
  const inter = [...a].filter(x => b.has(x)).length;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Sentence segmentation with abbreviation handling
function splitSentences(text) {
  const sentences = [];
  let current = "";
  const words = text.split(/(\s+)/);
  
  for (let i = 0; i < words.length; i++) {
    const token = words[i];
    current += token;
    
    // Check for sentence ending
    if (/[.!?]+$/.test(token)) {
      // Check if it's an abbreviation
      const wordPart = token.replace(/[.!?]+$/, "").toLowerCase();
      const isAbbr = ABBREVIATIONS.has(wordPart) || 
                     /^[a-z]\.$/.test(wordPart) || // single letter + period
                     /^\d+\.$/.test(wordPart);      // numbered list
      
      // Check for decimal number (e.g., 3.14)
      const prevToken = words[i - 1] || "";
      const isDecimal = /^\d+$/.test(prevToken) && /^\d+/.test(words[i + 1] || "");
      
      if (!isAbbr && !isDecimal) {
        sentences.push(current.trim());
        current = "";
      }
    }
  }
  
  if (current.trim()) sentences.push(current.trim());
  return sentences.filter(s => s.length > 0);
}

function sentenceRejection(sentence) {
  const words = wordCount(sentence);
  if (words < MIN_SENTENCE_WORDS || words > MAX_SENTENCE_WORDS) return "length";
  
  // Reject headings (all caps, short, no verb-like structure)
  if (sentence === sentence.toUpperCase() && words < 10 && !/[a-z]/.test(sentence)) {
    return "heading";
  }
  
  // Reject non-prose (low letter density)
  const letters = (sentence.match(/[a-zA-Z]/g) || []).length;
  const nonSpace = sentence.replace(/\s/g, "").length;
  if (nonSpace > 0 && letters / nonSpace < 0.55) return "nonprose";
  
  // Reject synthetic audit frames
  if (/^The selected expression is /.test(sentence)) return "synthetic";
  
  return null;
}

// Load data
const roster = JSON.parse(readFileSync(join(DATA, "roster.json"), "utf8"));
const pool = JSON.parse(readFileSync(join(DATA, "pool.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(DATA, "corpus-manifest.json"), "utf8"));
const resolverSeenRaw = JSON.parse(readFileSync(join(DATA, "resolver-seen-index.json"), "utf8"));

// resolverSeenIndex: lemma -> Set of normalized evidence strings
const resolverSeenIndex = {};
for (const [lemma, data] of Object.entries(resolverSeenRaw)) {
  const set = new Set();
  const examples = data.index?.examples || data.examples || [];
  for (const ex of examples) {
    const norm = normalize(ex).toLowerCase();
    if (norm.length >= RESOLVER_FULL_MATCH_MIN_LEN) set.add(norm);
  }
  resolverSeenIndex[lemma] = set;
}

function checkResolverSeen(lemma, sentence) {
  const norm = normalize(sentence).toLowerCase();
  const set = resolverSeenIndex[lemma] || new Set();
  
  // Full match exclusion
  if (set.has(norm)) return { seen: true, type: "full", evidence: norm };
  
  // Substring match (mark only)
  for (const ex of set) {
    if (norm.includes(ex) || ex.includes(norm)) {
      return { seen: true, type: "partial", evidence: ex };
    }
  }
  
  return { seen: false, type: null, evidence: null };
}

// POS inference from surface cues (no product pipeline)
const DETERMINERS = new Set(["the", "a", "an", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their", "some", "any", "every", "no"]);
const AUXILIARIES = new Set(["is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should", "can", "could", "may", "might", "must", "ought"]);

function inferPos(sentence, lemma, allPos) {
  const tokens = sentence.toLowerCase().split(/\s+/);
  const idx = tokens.findIndex(t => t.replace(/[^\w]/g, "") === lemma.toLowerCase().replace(/[^\w]/g, ""));
  if (idx === -1) return allPos[0] || "noun";
  
  const before = tokens[idx - 1];
  const after = tokens[idx + 1];
  
  // Verb cues
  if (AUXILIARIES.has(before) || after === "to" || /^(to|will|would|can|could|should|may|might|must)\b/.test(after || "")) {
    if (allPos.includes("verb")) return "verb";
  }
  
  // Adjective cues
  if (DETERMINERS.has(before) && (after === "noun" || /^[a-z]+$/.test(after || ""))) {
    if (allPos.includes("adjective")) return "adjective";
  }
  
  // Adverb cues
  if (after && /^(very|quite|rather|too|so|extremely|incredibly|remarkably)$/.test(after)) {
    if (allPos.includes("adverb")) return "adverb";
  }
  
  return allPos[0] || "noun";
}

// Neighbour key for diversity
function neighbourKey(sentence, lemma) {
  const tokens = sentence.toLowerCase().split(/\s+/);
  const idx = tokens.findIndex(t => t.replace(/[^\w]/g, "") === lemma.toLowerCase().replace(/[^\w]/g, ""));
  if (idx === -1) return "";
  const left = tokens[idx - 1] || "";
  const right = tokens[idx + 1] || "";
  return `${left}|${right}`;
}

// Load document text from cache
function loadDoc(doc) {
  const cachePath = join(TMP, `${doc.id}.txt`);
  if (!existsSync(cachePath)) return null;
  let text = readFileSync(cachePath, "utf8");
  // Strip Gutenberg boilerplate
  text = text.replace(/^\*\*\* START OF (THE )?PROJECT GUTENBERG EBOOK .*?\*\*\*\n?/i, "");
  text = text.replace(/\n?\*\*\* END OF (THE )?PROJECT GUTENBERG EBOOK .*?\*\*\*/i, "");
  return normalize(text);
}

// Build author map from manifest
const authorMap = {};
for (const doc of manifest.documents) {
  authorMap[doc.id] = doc.author || "unknown";
}

// Main sampling
const occurrences = [];
const funnel = {};
const stratumC = [];
const allLemmas = roster.lemmas.map(l => l.lemma);
const rng2 = makeRng(SEED + 1); // separate RNG for stratum C

// Initialize funnel
for (const lemmaObj of roster.lemmas) {
  funnel[lemmaObj.lemma] = {
    candidates: 0,
    rejected_synthetic: 0,
    rejected_heading: 0,
    rejected_nonprose: 0,
    rejected_length: 0,
    rejected_duplicate_doc: 0,
    rejected_duplicate_neighbour: 0,
    rejected_per_author: 0,
    rejected_near_duplicate: 0,
    rejected_resolver_full: 0,
    kept: 0
  };
}

// Process each lemma in roster order (deterministic)
for (const lemmaObj of roster.lemmas) {
  const lemma = lemmaObj.lemma;
  const allPos = lemmaObj.allPos || [lemmaObj.pos];
  const surfaceVariants = roster.surfaceVariants?.[lemma] || [];
  const surfaces = [lemma, ...surfaceVariants];
  const patterns = surfaces.map(s => lemmaPattern(s));
  
  const kept = [];
  const docCounts = {};
  const neighbourCounts = {};
  const authorCounts = {};
  const posCounts = {};
  const keptSentences = []; // for near-dup check
  
  for (const doc of pool) {
    if (kept.length >= TARGET_PER_LEMMA) break;
    
    const text = loadDoc(doc);
    if (!text) continue;
    
    const paragraphs = text.split(/\n\n+/);
    
    for (let paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
      if (kept.length >= TARGET_PER_LEMMA) break;
      
      const paraText = paragraphs[paraIdx];
      const sentences = splitSentences(paraText);
      
      for (const sentence of sentences) {
        if (kept.length >= TARGET_PER_LEMMA) break;
        
        funnel[lemma].candidates++;
        
        // Rejection checks
        const rejection = sentenceRejection(sentence);
        if (rejection) {
          funnel[lemma][`rejected_${rejection}`]++;
          continue;
        }
        
        // Check lemma appears exactly once
        let matchCount = 0;
        let matchedSurface = "";
        let matchPos = -1;
        
        for (let pi = 0; pi < patterns.length; pi++) {
          const matches = [...sentence.matchAll(patterns[pi])];
          matchCount += matches.length;
          if (matches.length > 0 && matchPos === -1) {
            matchPos = matches[0].index + (matches[0][1]?.length ? matches[0].indexOf(matches[0][1]) : 0);
            matchedSurface = surfaces[pi];
          }
        }
        
        if (matchCount !== 1) continue; // require exactly one occurrence
        
        // Per-document cap
        const docId = doc.id;
        docCounts[docId] = (docCounts[docId] || 0) + 1;
        if (docCounts[docId] > MAX_PER_DOCUMENT) {
          funnel[lemma].rejected_duplicate_doc++;
          continue;
        }
        
        // Per-neighbour cap
        const nkey = neighbourKey(sentence, lemma);
        neighbourCounts[nkey] = (neighbourCounts[nkey] || 0) + 1;
        if (neighbourCounts[nkey] > MAX_PER_NEIGHBOUR) {
          funnel[lemma].rejected_duplicate_neighbour++;
          continue;
        }
        
        // Per-author cap
        const author = authorMap[docId] || "unknown";
        authorCounts[author] = (authorCounts[author] || 0) + 1;
        if (authorCounts[author] > MAX_PER_AUTHOR) {
          funnel[lemma].rejected_per_author++;
          continue;
        }
        
        // Near-duplicate check
        const cw = contentWords(sentence);
        let isNearDup = false;
        for (const keptCw of keptSentences) {
          if (jaccard(cw, keptCw) >= NEAR_DUP_THRESHOLD) {
            isNearDup = true;
            break;
          }
        }
        if (isNearDup) {
          funnel[lemma].rejected_near_duplicate++;
          continue;
        }
        
        // Resolver check
        const resolverCheck = checkResolverSeen(lemma, sentence);
        if (resolverCheck.seen && resolverCheck.type === "full") {
          funnel[lemma].rejected_resolver_full++;
          continue;
        }
        
        // POS inference
        const inferredPos = inferPos(sentence, lemma, allPos);
        
        // Per-POS cap (soft, ~60%)
        const posTotal = kept.length + 1;
        const posCount = (posCounts[inferredPos] || 0) + 1;
        if (posTotal > MIN_PER_LEMMA && posCount / posTotal > POS_CAP_RATIO) {
          // Try to find a different POS occurrence instead
          continue;
        }
        
        // All checks passed - keep this occurrence
        posCounts[inferredPos] = posCount;
        keptSentences.push(cw);
        
        // Build context
        const targetOffset = matchPos;
        const contextBefore = sentence.slice(Math.max(0, targetOffset - CONTEXT_CHARS), targetOffset);
        const contextAfter = sentence.slice(targetOffset + matchedSurface.length, targetOffset + matchedSurface.length + CONTEXT_CHARS);
        
        const occurrence = {
          stratum: lemmaObj.stratum,
          lemma,
          surface: matchedSurface,
          pos: inferredPos,
          posSource: "inferred",
          sentence,
          contextBefore,
          contextAfter,
          documentId: docId,
          documentTitle: doc.title,
          documentBucket: doc.bucket,
          documentWords: doc.words,
          paragraphIndex: paraIdx,
          paragraphText: paraText,
          targetOffset,
          resolverSeen: resolverCheck.seen,
          resolverEvidence: resolverCheck.evidence,
          resolverMatchType: resolverCheck.type,
          auditExpected: lemmaObj.expected,
          auditMeaningVi: lemmaObj.meaningVi || null,
          auditDefinitionEn: null, // not in roster
          goldSense: null,
          goldPos: null,
          sampling: {
            corpusFrequencyPerMillion: lemmaObj.yield?.perMillion || 0,
            sourceTier: "primary"
          }
        };
        
        kept.push(occurrence);
        funnel[lemma].kept++;
      }
    }
  }
  
  // If primary tier yielded <5, note for secondary tier (not implemented in this run)
  if (kept.length < MIN_PER_LEMMA) {
    console.log(`[WARN] ${lemma}: only ${kept.length} occurrences in primary tier (need ${MIN_PER_LEMMA})`);
  }
  
  occurrences.push(...kept);
}

// Stratum C: stratified random sample from full inventory
// For now, we'll sample from the roster lemmas as a proxy
// In practice this would draw from the full dictionary inventory
const bandCounts = {};
for (const lemmaObj of roster.lemmas) {
  const band = lemmaObj.band;
  bandCounts[band] = (bandCounts[band] || 0) + 1;
}

// Simple stratified sample from roster (placeholder for full inventory)
const stratumCLemmas = [...roster.lemmas].sort(() => rng2() - 0.5).slice(0, Math.min(STRATUM_C_SIZE, roster.lemmas.length));
for (const lemmaObj of stratumCLemmas) {
  // Just record the lemma for binding-precision reporting
  stratumC.push({
    lemma: lemmaObj.lemma,
    band: lemmaObj.band,
    pos: lemmaObj.pos
  });
}

// Build manifest
const manifestData = {
  datasetVersion: DATASET_VERSION,
  samplingRuleVersion: SAMPLING_RULE_VERSION,
  seed: SEED,
  generatedAt: new Date().toISOString(),
  corpus: {
    primary: {
      documents: pool.length,
      words: roster.corpus.words,
      source: "Project Gutenberg",
      selectionRule: "SOURCE.md v2 §4"
    },
    secondary: {
      declared: true,
      source: "Project Gutenberg 1900-1930",
      trigger: "primary yields <5 per lemma",
      used: false
    }
  },
  roster: {
    version: roster.rosterVersion,
    diagnosticCount: roster.lemmas.filter(l => l.stratum === "diagnostic").length,
    controlCount: roster.lemmas.filter(l => l.stratum === "control").length,
    totalLemmas: roster.lemmas.length
  },
  sampling: {
    minPerLemma: MIN_PER_LEMMA,
    targetPerLemma: TARGET_PER_LEMMA,
    maxPerDocument: MAX_PER_DOCUMENT,
    maxPerNeighbour: MAX_PER_NEIGHBOUR,
    minDistinctDocuments: MIN_DISTINCT_DOCUMENTS,
    minSentenceWords: MIN_SENTENCE_WORDS,
    maxSentenceWords: MAX_SENTENCE_WORDS,
    contextChars: CONTEXT_CHARS,
    posCapRatio: POS_CAP_RATIO,
    maxPerAuthor: MAX_PER_AUTHOR,
    nearDuplicateThreshold: NEAR_DUP_THRESHOLD,
    resolverFullMatchMinLen: RESOLVER_FULL_MATCH_MIN_LEN
  },
  funnel: funnel,
  stratumC: {
    n: stratumC.length,
    bandCounts: {},
    precision: null,
    ci95: null
  },
  collisions: occurrences.filter(o => o.resolverSeen).map(o => ({
    lemma: o.lemma,
    documentId: o.documentId,
    matchType: o.resolverMatchType,
    evidence: o.resolverEvidence
  })),
  shortages: Object.entries(funnel)
    .filter(([_, f]) => f.kept < MIN_PER_LEMMA)
    .map(([lemma, f]) => ({ lemma, kept: f.kept, needed: MIN_PER_LEMMA })),
  normalization: {
    lineUnwrap: true,
    paragraphPreserved: true
  }
};

// Compute band counts for stratum C
for (const item of stratumC) {
  manifestData.stratumC.bandCounts[item.band] = (manifestData.stratumC.bandCounts[item.band] || 0) + 1;
}

// Write occurrences.jsonl
const jsonl = occurrences.map(o => JSON.stringify(o)).join("\n") + "\n";
writeFileSync(join(DATA, "occurrences.jsonl"), jsonl, "utf8");

// Compute SHA-256 of JSONL
const sha256 = createHash("sha256").update(jsonl).digest("hex");
manifestData.datasetSha256 = sha256;
manifestData.occurrenceCount = occurrences.length;

// Write manifest
writeFileSync(join(DATA, "dataset-manifest.json"), JSON.stringify(manifestData, null, 2), "utf8");

console.log(`Done. ${occurrences.length} occurrences written.`);
console.log(`SHA-256: ${sha256}`);
console.log(`Shortages: ${manifestData.shortages.length}`);
for (const s of manifestData.shortages) {
  console.log(`  ${s.lemma}: ${s.kept}/${s.needed}`);
}