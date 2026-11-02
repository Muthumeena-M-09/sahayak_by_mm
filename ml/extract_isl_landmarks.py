"""Extract a local, consented video with MediaPipe 0.10.14 legacy Holistic."""
import argparse
from pathlib import Path
import numpy as np
from isl_preprocessing import preprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    import cv2
    import mediapipe as mp
    if not hasattr(mp, 'solutions'):
        raise RuntimeError('Install the documented legacy MediaPipe 0.10.14 extraction environment')
    capture = cv2.VideoCapture(args.video)
    frames = []
    try:
        with mp.solutions.holistic.Holistic(model_complexity=1, static_image_mode=False) as holistic:
            while True:
                ok, image = capture.read()
                if not ok:
                    break
                result = holistic.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
                points = np.zeros((75, 3), dtype=np.float32)
                for component, offset in [(result.pose_landmarks,0), (result.left_hand_landmarks,33), (result.right_hand_landmarks,54)]:
                    if component:
                        for i, point in enumerate(component.landmark):
                            if offset or point.visibility >= .5:
                                points[offset+i] = [point.x,point.y,point.z]
                frames.append(points)
    finally:
        capture.release()
    points = np.stack(frames)
    np.savez(Path(args.out), landmarks=points, x=preprocess(points))
    print(f'Extracted {len(points)} frames locally; no uploads')


if __name__ == '__main__':
    main()
