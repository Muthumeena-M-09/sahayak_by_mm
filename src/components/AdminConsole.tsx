import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  FileUp,
  Globe,
  Headphones,
  KeyRound,
  Languages,
  Layers,
  Loader2,
  Lock,
  Mail,
  Menu,
  Play,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { fileToBase64 } from '../hooks/usePWAAndNetwork.ts';
import type {
  AdminSection,
  CitationItem,
  ConversationItem,
  GrievanceItem,
  IntegrationItem,
  LanguageItem,
  MessageItem,
  UserProfile,
  WorkflowItem,
  WorkflowRunItem,
  WorkflowStepDef,
} from '../types.ts';
import {
  DomainLabel,
  LanguagePickerSheet,
  LanguageTriggerButton,
  ResponsiveSheet,
} from './SharedUI.tsx';

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escapeCell = (val: string | number | null | undefined) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// ADMIN SIGN-IN GATE (Email + OTP or Google Sign-In, Role-Gated)
// ============================================================================
const AdminSignInGate: React.FC<{ onBackToCitizen: () => void }> = ({ onBackToCitizen }) => {
  const {
    profile,
    roles,
    currentLanguage,
    t,
    signInWithGooglePopup,
    completeOtpOrGuestSession,
    logout,
  } = useApp();

  const [email, setEmail] = useState(profile?.email || '');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Enter a valid staff or administrator email address.');
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email.trim().toLowerCase(), channel: 'email' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send verification code.');
      setOtpSent(true);
      setResendTimer(30);
      setSandboxOtp(data.sandboxVerificationCode || data.sandboxOtpPreview || null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length !== 6) {
      setErrorMsg('Enter the 6-digit verification code.');
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: email.trim().toLowerCase(),
          code: otpCode.trim(),
          channel: 'email',
          preferredLanguage: currentLanguage.code,
          consentGiven: consent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      completeOtpOrGuestSession(
        data.sessionToken || data.token,
        data.profile,
        data.roles || ['citizen']
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      await signInWithGooglePopup();
    } catch (err: any) {
      if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        setErrorMsg(
          'Firebase Auth domain is not authorized for localhost on the default project. Please use the "Email Verification Code" option below with your admin email mmuthumeenajan@gmail.com.'
        );
      } else {
        setErrorMsg(err.message || 'Google authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const signedInNonStaff = Boolean(profile && !profile.isGuest && roles.length > 0);

  return (
    <div className="min-h-screen bg-canvas text-body flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToCitizen}
          className="min-h-11 px-4 rounded-xl bg-secondary text-on-secondary border border-strong hover:bg-secondary-hover text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          <span>{t('admin.back_to_app')}</span>
        </button>
        <div className="font-display font-bold text-lg text-body">Sahayak · {t('admin.title')}</div>
      </div>

      <div className="max-w-md w-full mx-auto my-8 bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-tint text-tint-fg flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-body">Staff & Admin Sign-In</h1>
          <p className="text-sm text-muted leading-relaxed">
            Role-gated console for Administrators, Content Editors, and Support Agents.
          </p>
        </div>

        {signedInNonStaff && (
          <div className="p-4 rounded-xl bg-warm-soft border border-hairline text-sm text-body space-y-2">
            <div className="font-semibold">Role Permission Required</div>
            <p className="text-xs text-muted">
              Signed in as <span className="font-mono">{profile?.email || profile?.phone}</span> (
              {roles.join(', ')}). Sign in with an account granted{' '}
              <span className="font-mono">admin</span>,{' '}
              <span className="font-mono">content_editor</span>, or{' '}
              <span className="font-mono">support_agent</span> access.
            </p>
            <button
              type="button"
              onClick={() => logout()}
              className="text-xs font-semibold text-primary underline"
            >
              Switch account
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="w-full min-h-12 px-4 rounded-xl bg-primary text-on-primary font-semibold text-sm flex items-center justify-center gap-2.5 hover:bg-primary-hover disabled:opacity-60"
        >
          <Lock className="w-4 h-4" />
          <span>Sign in with Authorized Google Account</span>
        </button>

        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="flex-1 h-px bg-hairline" />
          <span>OR EMAIL VERIFICATION CODE</span>
          <div className="flex-1 h-px bg-hairline" />
        </div>

        {!otpSent ? (
          <form onSubmit={handleSendEmailOtp} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-body">
                  Authorized Work Email
                </label>
                <button
                  type="button"
                  onClick={() => setEmail('mmuthumeenajan@gmail.com')}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Use Admin Email
                </button>
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted absolute start-3.5 top-4 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mmuthumeenajan@gmail.com"
                  className="w-full min-h-12 ps-10 pe-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-12 rounded-xl border border-strong bg-elevated text-body font-semibold text-sm hover:bg-tint"
            >
              {busy ? 'Sending...' : 'Send 6-Digit Email OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
            {sandboxOtp && (
              <div className="p-3 rounded-xl bg-tint text-tint-fg text-xs">
                Preview Sandbox Email Code:{' '}
                <span className="font-mono font-bold tabular-nums text-sm">{sandboxOtp}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-body mb-1.5">
                6-Digit Code sent to {email}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-muted absolute start-3.5 top-4 pointer-events-none" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full min-h-12 ps-10 pe-4 rounded-xl bg-elevated border border-strong text-body font-mono tracking-widest tabular-nums"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary"
              />
              <span>I consent to administrative audit logging for all console actions.</span>
            </label>

            <button
              type="submit"
              disabled={busy || !consent}
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? 'Verifying...' : 'Verify & Open Console'}
            </button>

            <div className="flex items-center justify-between text-xs text-muted">
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode('');
                }}
                className="underline min-h-10"
              >
                Change email
              </button>
              <button
                type="button"
                disabled={resendTimer > 0 || busy}
                onClick={handleSendEmailOtp}
                className="underline disabled:opacity-50 font-mono tabular-nums min-h-10"
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="text-center text-xs text-muted">
        All administrative actions are recorded in immutable audit logs.
      </div>
    </div>
  );
};

// ============================================================================
// 1. KNOWLEDGE BASE SECTION
// ============================================================================
interface KbDocRow {
  id: number;
  title: string;
  docType: string;
  domain: string;
  languageCode: string;
  status: string;
  sourceUrl: string | null;
  fileSize: number | null;
  rawText: string | null;
  extractedMetadata?: Record<string, any> | null;
  totalChunks?: number;
  embeddedChunks?: number;
  publishedAt: string | null;
  updatedAt: string;
}

const AdminKnowledgeBaseSection: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { apiFetch, languages, formatDate, formatNumber } = useApp();
  const [docs, setDocs] = useState<KbDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Ingestion form state
  const [mode, setMode] = useState<'file' | 'text' | 'url'>('file');
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('pdf');
  const [domain, setDomain] = useState('government');
  const [languageCode, setLanguageCode] = useState('en');
  const [publishStatus, setPublishStatus] = useState<'draft' | 'in_review' | 'published'>('published');
  const [rawText, setRawText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Test in chat state
  const [testQuestion, setTestQuestion] = useState('');
  const [testLang, setTestLang] = useState('en');
  const [testingChat, setTestingChat] = useState(false);
  const [testResult, setTestResult] = useState<{
    answer: string;
    confidence: number;
    citations: CitationItem[];
  } | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const res = await apiFetch<{ documents: KbDocRow[] }>('/api/admin/kb');
      setDocs(res.documents || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load knowledge base.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Auto-refresh when any document is actively being processed by background worker
  const isAnyProcessing = useMemo(() => {
    return docs.some((d) =>
      ['fetching', 'extracting', 'chunking', 'embedding'].includes(d.status)
    );
  }, [docs]);

  useEffect(() => {
    if (!isAnyProcessing) return;
    const interval = setInterval(() => {
      loadDocs();
    }, 2500);
    return () => clearInterval(interval);
  }, [isAnyProcessing, loadDocs]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setErrorMsg(null);
    setNotice(null);

    if (!title.trim()) {
      setErrorMsg('Enter a clear document title.');
      return;
    }

    setBusy(true);
    try {
      let filePayload: { base64?: string; mimeType?: string; size?: number } = {};
      if (mode === 'file') {
        if (!selectedFile) throw new Error('Select or drop a PDF/image file.');
        const encoded = await fileToBase64(selectedFile);
        filePayload = {
          base64: encoded.base64,
          mimeType: encoded.mimeType,
          size: selectedFile.size,
        };
      } else if (mode === 'text' && !rawText.trim()) {
        throw new Error('Paste circular, FAQ, or policy content.');
      } else if (mode === 'url' && !sourceUrl.trim()) {
        throw new Error('Enter a valid public URL to ingest.');
      }

      const res = await apiFetch<{ document: KbDocRow; status: string; message?: string }>('/api/admin/kb', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          docType: mode === 'url' ? 'web_link' : docType,
          domain,
          languageCode,
          status: publishStatus,
          sourceUrl: mode === 'url' ? sourceUrl.trim() : undefined,
          rawText: mode === 'text' ? rawText.trim() : undefined,
          fileDataBase64: filePayload.base64,
          mimeType: filePayload.mimeType,
          fileSize: filePayload.size,
        }),
      });

      setTitle('');
      setRawText('');
      setSourceUrl('');
      setSelectedFile(null);
      setNotice(
        `Ingestion initiated for "${res.document.title}". Processing content and vector embeddings in background...`
      );
      await loadDocs();
    } catch (err: any) {
      setErrorMsg(err.message || 'Document ingestion failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (id: number, verifyConfiguration = false) => {
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiFetch<{ success: boolean; message: string }>(`/api/admin/kb/${id}/retry`, {
        method: 'POST',
        body: JSON.stringify({ verifyConfiguration }),
      });
      setNotice('Ingestion resumed in background. Updating live progress...');
      await loadDocs();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not resume ingestion.');
    }
  };

  const handleStatusChange = async (id: number, status: 'draft' | 'in_review' | 'published') => {
    setErrorMsg(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ document: KbDocRow; message?: string }>(
        `/api/admin/kb/${id}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ status }),
        }
      );
      setNotice(
        res.message ||
          (status === 'published'
            ? `Published "${res.document.title}" (live in citizen RAG).`
            : `Moved "${res.document.title}" to ${status.replace('_', ' ')}.`)
      );
      await loadDocs();
    } catch (err: any) {
      setErrorMsg(err.message || 'Status update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/kb/${id}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not delete document.');
    }
  };

  const handleTestChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuestion.trim()) return;
    setTestingChat(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{
        answer: string;
        confidence: number;
        citations: CitationItem[];
      }>('/api/admin/kb/test-chat', {
        method: 'POST',
        body: JSON.stringify({
          question: testQuestion.trim(),
          languageCode: testLang,
        }),
      });
      setTestResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Test query failed.');
    } finally {
      setTestingChat(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-body">Knowledge Base & Grounding</h1>
          <p className="text-sm text-muted">
            Ingest PDFs, circulars, FAQs, or web links. Strictly Published documents are embedded
            into pgvector and used to answer citizen queries with page citations.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-tint text-tint-fg border border-hairline text-sm font-medium">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Upload + Document Registry */}
        <div className="xl:col-span-7 space-y-6">
          {canEdit && (
            <form
              onSubmit={handleIngest}
              className="bg-card border border-hairline rounded-2xl p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-body">Add Official Source</h2>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-elevated border border-hairline">
                  {(
                    [
                      { id: 'file', label: 'PDF / Image' },
                      { id: 'text', label: 'FAQ / Circular Text' },
                      { id: 'url', label: 'Web Link' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`min-h-10 px-3 rounded-lg text-xs font-semibold ${
                        mode === m.id ? 'bg-primary text-on-primary' : 'text-body hover:bg-tint/40'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-body mb-1">
                    Document Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Public Distribution System Eligibility Circular 2026"
                    className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-body mb-1">Domain</label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full min-h-12 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
                  >
                    <option value="government">Government</option>
                    <option value="education">Education</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="banking">Banking</option>
                    <option value="business">Business</option>
                    <option value="customer_support">Customer Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-body mb-1">
                    Source Language
                  </label>
                  <select
                    value={languageCode}
                    onChange={(e) => setLanguageCode(e.target.value)}
                    className="w-full min-h-12 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.englishName} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-body mb-1">Source Type</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full min-h-12 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
                  >
                    <option value="pdf">Official PDF / Handbook</option>
                    <option value="circular">Department Circular</option>
                    <option value="faq">Verified FAQ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-body mb-1">
                    Initial Publication Stage
                  </label>
                  <select
                    value={publishStatus}
                    onChange={(e) => setPublishStatus(e.target.value as any)}
                    className="w-full min-h-12 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
                  >
                    <option value="draft">Draft (Not used in answers)</option>
                    <option value="in_review">In Review (Pending approval)</option>
                    <option value="published">Published (Live in RAG)</option>
                  </select>
                </div>
              </div>

              {mode === 'file' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) {
                      setSelectedFile(f);
                      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
                    }
                  }}
                  className={`p-6 rounded-2xl border-2 border-dashed text-center transition-colors ${
                    isDragging ? 'border-primary bg-tint' : 'border-strong bg-elevated'
                  }`}
                >
                  <FileUp className="w-7 h-7 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium text-body">
                    {selectedFile
                      ? `Selected: ${selectedFile.name} (${formatNumber(Math.round(selectedFile.size / 1024))} KB)`
                      : 'Drag and drop a PDF or scanned circular image here, or browse'}
                  </p>
                  <label className="mt-3 min-h-11 px-4 rounded-xl bg-tint text-tint-fg text-xs font-semibold inline-flex items-center cursor-pointer">
                    <span>Choose File</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setSelectedFile(f);
                          if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
                        }
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
              )}

              {mode === 'text' && (
                <textarea
                  rows={5}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste full circular text, eligibility criteria, required documents, and step-by-step instructions..."
                  className="w-full p-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
                />
              )}

              {mode === 'url' && (
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://example.gov.in/circular-2026"
                  className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm font-mono"
                />
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover disabled:opacity-60"
              >
                {busy
                  ? 'Initiating Ingestion...'
                  : publishStatus === 'published'
                    ? 'Ingest & Publish to Knowledge Base'
                    : 'Save Document'}
              </button>
            </form>
          )}

          {/* Document Table */}
          <div className="bg-card border border-hairline rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-body">
                  Repository ({formatNumber(docs.length)})
                </h2>
                {isAnyProcessing && (
                  <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Live processing...
                  </span>
                )}
              </div>
              <span className="text-xs text-muted">
                Published: {formatNumber(docs.filter((d) => d.status === 'published').length)}
              </span>
            </div>

            {loading ? (
              <div className="p-6 text-sm text-muted flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading documents...
              </div>
            ) : docs.length === 0 ? (
              <div className="p-8 text-sm text-muted">
                Knowledge base is currently empty. Upload or paste an official document above and
                publish it so citizens receive grounded, cited answers.
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {docs.map((doc) => {
                  const isProcessing = ['fetching', 'extracting', 'chunking', 'embedding'].includes(doc.status);
                  const canRetry = doc.status !== 'failed_permanent' && (doc.status === 'failed_retryable' || (!isProcessing && (doc.totalChunks || 0) > (doc.embeddedChunks || 0)));
                  const charCount = doc.extractedMetadata?.characterCount || doc.rawText?.length || 0;

                  return (
                    <div key={doc.id} className="p-5 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="font-semibold text-base text-body">{doc.title}</div>
                          <div className="text-xs text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                            <DomainLabel domain={doc.domain} />
                            <span>·</span>
                            <span>{doc.docType.toUpperCase()}</span>
                            <span>·</span>
                            <span>Lang: <span className="font-mono">{doc.languageCode.toUpperCase()}</span></span>
                            <span>·</span>
                            <span>Updated <span className="font-mono tabular-nums">{formatDate(doc.updatedAt)}</span></span>
                            {charCount > 0 && (
                              <>
                                <span>·</span>
                                <span className="font-mono">{formatNumber(charCount)} chars</span>
                              </>
                            )}
                            {doc.totalChunks !== undefined && doc.totalChunks > 0 && (
                              <>
                                <span>·</span>
                                <span className={`font-mono font-medium ${doc.embeddedChunks === doc.totalChunks ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`}>
                                  Vectors: {doc.embeddedChunks || 0} / {doc.totalChunks} chunks
                                </span>
                              </>
                            )}
                          </div>
                          {doc.sourceUrl && (
                            <div className="text-xs">
                              <a
                                href={doc.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono break-all inline-flex items-center gap-1"
                              >
                                {doc.sourceUrl}
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {isProcessing ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {doc.status === 'fetching'
                                ? 'Fetching URL...'
                                : doc.status === 'extracting'
                                ? 'Extracting Text...'
                                : doc.status === 'chunking'
                                ? 'Chunking Content...'
                                : `Embedding (${doc.embeddedChunks || 0}/${doc.totalChunks || 0})...`}
                            </span>
                          ) : doc.status === 'published' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Published
                            </span>
                          ) : doc.status === 'stored' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                              <Check className="w-3.5 h-3.5" />
                              Stored
                            </span>
                          ) : doc.status === 'failed_retryable' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Failed (Retryable)
                            </span>
                          ) : doc.status === 'failed_permanent' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-elevated border border-hairline text-body">
                              {doc.status.replace('_', ' ').toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Error or Stage Failure Alert Banner */}
                      {doc.extractedMetadata?.lastError && (
                        <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger font-medium flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="flex-1 break-words">
                            {String(doc.extractedMetadata.lastError)}
                          </div>
                        </div>
                      )}

                      {canEdit && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {doc.status === 'failed_permanent' && doc.extractedMetadata?.embeddingError?.category === 'MODEL_CONFIGURATION_ERROR' && (
                              <button type="button" disabled={busy || isProcessing} onClick={() => handleRetry(doc.id, true)}
                                className="min-h-10 px-3 rounded-lg text-xs font-semibold border border-hairline">
                                Verify configuration and resume
                              </button>
                            )}
                            {canRetry && (
                              <button
                                type="button"
                                disabled={busy || isProcessing}
                                onClick={() => handleRetry(doc.id)}
                                className="min-h-10 px-3.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Resume / Retry Ingestion
                              </button>
                            )}

                            {(['draft', 'in_review', 'published'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                disabled={busy || isProcessing || doc.status === st || doc.status === 'failed_permanent' || (st !== 'draft' && (!(doc.totalChunks || 0) || doc.totalChunks !== doc.embeddedChunks)) || (st === 'published' && doc.status !== 'in_review')}
                                onClick={() => handleStatusChange(doc.id, st)}
                                className={`min-h-10 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                                  doc.status === st
                                    ? 'bg-primary text-on-primary border-primary'
                                    : 'bg-elevated border-hairline text-body hover:bg-tint disabled:opacity-50'
                                }`}
                              >
                                {st === 'published'
                                  ? 'Publish'
                                  : st === 'in_review'
                                    ? 'In Review'
                                    : 'Draft'}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDelete(doc.id)}
                            aria-label={`Delete ${doc.title}`}
                            className="min-h-10 min-w-10 rounded-lg border border-hairline text-danger hover:bg-danger-soft flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 cols: Test in Chat Panel */}
        <div className="xl:col-span-5 bg-card border border-hairline rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-body">Test in Chat</h2>
            <p className="text-xs text-muted mt-0.5">
              Verify cross-lingual retrieval and citations strictly against Published documents.
            </p>
          </div>

          <form onSubmit={handleTestChat} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Reply Language</label>
              <select
                value={testLang}
                onChange={(e) => setTestLang(e.target.value)}
                className="w-full min-h-11 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.englishName} ({l.nativeName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Test Question</label>
              <textarea
                rows={3}
                value={testQuestion}
                onChange={(e) => setTestQuestion(e.target.value)}
                placeholder="Ask a question in any language to verify grounding..."
                className="w-full p-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={testingChat || !canEdit}
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              <span>{testingChat ? 'Running RAG Query...' : 'Run Grounded Test'}</span>
            </button>
          </form>

          {testResult && (
            <div className="pt-4 border-t border-hairline space-y-3">
              <div className="flex items-center justify-between text-xs text-muted font-mono tabular-nums">
                <span>Confidence Score</span>
                <span className="font-bold text-body">
                  {Math.round((testResult.confidence || 0) * 100)}%
                </span>
              </div>
              <div className="p-4 rounded-xl bg-tint text-tint-fg text-sm whitespace-pre-wrap leading-relaxed">
                {testResult.answer}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-body">
                  Citations ({formatNumber(testResult.citations.length)})
                </div>
                {testResult.citations.length === 0 ? (
                  <p className="text-xs text-muted">No published chunks matched this query.</p>
                ) : (
                  testResult.citations.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-elevated border border-hairline text-xs space-y-1"
                    >
                      <div className="font-semibold text-body">
                        {c.documentTitle} · <span className="font-mono">p.{c.pageNumber}</span>
                      </div>
                      <p className="text-muted">{c.snippet}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. API INTEGRATIONS SECTION
// ============================================================================
const AdminIntegrationsSection: React.FC = () => {
  const { apiFetch, formatDate, formatNumber } = useApp();
  const [items, setItems] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<number | 'all' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [adapterType, setAdapterType] = useState('rest');
  const [domain, setDomain] = useState('government');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [mode, setMode] = useState<'sandbox' | 'live'>('sandbox');
  const [bearerToken, setBearerToken] = useState('');
  const [apiKey, setApiKey] = useState('');

  const loadIntegrations = useCallback(async () => {
    try {
      const res = await apiFetch<{ integrations: IntegrationItem[] }>('/api/admin/integrations');
      setItems(res.integrations || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load integrations.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const secretValues: Record<string, string> = {};
      if (bearerToken.trim()) secretValues.bearerToken = bearerToken.trim();
      if (apiKey.trim()) secretValues.apiKey = apiKey.trim();

      const res = await apiFetch<{ integrations: IntegrationItem[] }>('/api/admin/integrations', {
        method: 'POST',
        body: JSON.stringify({
          id: editingId || undefined,
          name: name.trim(),
          adapterType,
          domain,
          endpointUrl: endpointUrl.trim(),
          mode,
          secretValues: Object.keys(secretValues).length > 0 ? secretValues : undefined,
        }),
      });
      setItems(res.integrations || []);
      setEditingId(null);
      setName('');
      setEndpointUrl('');
      setBearerToken('');
      setApiKey('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save connector.');
    }
  };

  const handleTestSingle = async (id: number) => {
    setTestingId(id);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/integrations/${id}/test`, { method: 'POST' });
      await loadIntegrations();
    } catch (err: any) {
      setErrorMsg(err.message || 'Connector test failed.');
    } finally {
      setTestingId(null);
    }
  };

  const handleTestAll = async () => {
    setTestingId('all');
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ integrations: IntegrationItem[] }>(
        '/api/admin/integrations/test-all',
        { method: 'POST' }
      );
      setItems(res.integrations || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Batch test failed.');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-body">API Integrations & Adapters</h1>
          <p className="text-sm text-muted">
            Configure REST, OAuth2, and Webhook service adapters. Credentials are stored strictly
            server-side and never returned to the browser.
          </p>
        </div>

        <button
          type="button"
          onClick={handleTestAll}
          disabled={testingId !== null || items.length === 0}
          className="min-h-12 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center gap-2 hover:bg-primary-hover disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${testingId === 'all' ? 'animate-spin' : ''}`} />
          <span>{testingId === 'all' ? 'Testing All...' : 'Test All Connectors'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 bg-card border border-hairline rounded-2xl divide-y divide-hairline">
          {loading ? (
            <div className="p-6 text-sm text-muted">Loading connectors...</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-base text-body">{item.name}</div>
                    <div className="text-xs text-muted font-mono mt-0.5 break-all">
                      {item.adapterType.toUpperCase()} · {item.mode.toUpperCase()} ·{' '}
                      {item.endpointUrl}
                    </div>
                  </div>
                  <div className="text-xs font-mono tabular-nums font-semibold text-body">
                    {item.status.toUpperCase()}
                    {item.lastLatencyMs ? ` · ${formatNumber(item.lastLatencyMs)}ms` : ''}
                  </div>
                </div>

                <div className="text-xs text-muted">
                  Server-side secrets:{' '}
                  {item.hasSecretConfigured
                    ? `Configured (${item.secretKeyNames.join(', ')})`
                    : 'None stored'}{' '}
                  {item.lastTestedAt ? `· Last tested ${formatDate(item.lastTestedAt)}` : ''}
                </div>

                {item.lastTestMessage && (
                  <div className="p-3 rounded-xl bg-elevated border border-hairline text-xs text-body">
                    {item.lastTestMessage}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleTestSingle(item.id)}
                    disabled={testingId !== null}
                    className="min-h-10 px-4 rounded-xl bg-tint text-tint-fg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{testingId === item.id ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(item.id);
                      setName(item.name);
                      setAdapterType(item.adapterType);
                      setDomain(item.domain);
                      setEndpointUrl(item.endpointUrl);
                      setMode(item.mode);
                      setBearerToken('');
                      setApiKey('');
                    }}
                    className="min-h-10 px-3.5 rounded-xl border border-hairline bg-elevated text-body text-xs font-medium"
                  >
                    Edit Adapter
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={handleSave}
          className="xl:col-span-5 bg-card border border-hairline rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-body">
              {editingId ? 'Edit Connector' : 'Add Connector'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                  setEndpointUrl('');
                }}
                className="text-xs text-primary underline"
              >
                New instead
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Connector Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., State Scholarship Portal API"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Protocol</label>
              <select
                value={adapterType}
                onChange={(e) => setAdapterType(e.target.value)}
                className="w-full min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm"
              >
                <option value="rest">REST JSON</option>
                <option value="oauth2">OAuth2 Client</option>
                <option value="webhook">Outbound Webhook</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Adapter Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'sandbox' | 'live')}
                className="w-full min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm"
              >
                <option value="sandbox">Sandbox Adapter</option>
                <option value="live">Live Production HTTP</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Domain</label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm"
            >
              <option value="government">Government</option>
              <option value="education">Education</option>
              <option value="healthcare">Healthcare</option>
              <option value="banking">Banking</option>
              <option value="business">Business</option>
              <option value="customer_support">Customer Support</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Endpoint URL *</label>
            <input
              type="url"
              required
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://api.department.gov.in/v1/dispatch"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm font-mono"
            />
          </div>

          <div className="p-4 rounded-xl bg-elevated border border-hairline space-y-3">
            <div className="text-xs font-semibold text-body">
              Write-Only Server Credentials (Encrypted at rest, never echoed)
            </div>
            <input
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              placeholder="Bearer / OAuth Access Token (optional)"
              className="w-full min-h-11 px-3.5 rounded-lg bg-card border border-hairline text-body text-xs font-mono"
            />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="X-API-Key Header Secret (optional)"
              className="w-full min-h-11 px-3.5 rounded-lg bg-card border border-hairline text-body text-xs font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover"
          >
            {editingId ? 'Update Connector' : 'Save Connector'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 3. WORKFLOWS SECTION (Visual Step Builder + Live Run Logs)
// ============================================================================
const STEP_CATALOG: Array<{ type: WorkflowStepDef['type']; defaultLabel: string }> = [
  { type: 'collect_details', defaultLabel: 'Collect & Validate Structured Details' },
  { type: 'verify_documents', defaultLabel: 'Verify Attached Citizen Documents' },
  { type: 'send_to_office', defaultLabel: 'Dispatch Payload via Office Adapter' },
  { type: 'notify_user', defaultLabel: 'Send Multilingual Citizen Notification' },
  { type: 'set_reminder', defaultLabel: 'Schedule Follow-Up / Deadline Reminder' },
  { type: 'route_grievance', defaultLabel: 'Assign SLA & Route to Resolution Desk' },
];

const AdminWorkflowsSection: React.FC = () => {
  const { apiFetch, formatDate } = useApp();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [runs, setRuns] = useState<WorkflowRunItem[]>([]);
  const [selectedWfId, setSelectedWfId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('government');
  const [triggerType, setTriggerType] = useState('application_submitted');
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<WorkflowStepDef[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await apiFetch<{ workflows: WorkflowItem[]; runs: WorkflowRunItem[] }>(
        '/api/admin/workflows'
      );
      const list = res.workflows || [];
      setWorkflows(list);
      setRuns(res.runs || []);
      if (list.length > 0 && selectedWfId === null) {
        const first = list[0];
        setSelectedWfId(first.id);
        setName(first.name);
        setDescription(first.description);
        setDomain(first.domain);
        setTriggerType(first.triggerType);
        setIsActive(first.isActive);
        setSteps(first.steps || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load workflows.');
    }
  }, [apiFetch, selectedWfId]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const selectWorkflowForEdit = (wf: WorkflowItem) => {
    setSelectedWfId(wf.id);
    setName(wf.name);
    setDescription(wf.description);
    setDomain(wf.domain);
    setTriggerType(wf.triggerType);
    setIsActive(wf.isActive);
    setSteps(wf.steps || []);
  };

  const startNewWorkflow = () => {
    setSelectedWfId(0);
    setName('');
    setDescription('');
    setDomain('government');
    setTriggerType('application_submitted');
    setIsActive(true);
    setSteps([
      {
        id: `step_${Date.now()}`,
        type: 'verify_documents',
        label: 'Verify Attached Citizen Documents',
        config: {},
      },
      {
        id: `step_${Date.now() + 1}`,
        type: 'notify_user',
        label: 'Send Multilingual Citizen Notification',
        config: { channel: 'push' },
      },
    ]);
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const copy = [...steps];
    const [removed] = copy.splice(idx, 1);
    copy.splice(target, 0, removed);
    setSteps(copy);
  };

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ workflows: WorkflowItem[]; runs: WorkflowRunItem[] }>(
        '/api/admin/workflows',
        {
          method: 'POST',
          body: JSON.stringify({
            id: selectedWfId && selectedWfId > 0 ? selectedWfId : undefined,
            name: name.trim(),
            description: description.trim(),
            domain,
            triggerType,
            steps,
            isActive,
          }),
        }
      );
      setWorkflows(res.workflows || []);
      setRuns(res.runs || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save workflow.');
    } finally {
      setBusy(false);
    }
  };

  const handleManualRun = async (id: number) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ workflows: WorkflowItem[]; runs: WorkflowRunItem[] }>(
        `/api/admin/workflows/${id}/trigger`,
        { method: 'POST' }
      );
      setWorkflows(res.workflows || []);
      setRuns(res.runs || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Manual workflow execution failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-body">Service Automation Workflows</h1>
          <p className="text-sm text-muted">
            Design multi-step automated pipelines triggered when citizens submit forms, file
            grievances, or scan deadline notices.
          </p>
        </div>

        <button
          type="button"
          onClick={startNewWorkflow}
          className="min-h-12 px-4 rounded-xl bg-tint text-tint-fg text-sm font-semibold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Workflow</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 4 cols: Workflow List */}
        <div className="xl:col-span-4 bg-card border border-hairline rounded-2xl divide-y divide-hairline">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className={`p-4 space-y-2 ${
                selectedWfId === wf.id ? 'bg-tint text-tint-fg' : 'text-body'
              }`}
            >
              <button
                type="button"
                onClick={() => selectWorkflowForEdit(wf)}
                className="w-full text-start"
              >
                <div className="font-semibold text-base">{wf.name}</div>
                <div className="text-xs text-muted mt-0.5 font-mono">
                  Trigger: {wf.triggerType} · {wf.steps.length} steps ·{' '}
                  {wf.isActive ? 'ACTIVE' : 'PAUSED'}
                </div>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleManualRun(wf.id)}
                className="min-h-9 px-3 rounded-lg border border-hairline bg-card text-body text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-elevated"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute Test Run</span>
              </button>
            </div>
          ))}
        </div>

        {/* Center/Right 8 cols: Visual Step Builder + Execution Logs */}
        <div className="xl:col-span-8 space-y-6">
          <form
            onSubmit={handleSaveWorkflow}
            className="bg-card border border-hairline rounded-2xl p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-body">
                {selectedWfId && selectedWfId > 0 ? 'Visual Workflow Builder' : 'Create Workflow'}
              </h2>
              <label className="flex items-center gap-2 text-sm font-medium text-body cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span>Active</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-body mb-1">Workflow Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Citizen Application Verification & Dispatch"
                  className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body mb-1">Trigger Event</label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm"
                >
                  <option value="application_submitted">Application Submitted</option>
                  <option value="grievance_filed">Grievance Filed</option>
                  <option value="deadline_detected">Letter Deadline Detected</option>
                </select>
              </div>
            </div>

            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief operational description..."
              className="w-full min-h-11 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />

            {/* Ordered Visual Pipeline Steps */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-body uppercase tracking-wider">
                Pipeline Steps ({steps.length})
              </div>
              {steps.map((st, idx) => (
                <div
                  key={st.id}
                  className="p-4 rounded-xl bg-elevated border border-hairline flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                    <span className="w-7 h-7 rounded-lg bg-primary text-on-primary font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        value={st.label}
                        onChange={(e) => {
                          const next = [...steps];
                          next[idx] = { ...st, label: e.target.value };
                          setSteps(next);
                        }}
                        className="w-full min-h-10 px-3 rounded-lg bg-card border border-hairline text-body text-sm font-medium"
                      />
                      <div className="text-xs text-muted font-mono">Action: {st.type}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveStep(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Move step up"
                      className="min-h-10 min-w-10 rounded-lg border border-hairline bg-card text-body flex items-center justify-center disabled:opacity-40"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === steps.length - 1}
                      aria-label="Move step down"
                      className="min-h-10 min-w-10 rounded-lg border border-hairline bg-card text-body flex items-center justify-center disabled:opacity-40"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                      aria-label="Remove step"
                      className="min-h-10 min-w-10 rounded-lg border border-hairline bg-card text-danger flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-2">
                {STEP_CATALOG.map((cat) => (
                  <button
                    key={cat.type}
                    type="button"
                    onClick={() =>
                      setSteps([
                        ...steps,
                        {
                          id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                          type: cat.type,
                          label: cat.defaultLabel,
                          config: {},
                        },
                      ])
                    }
                    className="min-h-10 px-3 rounded-xl border border-hairline bg-elevated text-body text-xs font-medium hover:bg-tint"
                  >
                    + {cat.type.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover"
            >
              {busy ? 'Saving...' : 'Save Workflow Definition'}
            </button>
          </form>

          {/* Execution Run Logs */}
          <div className="bg-card border border-hairline rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-body">
              Recent Execution Runs ({runs.length})
            </h3>
            {runs.length === 0 ? (
              <p className="text-sm text-muted">
                No workflow runs recorded yet. Submit an application/grievance or click Execute Test
                Run on any workflow.
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {runs.slice(0, 12).map((run) => (
                  <div
                    key={run.id}
                    className="p-4 rounded-xl bg-elevated border border-hairline space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                      <span className="font-semibold text-body">
                        Run #{run.id} · {run.triggerEntityType} ({run.triggerEntityId})
                      </span>
                      <span className="text-muted">
                        {run.status.toUpperCase()} · {formatDate(run.startedAt)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {run.stepLogs.map((lg, i) => (
                        <div key={i} className="text-xs text-muted flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          <span>
                            <strong className="text-body">{lg.label}:</strong> {lg.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. LANGUAGES, UI TRANSLATION OVERRIDES & PER-ORG GLOSSARY
// ============================================================================
const AdminLanguagesSection: React.FC = () => {
  const { apiFetch, refreshLanguages, formatNumber } = useApp();
  const [subTab, setSubTab] = useState<'registry' | 'strings' | 'glossary'>('registry');
  const [allLangs, setAllLangs] = useState<LanguageItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add runtime language form
  const [newCode, setNewCode] = useState('');
  const [newNative, setNewNative] = useState('');
  const [newEnglish, setNewEnglish] = useState('');
  const [newScript, setNewScript] = useState('Devanagari');
  const [newDir, setNewDir] = useState<'ltr' | 'rtl'>('ltr');
  const [newGreeting, setNewGreeting] = useState('');

  // UI Translation Override state
  const [inspectLang, setInspectLang] = useState('hi');
  const [translations, setTranslations] = useState<
    Array<{
      translationKey: string;
      translatedValue: string;
      isAutoTranslated: boolean;
    }>
  >([]);
  const [sourceDefaults, setSourceDefaults] = useState<Record<string, string>>({});
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [loadingStrings, setLoadingStrings] = useState(false);

  // Glossary state
  const [glossary, setGlossary] = useState<
    Array<{
      id: number;
      sourceTerm: string;
      languageCode: string;
      targetTerm: string;
      domain: string;
    }>
  >([]);
  const [gSource, setGSource] = useState('');
  const [gLang, setGLang] = useState('hi');
  const [gTarget, setGTarget] = useState('');
  const [gDomain, setGDomain] = useState('general');

  const loadAllLangs = useCallback(async () => {
    try {
      const res = await apiFetch<{ languages: LanguageItem[] }>('/api/admin/languages');
      setAllLangs(res.languages || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load language registry.');
    }
  }, [apiFetch]);

  const loadGlossary = useCallback(async () => {
    try {
      const res = await apiFetch<{ glossary: any[] }>('/api/admin/glossary');
      setGlossary(res.glossary || []);
    } catch {
      // ignore
    }
  }, [apiFetch]);

  const loadTranslationsForLang = useCallback(
    async (code: string, triggerAutoTranslateFirst = false) => {
      setLoadingStrings(true);
      try {
        if (triggerAutoTranslateFirst) {
          await fetch(`/api/public/i18n/${encodeURIComponent(code)}`);
        }
        const res = await apiFetch<{
          translations: any[];
          sourceDefaults: Record<string, string>;
        }>(`/api/admin/languages/${encodeURIComponent(code)}/translations`);
        setTranslations(res.translations || []);
        setSourceDefaults(res.sourceDefaults || {});
        const map: Record<string, string> = {};
        for (const row of res.translations || []) {
          map[row.translationKey] = row.translatedValue;
        }
        setDraftValues(map);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to load translations.');
      } finally {
        setLoadingStrings(false);
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    loadAllLangs();
    loadGlossary();
  }, [loadAllLangs, loadGlossary]);

  useEffect(() => {
    if (subTab === 'strings') {
      loadTranslationsForLang(inspectLang, false);
    }
  }, [subTab, inspectLang, loadTranslationsForLang]);

  const toggleLanguageEnabled = async (lang: LanguageItem) => {
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ languages: LanguageItem[] }>('/api/admin/languages', {
        method: 'POST',
        body: JSON.stringify({
          ...lang,
          isEnabled: !lang.isEnabled,
        }),
      });
      setAllLangs(res.languages || []);
      await refreshLanguages();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle language.');
    }
  };

  const handleAddRuntimeLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ languages: LanguageItem[] }>('/api/admin/languages', {
        method: 'POST',
        body: JSON.stringify({
          code: newCode.trim().toLowerCase(),
          nativeName: newNative.trim(),
          englishName: newEnglish.trim(),
          script: newScript.trim(),
          direction: newDir,
          localeCode: `${newCode.trim().toLowerCase()}-IN`,
          sampleGreeting: newGreeting.trim() || `Welcome to Sahayak (${newEnglish.trim()})`,
          isEnabled: true,
          sttSupported: true,
          ttsSupported: true,
        }),
      });
      setAllLangs(res.languages || []);
      await refreshLanguages();
      setNewCode('');
      setNewNative('');
      setNewEnglish('');
      setNewGreeting('');
      setNotice('Runtime language added and immediately enabled across Citizen App.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not add language.');
    }
  };

  const handleSaveOverride = async (key: string) => {
    const val = draftValues[key];
    if (val === undefined) return;
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ translations: any[] }>(
        `/api/admin/languages/${encodeURIComponent(inspectLang)}/translations`,
        {
          method: 'PATCH',
          body: JSON.stringify({ key, value: val }),
        }
      );
      setTranslations(res.translations || []);
      setNotice(`Saved verified override for "${key}" in ${inspectLang.toUpperCase()}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Override save failed.');
    }
  };

  const handleAddGlossary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gSource.trim() || !gTarget.trim()) return;
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ glossary: any[] }>('/api/admin/glossary', {
        method: 'POST',
        body: JSON.stringify({
          sourceTerm: gSource.trim(),
          languageCode: gLang,
          targetTerm: gTarget.trim(),
          domain: gDomain,
        }),
      });
      setGlossary(res.glossary || []);
      setGSource('');
      setGTarget('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add glossary term.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-body">
            Languages, i18n Overrides & Glossary
          </h1>
          <p className="text-sm text-muted">
            Manage all 22 scheduled Indian languages + English, add new languages at runtime,
            override AI UI strings, and enforce terminology.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-hairline">
          {(
            [
              { id: 'registry', label: `Registry (${formatNumber(allLangs.length)})` },
              { id: 'strings', label: 'UI String Overrides' },
              { id: 'glossary', label: `Org Glossary (${formatNumber(glossary.length)})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-11 px-3.5 rounded-lg text-xs font-semibold ${
                subTab === tab.id ? 'bg-primary text-on-primary' : 'text-body hover:bg-tint/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-tint text-tint-fg border border-hairline text-sm">
          {notice}
        </div>
      )}

      {subTab === 'registry' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8 bg-card border border-hairline rounded-2xl divide-y divide-hairline">
            {allLangs.map((l) => (
              <div key={l.code} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-base text-body">
                    <span style={{ fontFamily: l.fontStack }}>{l.nativeName}</span> ·{' '}
                    {l.englishName}
                  </div>
                  <div className="text-xs text-muted font-mono mt-0.5">
                    BCP-47: {l.code} · Script: {l.script} · Dir: {l.direction.toUpperCase()} ·
                    Locale: {l.localeCode}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={l.code === 'en'}
                  onClick={() => toggleLanguageEnabled(l)}
                  className={`min-h-10 px-4 rounded-xl text-xs font-semibold border ${
                    l.isEnabled
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-elevated text-muted border-hairline'
                  } disabled:opacity-50`}
                >
                  {l.isEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddRuntimeLanguage}
            className="xl:col-span-4 bg-card border border-hairline rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-body">Add Language at Runtime</h2>
            <input
              type="text"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="BCP-47 Code (e.g., tcy, bho)"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm font-mono"
            />
            <input
              type="text"
              required
              value={newNative}
              onChange={(e) => setNewNative(e.target.value)}
              placeholder="Native Script Name (e.g., ತುಳು / भोजपुरी)"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
            <input
              type="text"
              required
              value={newEnglish}
              onChange={(e) => setNewEnglish(e.target.value)}
              placeholder="English Name (e.g., Tulu / Bhojpuri)"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={newScript}
                onChange={(e) => setNewScript(e.target.value)}
                placeholder="Script (e.g., Kannada)"
                className="w-full min-h-12 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
              />
              <select
                value={newDir}
                onChange={(e) => setNewDir(e.target.value as 'ltr' | 'rtl')}
                className="w-full min-h-12 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
              >
                <option value="ltr">LTR (Left-to-Right)</option>
                <option value="rtl">RTL (Right-to-Left)</option>
              </select>
            </div>
            <input
              type="text"
              value={newGreeting}
              onChange={(e) => setNewGreeting(e.target.value)}
              placeholder="Sample TTS Greeting in Native Script"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
            <button
              type="submit"
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover"
            >
              Add & Enable Language
            </button>
          </form>
        </div>
      )}

      {subTab === 'strings' && (
        <div className="bg-card border border-hairline rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-body">Target Language:</label>
              <select
                value={inspectLang}
                onChange={(e) => setInspectLang(e.target.value)}
                className="min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
              >
                {allLangs
                  .filter((l) => l.code !== 'en')
                  .map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.englishName} ({l.nativeName})
                    </option>
                  ))}
              </select>
            </div>

            <button
              type="button"
              disabled={loadingStrings}
              onClick={() => loadTranslationsForLang(inspectLang, true)}
              className="min-h-11 px-4 rounded-xl bg-tint text-tint-fg text-xs font-semibold flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStrings ? 'animate-spin' : ''}`} />
              <span>Auto-Translate Missing Keys via AI & Refresh</span>
            </button>
          </div>

          <div className="divide-y divide-hairline">
            {Object.entries(sourceDefaults).map(([key, enVal]) => {
              const row = translations.find((r) => r.translationKey === key);
              return (
                <div
                  key={key}
                  className="py-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                >
                  <div className="md:col-span-4">
                    <div className="font-mono text-xs text-muted">{key}</div>
                    <div className="text-sm text-body font-medium">{enVal}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {row
                        ? row.isAutoTranslated
                          ? 'AI Auto-Translated (Cached)'
                          : 'Admin Verified Override'
                        : 'Not cached yet'}
                    </div>
                  </div>
                  <div className="md:col-span-6">
                    <input
                      type="text"
                      value={draftValues[key] ?? ''}
                      onChange={(e) =>
                        setDraftValues((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder="Enter or edit translation..."
                      className="w-full min-h-11 px-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSaveOverride(key)}
                      className="min-h-10 px-4 rounded-xl bg-primary text-on-primary text-xs font-semibold"
                    >
                      Save Override
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'glossary' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 bg-card border border-hairline rounded-2xl divide-y divide-hairline">
            {glossary.length === 0 ? (
              <div className="p-8 text-sm text-muted">
                No mandatory glossary rules defined yet. Add terms on the right so AI answers and UI
                translations always use approved terminology.
              </div>
            ) : (
              glossary.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-body">
                      "{item.sourceTerm}" → "{item.targetTerm}"
                    </div>
                    <div className="text-xs text-muted font-mono">
                      Language: {item.languageCode.toUpperCase()} · Domain: {item.domain}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/glossary/${item.id}`, { method: 'DELETE' });
                      loadGlossary();
                    }}
                    aria-label="Delete glossary term"
                    className="min-h-10 min-w-10 rounded-lg border border-hairline text-danger flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleAddGlossary}
            className="xl:col-span-5 bg-card border border-hairline rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-body">Add Glossary Rule</h2>
            <input
              type="text"
              required
              value={gSource}
              onChange={(e) => setGSource(e.target.value)}
              placeholder="Source Term in English (e.g., grievance)"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
            <select
              value={gLang}
              onChange={(e) => setGLang(e.target.value)}
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            >
              {allLangs.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.englishName} ({l.nativeName})
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              value={gTarget}
              onChange={(e) => setGTarget(e.target.value)}
              placeholder="Approved Target Term in Native Script"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
            <select
              value={gDomain}
              onChange={(e) => setGDomain(e.target.value)}
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            >
              <option value="general">All Domains</option>
              <option value="government">Government</option>
              <option value="healthcare">Healthcare</option>
              <option value="banking">Banking</option>
              <option value="education">Education</option>
            </select>
            <button
              type="submit"
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm"
            >
              Save Mandatory Term
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 5. HUMAN INBOX SECTION (Bidirectional AI Translation + Live WebSocket)
// ============================================================================
interface InboxRow {
  conversation: ConversationItem;
  userFullName: string | null;
  userPhone: string | null;
  userEmail: string | null;
}

const AdminHumanInboxSection: React.FC = () => {
  const { apiFetch, subscribeRealtime, formatDate } = useApp();
  const [items, setItems] = useState<InboxRow[]>([]);
  const [selected, setSelected] = useState<InboxRow | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [replyText, setReplyText] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [sending, setSending] = useState(false);

  const loadInbox = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: InboxRow[] }>('/api/admin/inbox');
      const list = res.items || [];
      setItems(list);
      if (list.length > 0 && !selected) {
        setSelected(list[0]);
      }
    } catch {
      // ignore
    }
  }, [apiFetch, selected]);

  const loadThread = useCallback(
    async (convId: number) => {
      try {
        const res = await apiFetch<{ messages: MessageItem[] }>(
          `/api/admin/inbox/${convId}/messages`
        );
        setMessages(res.messages || []);
      } catch {
        // ignore
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (selected?.conversation.id) {
      loadThread(selected.conversation.id);
    }
  }, [selected?.conversation.id, loadThread]);

  useEffect(() => {
    return subscribeRealtime((evt) => {
      if (evt.type === 'conversation:updated' || evt.type === 'message:created') {
        loadInbox();
        if (selected?.conversation.id) {
          loadThread(selected.conversation.id);
        }
      }
    });
  }, [subscribeRealtime, loadInbox, loadThread, selected?.conversation.id]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch<{ message: MessageItem }>(
        `/api/admin/inbox/${selected.conversation.id}/reply`,
        {
          method: 'POST',
          body: JSON.stringify({
            replyText: replyText.trim(),
            autoTranslateToUserLang: autoTranslate,
          }),
        }
      );
      setMessages((prev) => [...prev, res.message]);
      setReplyText('');
      loadInbox();
    } finally {
      setSending(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!selected) return;
    const res = await apiFetch<{ conversation: ConversationItem }>(
      `/api/admin/inbox/${selected.conversation.id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      }
    );
    setSelected({ ...selected, conversation: res.conversation });
    loadInbox();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-body">Human Support Inbox</h1>
        <p className="text-sm text-muted">
          Live handover queue for low-confidence queries, disputes, and citizen agent requests—with
          automatic bidirectional translation.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-hairline text-sm text-muted">
          No escalated conversations in the human queue right now. When a citizen taps "Talk to a
          human" or a query triggers low-confidence handover, it appears here live.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <div className="md:col-span-4 bg-card border border-hairline rounded-2xl divide-y divide-hairline overflow-hidden">
            {items.map((row) => {
              const c = row.conversation;
              const isSel = selected?.conversation.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(row)}
                  className={`w-full p-4 text-start transition-colors ${
                    isSel ? 'bg-tint text-tint-fg' : 'text-body hover:bg-tint/30'
                  }`}
                >
                  <div className="font-semibold text-sm truncate">{c.title}</div>
                  <div className="text-xs text-muted mt-1">
                    {row.userFullName || row.userPhone || row.userEmail || 'Citizen Session'} ·
                    Lang: <span className="font-mono">{c.languageCode.toUpperCase()}</span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-muted mt-0.5">
                    {c.status.replace(/_/g, ' ')}
                    {c.handoverReason ? ` · ${c.handoverReason}` : ''} · {formatDate(c.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="md:col-span-8 bg-card border border-hairline rounded-2xl flex flex-col min-h-[65vh] max-h-[80vh]">
              <div className="px-5 py-4 border-b border-hairline flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-body">
                    {selected.conversation.title}
                  </h2>
                  <p className="text-xs text-muted font-mono">
                    Citizen Language: {selected.conversation.languageCode.toUpperCase()} · Status:{' '}
                    {selected.conversation.status}
                  </p>
                </div>

                {selected.conversation.status !== 'resolved' && (
                  <button
                    type="button"
                    onClick={handleMarkResolved}
                    className="min-h-10 px-4 rounded-xl bg-tint text-tint-fg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark Resolved</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-4 rounded-2xl border border-hairline space-y-1.5 ${
                      m.senderRole === 'human_agent'
                        ? 'bg-primary text-on-primary ms-8'
                        : m.senderRole === 'user'
                          ? 'bg-elevated text-body me-8'
                          : 'bg-tint/50 text-body me-8'
                    }`}
                  >
                    <div className="text-xs font-mono opacity-75">
                      {m.senderRole.toUpperCase()}
                      {m.detectedLanguage ? ` · ${m.detectedLanguage.toUpperCase()}` : ''}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                    {m.translatedContent && m.translatedContent !== m.content && (
                      <div className="pt-2 mt-2 border-t border-hairline/50 text-xs opacity-90">
                        <strong>English / Source Reference:</strong> {m.translatedContent}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleSendReply}
                className="p-4 border-t border-hairline space-y-3"
              >
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTranslate}
                    onChange={(e) => setAutoTranslate(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span>
                    Automatically translate my reply into citizen language (
                    {selected.conversation.languageCode.toUpperCase()}) applying Org Glossary
                  </span>
                </label>

                <div className="flex gap-2.5">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type reply in English or citizen's language..."
                    className="flex-1 min-h-12 px-4 rounded-xl bg-elevated border border-strong text-body text-sm"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="min-h-12 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{sending ? 'Sending...' : 'Send'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 6. GRIEVANCES ADMIN SECTION (+ CSV Export)
// ============================================================================
const AdminGrievancesSection: React.FC = () => {
  const { apiFetch, formatDate, subscribeRealtime } = useApp();
  const [items, setItems] = useState<GrievanceItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [editing, setEditing] = useState<GrievanceItem | null>(null);
  const [editStatus, setEditStatus] = useState('in_progress');
  const [editPriority, setEditPriority] = useState('normal');
  const [editDept, setEditDept] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const loadGrievances = useCallback(async () => {
    try {
      const res = await apiFetch<{ grievances: GrievanceItem[] }>('/api/admin/grievances');
      setItems(res.grievances || []);
    } catch {
      // ignore
    }
  }, [apiFetch]);

  useEffect(() => {
    loadGrievances();
    return subscribeRealtime((evt) => {
      if (evt.type === 'grievance:updated') loadGrievances();
    });
  }, [loadGrievances, subscribeRealtime]);

  const filtered = items.filter((g) => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (domainFilter !== 'all' && g.domain !== domainFilter) return false;
    return true;
  });

  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await apiFetch(`/api/admin/grievances/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: editStatus,
        priority: editPriority,
        assignedDepartment: editDept,
        resolutionNotes: editNotes,
      }),
    });
    setEditing(null);
    loadGrievances();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-body">Grievance & SLA Desk</h1>
          <p className="text-sm text-muted">
            Triage citizen grievances across domains, track SLA deadlines, and publish resolution
            notes.
          </p>
        </div>

        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadCsv(
              `sahayak-grievances-${new Date().toISOString().slice(0, 10)}.csv`,
              [
                'Reference',
                'Domain',
                'Category',
                'Priority',
                'Status',
                'Language',
                'Department',
                'SLA Due',
                'Description',
                'English Translation',
                'Resolution Notes',
              ],
              filtered.map((g) => [
                g.referenceNumber,
                g.domain,
                g.category,
                g.priority,
                g.status,
                g.languageCode,
                g.assignedDepartment,
                g.slaDueAt,
                g.description,
                g.translatedDescription,
                g.resolutionNotes,
              ])
            )
          }
          className="min-h-12 px-4 rounded-xl border border-strong bg-card text-body text-sm font-semibold flex items-center gap-2 hover:bg-tint disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-11 px-3.5 rounded-xl bg-card border border-hairline text-body text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="min-h-11 px-3.5 rounded-xl bg-card border border-hairline text-body text-sm"
        >
          <option value="all">All Domains</option>
          <option value="government">Government</option>
          <option value="education">Education</option>
          <option value="healthcare">Healthcare</option>
          <option value="banking">Banking</option>
          <option value="business">Business</option>
          <option value="customer_support">Customer Support</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-hairline text-sm text-muted">
          No grievances match the selected filters.
        </div>
      ) : (
        <div className="bg-card border border-hairline rounded-2xl overflow-x-auto">
          <table className="w-full text-start border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-muted uppercase">
                <th className="py-3.5 px-4 text-start">Reference</th>
                <th className="py-3.5 px-4 text-start">Category & Description</th>
                <th className="py-3.5 px-4 text-start">Domain</th>
                <th className="py-3.5 px-4 text-start">Priority / Status</th>
                <th className="py-3.5 px-4 text-start">SLA Target</th>
                <th className="py-3.5 px-4 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map((g) => (
                <tr key={g.id} className="hover:bg-tint/20">
                  <td className="py-4 px-4 font-mono tabular-nums font-semibold text-body whitespace-nowrap">
                    {g.referenceNumber}
                  </td>
                  <td className="py-4 px-4 max-w-md">
                    <div className="font-semibold text-body">{g.category}</div>
                    <div className="text-xs text-body line-clamp-2 mt-0.5">{g.description}</div>
                    {g.translatedDescription && g.languageCode !== 'en' && (
                      <div className="text-xs text-muted mt-0.5">
                        EN: {g.translatedDescription}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-4 text-xs text-muted whitespace-nowrap">
                    <DomainLabel domain={g.domain} />
                    <div className="mt-0.5">{g.assignedDepartment || 'Unassigned'}</div>
                  </td>
                  <td className="py-4 px-4 text-xs font-mono whitespace-nowrap">
                    <div>{g.priority.toUpperCase()}</div>
                    <div className="text-muted mt-0.5">{g.status.replace(/_/g, ' ')}</div>
                  </td>
                  <td className="py-4 px-4 text-xs font-mono tabular-nums text-muted whitespace-nowrap">
                    {formatDate(g.slaDueAt)}
                  </td>
                  <td className="py-4 px-4 text-end whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(g);
                        setEditStatus(g.status);
                        setEditPriority(g.priority);
                        setEditDept(g.assignedDepartment || '');
                        setEditNotes(g.resolutionNotes || '');
                      }}
                      className="min-h-10 px-3.5 rounded-xl bg-tint text-tint-fg text-xs font-semibold"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResponsiveSheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Update Grievance ${editing.referenceNumber}` : 'Update Grievance'}
      >
        {editing && (
          <form onSubmit={handleSaveUpdate} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-elevated border border-hairline text-sm text-body space-y-1">
              <div className="font-semibold">{editing.category}</div>
              <p className="text-xs text-muted">{editing.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body mb-1">Priority</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="w-full min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-body mb-1">
                Assigned Department / Officer
              </label>
              <input
                type="text"
                value={editDept}
                onChange={(e) => setEditDept(e.target.value)}
                className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-body mb-1">
                Citizen-Facing Resolution Notes
              </label>
              <textarea
                rows={4}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Enter action taken or resolution summary..."
                className="w-full p-3.5 rounded-xl bg-elevated border border-hairline text-body text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm"
            >
              Save Grievance Update
            </button>
          </form>
        )}
      </ResponsiveSheet>
    </div>
  );
};

// ============================================================================
// 7. ANALYTICS SECTION (Real Computed Metrics + Custom Token SVG Charts)
// ============================================================================
const AdminAnalyticsSection: React.FC = () => {
  const { apiFetch, formatNumber } = useApp();
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/analytics')
      .then((res) => setData(res))
      .catch(() => {});
  }, [apiFetch]);

  if (!data) {
    return <div className="p-8 rounded-2xl bg-card border border-hairline text-sm text-muted">Computing real-time analytics...</div>;
  }

  const maxLangCount = Math.max(
    1,
    ...(data.languagesUsed || []).map((l: { count: number }) => l.count)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-body">Service & AI Analytics</h1>
        <p className="text-sm text-muted">
          Real metrics computed live from citizen conversations, grounded retrieval scores,
          applications, and grievances.
        </p>
      </div>

      {/* KPI Row — Max 4 Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-hairline space-y-1">
          <div className="text-xs text-muted">Total Citizen Queries</div>
          <div className="font-display text-3xl font-bold text-body font-mono tabular-nums">
            {formatNumber(data.totalQueries)}
          </div>
          <div className="text-xs text-muted font-mono tabular-nums">
            Across {formatNumber(data.totalConversations)} threads
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-hairline space-y-1">
          <div className="text-xs text-muted">Resolved Without Agent</div>
          <div className="font-display text-3xl font-bold text-body font-mono tabular-nums">
            {formatNumber(data.resolvedWithoutAgentPct)}%
          </div>
          <div className="text-xs text-muted">Self-service RAG rate</div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-hairline space-y-1">
          <div className="text-xs text-muted">Avg AI Reply Latency</div>
          <div className="font-display text-3xl font-bold text-body font-mono tabular-nums">
            {formatNumber(data.avgReplyTimeMs)}ms
          </div>
          <div className="text-xs text-muted">End-to-end grounded stream</div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-hairline space-y-1">
          <div className="text-xs text-muted">Published Sources</div>
          <div className="font-display text-3xl font-bold text-body font-mono tabular-nums">
            {formatNumber(data.publishedDocuments)}
          </div>
          <div className="text-xs text-muted font-mono tabular-nums">
            {formatNumber(data.totalApplications)} apps · {formatNumber(data.openGrievances)} open
            grievances
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Queries by Language Custom SVG Horizontal Bar Chart */}
        <div className="lg:col-span-6 bg-card border border-hairline rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-body">Queries by Detected Language</h2>
          {data.languagesUsed.length === 0 ? (
            <p className="text-sm text-muted">
              No citizen queries recorded yet. Ask a question in Citizen App to populate live
              language distribution.
            </p>
          ) : (
            <div className="space-y-3">
              {data.languagesUsed.map((item: { code: string; count: number }) => {
                const widthPct = Math.max(8, Math.round((item.count / maxLangCount) * 100));
                return (
                  <div key={item.code} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono tabular-nums text-body">
                      <span className="font-semibold uppercase">{item.code}</span>
                      <span>{formatNumber(item.count)} queries</span>
                    </div>
                    <svg className="w-full h-3 rounded-full overflow-hidden" role="img" aria-label={`${item.code}: ${item.count}`}>
                      <rect
                        x="0"
                        y="0"
                        width="100%"
                        height="12"
                        rx="6"
                        fill="var(--surface-elevated)"
                      />
                      <rect
                        x="0"
                        y="0"
                        width={`${widthPct}%`}
                        height="12"
                        rx="6"
                        fill="var(--action-primary)"
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Citizen Feedback Summary */}
        <div className="lg:col-span-6 bg-card border border-hairline rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-body">Answer Quality Feedback</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-elevated border border-hairline">
              <div className="text-xs text-muted">Helpful (Thumbs Up)</div>
              <div className="font-display text-2xl font-bold text-body font-mono tabular-nums mt-1">
                {formatNumber(data.feedbackSummary.thumbsUp)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-hairline">
              <div className="text-xs text-muted">Not Helpful (Thumbs Down)</div>
              <div className="font-display text-2xl font-bold text-body font-mono tabular-nums mt-1">
                {formatNumber(data.feedbackSummary.thumbsDown)}
              </div>
            </div>
          </div>

          {data.feedbackSummary.reasons.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="text-xs font-semibold text-body">Reported Improvement Reasons</div>
              {data.feedbackSummary.reasons.map((r: { reason: string; count: number }) => (
                <div
                  key={r.reason}
                  className="flex justify-between text-xs text-muted py-1 border-b border-hairline"
                >
                  <span>{r.reason}</span>
                  <span className="font-mono tabular-nums font-semibold text-body">
                    {formatNumber(r.count)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-card border border-hairline rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-body">Recent Citizen Questions</h2>
          {data.topQuestions.length === 0 ? (
            <p className="text-sm text-muted">No questions submitted yet.</p>
          ) : (
            <div className="divide-y divide-hairline">
              {data.topQuestions.map((q: any) => (
                <div key={q.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                  <span className="text-body">{q.question}</span>
                  <span className="text-xs font-mono uppercase text-muted shrink-0">
                    {q.language}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-hairline rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-body">
            Low-Confidence Topics (Content Gaps)
          </h2>
          {data.lowConfidenceTopics.length === 0 ? (
            <p className="text-sm text-muted">
              No low-confidence responses detected. Queries lacking published KB coverage appear
              here so editors can upload authoritative documents.
            </p>
          ) : (
            <div className="divide-y divide-hairline">
              {data.lowConfidenceTopics.map((topic: any) => (
                <div
                  key={topic.messageId}
                  className="py-2.5 flex items-start justify-between gap-3 text-sm"
                >
                  <span className="text-body">{topic.question}</span>
                  <span className="text-xs font-mono tabular-nums text-danger shrink-0">
                    {Math.round((topic.confidence || 0) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 8. AUDIT LOGS SECTION (+ CSV Export)
// ============================================================================
const AdminAuditLogsSection: React.FC = () => {
  const { apiFetch, formatDate } = useApp();
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch<{ logs: any[] }>('/api/admin/audit-logs')
      .then((res) => setLogs(res.logs || []))
      .catch(() => {});
  }, [apiFetch]);

  const filtered = logs.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.action || '').toLowerCase().includes(q) ||
      (l.actorEmail || '').toLowerCase().includes(q) ||
      (l.entityType || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-body">Immutable Audit Logs</h1>
          <p className="text-sm text-muted">
            Every knowledge publication, integration test, glossary change, grievance action, and
            role assignment.
          </p>
        </div>

        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadCsv(
              `sahayak-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
              ['Timestamp', 'Actor Email', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Details'],
              filtered.map((l) => [
                l.createdAt,
                l.actorEmail || l.actorUid,
                l.actorRole,
                l.action,
                l.entityType,
                l.entityId,
                JSON.stringify(l.details || {}),
              ])
            )
          }
          className="min-h-12 px-4 rounded-xl border border-strong bg-card text-body text-sm font-semibold flex items-center gap-2 hover:bg-tint disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit CSV</span>
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-muted absolute start-3.5 top-4 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by action, email, or entity..."
          className="w-full min-h-12 ps-10 pe-4 rounded-xl bg-card border border-hairline text-body text-sm"
        />
      </div>

      <div className="bg-card border border-hairline rounded-2xl overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-sm text-muted">No audit log entries recorded yet.</div>
        ) : (
          <table className="w-full text-start border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-muted uppercase">
                <th className="py-3.5 px-4 text-start">Timestamp</th>
                <th className="py-3.5 px-4 text-start">Actor</th>
                <th className="py-3.5 px-4 text-start">Action</th>
                <th className="py-3.5 px-4 text-start">Target</th>
                <th className="py-3.5 px-4 text-start">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-tint/20">
                  <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-muted whitespace-nowrap">
                    {formatDate(l.createdAt)}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-body">
                    <div className="font-medium">{l.actorEmail || l.actorUid || 'System'}</div>
                    <div className="text-muted font-mono">{l.actorRole || 'staff'}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-body whitespace-nowrap">
                    {l.action}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-muted font-mono whitespace-nowrap">
                    {l.entityType}
                    {l.entityId ? ` #${l.entityId}` : ''}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-muted font-mono max-w-xs truncate">
                    {JSON.stringify(l.details || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 9. USERS & ROLES SECTION (RBAC Administration)
// ============================================================================
const AdminUsersAndRolesSection: React.FC = () => {
  const { apiFetch, formatDate } = useApp();
  const [roleRows, setRoleRows] = useState<any[]>([]);
  const [profilesList, setProfilesList] = useState<UserProfile[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'content_editor' | 'support_agent'>(
    'support_agent'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch<{ roles: any[]; profiles: UserProfile[] }>('/api/admin/users');
      setRoleRows(res.roles || []);
      setProfilesList(res.profiles || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load users.');
    }
  }, [apiFetch]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ roles: any[]; profiles: UserProfile[] }>(
        '/api/admin/users/invite',
        {
          method: 'POST',
          body: JSON.stringify({
            email: inviteEmail.trim().toLowerCase(),
            role: inviteRole,
          }),
        }
      );
      setRoleRows(res.roles || []);
      setProfilesList(res.profiles || []);
      setInviteEmail('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Role assignment failed.');
    }
  };

  const toggleRoleState = async (id: number, currentActive: boolean) => {
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ roles: any[]; profiles: UserProfile[] }>(
        `/api/admin/users/roles/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !currentActive }),
        }
      );
      setRoleRows(res.roles || []);
      setProfilesList(res.profiles || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not update role status.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-body">Users & Role-Based Access</h1>
        <p className="text-sm text-muted">
          Assign Admin, Content Editor, and Support Agent permissions by email. Invited staff gain
          access immediately upon signing in via Google or Email OTP.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-6">
          <div className="bg-card border border-hairline rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-hairline font-display font-bold text-base text-body">
              Staff Role Assignments ({roleRows.length})
            </div>
            <div className="divide-y divide-hairline">
              {roleRows.map((r) => (
                <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-body font-mono">{r.email}</div>
                    <div className="text-xs text-muted mt-0.5">
                      Role: <strong className="text-body">{r.role}</strong> · Added{' '}
                      <span className="font-mono tabular-nums">{formatDate(r.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRoleState(r.id, r.isActive)}
                    className={`min-h-10 px-4 rounded-xl text-xs font-semibold border ${
                      r.isActive
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-elevated text-muted border-hairline'
                    }`}
                  >
                    {r.isActive ? 'Active' : 'Revoked'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-hairline rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-hairline font-display font-bold text-base text-body">
              Recent Active Profiles ({profilesList.length})
            </div>
            <div className="divide-y divide-hairline max-h-72 overflow-y-auto">
              {profilesList.map((p) => (
                <div key={p.uid} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-sm text-body">
                      {p.fullName || p.email || p.phone || (p.isGuest ? 'Guest Session' : p.uid)}
                    </div>
                    <div className="text-muted font-mono">
                      Lang: {p.preferredLanguage.toUpperCase()} ·{' '}
                      {p.isGuest ? 'Guest' : 'Verified Account'}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-muted">
                    {formatDate(p.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <form
          onSubmit={handleInvite}
          className="xl:col-span-5 bg-card border border-hairline rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-display text-lg font-bold text-body">Invite Staff / Grant Role</h2>
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Staff Email *</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@organisation.gov.in"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            >
              <option value="admin">Admin (Full Console, Integrations, Workflows, RBAC)</option>
              <option value="content_editor">
                Content Editor (Knowledge Base, Languages, Glossary)
              </option>
              <option value="support_agent">
                Support Agent (Human Inbox, Grievances, Read KB)
              </option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover"
          >
            Grant Role Access
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN EXPORTED ADMIN CONSOLE SHELL
// ============================================================================
export const AdminConsole: React.FC<{ onBackToCitizen: () => void }> = ({ onBackToCitizen }) => {
  const { isAdminOrStaff, roles, profile, t, logout } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langSheetOpen, setLangSheetOpen] = useState(false);

  const navItems = useMemo(() => {
    const all: Array<{
      id: AdminSection;
      label: string;
      icon: React.FC<{ className?: string }>;
      allowed: string[];
    }> = [
      {
        id: 'kb',
        label: 'Knowledge Base',
        icon: BookOpen,
        allowed: ['admin', 'content_editor', 'support_agent'],
      },
      {
        id: 'inbox',
        label: 'Human Inbox',
        icon: Headphones,
        allowed: ['admin', 'support_agent'],
      },
      {
        id: 'grievances',
        label: 'Grievances',
        icon: ShieldAlert,
        allowed: ['admin', 'support_agent'],
      },
      {
        id: 'languages',
        label: 'Languages & Glossary',
        icon: Languages,
        allowed: ['admin', 'content_editor'],
      },
      {
        id: 'workflows',
        label: 'Workflows',
        icon: Layers,
        allowed: ['admin'],
      },
      {
        id: 'integrations',
        label: 'API Integrations',
        icon: Plug,
        allowed: ['admin'],
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: Activity,
        allowed: ['admin', 'content_editor', 'support_agent'],
      },
      {
        id: 'audit',
        label: 'Audit Logs',
        icon: ClipboardList,
        allowed: ['admin'],
      },
      {
        id: 'users',
        label: 'Users & Roles',
        icon: Users,
        allowed: ['admin'],
      },
    ];
    return all.filter((item) => item.allowed.some((r) => roles.includes(r)));
  }, [roles]);

  const [activeSection, setActiveSection] = useState<AdminSection>('kb');
  const [sectionHistory, setSectionHistory] = useState<AdminSection[]>([]);

  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((n) => n.id === activeSection)) {
      setActiveSection(navItems[0].id);
    }
  }, [navItems, activeSection]);

  const navigateAdminSection = (nextSection: AdminSection) => {
    if (nextSection !== activeSection) {
      setSectionHistory((prev) => [...prev.slice(-24), activeSection]);
    }
    setActiveSection(nextSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminBack = () => {
    if (sectionHistory.length > 0) {
      const prev = sectionHistory[sectionHistory.length - 1];
      setSectionHistory((s) => s.slice(0, -1));
      setActiveSection(prev);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    onBackToCitizen();
  };

  if (!isAdminOrStaff) {
    return <AdminSignInGate onBackToCitizen={onBackToCitizen} />;
  }

  const canEditKb = roles.includes('admin') || roles.includes('content_editor');
  const previousAdminLabel =
    sectionHistory.length > 0
      ? navItems.find((n) => n.id === sectionHistory[sectionHistory.length - 1])?.label ||
        t('common.back')
      : t('admin.back_to_app');

  return (
    <div className="min-h-screen bg-canvas text-body flex">
      {/* Persistent Left Sidebar on Desktop (>=1200px) */}
      <aside className="hidden xl:flex xl:w-64 xl:flex-col xl:shrink-0 bg-card border-e border-hairline justify-between p-4">
        <div className="space-y-6">
          <div className="px-3 py-2">
            <div className="font-display text-xl font-bold text-primary">Sahayak</div>
            <div className="text-xs text-muted font-mono mt-0.5">
              {t('admin.title')} · {roles.filter((r) => r !== 'citizen').join(', ')}
            </div>
          </div>

          <nav className="space-y-1" aria-label="Admin Console">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateAdminSection(item.id)}
                  className={`w-full min-h-12 px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors ${
                    active ? 'bg-primary text-on-primary' : 'text-body hover:bg-tint/50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-hairline space-y-2">
          <button
            type="button"
            onClick={onBackToCitizen}
            className="w-full min-h-12 px-3.5 rounded-xl bg-secondary text-on-secondary border border-strong text-sm font-semibold flex items-center gap-2.5 hover:bg-secondary-hover transition-colors"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180 shrink-0" />
            <span>{t('admin.back_to_app')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-4 sm:px-8 bg-card border-b border-hairline flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open admin navigation"
              className="xl:hidden min-h-11 min-w-11 rounded-xl border border-hairline bg-elevated text-body flex items-center justify-center shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleAdminBack}
              aria-label={`${t('common.back')} · ${previousAdminLabel}`}
              className="min-h-11 px-3 rounded-xl bg-secondary text-on-secondary border border-strong hover:bg-secondary-hover text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180 shrink-0" />
              <span>{t('common.back')}</span>
              <span className="hidden md:inline text-muted font-normal max-w-[160px] truncate">
                · {previousAdminLabel}
              </span>
            </button>

            <div className="font-display font-bold text-base sm:text-lg text-body truncate">
              {navItems.find((n) => n.id === activeSection)?.label || t('admin.title')}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden md:inline text-xs text-muted font-mono truncate max-w-[200px]">
              {profile?.email || profile?.phone}
            </span>
            <LanguageTriggerButton onClick={() => setLangSheetOpen(true)} />
            <button
              type="button"
              onClick={onBackToCitizen}
              className="xl:hidden min-h-11 px-3 rounded-xl border border-strong bg-elevated text-body text-xs font-semibold flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>App</span>
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="min-h-11 px-3.5 rounded-xl border border-hairline bg-elevated text-body text-xs font-medium hover:bg-tint"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeSection === 'kb' && <AdminKnowledgeBaseSection canEdit={canEditKb} />}
          {activeSection === 'integrations' && <AdminIntegrationsSection />}
          {activeSection === 'workflows' && <AdminWorkflowsSection />}
          {activeSection === 'languages' && <AdminLanguagesSection />}
          {activeSection === 'inbox' && <AdminHumanInboxSection />}
          {activeSection === 'grievances' && <AdminGrievancesSection />}
          {activeSection === 'analytics' && <AdminAnalyticsSection />}
          {activeSection === 'audit' && <AdminAuditLogsSection />}
          {activeSection === 'users' && <AdminUsersAndRolesSection />}
        </main>
      </div>

      {/* Tablet & Phone Admin Navigation Sheet (<1200px) */}
      <ResponsiveSheet
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title={t('admin.title')}
      >
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  navigateAdminSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full min-h-12 px-4 rounded-xl flex items-center gap-3 text-sm font-semibold ${
                  active ? 'bg-primary text-on-primary' : 'bg-elevated text-body'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onBackToCitizen();
              }}
              className="w-full min-h-12 px-4 rounded-xl border border-strong bg-card text-body text-sm font-semibold flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('admin.back_to_app')}</span>
            </button>
          </div>
        </div>
      </ResponsiveSheet>

      <LanguagePickerSheet open={langSheetOpen} onClose={() => setLangSheetOpen(false)} />
    </div>
  );
};
