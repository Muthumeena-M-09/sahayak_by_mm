"""Real released-checkpoint inference; no installs, training or network access."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import pickle
import sys
import time
import zipfile

import numpy as np
import torch

ROOT = Path(__file__).resolve().parent


class NumpyOnlyUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        allowed = {
            ('numpy.core.multiarray', '_reconstruct'): np.core.multiarray._reconstruct,
            ('numpy', 'ndarray'): np.ndarray,
            ('numpy', 'dtype'): np.dtype,
        }
        if (module, name) not in allowed:
            raise pickle.UnpicklingError(f'Unsupported sample global: {module}.{name}')
        return allowed[module, name]


def verified_bytes(name, expected):
    data = (ROOT / 'artifacts' / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Hash mismatch: {name}')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', action='store_true', help='Attempt ONNX export and CPU parity; no installs')
    args = parser.parse_args()
    # Keep upstream code byte-for-byte and import only torch/numpy model modules.
    source = verified_bytes('source.zip', '297540715f2aefbca288da9f63ae16920ba34e7f0bc1d6e5074c063637302680')
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        for suffix in ['LICENSE.txt', 'openhands/models/network.py',
                       'openhands/models/encoder/graph/pose_flattener.py',
                       'openhands/models/decoder/rnn.py', 'openhands/models/decoder/utils.py',
                       'openhands/datasets/pose_transforms.py']:
            name = 'OpenHands-checkpoints_v1/' + suffix
            target = ROOT / 'vendor' / suffix
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))
    sys.path.insert(0, str(ROOT / 'vendor'))
    from openhands.models.network import Network
    from openhands.models.encoder.graph.pose_flattener import PoseFlattener
    from openhands.models.decoder.rnn import RNNClassifier
    from openhands.datasets.pose_transforms import PoseSelect, CenterAndScaleNormalize

    metadata = verified_bytes('include_metadata.zip', 'f4d229aaf56cc85266feb9d8526407513382113294dbe75fc3772f881d0fc6e3')
    with zipfile.ZipFile(io.BytesIO(metadata)) as archive:
        train = list(csv.DictReader(io.StringIO(archive.read('Train_Test_Split/train_include.csv').decode())))
        test = list(csv.DictReader(io.StringIO(archive.read('Train_Test_Split/test_include.csv').decode())))
    labels = sorted({row['Word'] for row in train})
    test_labels = sorted({row['Word'] for row in test})
    if ([label.replace(' ', '') for label in labels] !=
            [label.replace(' ', '') for label in test_labels] or len(labels) != 263):
        raise ValueError('Train/test vocabulary mismatch')
    # Release metadata has inconsistent spaces between train/test labels. The
    # class index order must be checked separately without changing checkpoint IDs.
    model = Network(PoseFlattener(in_channels=2, num_points=27),
                    RNNClassifier(54, 263, rnn_type='LSTM', hidden_size=128,
                                  num_layers=4, bidirectional=True, use_attention=True))
    checkpoint = verified_bytes('include_lstm.zip', '22e3b923fa066dd37c7ae44899fe00dacc737df61f00c730853b77f7ab58018d')
    with zipfile.ZipFile(io.BytesIO(checkpoint)) as archive:
        blob = archive.read('include/lstm/epoch=294-step=63719.ckpt')
    # Only inert markers for old callback dictionary keys; never import callbacks
    # or fall back to unrestricted torch.load(weights_only=False).
    markers = [(type('ModelCheckpoint', (), {}), 'pytorch_lightning.callbacks.model_checkpoint.ModelCheckpoint'),
               (type('EarlyStopping', (), {}), 'pytorch_lightning.callbacks.early_stopping.EarlyStopping')]
    with torch.serialization.safe_globals(markers):
        checkpoint = torch.load(io.BytesIO(blob), map_location='cpu', weights_only=True)
    state = {key.removeprefix('model.'): value for key, value in checkpoint['state_dict'].items()}
    model.load_state_dict(state, strict=True)
    model.eval()
    torch.set_num_threads(2)
    provenance = json.loads((ROOT / 'sample-provenance.json').read_text())
    sample_bytes = verified_bytes('sample.pkl', provenance['sha256'])
    sample = NumpyOnlyUnpickler(io.BytesIO(sample_bytes)).load()
    points = sample['keypoints']
    if points.ndim != 3 or points.shape[1:] != (75, 3) or not np.isfinite(points).all():
        raise ValueError('Expected finite genuine sample [T,75,3]')
    frames = torch.tensor(points[:, :, :2], dtype=torch.float32).permute(2, 0, 1)
    data = PoseSelect(preset='mediapipe_holistic_minimal_27')({'frames': frames})
    data = CenterAndScaleNormalize(reference_points_preset='shoulder_mediapipe_holistic_minimal_27')(data)
    inputs = data['frames'].unsqueeze(0)
    if not torch.isfinite(inputs).all():
        raise ValueError('Invalid normalized sample')
    start = time.perf_counter()
    with torch.inference_mode():
        logits = model(inputs)
    elapsed = (time.perf_counter() - start) * 1000
    if logits.shape != (1, len(labels)) or not torch.isfinite(logits).all():
        raise ValueError('Invalid inference output')
    probabilities = logits.softmax(-1)[0]
    values, indices = probabilities.topk(5)
    result = {'status': 'real checkpoint inference executed; not deployment validation',
              'torch': torch.__version__, 'device': 'cpu', 'strict_weights': True,
              'input_shape': list(inputs.shape), 'output_shape': list(logits.shape),
              'elapsed_ms_first_pass': elapsed, 'expected_label': provenance['expected_label'],
              'top5': [{'class_id': int(i), 'label': labels[i], 'softmax': float(v)}
                       for v, i in zip(values, indices)],
              'upstream_lstm_batch_first': model.decoder.rnn.batch_first}
    result['top1_matches_after_space_normalization'] = labels[indices[0]].replace(' ', '') == provenance['expected_label'].replace(' ', '')
    if args.export:
        try:
            import onnx
            import onnxruntime as ort
            target = ROOT / 'artifacts/include-lstm.onnx'
            torch.onnx.export(model, inputs, str(target), input_names=['landmarks'],
                              output_names=['logits'], opset_version=17, dynamo=False,
                              dynamic_axes={'landmarks': {2: 'frames'}})
            onnx.checker.check_model(str(target))
            session = ort.InferenceSession(str(target), providers=['CPUExecutionProvider'])
            actual = session.run(None, {'landmarks': inputs.numpy()})[0]
            np.testing.assert_allclose(actual, logits.numpy(), rtol=1e-4, atol=1e-4)
            result['onnx'] = {'export': 'passed', 'cpu_sample_parity': 'passed',
                              'browser': 'not tested', 'bytes': target.stat().st_size}
        except Exception as error:
            result['onnx'] = {'export_or_parity': 'blocked/failed',
                              'error': f'{type(error).__name__}: {error}', 'browser': 'not tested'}
    (ROOT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    (ROOT / 'vocabulary.json').write_text(json.dumps(labels, indent=2), encoding='utf-8')
    np.savez(ROOT / 'artifacts/preprocessed-sample.npz', x=inputs.numpy(), logits=logits.numpy())
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
