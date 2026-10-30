import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

export interface NotificationChannelPrefs {
  push: boolean;
  sms: boolean;
  whatsapp: boolean;
  voiceCall: boolean;
}

export interface CitationItem {
  documentId: number;
  documentTitle: string;
  pageNumber: number;
  snippet: string;
  languageCode: string;
}

export interface SuggestedActionItem {
  type: 'talk_to_human' | 'start_application' | 'file_grievance';
  label: string;
  serviceSlug?: string;
}

export interface ServiceFormField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'textarea';
  required: boolean;
  step: number;
  options?: string[];
  extractHint?: string;
}

export interface WorkflowStepDef {
  id: string;
  type:
    | 'collect_details'
    | 'verify_documents'
    | 'send_to_office'
    | 'notify_user'
    | 'set_reminder'
    | 'route_grievance';
  label: string;
  config: Record<string, string>;
}

export interface WorkflowStepLog {
  stepId: string;
  label: string;
  status: 'completed' | 'skipped' | 'failed';
  detail: string;
  timestamp: string;
}

// 1. Profiles (users keyed by Firebase Auth UID or verified session UID)
export const profiles = pgTable('profiles', {
  uid: text('uid').primaryKey(),
  email: text('email'),
  phone: text('phone'),
  phoneVerified: boolean('phone_verified').default(false).notNull(),
  fullName: text('full_name'),
  isGuest: boolean('is_guest').default(false).notNull(),
  preferredLanguage: text('preferred_language').default('en').notNull(),
  voiceSpeed: real('voice_speed').default(1.0).notNull(),
  textSizeLevel: integer('text_size_level').default(1).notNull(),
  theme: text('theme').default('system').notNull(),
  notificationChannels: jsonb('notification_channels')
    .$type<NotificationChannelPrefs>()
    .default({ push: true, sms: false, whatsapp: false, voiceCall: false })
    .notNull(),
  consentGiven: boolean('consent_given').default(false).notNull(),
  consentTimestamp: timestamp('consent_timestamp'),
  digilockerLinked: boolean('digilocker_linked').default(false).notNull(),
  digilockerAccountRef: text('digilocker_account_ref'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 2. Separate User Roles table (RBAC: admin, content_editor, support_agent, citizen)
export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').references(() => profiles.uid, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  invitedBy: text('invited_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Supporting OTP & Session tables for Phone OTP and Guest sessions
export const otpVerifications = pgTable('otp_verifications', {
  id: serial('id').primaryKey(),
  identifier: text('identifier').notNull(),
  otpHash: text('otp_hash').notNull(),
  channel: text('channel').default('phone').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  consumed: boolean('consumed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const authSessions = pgTable('auth_sessions', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  userUid: text('user_uid')
    .references(() => profiles.uid, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Languages Registry (22 scheduled Indian languages + English, runtime editable)
export const languages = pgTable('languages', {
  code: text('code').primaryKey(),
  nativeName: text('native_name').notNull(),
  englishName: text('english_name').notNull(),
  script: text('script').notNull(),
  direction: text('direction').default('ltr').notNull(),
  sttSupported: boolean('stt_supported').default(true).notNull(),
  ttsSupported: boolean('tts_supported').default(true).notNull(),
  fontStack: text('font_stack').notNull(),
  localeCode: text('locale_code').notNull(),
  sampleGreeting: text('sample_greeting').notNull(),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  sortOrder: integer('sort_order').default(100).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. UI Translations (i18n cache + admin review/override)
export const uiTranslations = pgTable(
  'ui_translations',
  {
    id: serial('id').primaryKey(),
    languageCode: text('language_code')
      .references(() => languages.code, { onDelete: 'cascade' })
      .notNull(),
    translationKey: text('translation_key').notNull(),
    translatedValue: text('translated_value').notNull(),
    isAutoTranslated: boolean('is_auto_translated').default(true).notNull(),
    isReviewed: boolean('is_reviewed').default(false).notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('ui_translations_lang_key_idx').on(table.languageCode, table.translationKey)]
);

// 5. Per-Organisation Glossary
export const glossary = pgTable('glossary', {
  id: serial('id').primaryKey(),
  sourceTerm: text('source_term').notNull(),
  languageCode: text('language_code')
    .references(() => languages.code, { onDelete: 'cascade' })
    .notNull(),
  targetTerm: text('target_term').notNull(),
  domain: text('domain').default('general').notNull(),
  notes: text('notes'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Neutral Domain Service Templates (admin-configurable)
export const serviceTemplates = pgTable('service_templates', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  domain: text('domain').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  requiredDocuments: jsonb('required_documents').$type<string[]>().default([]).notNull(),
  formSchema: jsonb('form_schema').$type<ServiceFormField[]>().default([]).notNull(),
  estimatedDays: integer('estimated_days').default(7).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Documents (Knowledge Base + Citizen Document Vault + Explain-a-Letter)
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  scope: text('scope').notNull(), // 'knowledge_base' | 'citizen_vault' | 'letter_explain'
  ownerUid: text('owner_uid').references(() => profiles.uid, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  docType: text('doc_type').notNull(), // 'pdf' | 'faq' | 'circular' | 'web_link' | 'identity' | 'certificate' | 'letter'
  domain: text('domain').default('government').notNull(),
  languageCode: text('language_code').default('en').notNull(),
  status: text('status').default('draft').notNull(), // KB: 'draft' | 'in_review' | 'published'; Vault: 'uploaded' | 'verified' | 'rejected'
  sourceUrl: text('source_url'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  fileDataBase64: text('file_data_base64'),
  rawText: text('raw_text'),
  extractedMetadata: jsonb('extracted_metadata').$type<Record<string, any>>().default({}).notNull(),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 7. Document Chunks with pgvector embeddings (768-dim)
export const documentChunks = pgTable('document_chunks', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  pageNumber: integer('page_number').default(1).notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Conversations
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => profiles.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  domain: text('domain').default('general').notNull(),
  languageCode: text('language_code').default('en').notNull(),
  status: text('status').default('ai_active').notNull(), // 'ai_active' | 'needs_human' | 'agent_assigned' | 'resolved'
  handoverReason: text('handover_reason'),
  assignedAgentUid: text('assigned_agent_uid'),
  resolvedWithoutAgent: boolean('resolved_without_agent').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 9. Messages
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  senderRole: text('sender_role').notNull(), // 'user' | 'assistant' | 'human_agent' | 'system'
  senderUid: text('sender_uid'),
  content: text('content').notNull(),
  translatedContent: text('translated_content'),
  detectedLanguage: text('detected_language'),
  confidence: real('confidence'),
  citations: jsonb('citations').$type<CitationItem[]>().default([]).notNull(),
  suggestedActions: jsonb('suggested_actions').$type<SuggestedActionItem[]>().default([]).notNull(),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 10. Feedback
export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id')
    .references(() => messages.id, { onDelete: 'cascade' })
    .notNull(),
  userUid: text('user_uid')
    .references(() => profiles.uid, { onDelete: 'cascade' })
    .notNull(),
  rating: text('rating').notNull(), // 'up' | 'down'
  reason: text('reason'),
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 11. Applications (Smart Form Filling & Status Tracker)
export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  referenceNumber: text('reference_number').notNull().unique(),
  userUid: text('user_uid')
    .references(() => profiles.uid, { onDelete: 'cascade' })
    .notNull(),
  serviceSlug: text('service_slug').notNull(),
  serviceTitle: text('service_title').notNull(),
  domain: text('domain').notNull(),
  status: text('status').default('submitted').notNull(),
  currentStep: integer('current_step').default(2).notNull(),
  totalSteps: integer('total_steps').default(4).notNull(),
  formData: jsonb('form_data').$type<Record<string, any>>().default({}).notNull(),
  autoFilledFields: jsonb('auto_filled_fields').$type<string[]>().default([]).notNull(),
  attachedDocumentIds: jsonb('attached_document_ids').$type<number[]>().default([]).notNull(),
  languageCode: text('language_code').default('en').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 12. Application Events (Timeline)
export const applicationEvents = pgTable('application_events', {
  id: serial('id').primaryKey(),
  applicationId: integer('application_id')
    .references(() => applications.id, { onDelete: 'cascade' })
    .notNull(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  actorRole: text('actor_role').default('system').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 13. Grievances
export const grievances = pgTable('grievances', {
  id: serial('id').primaryKey(),
  referenceNumber: text('reference_number').notNull().unique(),
  userUid: text('user_uid')
    .references(() => profiles.uid, { onDelete: 'cascade' })
    .notNull(),
  domain: text('domain').notNull(),
  category: text('category').notNull(),
  priority: text('priority').default('normal').notNull(),
  description: text('description').notNull(),
  translatedDescription: text('translated_description'),
  languageCode: text('language_code').default('en').notNull(),
  attachmentDocumentId: integer('attachment_document_id'),
  status: text('status').default('open').notNull(), // 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed'
  assignedToUid: text('assigned_to_uid'),
  assignedDepartment: text('assigned_department'),
  slaDueAt: timestamp('sla_due_at').notNull(),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 14. Notifications
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => profiles.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  languageCode: text('language_code').default('en').notNull(),
  channel: text('channel').default('in_app').notNull(),
  relatedEntityType: text('related_entity_type'),
  relatedEntityRef: text('related_entity_ref'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 15. Reminders
export const reminders = pgTable('reminders', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => profiles.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  notes: text('notes'),
  dueAt: timestamp('due_at').notNull(),
  channel: text('channel').default('push').notNull(),
  sourceDocumentId: integer('source_document_id'),
  isCompleted: boolean('is_completed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 16. Workflows
export const workflows = pgTable('workflows', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  domain: text('domain').default('government').notNull(),
  triggerType: text('trigger_type').notNull(), // 'application_submitted' | 'grievance_created' | 'deadline_detected' | 'manual'
  steps: jsonb('steps').$type<WorkflowStepDef[]>().default([]).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 17. Workflow Runs
export const workflowRuns = pgTable('workflow_runs', {
  id: serial('id').primaryKey(),
  workflowId: integer('workflow_id')
    .references(() => workflows.id, { onDelete: 'cascade' })
    .notNull(),
  triggerEntityType: text('trigger_entity_type').notNull(),
  triggerEntityId: text('trigger_entity_id').notNull(),
  userUid: text('user_uid'),
  status: text('status').default('running').notNull(),
  stepLogs: jsonb('step_logs').$type<WorkflowStepLog[]>().default([]).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// 18. API Integrations
export const integrations = pgTable('integrations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  adapterType: text('adapter_type').notNull(), // 'rest' | 'oauth2' | 'webhook' | 'digilocker' | 'messaging_gateway'
  domain: text('domain').default('government').notNull(),
  endpointUrl: text('endpoint_url').notNull(),
  mode: text('mode').default('sandbox').notNull(), // 'sandbox' | 'live'
  authConfigEncrypted: jsonb('auth_config_encrypted')
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  headers: jsonb('headers').$type<Record<string, string>>().default({}).notNull(),
  status: text('status').default('sandbox_ready').notNull(),
  lastTestedAt: timestamp('last_tested_at'),
  lastTestMessage: text('last_test_message'),
  lastLatencyMs: integer('last_latency_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 19. Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUid: text('actor_uid'),
  actorEmail: text('actor_email'),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: jsonb('details').$type<Record<string, any>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  roles: many(userRoles),
  documents: many(documents),
  conversations: many(conversations),
  applications: many(applications),
  grievances: many(grievances),
  notifications: many(notifications),
  reminders: many(reminders),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  owner: one(profiles, { fields: [documents.ownerUid], references: [profiles.uid] }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(profiles, { fields: [conversations.userUid], references: [profiles.uid] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  feedbackItems: many(feedback),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(profiles, { fields: [applications.userUid], references: [profiles.uid] }),
  events: many(applicationEvents),
}));

export const applicationEventsRelations = relations(applicationEvents, ({ one }) => ({
  application: one(applications, {
    fields: [applicationEvents.applicationId],
    references: [applications.id],
  }),
}));
