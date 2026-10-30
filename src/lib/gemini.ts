import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import type { CitationItem, ServiceFormField, SuggestedActionItem } from '../db/schema.ts';

let _ai: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _ai;
}

export async function embedText(text: string): Promise<number[]> {
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
  const ai = getAiClient();
  const glossaryNote =
    params.glossaryTerms.length > 0
      ? `Organisation glossary: ${params.glossaryTerms
          .map((g) => `"${g.sourceTerm}" = "${g.targetTerm}"`)
          .join(', ')}.`
      : '';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: `Analyze this user message: "${params.query}"\nUser's currently selected UI language: ${params.preferredLangName} (${params.preferredLangCode}).\n${glossaryNote}\n1. Detect the language the user actually wrote in (BCP-47 base code like en, hi, ta, te, bn, mr, ur, gu, kn, ml, or, pa, as, mai, sat, ks, ne, sd, kok, doi, mni, brx, sa). If it is Romanized/code-mixed like Hinglish ("mera ration card status kya hai") or Tanglish ("epdi apply panradhu"), map it to the underlying Indian language code (e.g. hi or ta) so we reply in their language, UNLESS it is pure English.\n2. Translate/normalize the core intent into a clear English search query for retrieving official knowledge base documents.\n3. Classify domain into one of: government, education, healthcare, banking, business, customer_support, general.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedLanguageCode: { type: Type.STRING },
          detectedLanguageName: { type: Type.STRING },
          isCodeMixed: { type: Type.BOOLEAN },
          englishSearchQuery: { type: Type.STRING },
          domainGuess: { type: Type.STRING },
        },
        required: [
          'detectedLanguageCode',
          'detectedLanguageName',
          'isCodeMixed',
          'englishSearchQuery',
          'domainGuess',
        ],
      },
    },
  });

  try {
    return JSON.parse((response.text ?? '{}').trim());
  } catch {
    return {
      detectedLanguageCode: params.preferredLangCode,
      detectedLanguageName: params.preferredLangName,
      isCodeMixed: false,
      englishSearchQuery: params.query,
      domainGuess: 'general',
    };
  }
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
  availableServices: Array<{ slug: string; title: string; domain: string }>;
  conversationHistory: Array<{ role: 'user' | 'model'; text: string }>;
  onToken: (delta: string) => void;
}): Promise<{
  fullText: string;
  confidence: number;
  needsHumanHandover: boolean;
  citations: CitationItem[];
  suggestedActions: SuggestedActionItem[];
}> {
  const ai = getAiClient();
  const hasSources = params.retrievedChunks.length > 0 && params.retrievedChunks[0].similarity >= 0.38;

  const glossaryInstruction =
    params.glossaryTerms.length > 0
      ? `MANDATORY ORGANISATION GLOSSARY (you MUST use these exact target terms when writing in ${params.replyLanguageName}):\n` +
        params.glossaryTerms.map((g) => `- "${g.sourceTerm}" -> "${g.targetTerm}"`).join('\n')
      : '';

  const sourcesContext = hasSources
    ? params.retrievedChunks
        .map(
          (c, i) =>
            `[SOURCE ${i + 1} | DocID:${c.documentId} | Title: "${c.documentTitle}" | Page ${c.pageNumber} | Lang: ${c.languageCode} | Match: ${c.similarity.toFixed(2)}]\n${c.content}`
        )
        .join('\n\n')
    : 'NO PUBLISHED KNOWLEDGE BASE DOCUMENTS MATCHED THIS QUERY.';

  const systemInstruction = `You are Sahayak, a trustworthy multilingual public & institutional service assistant.
CRITICAL RULES:
1. Respond ENTIRELY in ${params.replyLanguageName} (${params.replyLanguageCode}) using its native ${params.replyScript} script, clear plain everyday language, and short bullet points where helpful.
2. STRICT GROUNDING: Answer ONLY using facts explicitly stated in the PUBLISHED SOURCES provided below. NEVER invent facts, dates, eligibility criteria, fees, phone numbers, or URLs.
3. If NO PUBLISHED KNOWLEDGE BASE DOCUMENTS MATCHED THIS QUERY, or if the provided sources do not contain the answer to the user's question, state clearly and politely in ${params.replyLanguageName} that there is no verified published document in the knowledge base covering this specific question yet, and offer to connect them with a human support agent or start a service request/grievance.
4. Keep tone respectful, warm, and accessible for citizens of all literacy levels.
${glossaryInstruction}

PUBLISHED SOURCES:
${sourcesContext}`;

  const contents = [
    ...params.conversationHistory.slice(-6).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: params.userMessage }],
    },
  ];

  const stream = await ai.models.generateContentStream({
    model: 'gemini-3.8-flash',
    contents,
    config: {
      systemInstruction,
    },
  });

  let fullText = '';
  for await (const chunk of stream) {
    const c = chunk as GenerateContentResponse;
    const piece = c.text ?? '';
    if (piece) {
      fullText += piece;
      params.onToken(piece);
    }
  }

  const topSimilarity = params.retrievedChunks[0]?.similarity ?? 0;
  const confidence = hasSources ? Math.min(0.98, Math.max(0.45, topSimilarity)) : 0.18;
  const needsHumanHandover = !hasSources || confidence < 0.52;

  const citations: CitationItem[] = hasSources
    ? params.retrievedChunks
        .filter((c) => c.similarity >= 0.38)
        .slice(0, 3)
        .map((c) => ({
          documentId: c.documentId,
          documentTitle: c.documentTitle,
          pageNumber: c.pageNumber,
          snippet: c.content.slice(0, 220),
          languageCode: c.languageCode,
        }))
    : [];

  const suggestedActions: SuggestedActionItem[] = [
    {
      type: 'talk_to_human',
      label: 'Talk to a human',
    },
  ];

  if (params.availableServices.length > 0) {
    suggestedActions.push({
      type: 'start_application',
      label: 'Start application',
      serviceSlug: params.availableServices[0].slug,
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
}): Promise<{ transcript: string }> {
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
}): Promise<{ audioBase64: string; mimeType: string }> {
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
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Extract the complete factual content, eligibility rules, procedures, FAQs, and notices from ${params.sourceUrl}. Preserve exact numbers, dates, and conditions.`,
      config: {
        tools: [{ urlContext: {} }],
      },
    });
    const text = (response.text ?? '').trim();
    return parseDocumentText({ rawText: text });
  }

  if (params.base64Data) {
    const cleanBase64 = params.base64Data.replace(/^data:[^;]+;base64,/, '');
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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
    });
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

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
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
  });

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

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
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
  });

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
  const ai = getAiClient();
  const entries = Object.entries(params.sourceMap);
  if (entries.length === 0) return {};

  const glossaryText =
    params.glossaryTerms.length > 0
      ? `Mandatory glossary terms: ${params.glossaryTerms
          .map((g) => `"${g.sourceTerm}" -> "${g.targetTerm}"`)
          .join(', ')}.`
      : '';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
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
  });

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
  const ai = getAiClient();
  const glossaryNote =
    params.glossaryTerms.length > 0
      ? `Mandatory glossary: ${params.glossaryTerms
          .map((g) => `"${g.sourceTerm}"="${g.targetTerm}"`)
          .join(', ')}.`
      : '';
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: `Translate the following message accurately and politely into ${params.targetLangName} (${params.targetLangCode}). ${glossaryNote} Return ONLY the translated text.\n\nMessage:\n${params.text}`,
  });
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
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
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
  });

  try {
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
    return {
      englishTranslation: params.description,
      priority: 'normal',
      assignedDepartment: `${params.domain} Resolution Desk`,
      slaHours: 72,
    };
  }
}
