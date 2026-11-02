"""Prepare local experimental browser assets, never enable unvalidated recognition."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys

import numpy as np
import onnxruntime as ort
from isl_preprocessing import preprocess, CONFIG

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'ml/openhands-audit'))
from infer import NumpyOnlyUnpickler


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',default='ml/runs/prototype-v1')
    args=parser.parse_args()
    run=ROOT/args.run
    source=ROOT/'ml/data/isl'
    manifest=json.loads((run/'manifest.json').read_text())
    evaluation=json.loads((run/'evaluation.json').read_text())
    target=ROOT/'public/models/isl'
    target.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(run/'model.onnx',target/'model.onnx')
    reason=('Experimental model: some per-sign scores and live-camera/unknown-sign validation are insufficient. '
            'ISL-user review and signer-independent evaluation remain pending.')
    public_manifest={'language':'ISL','labels':manifest['labels'],'preprocessing':CONFIG['id'],
                     'modelSha256':hashlib.sha256((target/'model.onnx').read_bytes()).hexdigest(),
                     'recognitionEnabled':False,'disabledReason':reason,'threshold':.85,
                     'testAccuracy':evaluation['accuracy'],'testSamples':evaluation['samples'],
                     'signerIndependent':False,'unknownValidated':False,'browserValidated':False,
                     'datasetLicense':'CC-BY-4.0','trained':True}
    browser_report=ROOT/'docs/isl-results/browser.json'
    if browser_report.exists():
        browser=json.loads(browser_report.read_text())
        public_manifest['browserValidated']=(browser.get('modelSha256')==public_manifest['modelSha256']
                                             and browser.get('samples')==evaluation['samples']
                                             and browser.get('maxAbsLogitError',1)<1e-4)
    (target/'manifest.json').write_text(json.dumps(public_manifest,indent=2),encoding='utf-8')
    (target/'labels.json').write_text(json.dumps(manifest['labels'],indent=2),encoding='utf-8')
    (target/'preprocessing.json').write_text(json.dumps(CONFIG,indent=2),encoding='utf-8')
    (target/'ATTRIBUTION.txt').write_text(manifest['attribution']+'\nDataset: '+manifest['source']+
      '\nLicense: https://creativecommons.org/licenses/by/4.0/\nCustom classifier trained locally; no OpenHands recognition weights used.\n',encoding='utf-8')
    with np.load(source/'test.npz',allow_pickle=False) as data:
        x,y=data['x'],data['y']
    session=ort.InferenceSession(str(run/'model.onnx'),providers=['CPUExecutionProvider'])
    logits=session.run(None,{'landmarks':x})[0]
    fixtures={'samples':[{'x':sample.tolist(),'logits':scores.tolist(),'label':manifest['labels'][label]}
                         for sample,scores,label in zip(x,logits,y)],'preprocessing':[]}
    records=manifest['records'][:3]
    for record in records:
        raw_path=source/'raw'/(hashlib.sha256(record['member'].encode()).hexdigest()+'.pkl')
        raw=NumpyOnlyUnpickler(io.BytesIO(raw_path.read_bytes())).load()['keypoints']
        fixtures['preprocessing'].append({'raw':raw.reshape(len(raw),225).tolist(),'expected':preprocess(raw).reshape(-1).tolist()})
    (source/'browser-fixtures.json').write_text(json.dumps(fixtures),encoding='utf-8')
    print(json.dumps(public_manifest,indent=2))


if __name__=='__main__':
    main()
