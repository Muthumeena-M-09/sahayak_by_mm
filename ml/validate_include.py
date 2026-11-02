"""Export the pinned INCLUDE small transformer; numerical probes are NOT accuracy.

Requires the source/checkpoint cache described in README.md. No network calls.
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

CHECKPOINT_SHA256 = "c25f7e8a4eb6f11964d4038552ab8e60f23dde392be7ab722f46aef4d7948c7e"
SOURCE_SHA256 = "08589daf1026433b89d468067d6b44a84c58e911c58a73225807cfbb4f20d699"
UPSTREAM_COMMIT = "df348f4a640060d4d39f02556d9f96851e8c46c7"


def checked(path, expected):
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise ValueError(f"Unexpected artifact hash: {path}")
    return content


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("ml/.cache/include"))
    parser.add_argument("--output", type=Path, default=Path("ml/output/include"))
    args = parser.parse_args()
    os.environ["USE_TF"] = "0"
    os.environ["USE_FLAX"] = "0"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    sys.path.insert(0, str(Path(__file__).resolve().parent / ".deps"))
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    import transformers
    from transformers import BertConfig
    from transformers.models.bert.modeling_bert import BertLayer
    print("Validation dependencies loaded", flush=True)

    checkpoint = args.cache / "include_no_cnn_transformer_small.pth"
    checked(checkpoint, CHECKPOINT_SHA256)
    source = checked(args.cache / "models/transformer.py", SOURCE_SHA256).decode()
    # Reviewed, hash-pinned MIT source. Preserve the network and load all weights
    # strictly; fix the obsolete BertLayer import and always-on final dropout.
    source = source.replace("import transformers", "from transformers.models.bert.modeling_bert import BertLayer")
    source = source.replace("transformers.BertLayer", "BertLayer")
    if source.count("F.dropout(x, p=0.2)") != 1:
        raise ValueError("Unexpected upstream dropout implementation")
    source = source.replace("F.dropout(x, p=0.2)", "F.dropout(x, p=0.2, training=self.training)")
    namespace = {"__name__": "include_reviewed_model"}
    exec(compile(source, "include_reviewed_model", "exec"), namespace)
    bert = BertConfig(hidden_size=256, num_attention_heads=4, num_hidden_layers=2,
                      max_position_embeddings=256)
    bert._attn_implementation = "eager"
    config = SimpleNamespace(input_size=134, hidden_size=256, max_position_embeddings=256,
                             layer_norm_eps=1e-12, hidden_dropout_prob=0.1,
                             num_hidden_layers=2, model_config=bert)
    model = namespace["Transformer"](config, n_classes=263)
    # Only allow the NumPy scalar metadata used by this historical checkpoint.
    # Never fall back to unrestricted pickle deserialization.
    safe = [(np._core.multiarray.scalar, "numpy.core.multiarray.scalar"), np.dtype,
            type(np.dtype("float64")), type(np.dtype("float32"))]
    with torch.serialization.safe_globals(safe):
        saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    model.load_state_dict(saved["model"], strict=True)
    model.eval()
    torch.set_num_threads(2)
    labels = json.loads((args.cache / "label_maps/label_map_include.json").read_text())
    if sorted(labels.values()) != list(range(263)):
        raise ValueError("Invalid full INCLUDE label map")
    args.output.mkdir(parents=True, exist_ok=True)
    destination = args.output / "model.onnx"
    rng = np.random.default_rng(42)
    # Engineering probes only: zero input and plausible pixel-coordinate ranges
    # with varying zero-padding. These are not genuine signing examples.
    probes = [np.zeros((1, 169, 134), dtype=np.float32)]
    for frames in (20, 80, 169):
        probe = np.zeros((1, 169, 134), dtype=np.float32)
        probe[:, :frames, 0::2] = rng.uniform(0, 1920, (1, frames, 67))
        probe[:, :frames, 1::2] = rng.uniform(0, 1080, (1, frames, 67))
        probes.append(probe)
    with torch.no_grad():
        sample = torch.from_numpy(probes[0])
        assert torch.equal(model(sample), model(sample)), "Inference is stochastic"
        torch.onnx.export(model, sample, destination, opset_version=17, dynamo=False,
                          input_names=["landmarks"], output_names=["logits"])
    onnx.checker.check_model(onnx.load(destination))
    session = ort.InferenceSession(str(destination), providers=["CPUExecutionProvider"])
    results = []
    for probe in probes:
        with torch.no_grad():
            expected = model(torch.from_numpy(probe)).numpy()
        actual = session.run(None, {"landmarks": probe})[0]
        np.testing.assert_allclose(actual, expected, atol=1e-4, rtol=1e-4)
        results.append({"max_absolute_logit_error": float(np.max(np.abs(actual - expected))),
                        "top1_matches": bool(actual.argmax() == expected.argmax())})
    report = {"upstream_commit": UPSTREAM_COMMIT, "checkpoint_sha256": CHECKPOINT_SHA256,
              "onnx_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
              "onnx_bytes": destination.stat().st_size,
              "input_shape": [1, 169, 134], "labels": labels,
              "versions": {"torch": torch.__version__, "numpy": np.__version__,
                           "transformers": transformers.__version__, "onnx": onnx.__version__,
                           "onnxruntime": ort.__version__},
              "modifications": ["BertLayer import compatibility", "disable final dropout in eval"],
              "engineering_probes": results,
              "accuracy": None, "browser_validated": False,
              "deployment_status": "research artifact; not approved for production"}
    (args.output / "conversion-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "labels"}, indent=2), flush=True)


if __name__ == "__main__":
    main()
