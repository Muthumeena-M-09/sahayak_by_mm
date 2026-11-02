"""Measure ONNX classifier accuracy on a signer-disjoint held-out split."""
import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

from train_isl import load_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--test', required=True)
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    labels = manifest['labels']
    x, y, signers, clips = load_data(args.test, labels)
    if (signers & set(manifest['train_signers'] + manifest['validation_signers'])
            or clips & set(manifest['source_clips'])):
        raise ValueError('Test signer/clip leakage detected.')
    session = ort.InferenceSession(args.model, providers=['CPUExecutionProvider'])
    logits = np.concatenate([session.run(None, {'landmarks': batch})[0]
                             for batch in np.array_split(x, max(1, (len(x) + 63) // 64))])
    if logits.shape != (len(y), len(labels)) or not np.isfinite(logits).all():
        raise ValueError('Invalid model output.')
    prediction = logits.argmax(1)
    confusion = np.zeros((len(labels), len(labels)), dtype=int)
    np.add.at(confusion, (y, prediction), 1)
    print(json.dumps({
        'samples': len(y), 'accuracy': float((prediction == y).mean()),
        'per_sign': {label: {'samples': int((y == i).sum()),
                             'accuracy': float((prediction[y == i] == i).mean())}
                     for i, label in enumerate(labels)},
        'labels': labels, 'confusion_true_rows_predicted_columns': confusion.tolist(),
    }, indent=2))


if __name__ == '__main__':
    main()
