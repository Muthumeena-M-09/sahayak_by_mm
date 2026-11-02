"""holistic75-shoulder-v1; paired with src/lib/isl/preprocessing.ts."""
import numpy as np

CONFIG = {'id': 'holistic75-shoulder-v1', 'frames': 32, 'landmarks': 75,
          'channels': 3, 'features': 225, 'minimum_shoulder_distance': 0.001,
          'ordering': 'pose33,leftHand21,rightHand21', 'mirrored': False}


def preprocess(points):
    points = np.asarray(points, dtype=np.float32)
    if points.ndim != 3 or points.shape[1:] != (75, 3) or len(points) < 2 or not np.isfinite(points).all():
        raise ValueError('Expected finite landmarks [T,75,3], T>=2')
    valid = np.any(points != 0, axis=2)
    shoulders = points[:, [11, 12]]
    distance = np.linalg.norm(shoulders[:, 0, :2] - shoulders[:, 1, :2], axis=1)
    if not valid[:, [11, 12]].all() or (distance < CONFIG['minimum_shoulder_distance']).any():
        raise ValueError('Both shoulders must be visible with nonzero scale')
    normalized = (points - shoulders.mean(axis=1)[:, None]) / distance[:, None, None]
    normalized[~valid] = 0
    times = np.linspace(0, len(points)-1, 32)
    low = np.floor(times).astype(int)
    high = np.minimum(low+1, len(points)-1)
    weight = (times-low).astype(np.float32)[:, None, None]
    return (normalized[low]*(1-weight) + normalized[high]*weight).reshape(32, 225).astype(np.float32)
