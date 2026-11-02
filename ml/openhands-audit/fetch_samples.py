"""Fetch two test clips per predeclared class, capped at 8 MB total."""
import csv
import hashlib
import io
import json
import struct
import urllib.request
import zipfile
import zlib

import fetch_sample as remote

CLASSES = ['48.Hello', '55.Thankyou', '24.School', '30.Hospital',
           '4.Money', '3.Medicine', '87.Doctor', '35.Bank',
           '42.Paper', '41.Letter', '25.Office', '92.Police']


def main():
    remote.BUDGET = 8_000_000
    with urllib.request.urlopen(urllib.request.Request(remote.URL, method='HEAD'), timeout=30) as response:
        size = int(response.headers['Content-Length'])
    outer = remote.list_entries(0, size)
    nested = next(entry for entry in outer if entry[0] == 'INCLUDE/Pose_Signs.zip')
    if nested[1] != 0:
        raise ValueError('Compressed nested archive; refusing full download')
    header = struct.unpack('<4s5H3L2H', remote.read_range(nested[5], nested[5] + 29))
    entries = remote.list_entries(nested[5] + 30 + header[-2] + header[-1], nested[4])
    with zipfile.ZipFile(remote.ROOT / 'artifacts/include_metadata.zip') as archive:
        rows = list(csv.DictReader(io.StringIO(archive.read('Train_Test_Split/test_include.csv').decode())))
    planned = []
    for label in CLASSES:
        candidates = [row for row in rows if row['Word'].replace(' ', '') == label]
        selected = []
        for row in candidates:
            suffix = row['FilePath'].rsplit('.', 1)[0] + '.pkl'
            matches = [entry for entry in entries if entry[0].endswith('/' + suffix)]
            if len(matches) == 1 and matches[0][0] not in [e[1][0] for e in selected]:
                selected.append((row, matches[0]))
            if len(selected) == 2:
                break
        if len(selected) != 2:
            raise ValueError(f'Need two unique published test samples for {label}')
        planned.extend(selected)
    # Freeze selection before any inference; no cherry-picking based on results.
    records = []
    folder = remote.ROOT / 'artifacts/samples'
    folder.mkdir(exist_ok=True)
    for index, (row, entry) in enumerate(planned):
        name, method, crc, compressed, raw, offset = entry
        if compressed > 500_000 or raw > 2_000_000:
            raise ValueError('Sample too large for bounded retrieval')
        fields = struct.unpack('<4s5H3L2H', remote.read_range(offset, offset + 29))
        if fields[0] != b'PK\x03\x04':
            raise ValueError('Invalid ZIP local header')
        start = offset + 30 + fields[-2] + fields[-1]
        data = remote.read_range(start, start + compressed - 1)
        data = zlib.decompress(data, -15) if method == 8 else data if method == 0 else None
        if data is None or len(data) != raw or zlib.crc32(data) & 0xffffffff != crc:
            raise ValueError('Sample CRC/size mismatch')
        filename = f'samples/{index:02}.pkl'
        (remote.ROOT / 'artifacts' / filename).write_bytes(data)
        records.append({'file': filename, 'member': name, 'actual_label': row['Word'],
                        'video_path': row['FilePath'], 'bytes': len(data),
                        'sha256': hashlib.sha256(data).hexdigest()})
        print(f'{index+1}/24: {row["Word"]}: {len(data)} bytes', flush=True)
    result = {'source': remote.URL, 'split': 'publisher test split; signer independence unverified',
              'selection': 'first two distinct available clips in CSV order per predeclared class',
              'classes': CLASSES, 'samples': records, 'archive_bytes': size,
              'range_bytes_downloaded': remote.transferred}
    (remote.ROOT / 'samples-provenance.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('Total range bytes:', remote.transferred)


if __name__ == '__main__':
    main()
