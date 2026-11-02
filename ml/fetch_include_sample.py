"""Fetch one genuine CC BY 4.0 INCLUDE clip using bounded ZIP ranges.

This is a sanity-check sample, NOT a verified held-out evaluation set.
"""
import hashlib
import json
import struct
import zlib
from pathlib import Path
from urllib.request import Request, urlopen

URL = 'https://zenodo.org/records/4010759/files/Greetings_2of2.zip?download=1'
SHA = '48cd9741b508b757fc0993430003ac4d5adc232ffb15ac9ed2683e301181491b'


def read_range(start, end):
    with urlopen(Request(URL, headers={'Range': f'bytes={start}-{end}'}), timeout=90) as response:
        if response.status != 206:
            raise ValueError('Server refused bounded range download')
        content = response.read(end - start + 2)
    if len(content) != end - start + 1:
        raise ValueError('Unexpected response length')
    return content


def main():
    offset, compressed_size = 634605157, 11265457
    header = read_range(offset, offset + 255)
    fields = struct.unpack_from('<4s5H3I2H', header)
    if fields[0] != b'PK\x03\x04' or fields[3] != 8:
        raise ValueError('Unexpected ZIP member format')
    data_offset = offset + 30 + fields[9] + fields[10]
    video = zlib.decompress(read_range(data_offset, data_offset + compressed_size - 1), -15)
    if hashlib.sha256(video).hexdigest() != SHA:
        raise ValueError('Sample checksum mismatch')
    destination = Path('ml/.cache/real-clips')
    destination.mkdir(parents=True, exist_ok=True)
    clip_path = destination / 'thankyou-MVI_0006.MOV'
    clip_path.write_bytes(video)
    (destination / 'manifest.json').write_text(json.dumps([
        {'path': clip_path.as_posix(), 'expectedLabel': 'thankyou', 'signer': 'unknown', 'split': 'unknown'}
    ], indent=2), encoding='utf-8')
    (destination / 'provenance.json').write_text(json.dumps({
        'source': URL, 'member': 'Greetings/55. Thank you/MVI_0006.MOV',
        'license': 'CC BY 4.0', 'attribution': 'Sridhar et al., INCLUDE, ACM MM 2020',
        'sha256': SHA, 'split': 'not established; sanity check only'
    }, indent=2), encoding='utf-8')
    print('Saved one genuine INCLUDE clip locally; this does not establish held-out accuracy.')


if __name__ == '__main__':
    main()
