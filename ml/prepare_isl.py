"""Prepare a bounded, licensed INCLUDE pose subset without full dataset download."""
import csv
import hashlib
import io
import json
from pathlib import Path
import random
import struct
import sys
import urllib.request
import zipfile
import zlib

import numpy as np

from isl_preprocessing import preprocess, CONFIG

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'openhands-audit'))
import fetch_sample as remote
from infer import NumpyOnlyUnpickler

LABELS = ['48.Hello', '55.Thankyou', '24.School', '30.Hospital', '4.Money',
          '3.Medicine', '87.Doctor', '35.Bank', '42.Paper', '41.Letter']


def main():
    remote.BUDGET = 100_000_000
    folder = ROOT / 'data/isl'
    (folder / 'raw').mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(remote.ROOT / 'artifacts/include_metadata.zip') as archive:
        rows = []
        for split in ['train', 'test']:
            for row in csv.DictReader(io.StringIO(archive.read(f'Train_Test_Split/{split}_include.csv').decode())):
                label = row['Word'].replace(' ', '')
                if label in LABELS:
                    rows.append(dict(row, label=label, published_split=split))
    with urllib.request.urlopen(urllib.request.Request(remote.URL, method='HEAD'), timeout=30) as response:
        size = int(response.headers['Content-Length'])
    entries = remote.list_entries(0, size)
    nested = next(e for e in entries if e[0] == 'INCLUDE/Pose_Signs.zip')
    assert nested[1] == 0, 'Refusing compressed nested archive'
    header = struct.unpack('<4s5H3L2H', remote.read_range(nested[5], nested[5]+29))
    entries = remote.list_entries(nested[5]+30+header[-2]+header[-1], nested[4])
    cache = {}
    for provenance_file in ['sample-provenance.json', 'samples-provenance.json']:
        record = json.loads((remote.ROOT / provenance_file).read_text())
        for item in record.get('samples', [record]):
            cache[item['member']] = remote.ROOT / 'artifacts' / item.get('file', 'sample.pkl')
    records, excluded, arrays, seen = [], [], {}, {}
    for index, row in enumerate(rows):
        suffix = row['FilePath'].rsplit('.', 1)[0]+'.pkl'
        matches = [e for e in entries if e[0].endswith('/'+suffix)]
        if len(matches) != 1:
            excluded.append(dict(path=row['FilePath'], reason='missing or ambiguous archive member'))
            continue
        name, method, crc, compressed, raw_size, offset = matches[0]
        destination = folder / 'raw' / (hashlib.sha256(name.encode()).hexdigest()+'.pkl')
        if destination.exists():
            data = destination.read_bytes()
        elif name in cache and cache[name].exists():
            data = cache[name].read_bytes()
        else:
            assert raw_size < 2_000_000 and compressed < 1_000_000
            header = struct.unpack('<4s5H3L2H', remote.read_range(offset, offset+29))
            assert header[0] == b'PK\x03\x04'
            start = offset+30+header[-2]+header[-1]
            data = remote.read_range(start, start+compressed-1)
            data = zlib.decompress(data, -15) if method == 8 else data if method == 0 else None
        if data is None or len(data) != raw_size or zlib.crc32(data) & 0xffffffff != crc:
            raise ValueError(f'CRC/size failure: {name}')
        destination.write_bytes(data)
        try:
            sample = NumpyOnlyUnpickler(io.BytesIO(data)).load()
            points = np.asarray(sample['keypoints'], dtype=np.float32)
            x = preprocess(points)
        except (ValueError, KeyError) as error:
            excluded.append(dict(path=row['FilePath'], reason=str(error)))
            continue
        digest = hashlib.sha256(points.tobytes()).hexdigest()
        if digest in seen:
            excluded.append(dict(path=row['FilePath'], reason='duplicate landmark content', duplicate_of=seen[digest]))
            continue
        seen[digest] = row['FilePath']
        arrays[digest] = x
        records.append({'clip_id': digest, 'path': row['FilePath'], 'member': name,
                        'label': row['label'], 'published_split': row['published_split'],
                        'signer_id': None, 'raw_sha256': hashlib.sha256(data).hexdigest(),
                        'frames': len(points), 'quality': {'finite': True, 'shoulders_valid': True},
                        'linguistic_review': 'publisher label; independent ISL-user review pending'})
        if (index+1) % 10 == 0:
            print(f'Prepared {index+1}/{len(rows)} recordings', flush=True)
    rng = random.Random(42)
    for label in LABELS:
        group = [r for r in records if r['label'] == label and r['published_split'] == 'train']
        rng.shuffle(group)
        count = max(2, round(len(group)*.2))
        for i, item in enumerate(group):
            item['split'] = 'validation' if i < count else 'train'
    for item in records:
        if item['published_split'] == 'test':
            item['split'] = 'test'
    for split in ['train', 'validation', 'test']:
        group = [r for r in records if r['split'] == split]
        np.savez(folder / f'{split}.npz', x=np.stack([arrays[r['clip_id']] for r in group]),
                 y=np.array([LABELS.index(r['label']) for r in group], dtype=np.int64),
                 signer_id=np.array(['']*len(group)), clip_id=np.array([r['clip_id'] for r in group]))
    manifest = {'language': 'ISL', 'source': remote.URL, 'license': 'CC-BY-4.0',
                'attribution': 'INCLUDE: Sridhar, Ganesan, Kumar, Khapra (ACM MM 2020); poses: Gokul NC and Prem Selvaraj, OpenHands',
                'source_verified': True, 'audited': False, 'signer_independent': False,
                'label_review': 'source labels/recordings verified structurally; human linguistic review pending',
                'unknown_examples': 0, 'labels': LABELS, 'preprocessing_config': CONFIG,
                'records': records, 'excluded': excluded, 'seed': 42,
                'class_counts': {label: {s: sum(r['label']==label and r['split']==s for r in records)
                                          for s in ['train', 'validation', 'test']} for label in LABELS},
                'downloaded_range_bytes': remote.transferred}
    (folder / 'dataset-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest['class_counts'], indent=2))
    print('Range bytes downloaded:', remote.transferred)


if __name__ == '__main__':
    main()
