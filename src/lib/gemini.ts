import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';
import type { CitationItem, ServiceFormField, SuggestedActionItem } from '../db/schema.ts';
import {
  sarvamSynthesizeSpeech,
  sarvamTranscribeAudio,
  sarvamTranslateBatch,
  sarvamTranslateText,
} from './sarvam.ts';

let _ai: GoogleGenAI | null = null;

export function hasGeminiApiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

const TEXT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'] as const;

export function getAiClient(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        timeout: 22000,
        retryOptions: {
          attempts: 1,
        },
      },
    });
  }
  return _ai;
}

async function callTextModelWithFallback<T>(
  runner: (model: (typeof TEXT_MODELS)[number], ai: GoogleGenAI) => Promise<T>
): Promise<T> {
  const ai = getAiClient();
  let lastError: unknown = null;
  for (const model of TEXT_MODELS) {
    try {
      return await runner(model, ai);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Model generation unavailable');
}

function fallbackLexicalEmbedding(text: string): number[] {
  const vec = new Array(768).fill(0);
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < clean.length; i++) {
    const tri = clean.slice(i, i + 3);
    let h = 2166136261;
    for (let j = 0; j < tri.length; j++) {
      h ^= tri.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % 768;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function detectScriptLangFast(query: string, preferredLangCode: string): string {
  if (/[\u0B80-\u0BFF]/.test(query)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(query)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(query)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(query)) return 'ml';
  if (/[\u0980-\u09FF]/.test(query)) return preferredLangCode === 'as' ? 'as' : 'bn';
  if (/[\u0A80-\u0AFF]/.test(query)) return 'gu';
  if (/[\u0A00-\u0A7F]/.test(query)) return 'pa';
  if (/[\u0B00-\u0B7F]/.test(query)) return 'or';
  if (/[\u1C50-\u1C7F]/.test(query)) return 'sat';
  if (/[\u0600-\u06FF]/.test(query)) {
    return ['ur', 'ks', 'sd'].includes(preferredLangCode) ? preferredLangCode : 'ur';
  }
  if (/[\u0900-\u097F]/.test(query)) {
    return ['hi', 'mr', 'ne', 'kok', 'mai', 'doi', 'brx', 'sa'].includes(preferredLangCode)
      ? preferredLangCode
      : 'hi';
  }
  return preferredLangCode || 'en';
}

export function inferDomainFast(query: string): string {
  const q = query.toLowerCase();
  if (/\b(scholarship|college|school|university|exam|marksheet|enrollment|transfer certificate|admission|student)\b/.test(q)) {
    return 'education';
  }
  if (/\b(hospital|health|doctor|clinic|medical|ayushman|opd|patient|vaccine|medicine)\b/.test(q)) {
    return 'healthcare';
  }
  if (/\b(bank|kyc|account|loan|upi|dbt|ifsc|passbook|atm|debit|credit)\b/.test(q)) {
    return 'banking';
  }
  if (/\b(msme|udyam|gst|license|shop|business|enterprise|trade|registration)\b/.test(q)) {
    return 'business';
  }
  if (/\b(bill|electricity|water|complaint|grievance|refund|support|ticket|delay)\b/.test(q)) {
    return 'customer_support';
  }
  if (/\b(certificate|income|caste|domicile|residence|ration|aadhaar|voter|passport|pension|train|irctc|government)\b/.test(q)) {
    return 'government';
  }
  return 'general';
}

export async function embedText(text: string): Promise<number[]> {
  if (!hasGeminiApiKey()) {
    return fallbackLexicalEmbedding(text);
  }
  try {
    const ai = getAiClient();
    const trimmed = text.slice(0, 8000);
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: [trimmed],
      config: {
        outputDimensionality: 768,
      },
    });
    const values = result.embeddings?.[0]?.values || [];
    if (values.length === 768) return values;
    if (values.length > 768) return values.slice(0, 768);
    const padded = new Array(768).fill(0);
    for (let i = 0; i < values.length; i++) padded[i] = values[i];
    return padded;
  } catch {
    return fallbackLexicalEmbedding(text);
  }
}

export async function detectAndNormalizeQuery(params: {
  query: string;
  preferredLangCode: string;
  preferredLangName: string;
  glossaryTerms: Array<{ sourceTerm: string; targetTerm: string }>;
}): Promise<{
  detectedLanguageCode: string;
  detectedLanguageName: string;
  isCodeMixed: boolean;
  englishSearchQuery: string;
  domainGuess: string;
}> {
  const trimmed = params.query.trim();
  const hasNonAscii = /[^\u0000-\u007F]/.test(trimmed);
  const detectedByScript = detectScriptLangFast(trimmed, params.preferredLangCode);

  // Check common Romanized Hinglish / Tanglish cues when typed in Latin characters
  let detectedCode = detectedByScript;
  let isCodeMixed = false;
  if (!hasNonAscii) {
    if (/\b(epdi|eppadi|iruku|irukku|venum|sollunga|pannanum|panradhu|mudiyuma|vaanguradhu)\b/i.test(trimmed)) {
      detectedCode = 'ta';
      isCodeMixed = true;
    } else if (/\b(mera|meri|kaise|kya|chahiye|banwana|milega|kab|kahan|bataiye|karna)\b/i.test(trimmed)) {
      detectedCode = params.preferredLangCode !== 'en' ? params.preferredLangCode : 'hi';
      isCodeMixed = true;
    }
  }

  let englishQuery = trimmed;
  if (hasNonAscii || isCodeMixed) {
    try {
      const sarvamEn = await Promise.race([
        sarvamTranslateText({
          text: trimmed,
          sourceLangCode: hasNonAscii ? detectedCode : undefined,
          targetLangCode: 'en',
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (sarvamEn && sarvamEn.trim()) {
        englishQuery = sarvamEn.trim();
      }
    } catch {
      // Keep original query if translation times out
    }
  }

  const domainGuess = inferDomainFast(`${trimmed} ${englishQuery}`);

  return {
    detectedLanguageCode: detectedCode,
    detectedLanguageName: params.preferredLangName,
    isCodeMixed,
    englishSearchQuery: englishQuery,
    domainGuess,
  };
}

export async function generateGroundedAnswerStream(params: {
  userMessage: string;
  replyLanguageCode: string;
  replyLanguageName: string;
  replyScript: string;
  retrievedChunks: Array<{
    documentId: number;
    documentTitle: string;
    pageNumber: number;
    content: string;
    languageCode: string;
    similarity: number;
  }>;
  glossaryTerms: Array<{ sourceTerm: string; targetTerm: string }>;
  availableServices: Array<{
    slug: string;
    title: string;
    domain: string;
    description?: string;
    requiredDocuments?: string[];
    estimatedDays?: number;
  }>;
  attachedDocument?: {
    documentId?: number;
    fileName: string;
    mimeType: string;
    base64Data: string;
  };
  conversationHistory: Array<{ role: 'user' | 'model'; text: string }>;
  onToken: (delta: string) => void;
}): Promise<{
  fullText: string;
  confidence: number;
  needsHumanHandover: boolean;
  citations: CitationItem[];
  suggestedActions: SuggestedActionItem[];
}> {
  const hasKbSources =
    params.retrievedChunks.length > 0 && params.retrievedChunks[0].similarity >= 0.38;
  const hasAttachment = Boolean(params.attachedDocument?.base64Data);

  const glossaryInstruction =
    params.glossaryTerms.length > 0
      ? `MANDATORY ORGANISATION GLOSSARY (use these exact target terms when writing in ${params.replyLanguageName}):\n` +
        params.glossaryTerms.map((g) => `- "${g.sourceTerm}" -> "${g.targetTerm}"`).join('\n')
      : '';

  const sourcesContext = hasKbSources
    ? params.retrievedChunks
        .filter((c) => c.similarity >= 0.35)
        .map(
          (c, i) =>
            `[SOURCE ${i + 1} | DocID:${c.documentId} | Title: "${c.documentTitle}" | Page ${c.pageNumber} | Lang: ${c.languageCode}]\n${c.content}`
        )
        .join('\n\n')
    : 'NO INSTITUTION-SPECIFIC CIRCULAR MATCHED IN PUBLISHED KNOWLEDGE BASE.';

  const servicesContext =
    params.availableServices.length > 0
      ? params.availableServices
          .map(
            (s) =>
              `- Service: "${s.title}" (Domain: ${s.domain}, Slug: ${s.slug}${
                s.estimatedDays ? `, Est. turnaround: ${s.estimatedDays} days` : ''
              })${s.description ? `\n  Summary: ${s.description}` : ''}${
                s.requiredDocuments && s.requiredDocuments.length > 0
                  ? `\n  Required Documents: ${s.requiredDocuments.join(', ')}`
                  : ''
              }`
          )
          .join('\n')
      : 'None';

  const systemInstruction = `You are Sahayak, a trustworthy, practical multilingual public & institutional service assistant.
CRITICAL RULES:
1. Respond ENTIRELY in ${params.replyLanguageName} (${params.replyLanguageCode}) using its native ${params.replyScript} script. Use clear, warm, everyday language with short numbered steps or bullet points so citizens of any literacy level can follow easily.
2. SOURCE PRIORITY & HONEST GROUNDING:
   - If the user attached a document/image in this message, read it carefully and answer their question directly from what is visible in the document, listing key points, required actions, and any dates/deadlines. Never claim an uploaded document is "officially verified" by a government authority.
   - If PUBLISHED KNOWLEDGE BASE SOURCES are provided below, ground your answer strictly in those official passages.
   - If the question matches one of the AVAILABLE SAHAYAK SERVICES below, explain the steps, required documents, and estimated processing time from that service template, and mention they can tap "Start application" below to fill the guided form.
   - If no published circular matched in the knowledge base, STILL HELP THE USER with accurate, practical general public procedure steps (for example, standard official steps to book a train ticket, update bank KYC, apply for certificates, or file a grievance), while briefly noting at the end in 1 short sentence that these are general procedural steps (and never invent specific fees, scheme deadlines, phone numbers, or circular numbers).
3. Keep formatting clean and readable. Avoid markdown tables or code blocks.
${glossaryInstruction}

PUBLISHED KNOWLEDGE BASE SOURCES:
${sourcesContext}

AVAILABLE SAHAYAK DIGITAL SERVICES:
${servicesContext}`;

  const userParts: any[] = [];
  if (hasAttachment && params.attachedDocument) {
    userParts.push({
      inlineData: {
        mimeType: params.attachedDocument.mimeType || 'image/jpeg',
        data: params.attachedDocument.base64Data.replace(/^data:[^;]+;base64,/, ''),
      },
    });
    userParts.push({
      text: `Attached file: "${params.attachedDocument.fileName}".\nUser question: ${params.userMessage}`,
    });
  } else {
    userParts.push({ text: params.userMessage });
  }

  const contents = [
    ...params.conversationHistory.slice(-6).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    {
      role: 'user' as const,
      parts: userParts,
    },
  ];

  let fullText = '';

  if (hasGeminiApiKey()) {
    for (const modelName of TEXT_MODELS) {
      try {
        const ai = getAiClient();
        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: {
            systemInstruction,
          },
        });

        for await (const chunk of stream) {
          const c = chunk as GenerateContentResponse;
          const piece = c.text ?? '';
          if (piece) {
            fullText += piece;
            params.onToken(piece);
          }
        }
        if (fullText.trim()) break;
      } catch {
        fullText = '';
      }
    }
  }

  if (!fullText.trim()) {
    const matchedSvc = params.availableServices[0];
    const baseGroundedText = hasKbSources
      ? params.retrievedChunks
          .slice(0, 2)
          .map((c) => `${c.documentTitle} (Page ${c.pageNumber}): ${c.content}`)
          .join('\n\n')
      : matchedSvc
        ? `${matchedSvc.title}: ${matchedSvc.description || ''}${
            matchedSvc.requiredDocuments?.length
              ? `\n\nSupporting documents: ${matchedSvc.requiredDocuments.join(', ')}.`
              : ''
          }\n\nYou can start the guided smart form below or request human support.`
        : 'We could not reach the AI generation service right now. You can tap "Talk to a human" below to connect with a support agent, browse Services, or file a tracked Grievance.';

    let localized = baseGroundedText;
    if (params.replyLanguageCode !== 'en') {
      try {
        const tr = await sarvamTranslateText({
          text: baseGroundedText,
          sourceLangCode: 'en',
          targetLangCode: params.replyLanguageCode,
          glossaryTerms: params.glossaryTerms,
        });
        if (tr) localized = tr;
      } catch {
        // Keep base text if translation fails
      }
    }
    fullText = localized;
    params.onToken(fullText);
  }

  const topSimilarity = params.retrievedChunks[0]?.similarity ?? 0;
  const confidence = hasAttachment
    ? 0.92
    : hasKbSources
      ? Math.min(0.98, Math.max(0.65, topSimilarity))
      : 0.78;

  // Only auto-escalate to human inbox when the user explicitly asks for a human/agent
  const explicitHumanRequest =
    /\b(talk to (a )?human|human agent|support agent|live agent|real person|customer care executive|மனித உதவியாளர்|मानव सहायक)\b/i.test(
      params.userMessage
    );
  const needsHumanHandover = explicitHumanRequest;

  const citations: CitationItem[] = [];
  if (hasAttachment && params.attachedDocument) {
    citations.push({
      documentId: params.attachedDocument.documentId || 0,
      documentTitle: params.attachedDocument.fileName,
      pageNumber: 1,
      snippet: `Uploaded file analyzed directly in conversation (${params.attachedDocument.mimeType})`,
      languageCode: params.replyLanguageCode,
    });
  }
  if (hasKbSources) {
    for (const c of params.retrievedChunks.filter((x) => x.similarity >= 0.38).slice(0, 3)) {
      citations.push({
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        pageNumber: c.pageNumber,
        snippet: c.content.slice(0, 220),
        languageCode: c.languageCode,
      });
    }
  }

  const suggestedActions: SuggestedActionItem[] = [
    {
      type: 'talk_to_human',
      label: 'Talk to a human',
    },
  ];

  // Match best service slug based on keywords or domain
  const qLower = params.userMessage.toLowerCase();
  const matchedService =
    params.availableServices.find(
      (s) =>
        qLower.includes(s.domain.replace('_', ' ')) ||
        s.title
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.length > 4 && qLower.includes(w))
    ) || params.availableServices[0];

  if (matchedService) {
    suggestedActions.push({
      type: 'start_application',
      label: 'Start application',
      serviceSlug: matchedService.slug,
    });
  }

  if (/\b(complaint|grievance|delay|delayed|rejected|issue|problem|dispute|overcharge|wrong|error|குறை|புகார்|शिकायत)\b/i.test(params.userMessage)) {
    suggestedActions.push({
      type: 'file_grievance',
      label: 'File a grievance',
    });
  }

  return {
    fullText,
    confidence,
    needsHumanHandover,
    citations,
    suggestedActions,
  };
}

export async function transcribeAudioBase64(params: {
  base64Audio: string;
  mimeType: string;
  languageHint?: string;
  languageCode?: string;
}): Promise<{ transcript: string; detectedLanguageCode?: string }> {
  // Primary: Sarvam AI Saaras v3 Indian Speech-to-Text
  try {
    const sarvamStt = await sarvamTranscribeAudio({
      base64Audio: params.base64Audio,
      mimeType: params.mimeType,
      languageCode: params.languageCode,
    });
    if (sarvamStt && sarvamStt.transcript) {
      return sarvamStt;
    }
  } catch {
    // Fall back to Gemini STT
  }

  if (!hasGeminiApiKey()) {
    throw new Error('Voice transcription unavailable.');
  }

  const ai = getAiClient();
  const cleanBase64 = params.base64Audio.replace(/^data:[^;]+;base64,/, '');
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: cleanBase64,
          },
        },
        {
          text: params.languageHint
            ? `Transcribe this spoken audio accurately in its original script (likely ${params.languageHint} or code-mixed Indian language/English). Return only the spoken words.`
            : 'Transcribe this spoken audio accurately in its original language and script. Return only the spoken words.',
        },
      ],
    },
  });
  return { transcript: (response.text ?? '').trim() };
}

export async function synthesizeSpeechWav(params: {
  text: string;
  languageName: string;
  languageCode?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  // Primary: Sarvam AI Bulbul v3 Native Indian Text-to-Speech
  try {
    const sarvamTts = await sarvamSynthesizeSpeech({
      text: params.text,
      languageCode: params.languageCode,
    });
    if (sarvamTts && sarvamTts.audioBase64) {
      return sarvamTts;
    }
  } catch {
    // Fall back to Gemini TTS for languages outside Bulbul v3 set
  }

  if (!hasGeminiApiKey()) {
    throw new Error('Speech synthesis fallback unavailable for this script.');
  }

  const ai = getAiClient();
  const cleanText = params.text.replace(/[*#_`~>\[\]]/g, '').slice(0, 1800);
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: {
              style: `Warm, clear, patient public service guide speaking in ${params.languageName}`,
            },
          } as any,
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Speech synthesis returned empty audio data.');
  }
  return {
    audioBase64: base64Audio,
    mimeType: 'audio/wav',
  };
}

export async function parseDocumentText(params: {
  base64Data?: string;
  mimeType?: string;
  rawText?: string;
  sourceUrl?: string;
}): Promise<{ extractedText: string; pages: Array<{ pageNumber: number; text: string }> }> {
  const ai = getAiClient();

  if (params.rawText && params.rawText.trim().length > 0 && !params.base64Data) {
    const paragraphs = params.rawText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const pages: Array<{ pageNumber: number; text: string }> = [];
    let current = '';
    let pageNo = 1;
    for (const p of paragraphs) {
      if ((current + '\n\n' + p).length > 1200 && current.length > 0) {
        pages.push({ pageNumber: pageNo++, text: current.trim() });
        current = p;
      } else {
        current = current ? `${current}\n\n${p}` : p;
      }
    }
    if (current.trim()) pages.push({ pageNumber: pageNo, text: current.trim() });
    return { extractedText: params.rawText.trim(), pages };
  }

  if (params.sourceUrl && !params.base64Data) {
    const response = await callTextModelWithFallback((model, ai) =>
      ai.models.generateContent({
        model,
        contents: `Extract the complete factual content, eligibility rules, procedures, FAQs, and notices from ${params.sourceUrl}. Preserve exact numbers, dates, and conditions.`,
        config: {
          tools: [{ urlContext: {} }],
        },
      })
    );
    const text = (response.text ?? '').trim();
    return parseDocumentText({ rawText: text });
  }

  if (params.base64Data) {
    const cleanBase64 = params.base64Data.replace(/^data:[^;]+;base64,/, '');
    const response = await callTextModelWithFallback((model, ai) =>
      ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: params.mimeType || 'application/pdf',
                data: cleanBase64,
              },
            },
            {
              text: 'Extract all text from this document page by page with full OCR fidelity in its original script. Return JSON with pages array [{pageNumber, text}].',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pages: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pageNumber: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                  },
                  required: ['pageNumber', 'text'],
                },
              },
            },
            required: ['pages'],
          },
        },
      })
    );
    const parsed = JSON.parse((response.text ?? '{"pages":[]}').trim());
    const pages: Array<{ pageNumber: number; text: string }> = parsed.pages || [];
    return {
      extractedText: pages.map((p) => p.text).join('\n\n'),
      pages,
    };
  }

  return { extractedText: '', pages: [] };
}

export async function explainLetterMultimodal(params: {
  base64Data?: string;
  mimeType?: string;
  rawText?: string;
  targetLangCode: string;
  targetLangName: string;
  glossaryTerms: Array<{ sourceTerm: string; targetTerm: string }>;
}): Promise<{
  ocrText: string;
  senderOrAuthority: string;
  plainSummary: string;
  whatYouNeedToDo: string[];
  detectedDeadlineIso: string | null;
  deadlineLabel: string | null;
  referenceNumbers: string[];
}> {
  if (hasGeminiApiKey()) {
    const ai = getAiClient();
    const glossaryNote =
      params.glossaryTerms.length > 0
        ? `Use these mandatory terms in ${params.targetLangName}: ${params.glossaryTerms
            .map((g) => `"${g.sourceTerm}"="${g.targetTerm}"`)
            .join(', ')}.`
        : '';

    const parts: any[] = [];
    if (params.base64Data) {
      parts.push({
        inlineData: {
          mimeType: params.mimeType || 'image/jpeg',
          data: params.base64Data.replace(/^data:[^;]+;base64,/, ''),
        },
      });
    }
    if (params.rawText) {
      parts.push({ text: `Document text:\n${params.rawText}` });
    }

    parts.push({
      text: `Perform full OCR on this official letter/notice/document and explain it in simple, reassuring everyday ${params.targetLangName} (${params.targetLangCode}).
${glossaryNote}
Never invent details not present in the document. If a response/payment/submission deadline date is mentioned in the document, return it in YYYY-MM-DD format in detectedDeadlineIso (otherwise empty string).`,
    });

    const response = await callTextModelWithFallback((model, ai) =>
      ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ocrText: { type: Type.STRING },
              senderOrAuthority: { type: Type.STRING },
              plainSummary: { type: Type.STRING },
              whatYouNeedToDo: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              detectedDeadlineIso: { type: Type.STRING },
              deadlineLabel: { type: Type.STRING },
              referenceNumbers: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'ocrText',
              'senderOrAuthority',
              'plainSummary',
              'whatYouNeedToDo',
              'detectedDeadlineIso',
              'deadlineLabel',
              'referenceNumbers',
            ],
          },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return {
      ocrText: parsed.ocrText || '',
      senderOrAuthority: parsed.senderOrAuthority || '',
      plainSummary: parsed.plainSummary || '',
      whatYouNeedToDo: parsed.whatYouNeedToDo || [],
      detectedDeadlineIso:
        parsed.detectedDeadlineIso && /^\d{4}-\d{2}-\d{2}/.test(parsed.detectedDeadlineIso)
          ? parsed.detectedDeadlineIso.slice(0, 10)
          : null,
      deadlineLabel: parsed.deadlineLabel || null,
      referenceNumbers: parsed.referenceNumbers || [],
    };
  }

  // Sarvam AI text notice explanation fallback when rawText is provided
  const raw = (params.rawText || '').trim();
  if (!raw) {
    throw new Error('Paste notice text or configure multimodal OCR to scan images.');
  }
  const translatedSummary =
    params.targetLangCode === 'en'
      ? raw
      : (await sarvamTranslateText({
          text: raw,
          targetLangCode: params.targetLangCode,
          glossaryTerms: params.glossaryTerms,
        })) || raw;
  const isoMatch = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return {
    ocrText: raw,
    senderOrAuthority: '',
    plainSummary: translatedSummary,
    whatYouNeedToDo: [],
    detectedDeadlineIso: isoMatch ? isoMatch[1] : null,
    deadlineLabel: null,
    referenceNumbers: [],
  };
}

export async function extractFormFieldsFromDocument(params: {
  base64Data: string;
  mimeType: string;
  fields: ServiceFormField[];
}): Promise<{
  extractedValues: Record<string, string>;
  documentSummary: string;
}> {
  const ai = getAiClient();
  const cleanBase64 = params.base64Data.replace(/^data:[^;]+;base64,/, '');

  const fieldDescriptions = params.fields
    .map(
      (f) =>
        `- key: "${f.key}", label: "${f.label}", type: "${f.type}"${
          f.options ? `, allowed options: [${f.options.join(', ')}]` : ''
        }${f.extractHint ? `, hint: ${f.extractHint}` : ''}`
    )
    .join('\n');

  const response = await callTextModelWithFallback((model, ai) =>
    ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: `Extract ONLY factual values clearly visible in this uploaded document that match the target form fields below. Do NOT guess or fabricate missing fields — omit any field not visible in the document. Format dates as YYYY-MM-DD.\n\nTarget Fields:\n${fieldDescriptions}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentSummary: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['key', 'value'],
              },
            },
          },
          required: ['documentSummary', 'items'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{"documentSummary":"","items":[]}').trim());
  const extractedValues: Record<string, string> = {};
  const validKeys = new Set(params.fields.map((f) => f.key));
  for (const item of parsed.items || []) {
    if (validKeys.has(item.key) && item.value && String(item.value).trim() !== '') {
      extractedValues[item.key] = String(item.value).trim();
    }
  }
  return {
    extractedValues,
    documentSummary: parsed.documentSummary || 'Document scanned',
  };
}

export async function translateUiStringsBatch(params: {
  targetLangCode: string;
  targetLangName: string;
  nativeName: string;
  script: string;
  sourceMap: Record<string, string>;
  glossaryTerms: Array<{ sourceTerm: string; targetTerm: string }>;
}): Promise<Record<string, string>> {
  const entries = Object.entries(params.sourceMap);
  if (entries.length === 0) return {};

  // Primary: Sarvam AI sarvam-translate:v1 (supports all 22 Scheduled Indian Languages)
  try {
    const sarvamOut = await sarvamTranslateBatch({
      sourceMap: params.sourceMap,
      targetLangCode: params.targetLangCode,
      glossaryTerms: params.glossaryTerms,
    });
    if (sarvamOut && Object.keys(sarvamOut).length > 0) {
      return sarvamOut;
    }
  } catch (err) {
    console.error('Sarvam batch translation error, trying Gemini fallback:', err);
  }

  if (!hasGeminiApiKey()) {
    return {};
  }

  const ai = getAiClient();
  const glossaryText =
    params.glossaryTerms.length > 0
      ? `Mandatory glossary terms: ${params.glossaryTerms
          .map((g) => `"${g.sourceTerm}" -> "${g.targetTerm}"`)
          .join(', ')}.`
      : '';

  const response = await callTextModelWithFallback((model, ai) =>
    ai.models.generateContent({
      model,
      contents: `Translate the following UI interface strings from English into natural, accessible ${params.targetLangName} (${params.nativeName}, BCP-47: ${params.targetLangCode}, Script: ${params.script}). Keep button and navigation labels concise (1-3 words where short in English). Keep "Sahayak" transliterated naturally in ${params.script}.\n${glossaryText}\n\nInput JSON:\n${JSON.stringify(params.sourceMap)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['key', 'value'],
              },
            },
          },
          required: ['translations'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{"translations":[]}').trim());
  const out: Record<string, string> = {};
  for (const item of parsed.translations || []) {
    if (item.key && item.value) {
      out[item.key] = item.value;
    }
  }
  return out;
}

export async function translateTextWithGlossary(params: {
  text: string;
  targetLangCode: string;
  targetLangName: string;
  glossaryTerms: Array<{ sourceTerm: string; targetTerm: string }>;
}): Promise<string> {
  if (!params.text.trim()) return '';

  // Primary: Sarvam AI sarvam-translate:v1
  try {
    const sarvamTranslated = await sarvamTranslateText({
      text: params.text,
      targetLangCode: params.targetLangCode,
      glossaryTerms: params.glossaryTerms,
    });
    if (sarvamTranslated) {
      return sarvamTranslated;
    }
  } catch {
    // Fall back to Gemini
  }

  if (!hasGeminiApiKey()) {
    return params.text.trim();
  }

  const glossaryNote =
    params.glossaryTerms.length > 0
      ? `Mandatory glossary: ${params.glossaryTerms
          .map((g) => `"${g.sourceTerm}"="${g.targetTerm}"`)
          .join(', ')}.`
      : '';
  const response = await callTextModelWithFallback((model, ai) =>
    ai.models.generateContent({
      model,
      contents: `Translate the following message accurately and politely into ${params.targetLangName} (${params.targetLangCode}). ${glossaryNote} Return ONLY the translated text.\n\nMessage:\n${params.text}`,
    })
  );
  return (response.text ?? params.text).trim();
}

export async function classifyAndNormalizeGrievance(params: {
  description: string;
  domain: string;
  category: string;
  languageCode: string;
}): Promise<{
  englishTranslation: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedDepartment: string;
  slaHours: number;
}> {
  if (hasGeminiApiKey()) {
    try {
      const response = await callTextModelWithFallback((model, ai) =>
        ai.models.generateContent({
          model,
          contents: `Classify this citizen grievance for routing.\nDomain: ${params.domain}\nCategory: ${params.category}\nLanguage: ${params.languageCode}\nDescription: "${params.description}"\nReturn an English summary/translation for support staff, priority (low, normal, high, urgent), recommended department queue name, and SLA hours (24 for urgent, 48 for high, 72 for normal, 120 for low).`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                englishTranslation: { type: Type.STRING },
                priority: { type: Type.STRING },
                assignedDepartment: { type: Type.STRING },
                slaHours: { type: Type.INTEGER },
              },
              required: ['englishTranslation', 'priority', 'assignedDepartment', 'slaHours'],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const validPriority = ['low', 'normal', 'high', 'urgent'].includes(parsed.priority)
        ? parsed.priority
        : 'normal';
      return {
        englishTranslation: parsed.englishTranslation || params.description,
        priority: validPriority,
        assignedDepartment: parsed.assignedDepartment || `${params.domain} Resolution Desk`,
        slaHours: Number(parsed.slaHours) || 72,
      };
    } catch {
      // Fall through to Sarvam translation triage
    }
  }

  let englishTranslation = params.description;
  if (params.languageCode !== 'en') {
    try {
      const tr = await sarvamTranslateText({
        text: params.description,
        sourceLangCode: params.languageCode,
        targetLangCode: 'en',
      });
      if (tr) englishTranslation = tr;
    } catch {
      // Keep original text
    }
  }

  const isUrgent = /urgent|emergency|अவசரம்|உடனடி|तुरंत|आपात/i.test(
    `${params.category} ${params.description}`
  );
  return {
    englishTranslation,
    priority: isUrgent ? 'urgent' : 'normal',
    assignedDepartment: `${params.domain} Resolution Desk`,
    slaHours: isUrgent ? 24 : 72,
  };
}
