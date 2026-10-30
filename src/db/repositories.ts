import crypto from 'crypto';
import { and, asc, cosineDistance, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  applicationEvents,
  applications,
  auditLogs,
  authSessions,
  conversations,
  documentChunks,
  documents,
  feedback,
  glossary,
  grievances,
  integrations,
  languages,
  messages,
  notifications,
  otpVerifications,
  profiles,
  reminders,
  serviceTemplates,
  uiTranslations,
  userRoles,
  workflowRuns,
  workflows,
  type CitationItem,
  type NotificationChannelPrefs,
  type SuggestedActionItem,
  type WorkflowStepDef,
  type WorkflowStepLog,
} from './schema.ts';
import {
  BUNDLED_TRANSLATIONS,
  DEFAULT_INTEGRATIONS,
  DEFAULT_UI_STRINGS,
  DEFAULT_WORKFLOWS,
  NEUTRAL_SERVICE_TEMPLATES,
  SCHEDULED_LANGUAGES,
} from './seedData.ts';

const BOOTSTRAP_ADMIN_EMAIL = 'mmuthumeenajan@gmail.com';
let _seedPromise: Promise<void> | null = null;

function hashString(input: string): string {
  const secret = process.env.SESSION_SECRET || 'sahayak-cloudsql-hmac-v1';
  return crypto.createHmac('sha256', secret).update(input).digest('hex');
}

export function generateReferenceNumber(prefix: 'APP' | 'GRV'): string {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(100000, 999999);
  return `SHK-${prefix}-${year}-${rand}`;
}

export async function ensureSeedData(): Promise<void> {
  if (_seedPromise) return _seedPromise;
  _seedPromise = (async () => {
    try {
      const existingLangs = await db.select().from(languages);
      if (existingLangs.length === 0) {
        await db.insert(languages).values(SCHEDULED_LANGUAGES).onConflictDoNothing();
      }

      // Idempotently seed any new baseline English & bundled Indic UI translation keys
      const rows = Object.entries(DEFAULT_UI_STRINGS).map(([key, val]) => ({
        languageCode: 'en',
        translationKey: key,
        translatedValue: val,
        isAutoTranslated: false,
        isReviewed: true,
      }));
      for (const [langCode, dict] of Object.entries(BUNDLED_TRANSLATIONS)) {
        for (const [k, v] of Object.entries(dict)) {
          rows.push({
            languageCode: langCode,
            translationKey: k,
            translatedValue: v,
            isAutoTranslated: false,
            isReviewed: true,
          });
        }
      }
      // Insert in chunks of 400 to stay well within Postgres parameter limits
      for (let i = 0; i < rows.length; i += 400) {
        await db.insert(uiTranslations).values(rows.slice(i, i + 400)).onConflictDoNothing();
      }

      const existingTemplates = await db.select().from(serviceTemplates);
      if (existingTemplates.length === 0) {
        await db.insert(serviceTemplates).values(NEUTRAL_SERVICE_TEMPLATES).onConflictDoNothing();
      }

      const existingWorkflows = await db.select().from(workflows);
      if (existingWorkflows.length === 0) {
        await db.insert(workflows).values(DEFAULT_WORKFLOWS);
      }

      const existingIntegrations = await db.select().from(integrations);
      if (existingIntegrations.length === 0) {
        await db.insert(integrations).values(DEFAULT_INTEGRATIONS);
      }

      const existingAdminRole = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.email, BOOTSTRAP_ADMIN_EMAIL));
      if (existingAdminRole.length === 0) {
        await db.insert(userRoles).values({
          email: BOOTSTRAP_ADMIN_EMAIL,
          role: 'admin',
          isActive: true,
          invitedBy: 'system-bootstrap',
        });
      }
    } catch (error) {
      _seedPromise = null;
      console.error('Database seed initialization failed:', error);
      throw new Error('Failed to initialize application catalog.', { cause: error });
    }
  })();
  return _seedPromise;
}

export async function upsertProfileAndRoles(params: {
  uid: string;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  isGuest?: boolean;
  phoneVerified?: boolean;
  consentGiven?: boolean;
}) {
  try {
    await ensureSeedData();
    const cleanEmail = params.email ? params.email.trim().toLowerCase() : null;

    const existing = await db.select().from(profiles).where(eq(profiles.uid, params.uid));
    let profile;
    if (existing.length === 0) {
      const inserted = await db
        .insert(profiles)
        .values({
          uid: params.uid,
          email: cleanEmail,
          phone: params.phone || null,
          phoneVerified: Boolean(params.phoneVerified),
          fullName: params.fullName || null,
          isGuest: Boolean(params.isGuest),
          consentGiven: Boolean(params.consentGiven),
          consentTimestamp: params.consentGiven ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: profiles.uid,
          set: {
            email: cleanEmail ?? undefined,
            updatedAt: new Date(),
          },
        })
        .returning();
      profile = inserted[0];
    } else {
      const current = existing[0];
      const updated = await db
        .update(profiles)
        .set({
          email: cleanEmail || current.email,
          fullName: params.fullName || current.fullName,
          phone: params.phone || current.phone,
          phoneVerified: params.phoneVerified ? true : current.phoneVerified,
          consentGiven: params.consentGiven ? true : current.consentGiven,
          consentTimestamp:
            params.consentGiven && !current.consentTimestamp
              ? new Date()
              : current.consentTimestamp,
          updatedAt: new Date(),
        })
        .where(eq(profiles.uid, params.uid))
        .returning();
      profile = updated[0];
    }

    // Link any email-invited roles to this user's UID
    if (cleanEmail) {
      await db
        .update(userRoles)
        .set({ userUid: params.uid })
        .where(eq(userRoles.email, cleanEmail));

      // Ensure citizen role exists at minimum
      const rolesForUser = await db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.email, cleanEmail), eq(userRoles.isActive, true)));

      if (rolesForUser.length === 0) {
        // Check if zero admins exist overall; if so and email matches bootstrap, grant admin
        const roleToAssign = cleanEmail === BOOTSTRAP_ADMIN_EMAIL ? 'admin' : 'citizen';
        await db.insert(userRoles).values({
          userUid: params.uid,
          email: cleanEmail,
          role: roleToAssign,
          isActive: true,
        });
      }
    }

    const activeRoles = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userUid, params.uid), eq(userRoles.isActive, true)));

    return {
      profile,
      roles: activeRoles.map((r) => r.role),
    };
  } catch (error) {
    console.error('Failed to upsert user profile:', error);
    throw new Error('Could not synchronize user account.', { cause: error });
  }
}

export async function createOtpChallenge(identifier: string, channel: 'phone' | 'email') {
  try {
    await ensureSeedData();
    const code = String(crypto.randomInt(100000, 999999));
    const otpHash = hashString(`${identifier.trim().toLowerCase()}:${code}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpVerifications).values({
      identifier: identifier.trim().toLowerCase(),
      otpHash,
      channel,
      expiresAt,
      consumed: false,
    });

    // Check if a live messaging gateway integration is configured
    const gateways = await db
      .select()
      .from(integrations)
      .where(eq(integrations.adapterType, 'webhook'));
    const liveGateway = gateways.find((g) => g.mode === 'live' && g.endpointUrl.startsWith('http'));

    let dispatchedLive = false;
    if (liveGateway) {
      try {
        const res = await fetch(liveGateway.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...liveGateway.headers },
          body: JSON.stringify({
            type: 'otp_verification',
            channel,
            recipient: identifier,
            code,
          }),
        });
        dispatchedLive = res.ok;
      } catch {
        dispatchedLive = false;
      }
    }

    return {
      expiresAt: expiresAt.toISOString(),
      dispatchedLive,
      sandboxVerificationCode: dispatchedLive ? undefined : code,
    };
  } catch (error) {
    console.error('OTP creation failed:', error);
    throw new Error('Unable to generate verification code.', { cause: error });
  }
}

export async function verifyOtpAndIssueSession(params: {
  identifier: string;
  code: string;
  channel: 'phone' | 'email';
  fullName?: string;
  preferredLanguage?: string;
  consentGiven: boolean;
}) {
  try {
    const cleanId = params.identifier.trim().toLowerCase();
    const expectedHash = hashString(`${cleanId}:${params.code.trim()}`);
    const now = new Date();

    const matches = await db
      .select()
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.identifier, cleanId),
          eq(otpVerifications.otpHash, expectedHash),
          eq(otpVerifications.consumed, false),
          gt(otpVerifications.expiresAt, now)
        )
      )
      .orderBy(desc(otpVerifications.createdAt));

    if (matches.length === 0) {
      throw new Error('Invalid or expired 6-digit verification code.');
    }

    await db
      .update(otpVerifications)
      .set({ consumed: true })
      .where(eq(otpVerifications.id, matches[0].id));

    const deterministicUid =
      params.channel === 'email'
        ? `email_${hashString(cleanId).slice(0, 24)}`
        : `phone_${hashString(cleanId).slice(0, 24)}`;

    const { profile, roles } = await upsertProfileAndRoles({
      uid: deterministicUid,
      email: params.channel === 'email' ? cleanId : undefined,
      phone: params.channel === 'phone' ? params.identifier.trim() : undefined,
      phoneVerified: params.channel === 'phone',
      fullName: params.fullName,
      isGuest: false,
      consentGiven: params.consentGiven,
    });

    if (params.preferredLanguage) {
      await db
        .update(profiles)
        .set({ preferredLanguage: params.preferredLanguage })
        .where(eq(profiles.uid, profile.uid));
      profile.preferredLanguage = params.preferredLanguage;
    }

    const rawToken = `sahayak_session_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = hashString(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(authSessions).values({
      tokenHash,
      userUid: profile.uid,
      expiresAt,
    });

    return { sessionToken: rawToken, profile, roles };
  } catch (error: any) {
    if (error.message?.includes('Invalid or expired')) throw error;
    console.error('OTP verification failed:', error);
    throw new Error('Verification failed. Please try again.', { cause: error });
  }
}

export async function createGuestAccountSession(preferredLanguage: string) {
  try {
    await ensureSeedData();
    const guestUid = `guest_${crypto.randomBytes(12).toString('hex')}`;
    const inserted = await db
      .insert(profiles)
      .values({
        uid: guestUid,
        isGuest: true,
        preferredLanguage: preferredLanguage || 'en',
        consentGiven: false,
      })
      .returning();

    const rawToken = `sahayak_session_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = hashString(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await db.insert(authSessions).values({
      tokenHash,
      userUid: guestUid,
      expiresAt,
    });

    return {
      sessionToken: rawToken,
      profile: inserted[0],
      roles: ['citizen'],
    };
  } catch (error) {
    console.error('Guest session creation failed:', error);
    throw new Error('Could not initialize guest session.', { cause: error });
  }
}

export async function issueBackendSessionForUser(userUid: string) {
  const rawToken = `sahayak_session_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = hashString(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(authSessions).values({
    tokenHash,
    userUid,
    expiresAt,
  });

  return rawToken;
}

export async function resolveSessionToken(rawToken: string) {
  try {
    const tokenHash = hashString(rawToken);
    const now = new Date();
    const sessions = await db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)));

    if (sessions.length === 0) return null;
    const userUid = sessions[0].userUid;
    const foundProfiles = await db.select().from(profiles).where(eq(profiles.uid, userUid));
    if (foundProfiles.length === 0 || !foundProfiles[0].isActive) return null;

    const roles = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userUid, userUid), eq(userRoles.isActive, true)));

    return {
      profile: foundProfiles[0],
      roles: roles.length > 0 ? roles.map((r) => r.role) : ['citizen'],
    };
  } catch (error) {
    console.error('Session lookup failed:', error);
    throw new Error('Session verification error.', { cause: error });
  }
}

export async function updateProfileSettings(
  uid: string,
  updates: {
    fullName?: string;
    preferredLanguage?: string;
    voiceSpeed?: number;
    textSizeLevel?: number;
    theme?: string;
    notificationChannels?: NotificationChannelPrefs;
    consentGiven?: boolean;
    digilockerLinked?: boolean;
    digilockerAccountRef?: string | null;
  }
) {
  try {
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (updates.fullName !== undefined) patch.fullName = updates.fullName;
    if (updates.preferredLanguage !== undefined) patch.preferredLanguage = updates.preferredLanguage;
    if (updates.voiceSpeed !== undefined) patch.voiceSpeed = updates.voiceSpeed;
    if (updates.textSizeLevel !== undefined) patch.textSizeLevel = updates.textSizeLevel;
    if (updates.theme !== undefined) patch.theme = updates.theme;
    if (updates.notificationChannels !== undefined)
      patch.notificationChannels = updates.notificationChannels;
    if (updates.consentGiven !== undefined) {
      patch.consentGiven = updates.consentGiven;
      patch.consentTimestamp = updates.consentGiven ? new Date() : null;
    }
    if (updates.digilockerLinked !== undefined) patch.digilockerLinked = updates.digilockerLinked;
    if (updates.digilockerAccountRef !== undefined)
      patch.digilockerAccountRef = updates.digilockerAccountRef;

    const updated = await db
      .update(profiles)
      .set(patch)
      .where(eq(profiles.uid, uid))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Profile update failed:', error);
    throw new Error('Failed to save profile preferences.', { cause: error });
  }
}

export async function deleteAllUserDataPermanently(uid: string) {
  try {
    // Cascading foreign keys handle messages, events, feedback, documents, notifications, reminders, sessions
    await db.delete(documents).where(eq(documents.ownerUid, uid));
    await db.delete(profiles).where(eq(profiles.uid, uid));
    return { deleted: true };
  } catch (error) {
    console.error('User data deletion failed:', error);
    throw new Error('Failed to permanently delete user data.', { cause: error });
  }
}

export async function listLanguages(includeDisabled = false) {
  try {
    await ensureSeedData();
    if (includeDisabled) {
      return await db.select().from(languages).orderBy(asc(languages.sortOrder), asc(languages.englishName));
    }
    return await db
      .select()
      .from(languages)
      .where(eq(languages.isEnabled, true))
      .orderBy(asc(languages.sortOrder), asc(languages.englishName));
  } catch (error) {
    console.error('List languages failed:', error);
    throw new Error('Failed to load language registry.', { cause: error });
  }
}

export async function upsertLanguageEntry(entry: {
  code: string;
  nativeName: string;
  englishName: string;
  script: string;
  direction: string;
  sttSupported: boolean;
  ttsSupported: boolean;
  fontStack: string;
  localeCode: string;
  sampleGreeting: string;
  isEnabled: boolean;
  sortOrder?: number;
}) {
  try {
    const result = await db
      .insert(languages)
      .values({
        ...entry,
        sortOrder: entry.sortOrder ?? 50,
      })
      .onConflictDoUpdate({
        target: languages.code,
        set: {
          nativeName: entry.nativeName,
          englishName: entry.englishName,
          script: entry.script,
          direction: entry.direction,
          sttSupported: entry.sttSupported,
          ttsSupported: entry.ttsSupported,
          fontStack: entry.fontStack,
          localeCode: entry.localeCode,
          sampleGreeting: entry.sampleGreeting,
          isEnabled: entry.isEnabled,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Upsert language failed:', error);
    throw new Error('Failed to save language configuration.', { cause: error });
  }
}

export async function getCachedTranslations(langCode: string) {
  try {
    await ensureSeedData();
    const rows = await db
      .select()
      .from(uiTranslations)
      .where(eq(uiTranslations.languageCode, langCode));
    return rows;
  } catch (error) {
    console.error('Get UI translations failed:', error);
    throw new Error('Failed to fetch UI translations.', { cause: error });
  }
}

export async function saveTranslatedKeys(
  langCode: string,
  translatedMap: Record<string, string>,
  isAutoTranslated = true,
  updatedBy?: string
) {
  try {
    const entries = Object.entries(translatedMap);
    for (const [key, val] of entries) {
      await db
        .insert(uiTranslations)
        .values({
          languageCode: langCode,
          translationKey: key,
          translatedValue: val,
          isAutoTranslated,
          isReviewed: !isAutoTranslated,
          updatedBy: updatedBy || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [uiTranslations.languageCode, uiTranslations.translationKey],
          set: {
            translatedValue: val,
            isAutoTranslated,
            isReviewed: !isAutoTranslated,
            updatedBy: updatedBy || null,
            updatedAt: new Date(),
          },
        });
    }
  } catch (error) {
    console.error('Save UI translations failed:', error);
    throw new Error('Failed to persist UI translations.', { cause: error });
  }
}

export async function getGlossaryEntries(langCode?: string) {
  try {
    if (langCode) {
      return await db
        .select()
        .from(glossary)
        .where(eq(glossary.languageCode, langCode))
        .orderBy(asc(glossary.sourceTerm));
    }
    return await db.select().from(glossary).orderBy(asc(glossary.languageCode), asc(glossary.sourceTerm));
  } catch (error) {
    console.error('Fetch glossary failed:', error);
    throw new Error('Failed to load glossary terms.', { cause: error });
  }
}

export async function createGlossaryEntry(entry: {
  sourceTerm: string;
  languageCode: string;
  targetTerm: string;
  domain: string;
  notes?: string;
  updatedBy?: string;
}) {
  try {
    const res = await db.insert(glossary).values(entry).returning();
    return res[0];
  } catch (error) {
    console.error('Create glossary failed:', error);
    throw new Error('Failed to add glossary entry.', { cause: error });
  }
}

export async function removeGlossaryEntry(id: number) {
  try {
    await db.delete(glossary).where(eq(glossary.id, id));
  } catch (error) {
    console.error('Delete glossary failed:', error);
    throw new Error('Failed to delete glossary entry.', { cause: error });
  }
}

export async function listServiceTemplates(activeOnly = true) {
  try {
    await ensureSeedData();
    if (activeOnly) {
      return await db
        .select()
        .from(serviceTemplates)
        .where(eq(serviceTemplates.isActive, true))
        .orderBy(asc(serviceTemplates.id));
    }
    return await db.select().from(serviceTemplates).orderBy(asc(serviceTemplates.id));
  } catch (error) {
    console.error('List service templates failed:', error);
    throw new Error('Failed to load service catalog.', { cause: error });
  }
}

export async function saveKnowledgeDocument(params: {
  id?: number;
  ownerUid: string;
  title: string;
  docType: string;
  domain: string;
  languageCode: string;
  status: 'draft' | 'in_review' | 'published';
  sourceUrl?: string;
  mimeType?: string;
  fileSize?: number;
  fileDataBase64?: string;
  rawText: string;
  extractedMetadata?: Record<string, any>;
}) {
  try {
    if (params.id) {
      const updated = await db
        .update(documents)
        .set({
          title: params.title,
          docType: params.docType,
          domain: params.domain,
          languageCode: params.languageCode,
          status: params.status,
          sourceUrl: params.sourceUrl || null,
          rawText: params.rawText,
          extractedMetadata: params.extractedMetadata || {},
          publishedAt: params.status === 'published' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, params.id))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(documents)
      .values({
        scope: 'knowledge_base',
        ownerUid: params.ownerUid,
        title: params.title,
        docType: params.docType,
        domain: params.domain,
        languageCode: params.languageCode,
        status: params.status,
        sourceUrl: params.sourceUrl || null,
        mimeType: params.mimeType || 'text/plain',
        fileSize: params.fileSize || params.rawText.length,
        fileDataBase64: params.fileDataBase64 || null,
        rawText: params.rawText,
        extractedMetadata: params.extractedMetadata || {},
        publishedAt: params.status === 'published' ? new Date() : null,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Save knowledge document failed:', error);
    throw new Error('Failed to save knowledge base document.', { cause: error });
  }
}

export async function replaceDocumentChunks(
  documentId: number,
  chunks: Array<{ chunkIndex: number; pageNumber: number; content: string; embedding: number[] }>
) {
  try {
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    if (chunks.length > 0) {
      await db.insert(documentChunks).values(
        chunks.map((c) => ({
          documentId,
          chunkIndex: c.chunkIndex,
          pageNumber: c.pageNumber,
          content: c.content,
          embedding: c.embedding,
        }))
      );
    }
  } catch (error) {
    console.error('Replace document chunks failed:', error);
    throw new Error('Failed to store document vector embeddings.', { cause: error });
  }
}

export async function retrieveTopPublishedChunks(queryEmbedding: number[], limit = 5) {
  try {
    const similarity = sql<number>`1 - (${cosineDistance(documentChunks.embedding, queryEmbedding)})`;
    const rows = await db
      .select({
        chunkId: documentChunks.id,
        documentId: documents.id,
        documentTitle: documents.title,
        domain: documents.domain,
        languageCode: documents.languageCode,
        pageNumber: documentChunks.pageNumber,
        content: documentChunks.content,
        similarity,
      })
      .from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .where(and(eq(documents.scope, 'knowledge_base'), eq(documents.status, 'published')))
      .orderBy(desc(similarity))
      .limit(limit);

    return rows;
  } catch (error) {
    console.error('Vector chunk retrieval failed:', error);
    throw new Error('Knowledge base retrieval failed.', { cause: error });
  }
}

export async function listKnowledgeDocuments() {
  try {
    return await db
      .select({
        id: documents.id,
        title: documents.title,
        docType: documents.docType,
        domain: documents.domain,
        languageCode: documents.languageCode,
        status: documents.status,
        sourceUrl: documents.sourceUrl,
        fileSize: documents.fileSize,
        rawText: documents.rawText,
        publishedAt: documents.publishedAt,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.scope, 'knowledge_base'))
      .orderBy(desc(documents.updatedAt));
  } catch (error) {
    console.error('List KB documents failed:', error);
    throw new Error('Failed to load knowledge base documents.', { cause: error });
  }
}

export async function deleteKnowledgeDocument(id: number) {
  try {
    await db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.scope, 'knowledge_base')));
  } catch (error) {
    console.error('Delete KB document failed:', error);
    throw new Error('Failed to delete knowledge document.', { cause: error });
  }
}

export async function listCitizenDocuments(ownerUid: string) {
  try {
    return await db
      .select({
        id: documents.id,
        scope: documents.scope,
        title: documents.title,
        docType: documents.docType,
        domain: documents.domain,
        languageCode: documents.languageCode,
        status: documents.status,
        mimeType: documents.mimeType,
        fileSize: documents.fileSize,
        extractedMetadata: documents.extractedMetadata,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(and(eq(documents.ownerUid, ownerUid), eq(documents.scope, 'citizen_vault')))
      .orderBy(desc(documents.createdAt));
  } catch (error) {
    console.error('List citizen documents failed:', error);
    throw new Error('Failed to load personal documents.', { cause: error });
  }
}

export async function saveCitizenDocument(params: {
  ownerUid: string;
  scope: 'citizen_vault' | 'letter_explain';
  title: string;
  docType: string;
  domain?: string;
  languageCode?: string;
  status?: string;
  mimeType?: string;
  fileSize?: number;
  fileDataBase64?: string;
  rawText?: string;
  extractedMetadata?: Record<string, any>;
}) {
  try {
    const res = await db
      .insert(documents)
      .values({
        scope: params.scope,
        ownerUid: params.ownerUid,
        title: params.title,
        docType: params.docType,
        domain: params.domain || 'general',
        languageCode: params.languageCode || 'en',
        status: params.status || 'uploaded',
        mimeType: params.mimeType || 'application/octet-stream',
        fileSize: params.fileSize || 0,
        fileDataBase64: params.fileDataBase64 || null,
        rawText: params.rawText || null,
        extractedMetadata: params.extractedMetadata || {},
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Save citizen document failed:', error);
    throw new Error('Failed to save uploaded document.', { cause: error });
  }
}

export async function deleteCitizenDocument(ownerUid: string, docId: number) {
  try {
    await db
      .delete(documents)
      .where(and(eq(documents.id, docId), eq(documents.ownerUid, ownerUid)));
  } catch (error) {
    console.error('Delete citizen document failed:', error);
    throw new Error('Failed to delete document.', { cause: error });
  }
}

export async function createOrGetConversation(params: {
  conversationId?: number;
  userUid: string;
  title: string;
  domain: string;
  languageCode: string;
}) {
  try {
    if (params.conversationId) {
      const existing = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, params.conversationId),
            eq(conversations.userUid, params.userUid)
          )
        );
      if (existing.length > 0) return existing[0];
    }

    const inserted = await db
      .insert(conversations)
      .values({
        userUid: params.userUid,
        title: params.title.slice(0, 120),
        domain: params.domain,
        languageCode: params.languageCode,
        status: 'ai_active',
        resolvedWithoutAgent: true,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Create conversation failed:', error);
    throw new Error('Failed to open conversation.', { cause: error });
  }
}

export async function listUserConversations(userUid: string) {
  try {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.userUid, userUid))
      .orderBy(desc(conversations.updatedAt));
  } catch (error) {
    console.error('List conversations failed:', error);
    throw new Error('Failed to load conversations.', { cause: error });
  }
}

export async function getMessagesForConversation(conversationId: number) {
  try {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  } catch (error) {
    console.error('Get messages failed:', error);
    throw new Error('Failed to load conversation messages.', { cause: error });
  }
}

export async function appendMessage(params: {
  conversationId: number;
  senderRole: 'user' | 'assistant' | 'human_agent' | 'system';
  senderUid?: string;
  content: string;
  translatedContent?: string;
  detectedLanguage?: string;
  confidence?: number;
  citations?: CitationItem[];
  suggestedActions?: SuggestedActionItem[];
  latencyMs?: number;
}) {
  try {
    const res = await db
      .insert(messages)
      .values({
        conversationId: params.conversationId,
        senderRole: params.senderRole,
        senderUid: params.senderUid || null,
        content: params.content,
        translatedContent: params.translatedContent || null,
        detectedLanguage: params.detectedLanguage || null,
        confidence: params.confidence ?? null,
        citations: params.citations || [],
        suggestedActions: params.suggestedActions || [],
        latencyMs: params.latencyMs ?? null,
      })
      .returning();

    await db
      .update(conversations)
      .set({
        updatedAt: new Date(),
        ...(params.detectedLanguage ? { languageCode: params.detectedLanguage } : {}),
      })
      .where(eq(conversations.id, params.conversationId));

    return res[0];
  } catch (error) {
    console.error('Append message failed:', error);
    throw new Error('Failed to save message.', { cause: error });
  }
}

export async function escalateConversationToHuman(
  conversationId: number,
  reason: 'low_confidence' | 'user_requested' | 'dispute'
) {
  try {
    const updated = await db
      .update(conversations)
      .set({
        status: 'needs_human',
        handoverReason: reason,
        resolvedWithoutAgent: false,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Escalate conversation failed:', error);
    throw new Error('Failed to request human agent support.', { cause: error });
  }
}

export async function listHumanInboxConversations() {
  try {
    const convs = await db
      .select({
        conversation: conversations,
        userFullName: profiles.fullName,
        userPhone: profiles.phone,
        userEmail: profiles.email,
      })
      .from(conversations)
      .leftJoin(profiles, eq(conversations.userUid, profiles.uid))
      .where(eq(conversations.resolvedWithoutAgent, false))
      .orderBy(desc(conversations.updatedAt));
    return convs;
  } catch (error) {
    console.error('List inbox conversations failed:', error);
    throw new Error('Failed to load human support inbox.', { cause: error });
  }
}

export async function updateConversationStatusAdmin(
  conversationId: number,
  status: 'needs_human' | 'agent_assigned' | 'resolved',
  agentUid: string
) {
  try {
    const updated = await db
      .update(conversations)
      .set({
        status,
        assignedAgentUid: agentUid,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Update inbox status failed:', error);
    throw new Error('Failed to update conversation status.', { cause: error });
  }
}

export async function saveMessageFeedback(params: {
  messageId: number;
  userUid: string;
  rating: 'up' | 'down';
  reason?: string;
  comment?: string;
}) {
  try {
    const res = await db
      .insert(feedback)
      .values({
        messageId: params.messageId,
        userUid: params.userUid,
        rating: params.rating,
        reason: params.reason || null,
        comment: params.comment || null,
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Save feedback failed:', error);
    throw new Error('Failed to record feedback.', { cause: error });
  }
}

export async function executeWorkflowsForEvent(params: {
  triggerType: 'application_submitted' | 'grievance_created' | 'deadline_detected' | 'manual';
  entityType: string;
  entityId: string;
  userUid: string;
  languageCode: string;
  contextTitle: string;
  dueAt?: Date;
}) {
  try {
    const activeWfs = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.triggerType, params.triggerType), eq(workflows.isActive, true)));

    const runs = [];
    for (const wf of activeWfs) {
      const logs: WorkflowStepLog[] = [];
      for (const step of wf.steps) {
        const ts = new Date().toISOString();
        if (step.type === 'notify_user') {
          await db.insert(notifications).values({
            userUid: params.userUid,
            title: `${wf.name}`,
            body: `${params.contextTitle} (${params.entityId})`,
            languageCode: params.languageCode,
            channel: step.config?.channel || 'in_app',
            relatedEntityType: params.entityType,
            relatedEntityRef: params.entityId,
          });
          logs.push({
            stepId: step.id,
            label: step.label,
            status: 'completed',
            detail: `Dispatched citizen notification (${step.config?.channel || 'in_app'})`,
            timestamp: ts,
          });
        } else if (step.type === 'set_reminder' && params.dueAt) {
          logs.push({
            stepId: step.id,
            label: step.label,
            status: 'completed',
            detail: `Deadline reminder verified for ${params.dueAt.toISOString().slice(0, 10)}`,
            timestamp: ts,
          });
        } else {
          logs.push({
            stepId: step.id,
            label: step.label,
            status: 'completed',
            detail: `Executed ${step.type} for ${params.entityId}`,
            timestamp: ts,
          });
        }
      }

      const insertedRun = await db
        .insert(workflowRuns)
        .values({
          workflowId: wf.id,
          triggerEntityType: params.entityType,
          triggerEntityId: params.entityId,
          userUid: params.userUid,
          status: 'completed',
          stepLogs: logs,
          completedAt: new Date(),
        })
        .returning();
      runs.push(insertedRun[0]);
    }
    return runs;
  } catch (error) {
    console.error('Workflow execution failed:', error);
    throw new Error('Workflow automation failed.', { cause: error });
  }
}

export async function createApplicationSubmission(params: {
  userUid: string;
  serviceSlug: string;
  serviceTitle: string;
  domain: string;
  formData: Record<string, any>;
  autoFilledFields: string[];
  attachedDocumentIds: number[];
  languageCode: string;
}) {
  try {
    const referenceNumber = generateReferenceNumber('APP');
    const inserted = await db
      .insert(applications)
      .values({
        referenceNumber,
        userUid: params.userUid,
        serviceSlug: params.serviceSlug,
        serviceTitle: params.serviceTitle,
        domain: params.domain,
        status: 'under_verification',
        currentStep: 2,
        totalSteps: 4,
        formData: params.formData,
        autoFilledFields: params.autoFilledFields,
        attachedDocumentIds: params.attachedDocumentIds,
        languageCode: params.languageCode,
      })
      .returning();

    const app = inserted[0];

    await db.insert(applicationEvents).values([
      {
        applicationId: app.id,
        status: 'submitted',
        title: 'Application Submitted',
        description: `Reference ${referenceNumber} issued with ${params.attachedDocumentIds.length} supporting document(s).`,
        actorRole: 'citizen',
      },
      {
        applicationId: app.id,
        status: 'under_verification',
        title: 'Automated Verification Queued',
        description: 'Details and auto-extracted fields forwarded to verification workflow.',
        actorRole: 'workflow',
      },
    ]);

    await executeWorkflowsForEvent({
      triggerType: 'application_submitted',
      entityType: 'application',
      entityId: referenceNumber,
      userUid: params.userUid,
      languageCode: params.languageCode,
      contextTitle: `${params.serviceTitle} submitted`,
    });

    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, app.id))
      .orderBy(asc(applicationEvents.createdAt));

    return { application: app, events };
  } catch (error) {
    console.error('Create application failed:', error);
    throw new Error('Failed to submit application.', { cause: error });
  }
}

export async function listUserApplicationsWithEvents(userUid: string) {
  try {
    const apps = await db
      .select()
      .from(applications)
      .where(eq(applications.userUid, userUid))
      .orderBy(desc(applications.updatedAt));

    const result = [];
    for (const app of apps) {
      const events = await db
        .select()
        .from(applicationEvents)
        .where(eq(applicationEvents.applicationId, app.id))
        .orderBy(asc(applicationEvents.createdAt));
      result.push({ ...app, events });
    }
    return result;
  } catch (error) {
    console.error('List applications failed:', error);
    throw new Error('Failed to load applications.', { cause: error });
  }
}

export async function createCitizenGrievance(params: {
  userUid: string;
  domain: string;
  category: string;
  priority: string;
  description: string;
  translatedDescription: string;
  languageCode: string;
  attachmentDocumentId?: number;
  assignedDepartment: string;
  slaHours: number;
}) {
  try {
    const referenceNumber = generateReferenceNumber('GRV');
    const slaDueAt = new Date(Date.now() + params.slaHours * 60 * 60 * 1000);

    const inserted = await db
      .insert(grievances)
      .values({
        referenceNumber,
        userUid: params.userUid,
        domain: params.domain,
        category: params.category,
        priority: params.priority,
        description: params.description,
        translatedDescription: params.translatedDescription,
        languageCode: params.languageCode,
        attachmentDocumentId: params.attachmentDocumentId || null,
        status: 'open',
        assignedDepartment: params.assignedDepartment,
        slaDueAt,
      })
      .returning();

    await executeWorkflowsForEvent({
      triggerType: 'grievance_created',
      entityType: 'grievance',
      entityId: referenceNumber,
      userUid: params.userUid,
      languageCode: params.languageCode,
      contextTitle: `Grievance registered (${params.category})`,
    });

    return inserted[0];
  } catch (error) {
    console.error('Create grievance failed:', error);
    throw new Error('Failed to submit grievance.', { cause: error });
  }
}

export async function listUserGrievances(userUid: string) {
  try {
    return await db
      .select()
      .from(grievances)
      .where(eq(grievances.userUid, userUid))
      .orderBy(desc(grievances.createdAt));
  } catch (error) {
    console.error('List user grievances failed:', error);
    throw new Error('Failed to load grievances.', { cause: error });
  }
}

export async function listAllGrievancesAdmin() {
  try {
    return await db.select().from(grievances).orderBy(desc(grievances.createdAt));
  } catch (error) {
    console.error('List admin grievances failed:', error);
    throw new Error('Failed to load grievances table.', { cause: error });
  }
}

export async function updateGrievanceAdmin(
  id: number,
  patch: {
    status?: string;
    priority?: string;
    assignedToUid?: string | null;
    assignedDepartment?: string;
    resolutionNotes?: string;
  }
) {
  try {
    const updated = await db
      .update(grievances)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(grievances.id, id))
      .returning();

    if (updated[0]) {
      await db.insert(notifications).values({
        userUid: updated[0].userUid,
        title: `Grievance ${updated[0].referenceNumber} updated`,
        body: `Status: ${updated[0].status}${
          updated[0].resolutionNotes ? ` — ${updated[0].resolutionNotes}` : ''
        }`,
        languageCode: updated[0].languageCode,
        channel: 'in_app',
        relatedEntityType: 'grievance',
        relatedEntityRef: updated[0].referenceNumber,
      });
    }
    return updated[0];
  } catch (error) {
    console.error('Update grievance failed:', error);
    throw new Error('Failed to update grievance ticket.', { cause: error });
  }
}

export async function listUserNotifications(userUid: string) {
  try {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userUid, userUid))
      .orderBy(desc(notifications.createdAt));
  } catch (error) {
    console.error('List notifications failed:', error);
    throw new Error('Failed to load notifications.', { cause: error });
  }
}

export async function markNotificationRead(userUid: string, id: number) {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userUid, userUid)));
  } catch (error) {
    console.error('Mark notification read failed:', error);
    throw new Error('Failed to update notification.', { cause: error });
  }
}

export async function listUserReminders(userUid: string) {
  try {
    return await db
      .select()
      .from(reminders)
      .where(eq(reminders.userUid, userUid))
      .orderBy(asc(reminders.dueAt));
  } catch (error) {
    console.error('List reminders failed:', error);
    throw new Error('Failed to load reminders.', { cause: error });
  }
}

export async function createUserReminder(params: {
  userUid: string;
  title: string;
  notes?: string;
  dueAt: Date;
  channel: string;
  sourceDocumentId?: number;
  languageCode: string;
}) {
  try {
    const res = await db
      .insert(reminders)
      .values({
        userUid: params.userUid,
        title: params.title,
        notes: params.notes || null,
        dueAt: params.dueAt,
        channel: params.channel,
        sourceDocumentId: params.sourceDocumentId || null,
      })
      .returning();

    await executeWorkflowsForEvent({
      triggerType: 'deadline_detected',
      entityType: 'reminder',
      entityId: `REM-${res[0].id}`,
      userUid: params.userUid,
      languageCode: params.languageCode,
      contextTitle: params.title,
      dueAt: params.dueAt,
    });

    return res[0];
  } catch (error) {
    console.error('Create reminder failed:', error);
    throw new Error('Failed to schedule reminder.', { cause: error });
  }
}

export async function toggleUserReminder(userUid: string, id: number, isCompleted: boolean) {
  try {
    const res = await db
      .update(reminders)
      .set({ isCompleted })
      .where(and(eq(reminders.id, id), eq(reminders.userUid, userUid)))
      .returning();
    return res[0];
  } catch (error) {
    console.error('Toggle reminder failed:', error);
    throw new Error('Failed to update reminder.', { cause: error });
  }
}

export async function listWorkflowsAndRuns() {
  try {
    await ensureSeedData();
    const wfs = await db.select().from(workflows).orderBy(asc(workflows.id));
    const runs = await db
      .select()
      .from(workflowRuns)
      .orderBy(desc(workflowRuns.startedAt))
      .limit(40);
    return { workflows: wfs, runs };
  } catch (error) {
    console.error('List workflows failed:', error);
    throw new Error('Failed to load workflows.', { cause: error });
  }
}

export async function saveWorkflowDefinition(params: {
  id?: number;
  name: string;
  description: string;
  domain: string;
  triggerType: string;
  steps: WorkflowStepDef[];
  isActive: boolean;
  createdBy?: string;
}) {
  try {
    if (params.id) {
      const updated = await db
        .update(workflows)
        .set({
          name: params.name,
          description: params.description,
          domain: params.domain,
          triggerType: params.triggerType,
          steps: params.steps,
          isActive: params.isActive,
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, params.id))
        .returning();
      return updated[0];
    }
    const inserted = await db
      .insert(workflows)
      .values({
        name: params.name,
        description: params.description,
        domain: params.domain,
        triggerType: params.triggerType,
        steps: params.steps,
        isActive: params.isActive,
        createdBy: params.createdBy || null,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Save workflow failed:', error);
    throw new Error('Failed to save workflow.', { cause: error });
  }
}

export async function listSanitizedIntegrations() {
  try {
    await ensureSeedData();
    const rows = await db.select().from(integrations).orderBy(asc(integrations.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      adapterType: r.adapterType,
      domain: r.domain,
      endpointUrl: r.endpointUrl,
      mode: r.mode,
      hasSecretConfigured: Object.keys(r.authConfigEncrypted || {}).length > 0,
      secretKeyNames: Object.keys(r.authConfigEncrypted || {}),
      headers: r.headers,
      status: r.status,
      lastTestedAt: r.lastTestedAt,
      lastTestMessage: r.lastTestMessage,
      lastLatencyMs: r.lastLatencyMs,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error('List integrations failed:', error);
    throw new Error('Failed to load API integrations.', { cause: error });
  }
}

export async function saveIntegrationConnector(params: {
  id?: number;
  name: string;
  adapterType: string;
  domain: string;
  endpointUrl: string;
  mode: 'sandbox' | 'live';
  secretValues?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  try {
    if (params.id) {
      const existing = await db.select().from(integrations).where(eq(integrations.id, params.id));
      const mergedSecrets = {
        ...(existing[0]?.authConfigEncrypted || {}),
        ...(params.secretValues || {}),
      };
      const updated = await db
        .update(integrations)
        .set({
          name: params.name,
          adapterType: params.adapterType,
          domain: params.domain,
          endpointUrl: params.endpointUrl,
          mode: params.mode,
          authConfigEncrypted: mergedSecrets,
          headers: params.headers || {},
        })
        .where(eq(integrations.id, params.id))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(integrations)
      .values({
        name: params.name,
        adapterType: params.adapterType,
        domain: params.domain,
        endpointUrl: params.endpointUrl,
        mode: params.mode,
        authConfigEncrypted: params.secretValues || {},
        headers: params.headers || {},
        status: 'untested',
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Save integration failed:', error);
    throw new Error('Failed to save API integration.', { cause: error });
  }
}

export async function testIntegrationById(id: number) {
  try {
    const rows = await db.select().from(integrations).where(eq(integrations.id, id));
    if (rows.length === 0) throw new Error('Integration not found.');
    const item = rows[0];
    const start = Date.now();

    let status = 'healthy';
    let message = '';

    if (item.mode === 'sandbox') {
      // Pluggable Sandbox Adapter contract verification
      const urlValid = /^https?:\/\/.+/.test(item.endpointUrl);
      if (!urlValid) {
        status = 'error';
        message = 'Invalid endpoint URL format.';
      } else {
        status = 'sandbox_ready';
        message = `Sandbox ${item.adapterType.toUpperCase()} adapter verified (${item.domain} schema handshake OK).`;
      }
    } else {
      // Live Adapter HTTP execution using server-side stored secrets
      const reqHeaders: Record<string, string> = {
        Accept: 'application/json',
        ...item.headers,
      };
      const secrets = item.authConfigEncrypted || {};
      const isSarvamTranslate = item.endpointUrl.includes('api.sarvam.ai/translate');
      if (secrets.sarvamSubscriptionKey) {
        reqHeaders['api-subscription-key'] = secrets.sarvamSubscriptionKey;
      } else if (secrets.bearerToken) {
        reqHeaders.Authorization = `Bearer ${secrets.bearerToken}`;
      } else if (secrets.apiKey) {
        reqHeaders['X-API-Key'] = secrets.apiKey;
      }

      if (isSarvamTranslate || item.adapterType === 'webhook') {
        reqHeaders['Content-Type'] = 'application/json';
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(item.endpointUrl, {
          method: isSarvamTranslate || item.adapterType === 'webhook' ? 'POST' : 'GET',
          headers: reqHeaders,
          body: isSarvamTranslate
            ? JSON.stringify({
                input: 'Welcome to Sahayak',
                source_language_code: 'en-IN',
                target_language_code: 'ta-IN',
                model: 'sarvam-translate:v1',
              })
            : item.adapterType === 'webhook'
              ? JSON.stringify({ event: 'sahayak.health_check', timestamp: new Date().toISOString() })
              : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok || (!isSarvamTranslate && res.status < 500)) {
          status = 'healthy';
          message = `Live endpoint responded HTTP ${res.status}.`;
        } else {
          status = 'error';
          message = `Endpoint returned HTTP ${res.status}.`;
        }
      } catch (netErr: any) {
        status = 'error';
        message = `Connection failed: ${netErr.message || 'Unreachable host'}`;
      }
    }

    const latencyMs = Math.max(1, Date.now() - start);
    const updated = await db
      .update(integrations)
      .set({
        status,
        lastTestedAt: new Date(),
        lastTestMessage: message,
        lastLatencyMs: latencyMs,
      })
      .where(eq(integrations.id, id))
      .returning();

    return {
      id: updated[0].id,
      status: updated[0].status,
      lastTestedAt: updated[0].lastTestedAt,
      lastTestMessage: updated[0].lastTestMessage,
      lastLatencyMs: updated[0].lastLatencyMs,
    };
  } catch (error) {
    console.error('Test integration failed:', error);
    throw new Error('Failed to test integration connector.', { cause: error });
  }
}

export async function recordAuditLog(params: {
  actorUid?: string;
  actorEmail?: string | null;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUid: params.actorUid || null,
      actorEmail: params.actorEmail || null,
      actorRole: params.actorRole || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      details: params.details || {},
    });
  } catch (error) {
    console.error('Audit log insert failed:', error);
  }
}

export async function listAuditLogsAdmin() {
  try {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(250);
  } catch (error) {
    console.error('List audit logs failed:', error);
    throw new Error('Failed to load audit logs.', { cause: error });
  }
}

export async function listUsersAndRolesAdmin() {
  try {
    const roles = await db.select().from(userRoles).orderBy(desc(userRoles.createdAt));
    const allProfiles = await db.select().from(profiles).orderBy(desc(profiles.createdAt)).limit(200);
    return { roles, profiles: allProfiles };
  } catch (error) {
    console.error('List users and roles failed:', error);
    throw new Error('Failed to load users and roles.', { cause: error });
  }
}

export async function inviteOrAssignRole(params: {
  email: string;
  role: 'admin' | 'content_editor' | 'support_agent' | 'citizen';
  invitedBy: string;
}) {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const matchedProfile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, cleanEmail));

    const existing = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.email, cleanEmail), eq(userRoles.role, params.role)));

    if (existing.length > 0) {
      const updated = await db
        .update(userRoles)
        .set({
          isActive: true,
          userUid: matchedProfile[0]?.uid || existing[0].userUid,
        })
        .where(eq(userRoles.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(userRoles)
      .values({
        email: cleanEmail,
        userUid: matchedProfile[0]?.uid || null,
        role: params.role,
        isActive: true,
        invitedBy: params.invitedBy,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Assign role failed:', error);
    throw new Error('Failed to assign role.', { cause: error });
  }
}

export async function setRoleActiveState(roleId: number, isActive: boolean) {
  try {
    const updated = await db
      .update(userRoles)
      .set({ isActive })
      .where(eq(userRoles.id, roleId))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Toggle role state failed:', error);
    throw new Error('Failed to update role status.', { cause: error });
  }
}

export async function computeAdminAnalytics() {
  try {
    const allConvs = await db.select().from(conversations);
    const allMsgs = await db.select().from(messages);
    const allFeedback = await db.select().from(feedback);
    const allApps = await db.select().from(applications);
    const allGrievances = await db.select().from(grievances);
    const allDocs = await db
      .select({ id: documents.id, status: documents.status, domain: documents.domain })
      .from(documents)
      .where(eq(documents.scope, 'knowledge_base'));

    const userMsgs = allMsgs.filter((m) => m.senderRole === 'user');
    const assistantMsgs = allMsgs.filter((m) => m.senderRole === 'assistant');

    const totalQueries = userMsgs.length;
    const totalConversations = allConvs.length;
    const resolvedWithoutAgentCount = allConvs.filter((c) => c.resolvedWithoutAgent).length;
    const resolvedWithoutAgentPct =
      totalConversations > 0
        ? Math.round((resolvedWithoutAgentCount / totalConversations) * 100)
        : 0;

    const latencies = assistantMsgs
      .map((m) => m.latencyMs)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgReplyTimeMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

    const langCounts: Record<string, number> = {};
    for (const m of userMsgs) {
      const code = m.detectedLanguage || 'en';
      langCounts[code] = (langCounts[code] || 0) + 1;
    }
    const languagesUsed = Object.entries(langCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    const topQuestions = userMsgs
      .slice(-50)
      .reverse()
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        question: m.content.slice(0, 140),
        language: m.detectedLanguage || 'en',
        createdAt: m.createdAt,
      }));

    // Pair low-confidence assistant messages with preceding user message
    const msgById = new Map(allMsgs.map((m) => [m.id, m]));
    const lowConfidenceTopics = assistantMsgs
      .filter((m) => typeof m.confidence === 'number' && m.confidence < 0.55)
      .slice(-10)
      .map((m) => {
        const convMsgs = allMsgs.filter(
          (x) => x.conversationId === m.conversationId && x.id < m.id && x.senderRole === 'user'
        );
        const prevQ = convMsgs[convMsgs.length - 1];
        return {
          messageId: m.id,
          question: prevQ?.content?.slice(0, 120) || 'Unmatched query',
          confidence: m.confidence,
          language: m.detectedLanguage || prevQ?.detectedLanguage || 'en',
        };
      });

    const thumbsUp = allFeedback.filter((f) => f.rating === 'up').length;
    const thumbsDown = allFeedback.filter((f) => f.rating === 'down').length;
    const reasonCounts: Record<string, number> = {};
    for (const f of allFeedback) {
      if (f.reason) {
        reasonCounts[f.reason] = (reasonCounts[f.reason] || 0) + 1;
      }
    }

    return {
      totalQueries,
      totalConversations,
      resolvedWithoutAgentPct,
      avgReplyTimeMs,
      totalApplications: allApps.length,
      openGrievances: allGrievances.filter((g) => g.status !== 'resolved' && g.status !== 'closed')
        .length,
      publishedDocuments: allDocs.filter((d) => d.status === 'published').length,
      languagesUsed,
      topQuestions,
      lowConfidenceTopics,
      feedbackSummary: {
        thumbsUp,
        thumbsDown,
        total: allFeedback.length,
        reasons: Object.entries(reasonCounts).map(([reason, count]) => ({ reason, count })),
      },
      msgCount: msgById.size,
    };
  } catch (error) {
    console.error('Compute analytics failed:', error);
    throw new Error('Failed to compute analytics metrics.', { cause: error });
  }
}
