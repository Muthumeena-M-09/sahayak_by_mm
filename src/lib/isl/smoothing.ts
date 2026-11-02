export interface Prediction { label: string; confidence: number }

export class PredictionSmoother {
  private label = '';
  private count = 0;
  private emitted = '';
  private reason = 'Waiting for a model prediction.';
  constructor(private labels: readonly string[], private threshold = .85, private windows = 2) {}
  update(prediction: Prediction): Prediction | null {
    if (!this.labels.includes(prediction.label) || !Number.isFinite(prediction.confidence) ||
        prediction.confidence < this.threshold || prediction.confidence > 1) {
      this.reason = !this.labels.includes(prediction.label) ? 'Unsupported model label.' :
        !Number.isFinite(prediction.confidence) || prediction.confidence > 1 || prediction.confidence < 0 ? 'Invalid confidence.' :
        `Confidence ${(prediction.confidence*100).toFixed(1)}% is below ${(this.threshold*100).toFixed(1)}%.`;
      this.label = ''; this.count = 0; return null;
    }
    this.count = this.label === prediction.label ? this.count + 1 : 1;
    this.label = prediction.label;
    if (this.count < this.windows) {this.reason=`Waiting for consistent predictions: ${this.count}/${this.windows}.`;return null;}
    if (this.emitted === prediction.label) {this.reason='Duplicate suppressed. Choose Retry to recognize this word again.';return null;}
    this.emitted = prediction.label;
    this.reason='Accepted for review; nothing has been sent.';
    return prediction;
  }
  get diagnostics() {return {reason:this.reason,consecutive:this.count,required:this.windows,threshold:this.threshold};}
  reset() { this.label = ''; this.count = 0; this.emitted = ''; this.reason='Waiting for a model prediction.'; }
}

export function confirmWord(phrase: string, reviewedWord: string): string {
  const word = reviewedWord.trim();
  if (!word || word.length > 200) throw new Error('Review a word before confirming.');
  const result = [phrase.trim(), word].filter(Boolean).join(' ');
  if (result.length > 1000) throw new Error('Keep your phrase under 1000 characters.');
  return result;
}
