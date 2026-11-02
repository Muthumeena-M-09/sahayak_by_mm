"""Fetch ONE released INCLUDE pose sample; refuse full-archive responses."""
import csv
import hashlib
import io
import json
from pathlib import Path
import struct
import urllib.request
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent
URL = 'https://zenodo.org/records/6674324/files/INCLUDE.zip?download=1'
BUDGET = 2_000_000
transferred = 0


def read_range(start, end):
    global transferred
    expected = end - start + 1
    if expected <= 0 or transferred + expected > BUDGET:
        raise ValueError('Two MB transfer budget exceeded')
    request = urllib.request.Request(URL, headers={'Range': f'bytes={start}-{end}'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 206:
            raise RuntimeError(f'Server ignored Range (HTTP {response.status}); no dataset body read')
        if not response.headers.get('Content-Range', '').startswith(f'bytes {start}-{end}/'):
            raise ValueError('Unexpected content range')
        data = response.read(expected + 1)
    transferred += len(data)
    if len(data) != expected:
        raise ValueError('Unexpected response length')
    return data


def list_entries(base, size):
    tail_start = base + max(0, size - 65557)
    tail = read_range(tail_start, base + size - 1)
    pos = tail.rfind(b'PK\x05\x06')
    if pos < 0:
        raise ValueError('ZIP directory not found')
    _, disk, cd_disk, count_disk, count, cd_size, cd_offset, comment = struct.unpack_from('<4s4H2LH', tail, pos)
    if disk or cd_disk or count != count_disk or count == 65535:
        raise ValueError('Unsupported multipart/ZIP64 archive')
    directory = read_range(base + cd_offset, base + cd_offset + cd_size - 1)
    entries = []
    offset = 0
    while offset < len(directory):
        header = struct.unpack_from('<4s6H3L5H2L', directory, offset)
        if header[0] != b'PK\x01\x02':
            raise ValueError('Invalid ZIP directory')
        flags, method, crc, compressed, raw = header[3], header[4], header[7], header[8], header[9]
        name_len, extra_len, comment_len = header[10:13]
        name = directory[offset + 46:offset + 46 + name_len].decode('utf-8' if flags & 2048 else 'cp437')
        entries.append((name, method, crc, compressed, raw, base + header[16]))
        offset += 46 + name_len + extra_len + comment_len
    return entries


def main():
    request = urllib.request.Request(URL, method='HEAD')
    with urllib.request.urlopen(request, timeout=30) as response:
        size = int(response.headers['Content-Length'])
    entries = list_entries(0, size)
    nested = next(entry for entry in entries if entry[0] == 'INCLUDE/Pose_Signs.zip')
    if nested[1] != 0:
        raise ValueError('Nested archive is compressed; refusing full download')
    header = struct.unpack('<4s5H3L2H', read_range(nested[5], nested[5] + 29))
    base = nested[5] + 30 + header[-2] + header[-1]
    entries = list_entries(base, nested[4])
    with zipfile.ZipFile(ROOT / 'artifacts/include_metadata.zip') as archive:
        rows = list(csv.DictReader(io.StringIO(archive.read('Train_Test_Split/test_include.csv').decode('utf-8-sig'))))
    print('Archive entries:', len(entries), 'examples:', entries[:8])
    chosen = None
    for row in rows:
        if row['Word'].replace(' ', '') != '48.Hello':
            continue
        suffix = row['FilePath'].rsplit('.', 1)[0] + '.pkl'
        matches = [entry for entry in entries if entry[0].endswith(suffix)]
        if len(matches) == 1:
            chosen = row, matches[0]
            break
    if chosen is None:
        raise ValueError('No uniquely matching Hello test sample; archive examples: '
                         + repr([e[0] for e in entries if 'Hello' in e[0]][:8])
                         + '; metadata: ' + repr([r for r in rows if 'Hello' in r['Word']][:2]))
    row, (name, method, crc, compressed, raw, local_offset) = chosen
    if raw > 2_000_000 or compressed > 1_000_000:
        raise ValueError('Sample exceeds budget')
    header = read_range(local_offset, local_offset + 29)
    fields = struct.unpack('<4s5H3L2H', header)
    if fields[0] != b'PK\x03\x04':
        raise ValueError('Invalid local header')
    start = local_offset + 30 + fields[-2] + fields[-1]
    payload = read_range(start, start + compressed - 1)
    data = zlib.decompress(payload, -15) if method == 8 else payload if method == 0 else None
    if data is None or len(data) != raw or zlib.crc32(data) & 0xffffffff != crc:
        raise ValueError('ZIP integrity failure')
    (ROOT / 'artifacts/sample.pkl').write_bytes(data)
    record = {'source': URL, 'member': name, 'expected_label': row['Word'],
              'split': 'published test split', 'sha256': hashlib.sha256(data).hexdigest(),
              'archive_bytes': size, 'range_bytes_downloaded': transferred,
              'sample_bytes': len(data), 'sample_video': row['FilePath']}
    (ROOT / 'sample-provenance.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    main()
