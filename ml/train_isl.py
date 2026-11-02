"""Offline scaffold: train prepared ISL landmarks; export an unvalidated ONNX model.

See README.md. No data acquisition, camera capture or network calls.
"""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--epochs", type=int, default=50)
    args = parser.parse_args()
    if args.epochs < 1:
        parser.error("epochs must be positive")

    import numpy as np
    import torch
    from torch import nn

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    for field in ("dataset_source", "dataset_license", "preprocessing"):
        if not manifest.get(field):
            raise ValueError(f"Manifest must document {field}")
    labels = manifest["labels"]
    if not 10 <= len(labels) <= 20 or len(set(labels)) != len(labels):
        raise ValueError("Provide 10–20 unique, dataset-verified ISL labels")
    data = np.load(args.data, allow_pickle=False)
    partitions = {}
    signers = []
    shape = None
    for split in ("train", "val", "test"):
        x, y, signer = (data[f"{key}_{split}"] for key in ("x", "y", "signer"))
        if x.ndim != 3 or not len(x) or min(x.shape[1:]) < 1:
            raise ValueError("Features must be nonempty [clips, time, features]")
        if shape is not None and x.shape[1:] != shape:
            raise ValueError("All partitions need identical time/feature dimensions")
        shape = x.shape[1:]
        if y.shape != (len(x),) or signer.shape != y.shape:
            raise ValueError("One label and signer required per clip")
        if not np.isfinite(x).all() or not np.issubdtype(y.dtype, np.integer):
            raise ValueError("Require finite features and integer label IDs")
        if set(y.tolist()) != set(range(len(labels))):
            raise ValueError("Every partition must contain every selected label")
        if any(not str(s).strip() for s in signer):
            raise ValueError("Signer IDs must be present")
        signers.append(set(signer.astype(str)))
        partitions[split] = (torch.tensor(x, dtype=torch.float32), torch.tensor(y, dtype=torch.long))
    if any(signers[i] & signers[j] for i in range(3) for j in range(i)):
        raise ValueError("Signer leakage between partitions")

    torch.manual_seed(42)
    # Fixed temporal sampling preserves motion order. Normalize in the extractor.
    model = nn.Sequential(nn.Flatten(), nn.Linear(shape[0] * shape[1], 128),
                          nn.ReLU(), nn.Dropout(0.2), nn.Linear(128, len(labels)))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    loader = torch.utils.data.DataLoader(torch.utils.data.TensorDataset(*partitions["train"]),
                                         batch_size=32, shuffle=True)
    best_loss, best_state = float("inf"), None
    for _ in range(args.epochs):
        model.train()
        for x, y in loader:
            optimizer.zero_grad()
            loss = nn.functional.cross_entropy(model(x), y)
            loss.backward()
            optimizer.step()
        model.eval()
        with torch.no_grad():
            score = nn.functional.cross_entropy(model(partitions["val"][0]), partitions["val"][1]).item()
        if score < best_loss:
            best_loss = score
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
    if best_state is None:
        raise ValueError("Training produced no finite validation result")
    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        predicted = model(partitions["test"][0]).argmax(1).numpy()
    actual = partitions["test"][1].numpy()
    confusion = np.zeros((len(labels), len(labels)), dtype=int)
    np.add.at(confusion, (actual, predicted), 1)
    report = {"accuracy": float((actual == predicted).mean()),
              "confusion_matrix_actual_rows": confusion.tolist(),
              "per_sign_recall": {label: float(confusion[i, i] / confusion[i].sum())
                                  for i, label in enumerate(labels)},
              "validation_loss": best_loss,
              "status": "offline evaluation only; browser and real-user validation required"}
    args.output.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(model, partitions["train"][0][:1], args.output / "model.onnx",
                      input_names=["landmarks"], output_names=["logits"],
                      dynamic_axes={"landmarks": {0: "batch"}, "logits": {0: "batch"}},
                      opset_version=17, dynamo=False)
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (args.output / "evaluation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
