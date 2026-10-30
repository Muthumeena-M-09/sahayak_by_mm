import express from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import { conversations, profiles } from './src/db/schema.ts';
import { DEFAULT_UI_STRINGS } from './src/db/seedData.ts';
import {
  appendMessage,
  computeAdminAnalytics,
  createApplicationSubmission,
  createCitizenGrievance,
  createGlossaryEntry,
  createGuestAccountSession,
  createOrGetConversation,
  createOtpChallenge,
  createUserReminder,
  deleteAllUserDataPermanently,
  deleteCitizenDocument,
  deleteKnowledgeDocument,
  ensureSeedData,
  escalateConversationToHuman,
  executeWorkflowsForEvent,
  getCachedTranslations,
  getGlossaryEntries,
  getMessagesForConversation,
  inviteOrAssignRole,
  listAllGrievancesAdmin,
  listAuditLogsAdmin,
  listCitizenDocuments,
  listHumanInboxConversations,
  listKnowledgeDocuments,
  listLanguages,
  listSanitizedIntegrations,
  listServiceTemplates,
  listUserApplicationsWithEvents,
  listUserConversations,
  listUserGrievances,
  listUserNotifications,
  listUserReminders,
  listUsersAndRolesAdmin,
  listWorkflowsAndRuns,
  markNotificationRead,
  recordAuditLog,
  removeGlossaryEntry,
  replaceDocumentChunks,
  retrieveTopPublishedChunks,
  saveCitizenDocument,
  saveIntegrationConnector,
  saveKnowledgeDocument,
  saveMessageFeedback,
  saveTranslatedKeys,
  saveWorkflowDefinition,
  setRoleActiveState,
  testIntegrationById,
  toggleUserReminder,
  updateConversationStatusAdmin,
  updateGrievanceAdmin,
  updateProfileSettings,
  upsertLanguageEntry,
  verifyOtpAndIssueSession,
} from './src/db/repositories.ts';
import {
  classifyAndNormalizeGrievance,
  detectAndNormalizeQuery,
  embedText,
  explainLetterMultimodal,
  extractFormFieldsFromDocument,
  generateGroundedAnswerStream,
  parseDocumentText,
  synthesizeSpeechWav,
  transcribeAudioBase64,
  translateTextWithGlossary,
  translateUiStringsBatch,
} from './src/lib/gemini.ts';
import { requireAuth, requireRole, type AuthRequest } from './src/middleware/auth.ts';
import { realtimeHub } from './src/server/wsHub.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  // Attach real-time WebSocket hub on same HTTP server (/ws)
  realtimeHub.attach(httpServer);

  // Increase payload limit for PDF/Image uploads and audio recordings
  app.use(express.json({ limit: '25mb' }));

  // =========================================================================
  // PUBLIC ENDPOINTS (Languages, UI i18n, Neutral Services, Sample TTS)
  // =========================================================================

  app.get('/api/public/languages', async (_req, res) => {
    try {
      const langs = await listLanguages(false);
      res.json({ languages: langs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load languages' });
    }
  });

  app.get('/api/public/i18n/:langCode', async (req, res) => {
    try {
      const langCode = req.params.langCode.trim();
      const allLangs = await listLanguages(true);
      const targetLang = allLangs.find((l) => l.code === langCode);
      if (!targetLang || langCode === 'en') {
        const cachedEn = await getCachedTranslations('en');
        const merged = { ...DEFAULT_UI_STRINGS };
        for (const row of cachedEn) {
          merged[row.translationKey] = row.translatedValue;
        }
        return res.json({ languageCode: 'en', strings: merged });
      }

      const cachedRows = await getCachedTranslations(langCode);
      const existingMap: Record<string, string> = {};
      for (const r of cachedRows) {
        existingMap[r.translationKey] = r.translatedValue;
      }

      const missingSource: Record<string, string> = {};
      for (const [key, enVal] of Object.entries(DEFAULT_UI_STRINGS)) {
        if (!existingMap[key]) {
          missingSource[key] = enVal;
        }
      }

      if (Object.keys(missingSource).length > 0 && process.env.GEMINI_API_KEY) {
        try {
          const glossaryRows = await getGlossaryEntries(langCode);
          const aiTranslated = await translateUiStringsBatch({
            targetLangCode: targetLang.code,
            targetLangName: targetLang.englishName,
            nativeName: targetLang.nativeName,
            script: targetLang.script,
            sourceMap: missingSource,
            glossaryTerms: glossaryRows.map((g) => ({
              sourceTerm: g.sourceTerm,
              targetTerm: g.targetTerm,
            })),
          });
          if (Object.keys(aiTranslated).length > 0) {
            await saveTranslatedKeys(langCode, aiTranslated, true);
            Object.assign(existingMap, aiTranslated);
          }
        } catch (aiErr) {
          console.error(`Auto-translation fallback for ${langCode}:`, aiErr);
        }
      }

      res.json({
        languageCode: langCode,
        strings: { ...DEFAULT_UI_STRINGS, ...existingMap },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load UI translations' });
    }
  });

  app.get('/api/public/services', async (_req, res) => {
    try {
      const services = await listServiceTemplates(true);
      res.json({ services });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load services' });
    }
  });

  app.post('/api/public/tts', async (req, res) => {
    try {
      const { text, languageName } = req.body || {};
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required for speech synthesis.' });
      }
      const result = await synthesizeSpeechWav({
        text: text.slice(0, 600),
        languageName: languageName || 'English',
      });
      res.json(result);
    } catch (error: any) {
      console.error('Public TTS error:', error);
      res.status(500).json({ error: error.message || 'Speech synthesis failed.' });
    }
  });

  // =========================================================================
  // AUTHENTICATION & PROFILE PRIVACY ENDPOINTS
  // =========================================================================

  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const { identifier, channel } = req.body || {};
      if (!identifier || typeof identifier !== 'string' || identifier.trim().length < 5) {
        return res.status(400).json({ error: 'Please enter a valid mobile number or email.' });
      }
      const ch = channel === 'email' ? 'email' : 'phone';
      const result = await createOtpChallenge(identifier, ch);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to send verification code.' });
    }
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const { identifier, code, channel, fullName, preferredLanguage, consentGiven } =
        req.body || {};
      if (!identifier || !code || String(code).trim().length !== 6) {
        return res.status(400).json({ error: 'Enter the 6-digit verification code.' });
      }
      if (!consentGiven) {
        return res.status(400).json({ error: 'Explicit privacy consent is required to continue.' });
      }
      const session = await verifyOtpAndIssueSession({
        identifier,
        code: String(code),
        channel: channel === 'email' ? 'email' : 'phone',
        fullName,
        preferredLanguage,
        consentGiven: Boolean(consentGiven),
      });
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Invalid verification code.' });
    }
  });

  app.post('/api/auth/guest', async (req, res) => {
    try {
      const { preferredLanguage } = req.body || {};
      const session = await createGuestAccountSession(preferredLanguage || 'en');
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to start guest mode.' });
    }
  });

  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      await ensureSeedData();
      const uid = req.authContext!.uid;
      const rows = await db.select().from(profiles).where(eq(profiles.uid, uid));
      res.json({
        profile: rows[0] || null,
        roles: req.authContext!.roles,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load profile.' });
    }
  });

  app.patch('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await updateProfileSettings(req.authContext!.uid, req.body || {});
      res.json({ profile: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update settings.' });
    }
  });

  app.delete('/api/me/data', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.authContext!.uid;
      await deleteAllUserDataPermanently(uid);
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete user data.' });
    }
  });

  // =========================================================================
  // CITIZEN VOICE, RAG CHAT, LETTER EXPLAIN, SMART FORM, STATUS, GRIEVANCE
  // =========================================================================

  app.post('/api/voice/stt', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { base64Audio, mimeType, languageHint } = req.body || {};
      if (!base64Audio) {
        return res.status(400).json({ error: 'Audio data is required.' });
      }
      const result = await transcribeAudioBase64({ base64Audio, mimeType, languageHint });
      res.json(result);
    } catch (error: any) {
      console.error('STT error:', error);
      res.status(500).json({ error: error.message || 'Voice transcription failed.' });
    }
  });

  app.post('/api/voice/tts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { text, languageName } = req.body || {};
      if (!text) return res.status(400).json({ error: 'Text is required.' });
      const result = await synthesizeSpeechWav({
        text,
        languageName: languageName || 'English',
      });
      res.json(result);
    } catch (error: any) {
      console.error('TTS error:', error);
      res.status(500).json({ error: error.message || 'Speech synthesis failed.' });
    }
  });

  app.get('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listUserConversations(req.authContext!.uid);
      res.json({ conversations: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load conversations.' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const convId = Number(req.params.id);
      const convs = await listUserConversations(req.authContext!.uid);
      const match = convs.find((c) => c.id === convId);
      if (!match) return res.status(404).json({ error: 'Conversation not found.' });
      const msgs = await getMessagesForConversation(convId);
      res.json({ conversation: match, messages: msgs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load messages.' });
    }
  });

  // Streaming Grounded RAG Chat Endpoint (SSE)
  app.post('/api/chat/stream', requireAuth, async (req: AuthRequest, res) => {
    const startTime = Date.now();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: Record<string, any>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { message, conversationId, preferredLanguageCode } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        sendEvent({ type: 'error', error: 'Message cannot be empty.' });
        return res.end();
      }

      const userUid = req.authContext!.uid;
      const allLangs = await listLanguages(true);
      const prefLang =
        allLangs.find((l) => l.code === preferredLanguageCode) ||
        allLangs.find((l) => l.code === 'en')!;

      const initialGlossary = await getGlossaryEntries(prefLang.code);

      // Step 1: Detect per-message language (supports mid-chat language switch & Hinglish/Tanglish) + normalize
      const analysis = await detectAndNormalizeQuery({
        query: message.trim(),
        preferredLangCode: prefLang.code,
        preferredLangName: prefLang.englishName,
        glossaryTerms: initialGlossary.map((g) => ({
          sourceTerm: g.sourceTerm,
          targetTerm: g.targetTerm,
        })),
      });

      const replyLang =
        allLangs.find((l) => l.code === analysis.detectedLanguageCode) || prefLang;

      const conv = await createOrGetConversation({
        conversationId: conversationId ? Number(conversationId) : undefined,
        userUid,
        title: message.trim().slice(0, 80),
        domain: analysis.domainGuess || 'general',
        languageCode: replyLang.code,
      });

      const savedUserMsg = await appendMessage({
        conversationId: conv.id,
        senderRole: 'user',
        senderUid: userUid,
        content: message.trim(),
        translatedContent: analysis.englishSearchQuery,
        detectedLanguage: replyLang.code,
      });

      sendEvent({
        type: 'meta',
        conversationId: conv.id,
        detectedLanguage: replyLang.code,
        userMessage: savedUserMsg,
      });

      // If conversation is currently assigned to a human agent, notify inbox immediately
      if (conv.status === 'agent_assigned' || conv.status === 'needs_human') {
        realtimeHub.broadcastToAdmins('message:created', {
          conversationId: conv.id,
          message: savedUserMsg,
        });
      }

      // Step 2: Embed normalized query + original query for cross-lingual pgvector RAG retrieval
      const searchInput = `${analysis.englishSearchQuery}\n${message.trim()}`;
      const queryEmbedding = await embedText(searchInput);
      const retrievedChunks = await retrieveTopPublishedChunks(queryEmbedding, 5);

      const replyGlossary = await getGlossaryEntries(replyLang.code);
      const services = await listServiceTemplates(true);
      const domainServices = services.filter(
        (s) => s.domain === analysis.domainGuess || analysis.domainGuess === 'general'
      );

      const historyRows = await getMessagesForConversation(conv.id);
      const historyForModel = historyRows
        .filter((m) => m.id !== savedUserMsg.id && (m.senderRole === 'user' || m.senderRole === 'assistant'))
        .slice(-6)
        .map((m) => ({
          role: (m.senderRole === 'user' ? 'user' : 'model') as 'user' | 'model',
          text: m.content,
        }));

      // Step 3: Stream grounded response in user's detected/selected language
      const result = await generateGroundedAnswerStream({
        userMessage: message.trim(),
        replyLanguageCode: replyLang.code,
        replyLanguageName: replyLang.englishName,
        replyScript: replyLang.script,
        retrievedChunks,
        glossaryTerms: replyGlossary.map((g) => ({
          sourceTerm: g.sourceTerm,
          targetTerm: g.targetTerm,
        })),
        availableServices: domainServices.map((s) => ({
          slug: s.slug,
          title: s.title,
          domain: s.domain,
        })),
        conversationHistory: historyForModel,
        onToken: (delta) => {
          sendEvent({ type: 'delta', text: delta });
        },
      });

      const latencyMs = Date.now() - startTime;
      const savedAssistantMsg = await appendMessage({
        conversationId: conv.id,
        senderRole: 'assistant',
        content: result.fullText,
        detectedLanguage: replyLang.code,
        confidence: result.confidence,
        citations: result.citations,
        suggestedActions: result.suggestedActions,
        latencyMs,
      });

      let updatedConv = conv;
      if (result.needsHumanHandover && conv.status === 'ai_active') {
        updatedConv = await escalateConversationToHuman(conv.id, 'low_confidence');
        realtimeHub.broadcastToAdmins('conversation:updated', { conversation: updatedConv });
      }

      sendEvent({
        type: 'done',
        conversation: updatedConv,
        assistantMessage: savedAssistantMsg,
      });
      res.end();
    } catch (error: any) {
      console.error('Chat stream failed:', error);
      sendEvent({
        type: 'error',
        error: error.message || 'Unable to generate response right now.',
      });
      res.end();
    }
  });

  app.post('/api/conversations/:id/handover', requireAuth, async (req: AuthRequest, res) => {
    try {
      const convId = Number(req.params.id);
      const { reason } = req.body || {};
      const validReason =
        reason === 'dispute' ? 'dispute' : reason === 'low_confidence' ? 'low_confidence' : 'user_requested';

      const convs = await listUserConversations(req.authContext!.uid);
      if (!convs.some((c) => c.id === convId)) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }

      const updated = await escalateConversationToHuman(convId, validReason);
      const sysMsg = await appendMessage({
        conversationId: convId,
        senderRole: 'system',
        content: 'Conversation transferred to the human support queue. An agent will reply in your language.',
      });

      realtimeHub.broadcastToAdmins('conversation:updated', { conversation: updated });
      res.json({ conversation: updated, systemMessage: sysMsg });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to hand over conversation.' });
    }
  });

  app.post('/api/messages/:id/feedback', requireAuth, async (req: AuthRequest, res) => {
    try {
      const messageId = Number(req.params.id);
      const { rating, reason, comment } = req.body || {};
      if (rating !== 'up' && rating !== 'down') {
        return res.status(400).json({ error: 'Rating must be up or down.' });
      }
      const saved = await saveMessageFeedback({
        messageId,
        userUid: req.authContext!.uid,
        rating,
        reason,
        comment,
      });
      res.json({ feedback: saved });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save feedback.' });
    }
  });

  // Explain a Letter / Official Notice (OCR + Plain-Language Explanation + Deadline Detection)
  app.post('/api/explain-letter', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, base64Data, mimeType, rawText, targetLanguageCode } = req.body || {};
      if (!base64Data && !rawText) {
        return res.status(400).json({ error: 'Upload an image/PDF or paste text to explain.' });
      }
      const allLangs = await listLanguages(true);
      const lang =
        allLangs.find((l) => l.code === targetLanguageCode) ||
        allLangs.find((l) => l.code === 'en')!;
      const glossaryRows = await getGlossaryEntries(lang.code);

      const explanation = await explainLetterMultimodal({
        base64Data,
        mimeType,
        rawText,
        targetLangCode: lang.code,
        targetLangName: lang.englishName,
        glossaryTerms: glossaryRows.map((g) => ({
          sourceTerm: g.sourceTerm,
          targetTerm: g.targetTerm,
        })),
      });

      const savedDoc = await saveCitizenDocument({
        ownerUid: req.authContext!.uid,
        scope: 'letter_explain',
        title: title || explanation.senderOrAuthority || 'Scanned Official Notice',
        docType: 'letter',
        languageCode: lang.code,
        status: 'verified',
        mimeType: mimeType || 'text/plain',
        rawText: explanation.ocrText,
        extractedMetadata: explanation,
      });

      res.json({ document: savedDoc, explanation });
    } catch (error: any) {
      console.error('Explain letter error:', error);
      res.status(500).json({ error: error.message || 'Could not analyze the uploaded document.' });
    }
  });

  // Smart Form Auto-Extraction from Uploaded Document
  app.post('/api/forms/extract', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { serviceSlug, base64Data, mimeType, fileName, saveToVault } = req.body || {};
      if (!serviceSlug || !base64Data) {
        return res.status(400).json({ error: 'Service template and document file are required.' });
      }
      const templates = await listServiceTemplates(false);
      const tpl = templates.find((t) => t.slug === serviceSlug);
      if (!tpl) return res.status(404).json({ error: 'Service template not found.' });

      const extraction = await extractFormFieldsFromDocument({
        base64Data,
        mimeType: mimeType || 'image/jpeg',
        fields: tpl.formSchema,
      });

      let savedDoc = null;
      if (saveToVault !== false) {
        savedDoc = await saveCitizenDocument({
          ownerUid: req.authContext!.uid,
          scope: 'citizen_vault',
          title: fileName || extraction.documentSummary || 'Supporting Document',
          docType: 'identity',
          domain: tpl.domain,
          status: 'verified',
          mimeType: mimeType || 'image/jpeg',
          extractedMetadata: {
            extractedFields: extraction.extractedValues,
            summary: extraction.documentSummary,
          },
        });
      }

      res.json({
        extractedValues: extraction.extractedValues,
        documentSummary: extraction.documentSummary,
        document: savedDoc,
      });
    } catch (error: any) {
      console.error('Form field extraction error:', error);
      res.status(500).json({ error: error.message || 'Failed to extract fields from document.' });
    }
  });

  // Applications
  app.get('/api/applications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listUserApplicationsWithEvents(req.authContext!.uid);
      res.json({ applications: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load applications.' });
    }
  });

  app.post('/api/applications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        serviceSlug,
        serviceTitle,
        domain,
        formData,
        autoFilledFields,
        attachedDocumentIds,
        languageCode,
      } = req.body || {};
      if (!serviceSlug || !serviceTitle || !domain) {
        return res.status(400).json({ error: 'Missing required service details.' });
      }
      const created = await createApplicationSubmission({
        userUid: req.authContext!.uid,
        serviceSlug,
        serviceTitle,
        domain,
        formData: formData || {},
        autoFilledFields: Array.isArray(autoFilledFields) ? autoFilledFields : [],
        attachedDocumentIds: Array.isArray(attachedDocumentIds) ? attachedDocumentIds : [],
        languageCode: languageCode || 'en',
      });

      realtimeHub.broadcastToUser(req.authContext!.uid, 'application:updated', created);
      res.json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to submit application.' });
    }
  });

  // Citizen Document Vault & DigiLocker Adapter
  app.get('/api/documents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const docs = await listCitizenDocuments(req.authContext!.uid);
      res.json({ documents: docs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load documents.' });
    }
  });

  app.post('/api/documents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, docType, domain, mimeType, fileSize, fileDataBase64 } = req.body || {};
      if (!title) return res.status(400).json({ error: 'Document title is required.' });

      let status = 'uploaded';
      let extractedMetadata: Record<string, any> = {};
      if (fileDataBase64 && process.env.GEMINI_API_KEY) {
        try {
          const parsed = await parseDocumentText({ base64Data: fileDataBase64, mimeType });
          if (parsed.extractedText.trim().length > 10) {
            status = 'verified';
            extractedMetadata = {
              ocrVerified: true,
              pageCount: parsed.pages.length,
              previewSnippet: parsed.extractedText.slice(0, 180),
            };
          }
        } catch {
          status = 'uploaded';
        }
      }

      const saved = await saveCitizenDocument({
        ownerUid: req.authContext!.uid,
        scope: 'citizen_vault',
        title,
        docType: docType || 'identity',
        domain: domain || 'government',
        status,
        mimeType,
        fileSize,
        fileDataBase64,
        extractedMetadata,
      });
      res.json({ document: saved });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to upload document.' });
    }
  });

  app.delete('/api/documents/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteCitizenDocument(req.authContext!.uid, Number(req.params.id));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete document.' });
    }
  });

  app.post('/api/documents/digilocker-connect', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { referenceId } = req.body || {};
      const connectors = await listSanitizedIntegrations();
      const digiAdapter = connectors.find((c) =>
        c.name.toLowerCase().includes('digilocker')
      );
      const updated = await updateProfileSettings(req.authContext!.uid, {
        digilockerLinked: true,
        digilockerAccountRef:
          referenceId || `DL-${digiAdapter?.mode === 'live' ? 'LIVE' : 'SANDBOX'}-${Date.now().toString().slice(-6)}`,
      });
      res.json({
        profile: updated,
        adapterMode: digiAdapter?.mode || 'sandbox',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to connect DigiLocker adapter.' });
    }
  });

  // Grievances
  app.get('/api/grievances', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listUserGrievances(req.authContext!.uid);
      res.json({ grievances: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load grievances.' });
    }
  });

  app.post('/api/grievances', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { domain, category, description, languageCode, attachmentDocumentId } = req.body || {};
      if (!domain || !category || !description || !String(description).trim()) {
        return res.status(400).json({ error: 'Category and description are required.' });
      }

      const triage = await classifyAndNormalizeGrievance({
        description: String(description).trim(),
        domain,
        category,
        languageCode: languageCode || 'en',
      });

      const created = await createCitizenGrievance({
        userUid: req.authContext!.uid,
        domain,
        category,
        priority: triage.priority,
        description: String(description).trim(),
        translatedDescription: triage.englishTranslation,
        languageCode: languageCode || 'en',
        attachmentDocumentId: attachmentDocumentId ? Number(attachmentDocumentId) : undefined,
        assignedDepartment: triage.assignedDepartment,
        slaHours: triage.slaHours,
      });

      realtimeHub.broadcastToAdmins('grievance:updated', { grievance: created });
      res.json({ grievance: created });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to submit grievance.' });
    }
  });

  // Notifications & Reminders
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listUserNotifications(req.authContext!.uid);
      res.json({ notifications: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load notifications.' });
    }
  });

  app.patch('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      await markNotificationRead(req.authContext!.uid, Number(req.params.id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to mark notification read.' });
    }
  });

  app.get('/api/reminders', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listUserReminders(req.authContext!.uid);
      res.json({ reminders: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load reminders.' });
    }
  });

  app.post('/api/reminders', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, notes, dueAt, channel, sourceDocumentId, languageCode } = req.body || {};
      if (!title || !dueAt) {
        return res.status(400).json({ error: 'Reminder title and due date are required.' });
      }
      const parsedDate = new Date(dueAt);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid due date.' });
      }
      const created = await createUserReminder({
        userUid: req.authContext!.uid,
        title,
        notes,
        dueAt: parsedDate,
        channel: channel || 'push',
        sourceDocumentId: sourceDocumentId ? Number(sourceDocumentId) : undefined,
        languageCode: languageCode || 'en',
      });
      res.json({ reminder: created });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create reminder.' });
    }
  });

  app.patch('/api/reminders/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await toggleUserReminder(
        req.authContext!.uid,
        Number(req.params.id),
        Boolean(req.body?.isCompleted)
      );
      res.json({ reminder: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update reminder.' });
    }
  });

  // =========================================================================
  // ADMIN CONSOLE ENDPOINTS (Role-Gated + Full Audit Logging)
  // =========================================================================

  // 1. Knowledge Base
  app.get(
    '/api/admin/kb',
    requireAuth,
    requireRole(['admin', 'content_editor', 'support_agent']),
    async (_req, res) => {
      try {
        const docs = await listKnowledgeDocuments();
        res.json({ documents: docs });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load knowledge base.' });
      }
    }
  );

  app.post(
    '/api/admin/kb',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        const {
          id,
          title,
          docType,
          domain,
          languageCode,
          status,
          sourceUrl,
          mimeType,
          fileSize,
          fileDataBase64,
          rawText,
        } = req.body || {};

        if (!title) return res.status(400).json({ error: 'Document title is required.' });

        const parsed = await parseDocumentText({
          base64Data: fileDataBase64,
          mimeType,
          rawText,
          sourceUrl,
        });

        if (!parsed.extractedText.trim()) {
          return res.status(400).json({
            error: 'No readable text could be parsed from the document or URL.',
          });
        }

        const validStatus =
          status === 'published' ? 'published' : status === 'in_review' ? 'in_review' : 'draft';

        const savedDoc = await saveKnowledgeDocument({
          id: id ? Number(id) : undefined,
          ownerUid: req.authContext!.uid,
          title,
          docType: docType || 'pdf',
          domain: domain || 'government',
          languageCode: languageCode || 'en',
          status: validStatus,
          sourceUrl,
          mimeType,
          fileSize,
          fileDataBase64,
          rawText: parsed.extractedText,
          extractedMetadata: { pageCount: parsed.pages.length },
        });

        let chunkCount = 0;
        if (validStatus === 'published') {
          const chunksToInsert: Array<{
            chunkIndex: number;
            pageNumber: number;
            content: string;
            embedding: number[];
          }> = [];
          let idx = 0;
          for (const page of parsed.pages) {
            const segments = page.text.match(/[\s\S]{1,900}(?:\s|$)/g) || [page.text];
            for (const seg of segments) {
              const trimmed = seg.trim();
              if (!trimmed) continue;
              const emb = await embedText(`${title} (${domain}): ${trimmed}`);
              chunksToInsert.push({
                chunkIndex: idx++,
                pageNumber: page.pageNumber,
                content: trimmed,
                embedding: emb,
              });
            }
          }
          await replaceDocumentChunks(savedDoc.id, chunksToInsert);
          chunkCount = chunksToInsert.length;
        } else {
          await replaceDocumentChunks(savedDoc.id, []);
        }

        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: id ? 'kb.document.updated' : 'kb.document.created',
          entityType: 'document',
          entityId: String(savedDoc.id),
          details: { title, domain, status: validStatus, chunkCount },
        });

        res.json({ document: savedDoc, chunkCount });
      } catch (error: any) {
        console.error('KB upload error:', error);
        res.status(500).json({ error: error.message || 'Failed to ingest knowledge document.' });
      }
    }
  );

  app.post(
    '/api/admin/kb/:id/status',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        const docId = Number(req.params.id);
        const { status } = req.body || {};
        const validStatus =
          status === 'published' ? 'published' : status === 'in_review' ? 'in_review' : 'draft';

        const docs = await listKnowledgeDocuments();
        const target = docs.find((d) => d.id === docId);
        if (!target) return res.status(404).json({ error: 'Document not found.' });

        const updated = await saveKnowledgeDocument({
          id: docId,
          ownerUid: req.authContext!.uid,
          title: target.title,
          docType: target.docType,
          domain: target.domain,
          languageCode: target.languageCode,
          status: validStatus,
          sourceUrl: target.sourceUrl || undefined,
          rawText: target.rawText || '',
        });

        let chunkCount = 0;
        if (validStatus === 'published' && target.rawText) {
          const parsed = await parseDocumentText({ rawText: target.rawText });
          const chunksToInsert = [];
          let idx = 0;
          for (const page of parsed.pages) {
            const segments = page.text.match(/[\s\S]{1,900}(?:\s|$)/g) || [page.text];
            for (const seg of segments) {
              const trimmed = seg.trim();
              if (!trimmed) continue;
              const emb = await embedText(`${target.title} (${target.domain}): ${trimmed}`);
              chunksToInsert.push({
                chunkIndex: idx++,
                pageNumber: page.pageNumber,
                content: trimmed,
                embedding: emb,
              });
            }
          }
          await replaceDocumentChunks(docId, chunksToInsert);
          chunkCount = chunksToInsert.length;
        } else {
          await replaceDocumentChunks(docId, []);
        }

        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: `kb.document.${validStatus}`,
          entityType: 'document',
          entityId: String(docId),
          details: { title: target.title, chunkCount },
        });

        res.json({ document: updated, chunkCount });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update publication status.' });
      }
    }
  );

  app.delete(
    '/api/admin/kb/:id',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        const docId = Number(req.params.id);
        await deleteKnowledgeDocument(docId);
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: 'kb.document.deleted',
          entityType: 'document',
          entityId: String(docId),
        });
        res.json({ deleted: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to delete document.' });
      }
    }
  );

  app.post(
    '/api/admin/kb/test-chat',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        const { question, languageCode } = req.body || {};
        if (!question) return res.status(400).json({ error: 'Enter a test question.' });

        const allLangs = await listLanguages(true);
        const lang =
          allLangs.find((l) => l.code === languageCode) || allLangs.find((l) => l.code === 'en')!;
        const glossaryRows = await getGlossaryEntries(lang.code);

        const analysis = await detectAndNormalizeQuery({
          query: question,
          preferredLangCode: lang.code,
          preferredLangName: lang.englishName,
          glossaryTerms: [],
        });
        const emb = await embedText(`${analysis.englishSearchQuery}\n${question}`);
        const chunks = await retrieveTopPublishedChunks(emb, 4);

        const result = await generateGroundedAnswerStream({
          userMessage: question,
          replyLanguageCode: lang.code,
          replyLanguageName: lang.englishName,
          replyScript: lang.script,
          retrievedChunks: chunks,
          glossaryTerms: glossaryRows.map((g) => ({
            sourceTerm: g.sourceTerm,
            targetTerm: g.targetTerm,
          })),
          availableServices: [],
          conversationHistory: [],
          onToken: () => {},
        });

        res.json({
          answer: result.fullText,
          confidence: result.confidence,
          citations: result.citations,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Knowledge base test failed.' });
      }
    }
  );

  // 2. API Integrations
  app.get('/api/admin/integrations', requireAuth, requireRole(['admin']), async (_req, res) => {
    try {
      const items = await listSanitizedIntegrations();
      res.json({ integrations: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load integrations.' });
    }
  });

  app.post(
    '/api/admin/integrations',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res) => {
      try {
        const { id, name, adapterType, domain, endpointUrl, mode, secretValues, headers } =
          req.body || {};
        if (!name || !endpointUrl) {
          return res.status(400).json({ error: 'Name and endpoint URL are required.' });
        }
        const saved = await saveIntegrationConnector({
          id: id ? Number(id) : undefined,
          name,
          adapterType: adapterType || 'rest',
          domain: domain || 'government',
          endpointUrl,
          mode: mode === 'live' ? 'live' : 'sandbox',
          secretValues,
          headers,
        });

        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: 'admin',
          action: id ? 'integration.updated' : 'integration.created',
          entityType: 'integration',
          entityId: String(saved.id),
          details: { name, adapterType, mode },
        });

        const sanitized = await listSanitizedIntegrations();
        res.json({ integrations: sanitized });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to save integration.' });
      }
    }
  );

  app.post(
    '/api/admin/integrations/:id/test',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res) => {
      try {
        const result = await testIntegrationById(Number(req.params.id));
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: 'admin',
          action: 'integration.tested',
          entityType: 'integration',
          entityId: String(result.id),
          details: { status: result.status, latencyMs: result.lastLatencyMs },
        });
        res.json({ result });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Integration test failed.' });
      }
    }
  );

  app.post(
    '/api/admin/integrations/test-all',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res) => {
      try {
        const all = await listSanitizedIntegrations();
        const results = [];
        for (const item of all) {
          results.push(await testIntegrationById(item.id));
        }
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: 'admin',
          action: 'integration.tested_all',
          entityType: 'integration',
          details: { count: results.length },
        });
        const refreshed = await listSanitizedIntegrations();
        res.json({ integrations: refreshed, results });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Batch integration test failed.' });
      }
    }
  );

  // 3. Workflows
  app.get('/api/admin/workflows', requireAuth, requireRole(['admin']), async (_req, res) => {
    try {
      const data = await listWorkflowsAndRuns();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load workflows.' });
    }
  });

  app.post(
    '/api/admin/workflows',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res) => {
      try {
        const { id, name, description, domain, triggerType, steps, isActive } = req.body || {};
        if (!name || !triggerType) {
          return res.status(400).json({ error: 'Workflow name and trigger are required.' });
        }
        const saved = await saveWorkflowDefinition({
          id: id ? Number(id) : undefined,
          name,
          description: description || '',
          domain: domain || 'government',
          triggerType,
          steps: Array.isArray(steps) ? steps : [],
          isActive: isActive !== false,
          createdBy: req.authContext!.email || req.authContext!.uid,
        });
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: 'admin',
          action: id ? 'workflow.updated' : 'workflow.created',
          entityType: 'workflow',
          entityId: String(saved.id),
          details: { name, triggerType, stepCount: saved.steps.length },
        });
        const data = await listWorkflowsAndRuns();
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to save workflow.' });
      }
    }
  );

  app.post(
    '/api/admin/workflows/:id/trigger',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res) => {
      try {
        const data = await listWorkflowsAndRuns();
        const wf = data.workflows.find((w) => w.id === Number(req.params.id));
        if (!wf) return res.status(404).json({ error: 'Workflow not found.' });

        await executeWorkflowsForEvent({
          triggerType: wf.triggerType as any,
          entityType: 'manual_test',
          entityId: `RUN-${Date.now().toString().slice(-6)}`,
          userUid: req.authContext!.uid,
          languageCode: 'en',
          contextTitle: `Admin workflow verification: ${wf.name}`,
          dueAt: new Date(Date.now() + 24 * 3600 * 1000),
        });

        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: 'admin',
          action: 'workflow.executed_manual',
          entityType: 'workflow',
          entityId: String(wf.id),
        });

        const updated = await listWorkflowsAndRuns();
        res.json(updated);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Workflow execution failed.' });
      }
    }
  );

  // 4. Languages, UI Translation Overrides & Glossary
  app.get(
    '/api/admin/languages',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (_req, res) => {
      try {
        const langs = await listLanguages(true);
        res.json({ languages: langs });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load languages.' });
      }
    }
  );

  app.post(
    '/api/admin/languages',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        const saved = await upsertLanguageEntry(req.body);
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: 'language.upserted',
          entityType: 'language',
          entityId: saved.code,
          details: { englishName: saved.englishName, isEnabled: saved.isEnabled },
        });
        const langs = await listLanguages(true);
        res.json({ languages: langs });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update language.' });
      }
    }
  );

  app.get(
    '/api/admin/languages/:code/translations',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req, res) => {
      try {
        const rows = await getCachedTranslations(req.params.code);
        res.json({ translations: rows, sourceDefaults: DEFAULT_UI_STRINGS });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load translations.' });
      }
    }
  );

  app.patch(
    '/api/admin/languages/:code/translations',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        const { key, value } = req.body || {};
        if (!key || typeof value !== 'string') {
          return res.status(400).json({ error: 'Translation key and value are required.' });
        }
        await saveTranslatedKeys(
          req.params.code,
          { [key]: value },
          false,
          req.authContext!.email || req.authContext!.uid
        );
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: 'ui_translation.overridden',
          entityType: 'ui_translation',
          entityId: `${req.params.code}:${key}`,
        });
        const rows = await getCachedTranslations(req.params.code);
        res.json({ translations: rows });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to override UI translation.' });
      }
    }
  );

  app.get(
    '/api/admin/glossary',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req, res) => {
      try {
        const lang = typeof req.query.lang === 'string' ? req.query.lang : undefined;
        const items = await getGlossaryEntries(lang);
        res.json({ glossary: items });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load glossary.' });
      }
    }
  );

  app.post(
    '/api/admin/glossary',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        const { sourceTerm, languageCode, targetTerm, domain, notes } = req.body || {};
        if (!sourceTerm || !languageCode || !targetTerm) {
          return res.status(400).json({ error: 'Source term, language, and target term required.' });
        }
        const created = await createGlossaryEntry({
          sourceTerm: sourceTerm.trim(),
          languageCode,
          targetTerm: targetTerm.trim(),
          domain: domain || 'general',
          notes,
          updatedBy: req.authContext!.email || req.authContext!.uid,
        });
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: 'glossary.created',
          entityType: 'glossary',
          entityId: String(created.id),
          details: { sourceTerm, languageCode, targetTerm },
        });
        const items = await getGlossaryEntries();
        res.json({ glossary: items });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to save glossary entry.' });
      }
    }
  );

  app.delete(
    '/api/admin/glossary/:id',
    requireAuth,
    requireRole(['admin', 'content_editor']),
    async (req: AuthRequest, res) => {
      try {
        await removeGlossaryEntry(Number(req.params.id));
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: 'glossary.deleted',
          entityType: 'glossary',
          entityId: req.params.id,
        });
        res.json({ deleted: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to delete glossary term.' });
      }
    }
  );

  // 5. Human Inbox (Bidirectional AI-assisted translation + Real-Time WebSockets)
  app.get(
    '/api/admin/inbox',
    requireAuth,
    requireRole(['admin', 'support_agent']),
    async (_req, res) => {
      try {
        const items = await listHumanInboxConversations();
        res.json({ items });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load human inbox.' });
      }
    }
  );

  app.get(
    '/api/admin/inbox/:id/messages',
    requireAuth,
    requireRole(['admin', 'support_agent']),
    async (req, res) => {
      try {
        const msgs = await getMessagesForConversation(Number(req.params.id));
        res.json({ messages: msgs });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load messages.' });
      }
    }
  );

  app.post(
    '/api/admin/inbox/:id/reply',
    requireAuth,
    requireRole(['admin', 'support_agent']),
    async (req: AuthRequest, res) => {
      try {
        const convId = Number(req.params.id);
        const { replyText, autoTranslateToUserLang } = req.body || {};
        if (!replyText || !String(replyText).trim()) {
          return res.status(400).json({ error: 'Reply text is required.' });
        }

        const convRows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, convId));
        if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found.' });
        const conv = convRows[0];

        let citizenFacingText = String(replyText).trim();
        if (autoTranslateToUserLang !== false && conv.languageCode !== 'en') {
          const allLangs = await listLanguages(true);
          const targetLang = allLangs.find((l) => l.code === conv.languageCode);
          if (targetLang) {
            const glossaryRows = await getGlossaryEntries(targetLang.code);
            citizenFacingText = await translateTextWithGlossary({
              text: citizenFacingText,
              targetLangCode: targetLang.code,
              targetLangName: targetLang.englishName,
              glossaryTerms: glossaryRows.map((g) => ({
                sourceTerm: g.sourceTerm,
                targetTerm: g.targetTerm,
              })),
            });
          }
        }

        await updateConversationStatusAdmin(convId, 'agent_assigned', req.authContext!.uid);
        const savedMsg = await appendMessage({
          conversationId: convId,
          senderRole: 'human_agent',
          senderUid: req.authContext!.uid,
          content: citizenFacingText,
          translatedContent: String(replyText).trim(),
          detectedLanguage: conv.languageCode,
        });

        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: 'inbox.agent_replied',
          entityType: 'conversation',
          entityId: String(convId),
        });

        realtimeHub.broadcastToUser(conv.userUid, 'message:created', {
          conversationId: convId,
          message: savedMsg,
        });

        res.json({ message: savedMsg });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to send agent reply.' });
      }
    }
  );

  app.patch(
    '/api/admin/inbox/:id/status',
    requireAuth,
    requireRole(['admin', 'support_agent']),
    async (req: AuthRequest, res) => {
      try {
        const convId = Number(req.params.id);
        const status = req.body?.status === 'resolved' ? 'resolved' : 'agent_assigned';
        const updated = await updateConversationStatusAdmin(
          convId,
          status,
          req.authContext!.uid
        );
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: `inbox.status.${status}`,
          entityType: 'conversation',
          entityId: String(convId),
        });
        realtimeHub.broadcastToUser(updated.userUid, 'conversation:updated', {
          conversation: updated,
        });
        res.json({ conversation: updated });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update conversation status.' });
      }
    }
  );

  // 6. Grievances Admin
  app.get(
    '/api/admin/grievances',
    requireAuth,
    requireRole(['admin', 'support_agent']),
    async (_req, res) => {
      try {
        const items = await listAllGrievancesAdmin();
        res.json({ grievances: items });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load grievances.' });
      }
    }
  );

  app.patch(
    '/api/admin/grievances/:id',
    requireAuth,
    requireRole(['admin', 'support_agent']),
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateGrievanceAdmin(id, req.body || {});
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: req.authContext!.roles[0],
          action: 'grievance.updated',
          entityType: 'grievance',
          entityId: updated.referenceNumber,
          details: { status: updated.status, priority: updated.priority },
        });
        realtimeHub.broadcastToUser(updated.userUid, 'grievance:updated', {
          grievance: updated,
        });
        res.json({ grievance: updated });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update grievance.' });
      }
    }
  );

  // 7. Analytics
  app.get(
    '/api/admin/analytics',
    requireAuth,
    requireRole(['admin', 'content_editor', 'support_agent']),
    async (_req, res) => {
      try {
        const metrics = await computeAdminAnalytics();
        res.json(metrics);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to compute analytics.' });
      }
    }
  );

  // 8. Audit Logs
  app.get('/api/admin/audit-logs', requireAuth, requireRole(['admin']), async (_req, res) => {
    try {
      const logs = await listAuditLogsAdmin();
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load audit logs.' });
    }
  });

  // 9. Users and Roles
  app.get('/api/admin/users', requireAuth, requireRole(['admin']), async (_req, res) => {
    try {
      const data = await listUsersAndRolesAdmin();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load users and roles.' });
    }
  });

  app.post(
    '/api/admin/users/invite',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res) => {
      try {
        const { email, role } = req.body || {};
        if (!email || !['admin', 'content_editor', 'support_agent', 'citizen'].includes(role)) {
          return res.status(400).json({ error: 'Valid email and role are required.' });
        }
        const assigned = await inviteOrAssignRole({
          email,
          role,
          invitedBy: req.authContext!.email || req.authContext!.uid,
        });
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: 'admin',
          action: 'user_role.invited',
          entityType: 'user_role',
          entityId: String(assigned.id),
          details: { email, role },
        });
        const data = await listUsersAndRolesAdmin();
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to assign user role.' });
      }
    }
  );

  app.patch(
    '/api/admin/users/roles/:id',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await setRoleActiveState(
          Number(req.params.id),
          Boolean(req.body?.isActive)
        );
        await recordAuditLog({
          actorUid: req.authContext!.uid,
          actorEmail: req.authContext!.email,
          actorRole: 'admin',
          action: updated.isActive ? 'user_role.activated' : 'user_role.deactivated',
          entityType: 'user_role',
          entityId: String(updated.id),
          details: { email: updated.email, role: updated.role },
        });
        const data = await listUsersAndRolesAdmin();
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update role status.' });
      }
    }
  );

  // =========================================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sahayak server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
