import mapping from './signs.json';
export function displaySign(label: string, language = 'en'): string {
  const sign = (mapping as Record<string, Record<string, string>>)[label];
  if (!sign) throw new Error('Unsupported sign label.');
  return sign[language] || sign.en;
}
export function validateLabels(labels: unknown): asserts labels is string[] {
  if (!Array.isArray(labels) || labels.length < 1 || new Set(labels).size !== labels.length ||
      labels.some(label => typeof label !== 'string' || !Object.hasOwn(mapping, label))) throw new Error('Invalid ISL label mapping.');
}
