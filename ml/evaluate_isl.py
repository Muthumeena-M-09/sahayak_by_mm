"""Measure ONNX classifier accuracy on a signer-disjoint held-out split."""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

from train_isl import load_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--test', required=True)
    parser.add_argument('--allow-unknown-signers', action='store_true')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    labels = manifest['labels']
    x, y, signers, clips = load_data(args.test, labels, args.allow_unknown_signers)
    if (signers & set(manifest['train_signers'] + manifest['validation_signers'])
            or clips & set(manifest['source_clips'])):
        raise ValueError('Test signer/clip leakage detected.')
    session = ort.InferenceSession(args.model, providers=['CPUExecutionProvider'])
    start = time.perf_counter()
    logits = np.concatenate([session.run(None, {'landmarks': batch})[0]
                             for batch in np.array_split(x, max(1, (len(x) + 63) // 64))])
    elapsed = time.perf_counter()-start
    if logits.shape != (len(y), len(labels)) or not np.isfinite(logits).all():
        raise ValueError('Invalid model output.')
    prediction = logits.argmax(1)
    confusion = np.zeros((len(labels), len(labels)), dtype=int)
    np.add.at(confusion, (y, prediction), 1)
    from train_isl import Classifier
    import torch
    model = Classifier(225, len(labels))
    model.load_state_dict(torch.load(Path(args.model).parent/'best.pt', weights_only=True))
    model.eval()
    with torch.inference_mode():
        reference = model(torch.from_numpy(x)).numpy()
    np.testing.assert_allclose(logits, reference, rtol=1e-4, atol=1e-4)
    shifted = logits-logits.max(axis=1, keepdims=True)
    probs = np.exp(shifted)/np.exp(shifted).sum(axis=1, keepdims=True)
    output = {
        'samples': len(y), 'accuracy': float((prediction == y).mean()),
        'signer_independent': manifest.get('signer_independent', True),
        'onnx_pytorch_parity': True, 'parity_max_abs_error': float(np.abs(reference-logits).max()),
        'onnx_total_ms': elapsed*1000, 'onnx_ms_per_clip': elapsed*1000/len(y),
        'unknown_rejection': 'not measurable: no verified negative examples',
        'predictions': [{'actual':labels[a], 'predicted':labels[p], 'confidence':float(c)}
                        for a,p,c in zip(y,prediction,probs.max(axis=1))],
        'per_sign': {label: {'samples': int((y == i).sum()),
                             'accuracy': float((prediction[y == i] == i).mean())}
                     for i, label in enumerate(labels)},
        'labels': labels, 'confusion_true_rows_predicted_columns': confusion.tolist(),
    }
    Path(args.out).write_text(json.dumps(output, indent=2), encoding='utf-8')
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
