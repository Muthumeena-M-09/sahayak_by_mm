"""Download public, pinned INCLUDE research artifacts. Never reads user data."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

COMMIT = "df348f4a640060d4d39f02556d9f96851e8c46c7"
ROOT = Path(__file__).resolve().parent / ".cache/include"


def fetch(url, path, expected=None, limit=60_000_000):
    if path.exists() and expected and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
        return
    with urlopen(url, timeout=60) as response:
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError("Artifact exceeds size limit")
    digest = hashlib.sha256(content).hexdigest()
    if expected and digest != expected:
        raise ValueError(f"Hash mismatch: {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".download")
    temporary.write_bytes(content)
    temporary.replace(path)
    print(path.name, len(content), digest)


def main():
    from validate_include import CHECKPOINT_SHA256, SOURCE_SHA256
    ROOT.mkdir(parents=True, exist_ok=True)
    for name in ("models/transformer.py", "label_maps/label_map_include.json", "LICENSE",
                 "generate_keypoints.py", "dataset.py", "evaluate.py", "train_nn.py", "configs.py"):
        fetch(f"https://raw.githubusercontent.com/AI4Bharat/INCLUDE/{COMMIT}/{name}", ROOT / name,
              SOURCE_SHA256 if name == "models/transformer.py" else None, limit=1_000_000)
    fetch("https://api.wandb.ai/files/abdur-ai4bharat/include-no-cnn/2kuznb3t/augs_transformer.pth",
          ROOT / "include_no_cnn_transformer_small.pth", CHECKPOINT_SHA256)
    fetch("https://zenodo.org/api/records/4010759", ROOT / "zenodo.json", limit=2_000_000)
    record = json.loads((ROOT / "zenodo.json").read_text(encoding="utf-8"))
    print("Dataset license:", record["metadata"]["license"])


if __name__ == "__main__":
    main()
