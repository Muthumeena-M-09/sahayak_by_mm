import { SpeechProviderError } from './speech.ts';
import { ilike } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { integrations } from '../db/schema.ts';

const SARVAM_BASE_URL = 'https://api.sarvam.ai';

// Exact Sarvam AI language code mapping for all 22 Scheduled Indian Languages + English
export const SARVAM_TRANSLATE_LANG_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  ur: 'ur-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  or: 'od-IN', // Sarvam AI uses 'od-IN' for Odia
  od: 'od-IN',
  pa: 'pa-IN',
  as: 'as-IN',
  mai: 'mai-IN',
  sat: 'sat-IN',
  ks: 'ks-IN',
  ne: 'ne-IN',
  sd: 'sd-IN',
  kok: 'kok-IN',
  doi: 'doi-IN',
  mni: 'mni-IN',
  brx: 'brx-IN',
  sa: 'sa-IN',
};

// Languages supported by Sarvam Bulbul v3 TTS
const SARVAM_BULBUL_TTS_LANGS = new Set([
  'bn-IN',
  'en-IN',
  'gu-IN',
  'hi-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'od-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
]);

let cachedDbKey: string | null = null;
let cachedAt = 0;

export async function getSarvamApiKey(): Promise<string | null> {
  const envKey = process.env.SARVAM_API_KEY?.trim();
  if (envKey && envKey !== 'MY_SARVAM_API_KEY') {
    return envKey;
  }

  if (cachedDbKey && Date.now() - cachedAt < 5 * 60 * 1000) {
    return cachedDbKey;
  }

  try {
    const rows = await db
      .select({ authConfigEncrypted: integrations.authConfigEncrypted })
      .from(integrations)
      .where(ilike(integrations.name, '%Sarvam%'));

    for (const row of rows) {
      const secrets = row.authConfigEncrypted || {};
      const key =
        secrets.sarvamSubscriptionKey || secrets.apiKey || secrets.bearerToken || null;
      if (key && key.trim()) {
        cachedDbKey = key.trim();
        cachedAt = Date.now();
        return cachedDbKey;
      }
    }
  } catch {
    // Ignore DB lookup failure and return null
  }
  return null;
}

export function toSarvamLangCode(langCode: string): string | null {
  const base = (langCode || '').trim().toLowerCase().split('-')[0];
  return SARVAM_TRANSLATE_LANG_MAP[base] || null;
}

export function fromSarvamLangCode(sarvamCode: string): string {
  const clean = (sarvamCode || '').trim();
  if (clean.toLowerCase() === 'od-in') return 'or';
  return clean.split('-')[0].toLowerCase() || 'en';
}

export async function sarvamTranslateText(params: {
  text: string;
  sourceLangCode?: string;
  targetLangCode: string;
  glossaryTerms?: Array<{ sourceTerm: string; targetTerm: string }>;
}): Promise<string | null> {
  const apiKey = await getSarvamApiKey();
  if (!apiKey) return null;

  const trimmed = params.text.trim();
  if (!trimmed) return '';

  const targetSarvam = toSarvamLangCode(params.targetLangCode);
  if (!targetSarvam) return null;

  const sourceSarvam = params.sourceLangCode
    ? toSarvamLangCode(params.sourceLangCode) || 'auto'
    : 'auto';

  if (sourceSarvam === targetSarvam) {
    return trimmed;
  }

  // Split strings > 1800 chars safely within sarvam-translate:v1's 2000-char limit
  const segments = trimmed.match(/[\s\S]{1,1800}(?:\s|$)/g) || [trimmed];
  const translatedParts: string[] = [];

  for (const seg of segments) {
    const piece = seg.trim();
    if (!piece) continue;

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${SARVAM_BASE_URL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': apiKey,
        },
        body: JSON.stringify({
          input: piece,
          source_language_code: sourceSarvam,
          target_language_code: targetSarvam,
          model: 'sarvam-translate:v1',
          mode: 'formal',
        }),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }

    if (!res || !res.ok) {
      throw new Error(`Sarvam Translate HTTP ${res?.status || 500}`);
    }

    const data = (await res.json()) as { translated_text?: string };
    let out = (data.translated_text || piece).trim();

    if (params.glossaryTerms && params.glossaryTerms.length > 0) {
      for (const g of params.glossaryTerms) {
        if (piece.toLowerCase().includes(g.sourceTerm.toLowerCase()) && !out.includes(g.targetTerm)) {
          const rx = new RegExp(g.sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          out = out.replace(rx, g.targetTerm);
        }
      }
    }

    translatedParts.push(out);
  }

  return translatedParts.join(' ');
}

export async function sarvamTranslateBatch(params: {
  sourceMap: Record<string, string>;
  targetLangCode: string;
  glossaryTerms?: Array<{ sourceTerm: string; targetTerm: string }>;
}): Promise<Record<string, string> | null> {
  const apiKey = await getSarvamApiKey();
  if (!apiKey) return null;

  const targetSarvam = toSarvamLangCode(params.targetLangCode);
  if (!targetSarvam || targetSarvam === 'en-IN') return null;

  const entries = Object.entries(params.sourceMap).filter(([, v]) => Boolean(v && v.trim()));
  if (entries.length === 0) return {};

  // Pack single-line UI strings into multi-line chunks (<= 20 items & <= 1300 chars)
  // so 350 UI strings take ~15 fast requests instead of 350 individual requests.
  const chunks: Array<Array<[string, string]>> = [];
  let currentChunk: Array<[string, string]> = [];
  let currentChars = 0;

  for (const [k, rawVal] of entries) {
    const cleanLine = rawVal.replace(/\s*\n+\s*/g, ' ').trim();
    if (
      currentChunk.length >= 20 ||
      (currentChunk.length > 0 && currentChars + cleanLine.length + 1 > 1300)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }
    currentChunk.push([k, cleanLine]);
    currentChars += cleanLine.length + 1;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const results: Record<string, string> = {};
  const applyGlossary = (src: string, translated: string) => {
    let out = translated.trim();
    if (params.glossaryTerms && params.glossaryTerms.length > 0) {
      for (const g of params.glossaryTerms) {
        if (src.toLowerCase().includes(g.sourceTerm.toLowerCase()) && !out.includes(g.targetTerm)) {
          const rx = new RegExp(g.sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          out = out.replace(rx, g.targetTerm);
        }
      }
    }
    return out;
  };

  let chunkIdx = 0;
  const concurrency = 3;

  const worker = async () => {
    while (chunkIdx < chunks.length) {
      const myIdx = chunkIdx++;
      const batch = chunks[myIdx];
      const joinedInput = batch.map(([, val]) => val).join('\n');

      let batchMatched = false;
      try {
        let res: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          res = await fetch(`${SARVAM_BASE_URL}/translate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-subscription-key': apiKey,
            },
            body: JSON.stringify({
              input: joinedInput,
              source_language_code: 'en-IN',
              target_language_code: targetSarvam,
              model: 'sarvam-translate:v1',
              mode: 'formal',
            }),
          });
          if (res.status !== 429) break;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }

        if (res && res.ok) {
          const data = (await res.json()) as { translated_text?: string };
          const outLines = (data.translated_text || '')
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (outLines.length === batch.length) {
            for (let i = 0; i < batch.length; i++) {
              const [key, srcVal] = batch[i];
              results[key] = applyGlossary(srcVal, outLines[i]);
            }
            batchMatched = true;
          }
        }
      } catch {
        // Fall through to per-item fallback for this chunk
      }

      if (!batchMatched) {
        for (const [key, srcVal] of batch) {
          try {
            const single = await sarvamTranslateText({
              text: srcVal,
              sourceLangCode: 'en',
              targetLangCode: params.targetLangCode,
              glossaryTerms: params.glossaryTerms,
            });
            if (single) {
              results[key] = single;
            }
          } catch {
            // Skip failed key
          }
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker())
  );

  return Object.keys(results).length > 0 ? results : null;
}

export async function sarvamSynthesizeSpeech(params: {
  text: string;
  languageCode?: string;
}): Promise<{ audioBase64: string; mimeType: string } | null> {
  const apiKey = await getSarvamApiKey();
  if (!apiKey) return null;

  const sarvamLang = toSarvamLangCode(params.languageCode || 'en');
  if (!sarvamLang || !SARVAM_BULBUL_TTS_LANGS.has(sarvamLang)) {
    return null;
  }

  const cleanText = params.text.replace(/[*#_`~>\[\]]/g, '').trim().slice(0, 1400);
  if (!cleanText) return null;

  const res = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      text: cleanText,
      target_language_code: sarvamLang,
      model: 'bulbul:v3',
      speaker: 'shubh',
    }),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { audios?: string[] };
  const audioBase64 = data.audios?.[0];
  if (!audioBase64) return null;

  return {
    audioBase64,
    mimeType: 'audio/wav',
  };
}

export async function sarvamTranscribeAudio(params: {
  base64Audio: string;
  mimeType: string;
  languageCode?: string;
}): Promise<{ transcript: string; detectedLanguageCode?: string } | null> {
  const apiKey = await getSarvamApiKey();
  if (!apiKey) return null;

  const cleanBase64 = params.base64Audio.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const ext = params.mimeType.includes('wav')
    ? 'wav'
    : params.mimeType.includes('mp4') || params.mimeType.includes('m4a')
      ? 'm4a'
      : params.mimeType.includes('ogg')
        ? 'ogg'
        : 'webm';

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([buffer], { type: params.mimeType || 'audio/webm' }),
    `recording.${ext}`
  );
  formData.append('model', 'saaras:v3');
  formData.append('mode', 'transcribe');

  const sarvamLang = params.languageCode ? toSarvamLangCode(params.languageCode) : null;
  if (sarvamLang) {
    formData.append('language_code', sarvamLang);
  } else {
    formData.append('language_code', 'unknown');
  }

  const res = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = res.status === 402 || body?.error?.code === 'insufficient_quota_error' ? 'quota_exhausted' : res.status === 401 || res.status === 403 ? 'credentials_rejected' : res.status === 429 ? 'rate_limited' : 'provider_unavailable';
    throw new SpeechProviderError('sarvam',res.status,code);
  }

  const data = (await res.json()) as { transcript?: string; language_code?: string };
  if (typeof data.transcript !== 'string') throw new Error('Invalid Sarvam STT response');

  return {
    transcript: data.transcript.trim(),
    detectedLanguageCode: data.language_code
      ? fromSarvamLangCode(data.language_code)
      : undefined,
  };
}
