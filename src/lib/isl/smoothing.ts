export interface Prediction { label: string; confidence: number }

export class PredictionSmoother {
  private label = '';
  private count = 0;
  private emitted = '';
  constructor(private labels: readonly string[], private threshold = .85, private windows = 2) {}
  update(prediction: Prediction): Prediction | null {
    if (!this.labels.includes(prediction.label) || !Number.isFinite(prediction.confidence) ||
        prediction.confidence < this.threshold || prediction.confidence > 1) {
      this.label = ''; this.count = 0; return null;
    }
    this.count = this.label === prediction.label ? this.count + 1 : 1;
    this.label = prediction.label;
    if (this.count < this.windows || this.emitted === prediction.label) return null;
    this.emitted = prediction.label;
    return prediction;
  }
  reset() { this.label = ''; this.count = 0; this.emitted = ''; }
}

export function confirmWord(phrase: string, reviewedWord: string): string {
  const word = reviewedWord.trim();
  if (!word || word.length > 200) throw new Error('Review a word before confirming.');
  const result = [phrase.trim(), word].filter(Boolean).join(' ');
  if (result.length > 1000) throw new Error('Keep your phrase under 1000 characters.');
  return result;
}
