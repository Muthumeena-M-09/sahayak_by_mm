export interface LanguageItem {
  code: string;
  nativeName: string;
  englishName: string;
  script: string;
  direction: 'ltr' | 'rtl';
  sttSupported: boolean;
  ttsSupported: boolean;
  fontStack: string;
  localeCode: string;
  sampleGreeting: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface NotificationChannelPrefs {
  push: boolean;
  sms: boolean;
  whatsapp: boolean;
  voiceCall: boolean;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  fullName: string | null;
  isGuest: boolean;
  preferredLanguage: string;
  voiceSpeed: number;
  textSizeLevel: number;
  theme: 'light' | 'dark' | 'system';
  notificationChannels: NotificationChannelPrefs;
  consentGiven: boolean;
  consentTimestamp: string | null;
  digilockerLinked: boolean;
  digilockerAccountRef: string | null;
  isActive: boolean;
  createdAt: string;
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

export interface ServiceTemplate {
  id: number;
  slug: string;
  domain: string;
  title: string;
  description: string;
  requiredDocuments: string[];
  formSchema: ServiceFormField[];
  estimatedDays: number;
  isActive: boolean;
}

export interface CitationItem {
  sourceNumber?: number;
  sourceUrl?: string | null;
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

export interface ConversationItem {
  id: number;
  userUid: string;
  title: string;
  domain: string;
  languageCode: string;
  status: 'ai_active' | 'needs_human' | 'agent_assigned' | 'resolved';
  handoverReason: string | null;
  assignedAgentUid: string | null;
  resolvedWithoutAgent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageItem {
  id: number;
  conversationId: number;
  senderRole: 'user' | 'assistant' | 'human_agent' | 'system';
  senderUid: string | null;
  content: string;
  translatedContent: string | null;
  detectedLanguage: string | null;
  confidence: number | null;
  citations: CitationItem[];
  suggestedActions: SuggestedActionItem[];
  latencyMs: number | null;
  createdAt: string;
}

export interface ApplicationEventItem {
  id: number;
  applicationId: number;
  status: string;
  title: string;
  description: string;
  actorRole: string;
  createdAt: string;
}

export interface ApplicationItem {
  id: number;
  referenceNumber: string;
  userUid: string;
  serviceSlug: string;
  serviceTitle: string;
  domain: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  formData: Record<string, any>;
  autoFilledFields: string[];
  attachedDocumentIds: number[];
  languageCode: string;
  submittedAt: string;
  updatedAt: string;
  events: ApplicationEventItem[];
}

export interface CitizenDocumentItem {
  id: number;
  scope: string;
  title: string;
  docType: string;
  domain: string;
  languageCode: string;
  status: string;
  mimeType: string | null;
  fileSize: number | null;
  extractedMetadata: Record<string, any>;
  createdAt: string;
}

export interface GrievanceItem {
  id: number;
  referenceNumber: string;
  userUid: string;
  domain: string;
  category: string;
  priority: string;
  description: string;
  translatedDescription: string | null;
  languageCode: string;
  attachmentDocumentId: number | null;
  status: string;
  assignedToUid: string | null;
  assignedDepartment: string | null;
  slaDueAt: string;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  languageCode: string;
  channel: string;
  relatedEntityType: string | null;
  relatedEntityRef: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ReminderItem {
  id: number;
  title: string;
  notes: string | null;
  dueAt: string;
  channel: string;
  sourceDocumentId: number | null;
  isCompleted: boolean;
  createdAt: string;
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

export interface WorkflowItem {
  id: number;
  name: string;
  description: string;
  domain: string;
  triggerType: string;
  steps: WorkflowStepDef[];
  isActive: boolean;
  updatedAt: string;
}

export interface WorkflowRunItem {
  id: number;
  workflowId: number;
  triggerEntityType: string;
  triggerEntityId: string;
  status: string;
  stepLogs: Array<{
    stepId: string;
    label: string;
    status: string;
    detail: string;
    timestamp: string;
  }>;
  startedAt: string;
  completedAt: string | null;
}

export interface IntegrationItem {
  id: number;
  name: string;
  adapterType: string;
  domain: string;
  endpointUrl: string;
  mode: 'sandbox' | 'live';
  hasSecretConfigured: boolean;
  secretKeyNames: string[];
  headers: Record<string, string>;
  status: string;
  lastTestedAt: string | null;
  lastTestMessage: string | null;
  lastLatencyMs: number | null;
}

export type CitizenScreen =
  | 'centres'
  | 'home'
  | 'ask'
  | 'services'
  | 'smart_form'
  | 'explain'
  | 'status'
  | 'documents'
  | 'grievance'
  | 'notifications'
  | 'settings'
  | 'help';

export type AdminSection =
  | 'kb'
  | 'integrations'
  | 'workflows'
  | 'languages'
  | 'inbox'
  | 'grievances'
  | 'analytics'
  | 'audit'
  | 'users';
