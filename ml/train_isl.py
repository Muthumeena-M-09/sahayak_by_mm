"""Train a candidate temporal ISL classifier from audited local landmark data."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch import nn


class Classifier(nn.Module):
    def __init__(self, features, classes):
        super().__init__()
        self.network = nn.Sequential(
            nn.Conv1d(features, 64, 3, padding=1), nn.ReLU(),
            nn.Conv1d(64, 64, 3, padding=1), nn.ReLU(),
            nn.AdaptiveAvgPool1d(1), nn.Flatten(), nn.Linear(64, classes),
        )

    def forward(self, landmarks):
        return self.network(landmarks.transpose(1, 2))


def load_data(path, labels):
    with np.load(path, allow_pickle=False) as data:
        x, y = data['x'], data['y']
        signers, clips = data['signer_id'].astype(str), data['clip_id'].astype(str)
    if (x.ndim != 3 or x.shape[1:] != (32, 225) or len(x) == 0
            or x.dtype != np.float32 or not np.isfinite(x).all()):
        raise ValueError('Expected finite float32 x[N,32,225].')
    if (y.shape != (len(x),) or not np.issubdtype(y.dtype, np.integer)
            or y.min() < 0 or y.max() >= len(labels)):
        raise ValueError('Invalid integer class indices.')
    for ids in (signers, clips):
        if ids.shape != (len(x),) or any(not value.strip() for value in ids):
            raise ValueError('Nonempty signer_id and clip_id required per sample.')
    if set(y.tolist()) != set(range(len(labels))):
        raise ValueError('Every configured sign needs samples in each split.')
    return x, y.astype(np.int64), set(signers), set(clips)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--train', required=True)
    parser.add_argument('--validation', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--out', required=True, help='New output directory')
    parser.add_argument('--epochs', type=int, default=50)
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    labels = manifest['labels']
    if (manifest.get('language') != 'ISL' or not manifest.get('license')
            or not manifest.get('source') or manifest.get('audited') is not True
            or not 10 <= len(labels) <= 20 or len(set(labels)) != len(labels)
            or any(not isinstance(label, str) or not label.strip() for label in labels)
            or args.epochs < 1):
        raise ValueError('Require audited licensed ISL manifest with 10–20 unique labels.')
    train = load_data(args.train, labels)
    validation = load_data(args.validation, labels)
    if train[2] & validation[2] or train[3] & validation[3]:
        raise ValueError('Train/validation signers and source clips must be disjoint.')
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)
    torch.manual_seed(42)
    model = Classifier(225, len(labels))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    loader = torch.utils.data.DataLoader(
        torch.utils.data.TensorDataset(torch.from_numpy(train[0]), torch.from_numpy(train[1])),
        batch_size=32, shuffle=True,
    )
    best = -1.0
    for epoch in range(args.epochs):
        model.train()
        for x, y in loader:
            optimizer.zero_grad()
            loss = nn.functional.cross_entropy(model(x), y)
            loss.backward()
            optimizer.step()
        model.eval()
        with torch.no_grad():
            predictions = torch.cat([model(batch).argmax(1) for batch in
                                     torch.from_numpy(validation[0]).split(64)])
            accuracy = (predictions == torch.from_numpy(validation[1])).float().mean().item()
        print(json.dumps({'epoch': epoch + 1, 'validation_accuracy': accuracy}))
        if accuracy > best:
            best = accuracy
            torch.save(model.state_dict(), out / 'best.pt')
    model.load_state_dict(torch.load(out / 'best.pt', weights_only=True))
    model.eval()
    example = torch.from_numpy(validation[0][:1])
    torch.onnx.export(model, example, str(out / 'model.onnx'),
                      input_names=['landmarks'], output_names=['logits'],
                      dynamic_axes={'landmarks': {0: 'batch'}, 'logits': {0: 'batch'}},
                      opset_version=17, dynamo=False)
    import onnxruntime as ort
    session = ort.InferenceSession(str(out / 'model.onnx'), providers=['CPUExecutionProvider'])
    with torch.no_grad():
        expected = model(example).numpy()
    np.testing.assert_allclose(session.run(None, {'landmarks': example.numpy()})[0],
                               expected, rtol=1e-4, atol=1e-5)
    manifest.update(validation_accuracy=best, train_signers=sorted(train[2]),
                    validation_signers=sorted(validation[2]),
                    source_clips=sorted(train[3] | validation[3]),
                    input_shape=[None, 32, 225], preprocessing='holistic75-shoulder-v1')
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
