"""Build compact, sense-preserving offline EN-EN data from Princeton WordNet 3.0.

Usage: python scripts/build_wordnet_pack.py --source tmp/wordnet-3.0.tar.gz --license tmp/WORDNET-LICENSE.txt
The archive is read in place, never extracted. No code from the archive is run.
"""
import argparse
import hashlib
import json
import re
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--license', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path('release/wordnet'))
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
license_text = args.license.read_text(encoding='utf-8')
if 'Princeton' not in license_text or 'Permission to use' not in license_text:
    raise SystemExit('Missing WordNet license')
manifest = {'source': 'https://wordnetcode.princeton.edu/3.0/WNdb-3.0.tar.gz', 'version': '3.0', 'files': []}
with tarfile.open(args.source, 'r:gz') as archive:
    ranks = {}
    for line in archive.extractfile('dict/index.sense'):
        key, offset, sense_number, count = line.decode('utf-8').split()
        lemma, rest = key.split('%')
        pos = {'1': 'n', '2': 'v', '3': 'a', '4': 'r', '5': 'a'}[rest[0]]
        ranks[(lemma.replace('_', ' '), pos, offset)] = int(sense_number)
    for part, pos in [('noun', 'n'), ('verb', 'v'), ('adj', 'a'), ('adv', 'r')]:
        synsets = []
        entries = {}
        for raw in archive.extractfile(f'dict/data.{part}'):
            line = raw.decode('utf-8')
            if not line[0].isdigit():
                continue
            data, gloss = line.split('|', 1)
            fields = data.split()
            offset, _, _, count = fields[:4]
            words = [re.sub(r'\((?:a|p|ip)\)$', '', fields[4 + i * 2]).replace('_', ' ') for i in range(int(count, 16))]
            definition = re.split(r';?\s*"', gloss.strip(), maxsplit=1)[0].strip().rstrip(';')
            examples = re.findall(r'"([^"]+)"', gloss)
            index = len(synsets)
            synsets.append([offset, words, definition, examples])
            for word in words:
                entries.setdefault(word.lower(), []).append([index, ranks.get((word, pos, offset), 99)])
        for word in entries:
            entries[word] = [i for i, rank in sorted(entries[word], key=lambda pair: pair[1])]
        payload = {'version': '3.0', 'pos': pos, 'synsets': synsets, 'entries': entries}
        path = args.output / f'wordnet-{part}.json'
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        manifest['files'].append({'file': path.name, 'entries': len(entries), 'senses': len(synsets), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        if path.stat().st_size > 20 * 1024 * 1024:
            raise SystemExit('Pack exceeds PWA asset limit')
(args.output / 'WORDNET-LICENSE.md').write_text(license_text, encoding='utf-8')
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
