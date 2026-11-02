"""Compare real ST-GCN and BiLSTM checkpoints on a fixed genuine test panel."""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import time
from unittest.mock import patch
import zipfile

import numpy as np
import torch
import yaml

from infer import ROOT, NumpyOnlyUnpickler, verified_bytes


def load_state(archive_name, digest, member):
    with zipfile.ZipFile(io.BytesIO(verified_bytes(archive_name, digest))) as archive:
        blob = archive.read(member)
    markers = [(type('ModelCheckpoint', (), {}), 'pytorch_lightning.callbacks.model_checkpoint.ModelCheckpoint'),
               (type('EarlyStopping', (), {}), 'pytorch_lightning.callbacks.early_stopping.EarlyStopping')]
    with torch.serialization.safe_globals(markers):
        ckpt = torch.load(io.BytesIO(blob), map_location='cpu', weights_only=True)
    return {key.removeprefix('model.'): value for key, value in ckpt['state_dict'].items()}


def top_prediction(logits, labels):
    if logits.shape != (1, len(labels)) or not torch.isfinite(logits).all():
        raise ValueError('Invalid model output')
    values, ids = logits.softmax(-1)[0].topk(3)
    return [{'class_id': int(i), 'label': labels[i], 'softmax': float(v)} for v, i in zip(values, ids)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args()
    torch.set_num_threads(2)
    source = verified_bytes('source.zip', '297540715f2aefbca288da9f63ae16920ba34e7f0bc1d6e5074c063637302680')
    vendor_hashes = {}
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        for suffix in ['LICENSE.txt', 'openhands/models/network.py',
                       'openhands/models/encoder/graph/pose_flattener.py',
                       'openhands/models/encoder/graph/st_gcn.py',
                       'openhands/models/encoder/graph/graph_utils.py',
                       'openhands/models/decoder/rnn.py', 'openhands/models/decoder/utils.py',
                       'openhands/models/decoder/fc.py', 'openhands/datasets/pose_transforms.py']:
            data = archive.read('OpenHands-checkpoints_v1/' + suffix)
            if suffix.endswith('/st_gcn.py'):
                # Configuration-only adaptation; all model tensor operations unchanged.
                text = data.decode()
                assert text.count('from omegaconf import OmegaConf') == 1
                assert text.count('graph_args = OmegaConf.to_container(graph_args)') == 1
                text = text.replace('from omegaconf import OmegaConf', '# Audit: graph_args is already a plain dict')
                text = text.replace('graph_args = OmegaConf.to_container(graph_args)', '# Audit: no OmegaConf conversion needed')
                data = text.encode()
            target = ROOT / 'vendor' / suffix
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            vendor_hashes[suffix] = hashlib.sha256(data).hexdigest()
    sys.path.insert(0, str(ROOT / 'vendor'))
    from openhands.models.network import Network
    from openhands.models.encoder.graph.st_gcn import STGCN
    import openhands.models.encoder.graph.st_gcn as st_module
    from openhands.models.encoder.graph.pose_flattener import PoseFlattener
    from openhands.models.decoder.fc import FC
    from openhands.models.decoder.rnn import RNNClassifier
    from openhands.datasets.pose_transforms import PoseSelect, CenterAndScaleNormalize

    st_digest = 'bf79d52c168c5db98ad6c403846abd8712241eae7f5f1d40233eb3eae8c9346e'
    with zipfile.ZipFile(io.BytesIO(verified_bytes('include_stgcn.zip', st_digest))) as archive:
        config = yaml.safe_load(archive.read('include/st_gcn/config.yaml'))
        (ROOT / 'stgcn-config.yaml').write_bytes(archive.read('include/st_gcn/config.yaml'))
    assert config['data']['train_pipeline']['dataset']['_target_'].endswith('.INCLUDEDataset')
    with zipfile.ZipFile(io.BytesIO(verified_bytes('include_metadata.zip', 'f4d229aaf56cc85266feb9d8526407513382113294dbe75fc3772f881d0fc6e3'))) as archive:
        splits = {split: list(csv.DictReader(io.StringIO(archive.read(f'Train_Test_Split/{split}_include.csv').decode())))
                  for split in ['train', 'test']}
    labels = sorted({row['Word'] for row in splits['train']})
    test_labels = sorted({row['Word'] for row in splits['test']})
    canonical = lambda value: value.replace(' ', '')
    assert len(labels) == 263 and list(map(canonical, labels)) == list(map(canonical, test_labels))
    assert labels == json.loads((ROOT / 'vocabulary.json').read_text())
    stgcn = Network(STGCN(in_channels=2, **config['model']['encoder']['params']),
                    FC(256, 263, **config['model']['decoder']['params']))
    generated_adjacency = stgcn.encoder.A.clone()
    stgcn.load_state_dict(load_state('include_stgcn.zip', st_digest,
                                    'include/st_gcn/epoch=215-step=23543.ckpt'), strict=True)
    adjacency_matches = torch.equal(generated_adjacency, stgcn.encoder.A)
    if not adjacency_matches:
        raise ValueError('Graph constructed from config differs from checkpoint adjacency')
    lstm = Network(PoseFlattener(in_channels=2, num_points=27),
                   RNNClassifier(54, 263, rnn_type='LSTM', hidden_size=128,
                                 num_layers=4, bidirectional=True, use_attention=True))
    lstm.load_state_dict(load_state('include_lstm.zip', '22e3b923fa066dd37c7ae44899fe00dacc737df61f00c730853b77f7ab58018d',
                                   'include/lstm/epoch=294-step=63719.ckpt'), strict=True)
    models = {'stgcn': stgcn.eval(), 'bilstm': lstm.eval()}
    provenance = json.loads((ROOT / 'samples-provenance.json').read_text())
    inputs, results = [], []
    train_paths = {row['FilePath'] for row in splits['train']}
    test_entries = {(row['FilePath'], row['Word']) for row in splits['test']}
    for sample_record in provenance['samples']:
        assert (sample_record['video_path'], sample_record['actual_label']) in test_entries
        data = verified_bytes(sample_record['file'], sample_record['sha256'])
        sample = NumpyOnlyUnpickler(io.BytesIO(data)).load()
        points = sample['keypoints']
        assert points.ndim == 3 and points.shape[1:] == (75, 3) and np.isfinite(points).all()
        frames = torch.tensor(points[:, :, :2], dtype=torch.float32).permute(2, 0, 1)
        selected = PoseSelect(preset='mediapipe_holistic_minimal_27')({'frames': frames})
        normalized = CenterAndScaleNormalize(reference_points_preset='shoulder_mediapipe_holistic_minimal_27')(selected)
        x = normalized['frames'].unsqueeze(0)
        assert torch.isfinite(x).all()
        inputs.append(x)
        shoulder_distance = np.linalg.norm(points[:, 11, :2] - points[:, 12, :2], axis=1)
        record = dict(sample_record, frames=int(points.shape[0]), train_path_overlap=sample_record['video_path'] in train_paths,
                      zero_shoulder_frames=int((shoulder_distance == 0).sum()),
                      missing_left_hand_frames=int((points[:, 33:54] == 0).all(axis=(1, 2)).sum()),
                      missing_right_hand_frames=int((points[:, 54:75] == 0).all(axis=(1, 2)).sum()))
        for name, model in models.items():
            start = time.perf_counter()
            with torch.inference_mode():
                logits = model(x)
            record[name] = {'top3': top_prediction(logits, labels),
                            'forward_ms': (time.perf_counter() - start) * 1000}
            record[name]['correct'] = canonical(record[name]['top3'][0]['label']) == canonical(record['actual_label'])
        results.append(record)
    summaries = {}
    for name in models:
        correct = sum(row[name]['correct'] for row in results)
        per_class = {label: {'correct': sum(row[name]['correct'] for row in results if canonical(row['actual_label']) == label),
                             'tested': sum(canonical(row['actual_label']) == label for row in results)}
                     for label in provenance['classes']}
        summaries[name] = {'correct': correct, 'tested': len(results), 'sample_accuracy': correct / len(results),
                           'per_class': per_class, 'parameters': sum(p.numel() for p in models[name].parameters())}
    # Reproduce zero-padding used by upstream collation as a separate diagnostic.
    # Baseline scores above remain the predeclared single-clip results.
    max_frames = max(x.shape[2] for x in inputs)
    padded_batch = torch.cat([torch.nn.functional.pad(x, (0, 0, 0, max_frames-x.shape[2])) for x in inputs])
    for name, model in models.items():
        with torch.inference_mode():
            batch_logits = model(padded_batch)
        for index, row in enumerate(results):
            row[name]['padded_panel_batch_top1'] = top_prediction(batch_logits[index:index+1], labels)[0]
        summaries[name]['padding_diagnostic'] = {
            'batch_shape': list(padded_batch.shape),
            'correct': sum(canonical(row[name]['padded_panel_batch_top1']['label']) == canonical(row['actual_label']) for row in results),
            'labels_changed_from_single_clip': sum(row[name]['padded_panel_batch_top1']['label'] != row[name]['top3'][0]['label'] for row in results),
        }
    # Diagnostics use the same real clip, not fabricated recognition samples.
    diagnostics = {}
    for name, model in models.items():
        x = inputs[0]
        altered = inputs[2]
        target_length = max(x.shape[2], altered.shape[2])
        pad = lambda value: torch.nn.functional.pad(value, (0, 0, 0, target_length-value.shape[2]))
        with torch.inference_mode():
            solo = model(pad(x))[:1]
            paired = model(torch.cat([pad(x), pad(altered)]))[:1]
            reverse_order = model(torch.cat([pad(altered), pad(x)]))[1:2]
            reversed_time = model(x.flip(2))
            zero_input = model(torch.zeros_like(x))
            extra_padding = model(torch.nn.functional.pad(x, (0, 0, 0, 32)))
        diagnostics[name] = {
            'batch_companion_max_abs_logit_difference': float((solo-paired).abs().max()),
            'batch_order_max_abs_logit_difference': float((paired-reverse_order).abs().max()),
            'time_reversal_max_abs_logit_difference': float((model(x)-reversed_time).abs().max().detach()),
            'zero_input_prediction': top_prediction(zero_input, labels)[0],
            'plus_32_zero_frames_prediction': top_prediction(extra_padding, labels)[0],
        }
    paths_to_labels = defaultdict(set)
    for rows in splits.values():
        for row in rows:
            paths_to_labels[row['FilePath']].add(canonical(row['Word']))
    outcome = {'status': 'audit only; no integration', 'torch': torch.__version__,
               'stgcn_archive_sha256': st_digest, 'strict_weights': True,
               'graph_adjacency_matches_config': adjacency_matches, 'vocabulary_classes': len(labels),
               'summaries': summaries, 'samples': results, 'diagnostics': diagnostics,
               'sample_train_path_overlaps': sum(row['train_path_overlap'] for row in results),
               'sample_duplicate_content_hashes': [h for h, n in Counter(row['sha256'] for row in results).items() if n > 1],
               'metadata_paths_with_conflicting_labels': {path: sorted(values) for path, values in paths_to_labels.items() if len(values)>1},
               'vendor_hashes': vendor_hashes, 'onnx': {'status': 'not requested'}}
    if args.export:
        outcome['onnx'] = export_and_compare(stgcn, inputs, st_module)
    (ROOT / 'stgcn-results.json').write_text(json.dumps(outcome, indent=2), encoding='utf-8')
    for row in results:
        print(row['actual_label'], '|', row['video_path'].rsplit('/', 1)[-1], '|',
              ' | '.join(f'{name}: {row[name]["top3"][0]["label"]} ({row[name]["top3"][0]["softmax"]:.4f})' for name in models))
    print(json.dumps({'summaries': summaries, 'diagnostics': diagnostics, 'onnx': outcome['onnx']}, indent=2))


def export_and_compare(model, inputs, st_module):
    try:
        import onnx
        import onnxruntime as ort
    except ImportError as error:
        return {'status': 'blocked', 'error': str(error)}
    target = ROOT / 'artifacts/include-stgcn.onnx'
    result = {'opset': 17, 'onnx_version': onnx.__version__, 'runtime_version': ort.__version__}
    kwargs = dict(input_names=['landmarks'], output_names=['logits'], opset_version=17, dynamo=False,
                  dynamic_axes={'landmarks': {2: 'frames'}})
    try:
        torch.onnx.export(model, inputs[0], str(target), **kwargs)
        result['unmodified_dynamic_export'] = 'passed'
    except Exception as error:
        result['unmodified_dynamic_export'] = f'{type(error).__name__}: {error}'
        # Export-only equivalent global pooling, not an altered recognition model.
        def global_average(x, kernel_size):
            return x.mean(dim=(2, 3), keepdim=True)
        try:
            with patch.object(st_module.F, 'avg_pool2d', global_average):
                torch.onnx.export(model, inputs[0], str(target), **kwargs)
            result['equivalent_global_mean_export'] = 'passed'
        except Exception as second_error:
            result['status'] = 'failed'
            result['error'] = f'{type(second_error).__name__}: {second_error}'
            return result
    onnx.checker.check_model(str(target))
    session = ort.InferenceSession(str(target), providers=['CPUExecutionProvider'])
    max_error = 0.0
    for i, x in enumerate(inputs):
        with torch.inference_mode():
            expected = model(x).numpy()
        actual = session.run(None, {'landmarks': x.numpy()})[0]
        np.testing.assert_allclose(actual, expected, rtol=1e-4, atol=1e-4)
        assert actual.argmax() == expected.argmax()
        max_error = max(max_error, float(np.max(np.abs(actual-expected))))
        np.savez(ROOT / f'artifacts/samples/{i:02}-parity.npz', input=x.numpy(), logits=expected)
    graph = onnx.load(str(target))
    result.update(status='export/checker/CPU parity passed', parity_samples=len(inputs),
                  max_abs_logit_error=max_error, bytes=target.stat().st_size,
                  sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                  operators=sorted({node.op_type for node in graph.graph.node}), browser='not tested')
    return result


if __name__ == '__main__':
    main()
