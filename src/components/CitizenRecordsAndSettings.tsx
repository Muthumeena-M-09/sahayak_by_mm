import React, { useEffect, useState } from 'react';
import {
  Bell,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  FileUp,
  Headphones,
  Link2,
  MessageSquare,
  Mic,
  ShieldAlert,
  Square,
  Trash2,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { fileToBase64, useVoiceAudio } from '../hooks/usePWAAndNetwork.ts';
import type {
  ApplicationItem,
  CitizenDocumentItem,
  CitizenScreen,
  GrievanceItem,
  NotificationItem,
  ReminderItem,
} from '../types.ts';
import { DomainLabel, LanguagePickerSheet, PWAInstallControl, ResponsiveSheet } from './SharedUI.tsx';

// Screen 8: My Applications & Unified Status Tracker
export const CitizenStatusScreen: React.FC<{
  selectedAppId?: number;
  onAskAboutApp: (question: string) => void;
  onNavigate: (screen: CitizenScreen) => void;
}> = ({ selectedAppId, onAskAboutApp, onNavigate }) => {
  const { t, apiFetch, formatDate, formatNumber, subscribeRealtime } = useApp();
  const [tab, setTab] = useState<'applications' | 'grievances'>('applications');
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [grievances, setGrievances] = useState<GrievanceItem[]>([]);
  const [activeApp, setActiveApp] = useState<ApplicationItem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [aRes, gRes] = await Promise.all([
        apiFetch<{ applications: ApplicationItem[] }>('/api/applications'),
        apiFetch<{ grievances: GrievanceItem[] }>('/api/grievances'),
      ]);
      const appList = aRes.applications || [];
      setApps(appList);
      setGrievances(gRes.grievances || []);
      if (selectedAppId) {
        const found = appList.find((x) => x.id === selectedAppId);
        if (found) setActiveApp(found);
      } else if (appList.length > 0 && !activeApp) {
        setActiveApp(appList[0]);
      }
    } catch {
      // Offline graceful state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    return subscribeRealtime((evt) => {
      if (evt.type === 'application:updated' || evt.type === 'grievance:updated') {
        loadAll();
      }
    });
  }, [selectedAppId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
          {t('status.title')}
        </h1>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-hairline">
          <button
            type="button"
            onClick={() => setTab('applications')}
            className={`min-h-11 px-4 rounded-lg text-sm font-medium whitespace-nowrap ${
              tab === 'applications' ? 'bg-primary text-on-primary' : 'text-body hover:bg-tint/40'
            }`}
          >
            Applications ({formatNumber(apps.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('grievances')}
            className={`min-h-11 px-4 rounded-lg text-sm font-medium whitespace-nowrap ${
              tab === 'grievances' ? 'bg-primary text-on-primary' : 'text-body hover:bg-tint/40'
            }`}
          >
            Grievances ({formatNumber(grievances.length)})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-card border border-hairline animate-pulse" />
      ) : tab === 'applications' ? (
        apps.length === 0 ? (
          <div className="p-8 rounded-2xl bg-card border border-hairline space-y-4">
            <p className="text-base text-muted">{t('home.no_applications')}</p>
            <button
              type="button"
              onClick={() => onNavigate('services')}
              className="min-h-12 px-5 rounded-xl bg-primary text-on-primary font-semibold text-sm"
            >
              Browse Services
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-5 bg-card border border-hairline rounded-2xl divide-y divide-hairline overflow-hidden">
              {apps.map((app) => {
                const isSelected = activeApp?.id === app.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setActiveApp(app)}
                    className={`w-full p-4 text-start transition-colors ${
                      isSelected ? 'bg-tint text-tint-fg' : 'hover:bg-tint/30 text-body'
                    }`}
                  >
                    <div className="font-semibold text-base">{app.serviceTitle}</div>
                    <div className="text-xs text-muted mt-1 font-mono tabular-nums">
                      {app.referenceNumber} · {formatDate(app.submittedAt)}
                    </div>
                    <div className="text-xs font-medium mt-1">
                      <DomainLabel domain={app.domain} /> · {app.status.replace(/_/g, ' ')}
                    </div>
                  </button>
                );
              })}
            </div>

            {activeApp && (
              <div className="md:col-span-7 bg-card border border-hairline rounded-2xl p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-4">
                  <div>
                    <div className="text-xs text-muted font-mono tabular-nums">
                      {activeApp.referenceNumber} · Submitted {formatDate(activeApp.submittedAt)}
                    </div>
                    <h2 className="font-display text-xl font-bold text-body mt-1">
                      {activeApp.serviceTitle}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onAskAboutApp(
                        `Please explain the status and next steps for my application ${activeApp.referenceNumber} (${activeApp.serviceTitle}), currently "${activeApp.status}".`
                      )
                    }
                    className="min-h-12 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center gap-2 hover:bg-primary-hover shrink-0"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{t('status.ask_about')}</span>
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted font-mono tabular-nums">
                    <span>Status: {activeApp.status.replace(/_/g, ' ')}</span>
                    <span>
                      Step {formatNumber(activeApp.currentStep)}/
                      {formatNumber(activeApp.totalSteps)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-elevated overflow-hidden">
                    <div
                      className="h-full bg-warm"
                      style={{
                        width: `${(activeApp.currentStep / activeApp.totalSteps) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  <h3 className="font-display text-base font-semibold text-body">
                    Application Timeline
                  </h3>
                  <ol className="space-y-4">
                    {activeApp.events.map((ev) => (
                      <li
                        key={ev.id}
                        className="p-3.5 rounded-xl bg-elevated border border-hairline space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-body">{ev.title}</span>
                          <span className="text-xs text-muted font-mono tabular-nums">
                            {formatDate(ev.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted">{ev.description}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        )
      ) : grievances.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-hairline space-y-4">
          <p className="text-base text-muted">No grievances or support requests filed yet.</p>
          <button
            type="button"
            onClick={() => onNavigate('grievance')}
            className="min-h-12 px-5 rounded-xl bg-primary text-on-primary font-semibold text-sm"
          >
            {t('grievance.title')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {grievances.map((grv) => (
            <div
              key={grv.id}
              className="p-5 rounded-2xl bg-card border border-hairline space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs text-muted font-mono tabular-nums">
                <span>{grv.referenceNumber}</span>
                <span>SLA Due: {formatDate(grv.slaDueAt)}</span>
              </div>
              <div className="font-display text-lg font-bold text-body">{grv.category}</div>
              <div className="text-xs text-muted">
                <DomainLabel domain={grv.domain} /> · Status: {grv.status.replace(/_/g, ' ')} ·
                Priority: {grv.priority}
              </div>
              <p className="text-sm text-body">{grv.description}</p>
              {grv.resolutionNotes && (
                <div className="p-3 rounded-xl bg-tint text-tint-fg text-xs">
                  <strong>Resolution Update:</strong> {grv.resolutionNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Screen 9: My Documents & DigiLocker
export const CitizenDocumentsScreen: React.FC = () => {
  const { t, apiFetch, profile, refreshProfile, formatDate } = useApp();
  const [docs, setDocs] = useState<CitizenDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('identity');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDocs = async () => {
    try {
      const res = await apiFetch<{ documents: CitizenDocumentItem[] }>('/api/documents');
      setDocs(res.documents || []);
    } catch {
      // Offline graceful
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploading(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      await apiFetch('/api/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: file.name,
          docType,
          mimeType,
          fileSize: file.size,
          fileDataBase64: base64,
        }),
      });
      await loadDocs();
    } catch (err: any) {
      setErrorMsg(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      setErrorMsg(err.message || 'Delete failed.');
    }
  };

  const handleDigiLockerConnect = async () => {
    setErrorMsg(null);
    try {
      await apiFetch('/api/documents/digilocker-connect', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshProfile();
    } catch (err: any) {
      setErrorMsg(err.message || 'DigiLocker adapter connection failed.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
            {t('docs.title')}
          </h1>
          <p className="text-sm text-muted">
            Store verified documents securely for instant form auto-filling and submissions.
          </p>
        </div>

        {profile?.digilockerLinked ? (
          <div className="text-sm font-medium text-body px-4 py-2.5 rounded-xl bg-tint border border-hairline">
            DigiLocker Linked ·{' '}
            <span className="font-mono tabular-nums">{profile.digilockerAccountRef}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleDigiLockerConnect}
            className="min-h-12 px-4 rounded-xl border border-strong bg-card text-body text-sm font-semibold flex items-center gap-2 hover:bg-tint"
          >
            <Link2 className="w-4 h-4" />
            <span>{t('docs.connect_digilocker')}</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
      )}

      <div className="bg-card border border-hairline rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            aria-label="Document category"
            className="min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
          >
            <option value="identity">Identity Proof</option>
            <option value="certificate">Income / Residence / Academic Certificate</option>
            <option value="letter">Official Receipt / Statement</option>
          </select>
        </div>

        <label className="min-h-12 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold inline-flex items-center gap-2 cursor-pointer hover:bg-primary-hover">
          <FileUp className="w-4 h-4" />
          <span>{uploading ? 'Uploading & Verifying...' : 'Upload Document'}</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={uploading}
            onChange={handleUpload}
            className="sr-only"
          />
        </label>
      </div>

      {loading ? (
        <div className="h-36 rounded-2xl bg-card border border-hairline animate-pulse" />
      ) : docs.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-hairline text-sm text-muted">
          No personal documents uploaded yet. Upload an image or PDF above to verify and save it.
        </div>
      ) : (
        <div className="bg-card border border-hairline rounded-2xl divide-y divide-hairline">
          {docs.map((doc) => (
            <div key={doc.id} className="p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <FileCheck className="w-5 h-5 text-warm mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-body truncate">{doc.title}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {doc.docType} · Status:{' '}
                    <span className="font-medium text-body">{doc.status}</span> ·{' '}
                    <span className="font-mono tabular-nums">{formatDate(doc.createdAt)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                aria-label={`Delete ${doc.title}`}
                className="min-h-11 min-w-11 rounded-xl border border-hairline text-danger hover:bg-danger-soft flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Screen 10: Grievance / Request Filing
export const CitizenGrievanceScreen: React.FC<{
  onSubmitted: () => void;
}> = ({ onSubmitted }) => {
  const { t, apiFetch, currentLanguage, profile, network } = useApp();
  const [domain, setDomain] = useState('government');
  const [category, setCategory] = useState('Delayed Application / Service');
  const [description, setDescription] = useState('');
  const [docs, setDocs] = useState<CitizenDocumentItem[]>([]);
  const [attachmentId, setAttachmentId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const voice = useVoiceAudio(profile?.voiceSpeed || 1.0);

  useEffect(() => {
    apiFetch<{ documents: CitizenDocumentItem[] }>('/api/documents')
      .then((r) => setDocs(r.documents || []))
      .catch(() => {});
  }, []);

  const handleRecordVoice = async () => {
    if (voice.isRecording) {
      setBusy(true);
      try {
        const rec = await voice.stopRecording();
        const stt = await apiFetch<{ transcript: string }>('/api/voice/stt', {
          method: 'POST',
          body: JSON.stringify({
            base64Audio: rec.base64Audio,
            mimeType: rec.mimeType,
            languageHint: currentLanguage.englishName,
          }),
        });
        if (stt.transcript) {
          setDescription((prev) => (prev ? `${prev} ${stt.transcript}` : stt.transcript));
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Voice recording transcription failed.');
      } finally {
        setBusy(false);
      }
    } else {
      try {
        await voice.startRecording();
      } catch {
        setErrorMsg('Microphone permission unavailable.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg('Please describe your grievance by typing or recording your voice.');
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ grievance: GrievanceItem }>('/api/grievances', {
        method: 'POST',
        body: JSON.stringify({
          domain,
          category,
          description: description.trim(),
          languageCode: currentLanguage.code,
          attachmentDocumentId: attachmentId ? Number(attachmentId) : undefined,
        }),
      });
      setSubmittedRef(res.grievance.referenceNumber);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit grievance.');
    } finally {
      setBusy(false);
    }
  };

  if (submittedRef) {
    return (
      <div className="max-w-xl mx-auto bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3 text-primary">
          <CheckCircle2 className="w-8 h-8 shrink-0" />
          <h1 className="font-display text-2xl font-bold text-body">Grievance Registered</h1>
        </div>
        <p className="text-sm text-muted">
          Your grievance has been routed to the appropriate resolution desk with an SLA timeline.
        </p>
        <div className="p-4 rounded-xl bg-tint text-tint-fg font-mono text-xl font-bold tabular-nums">
          {submittedRef}
        </div>
        <button
          type="button"
          onClick={onSubmitted}
          className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold"
        >
          Track Grievance Status
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
          {t('grievance.title')}
        </h1>
        <p className="text-sm text-muted mt-1">
          Submit in {currentLanguage.nativeName} by voice or text. Support agents receive an
          automatic translation and SLA target.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">{errorMsg}</div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-card border border-hairline rounded-2xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-body mb-1.5">Domain</label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body"
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
            <label className="block text-sm font-semibold text-body mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body"
            >
              <option value="Delayed Application / Service">Delayed Application / Service</option>
              <option value="Incorrect Record / Billing">Incorrect Record / Billing</option>
              <option value="Document Rejection Dispute">Document Rejection Dispute</option>
              <option value="Accessibility / Staff Conduct">Accessibility / Staff Conduct</option>
              <option value="Urgent Benefit / Relief Request">Urgent Benefit / Relief Request</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-body">Description *</label>
            {!network.isWeakNetworkActive && (
              <button
                type="button"
                onClick={handleRecordVoice}
                className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  voice.isRecording ? 'bg-danger text-on-danger' : 'bg-voice text-on-voice'
                }`}
              >
                {voice.isRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{voice.isRecording ? 'Stop Recording' : 'Speak Description'}</span>
              </button>
            )}
          </div>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, reference numbers if any, and what resolution you need..."
            className="w-full p-4 rounded-xl bg-elevated border border-hairline text-body placeholder:text-muted"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-body mb-1.5">
            Attach Supporting Document (Optional)
          </label>
          <select
            value={attachmentId}
            onChange={(e) => setAttachmentId(e.target.value)}
            className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body"
          >
            <option value="">None selected</option>
            {docs.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.title} ({d.status})
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover disabled:opacity-60"
        >
          <ShieldAlert className="w-5 h-5" />
          <span>{busy ? 'Submitting...' : t('grievance.submit')}</span>
        </button>
      </form>
    </div>
  );
};

// Screen 11: Notifications & Reminders
export const CitizenNotificationsScreen: React.FC = () => {
  const { profile, updatePreferences, apiFetch, currentLanguage, formatDate } = useApp();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newChannel, setNewChannel] = useState('push');

  const loadData = async () => {
    try {
      const [nRes, rRes] = await Promise.all([
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<{ reminders: ReminderItem[] }>('/api/reminders'),
      ]);
      setNotifications(nRes.notifications || []);
      setReminders(rRes.reminders || []);
    } catch {
      // Offline graceful
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDue) return;
    await apiFetch('/api/reminders', {
      method: 'POST',
      body: JSON.stringify({
        title: newTitle.trim(),
        dueAt: newDue,
        channel: newChannel,
        languageCode: currentLanguage.code,
      }),
    });
    setNewTitle('');
    setNewDue('');
    loadData();
  };

  const handleToggleReminder = async (rem: ReminderItem) => {
    await apiFetch(`/api/reminders/${rem.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isCompleted: !rem.isCompleted }),
    });
    loadData();
  };

  const prefs = profile?.notificationChannels || {
    push: true,
    sms: false,
    whatsapp: false,
    voiceCall: false,
  };

  const toggleChannelPref = (key: keyof typeof prefs) => {
    updatePreferences({
      notificationChannels: {
        ...prefs,
        [key]: !prefs[key],
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
        Notifications & Deadline Reminders
      </h1>

      {/* Channel Preferences */}
      <section className="bg-card border border-hairline rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-base font-bold text-body">
          Delivery Channel Preferences ({currentLanguage.nativeName})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              { key: 'push', label: 'In-App / Push' },
              { key: 'whatsapp', label: 'WhatsApp' },
              { key: 'sms', label: 'SMS Text' },
              { key: 'voiceCall', label: 'Automated Voice Call' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleChannelPref(key)}
              className={`min-h-12 px-3.5 rounded-xl border text-sm font-medium flex items-center justify-between gap-2 ${
                prefs[key]
                  ? 'bg-tint border-strong text-tint-fg'
                  : 'bg-elevated border-hairline text-body'
              }`}
            >
              <span>{label}</span>
              {prefs[key] && <Check className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Reminders */}
        <section className="bg-card border border-hairline rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-body">Scheduled Reminders</h2>

          <form onSubmit={handleAddReminder} className="space-y-3 pb-4 border-b border-hairline">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Reminder title (e.g., Renew certificate)"
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body text-sm"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="flex-1 min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm font-mono tabular-nums"
              />
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                className="min-h-12 px-3 rounded-xl bg-elevated border border-hairline text-body text-sm"
              >
                <option value="push">Push</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="voice_call">Voice</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full min-h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center justify-center gap-2"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Add Reminder</span>
            </button>
          </form>

          {reminders.length === 0 ? (
            <p className="text-sm text-muted">No reminders yet.</p>
          ) : (
            <div className="divide-y divide-hairline">
              {reminders.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div
                      className={`text-sm font-medium ${
                        r.isCompleted ? 'line-through text-muted' : 'text-body'
                      }`}
                    >
                      {r.title}
                    </div>
                    <div className="text-xs text-muted font-mono tabular-nums">
                      {formatDate(r.dueAt)} · {r.channel.toUpperCase()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleReminder(r)}
                    className="min-h-10 px-3 rounded-lg border border-hairline text-xs font-medium text-body hover:bg-tint"
                  >
                    {r.isCompleted ? 'Undo' : 'Done'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Notifications */}
        <section className="bg-card border border-hairline rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-body">In-App Notifications</h2>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted">No notifications received yet.</p>
          ) : (
            <div className="divide-y divide-hairline">
              {notifications.map((n) => (
                <div key={n.id} className="py-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-body flex items-center gap-2">
                      <Bell className="w-4 h-4 text-primary shrink-0" />
                      {n.title}
                    </span>
                    <span className="text-xs text-muted font-mono tabular-nums">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{n.body}</p>
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
                        loadData();
                      }}
                      className="text-xs font-medium text-primary underline"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// Screen 12: Settings & Real Data Deletion
export const CitizenSettingsScreen: React.FC = () => {
  const {
    profile,
    currentLanguage,
    t,
    updatePreferences,
    apiFetch,
    logout,
    signInWithGooglePopup,
  } = useApp();

  const [langSheetOpen, setLangSheetOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile?.fullName || '');
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      await updatePreferences({ fullName: nameDraft.trim() || null });
    } finally {
      setSavingName(false);
    }
  };

  const handlePermanentDelete = async () => {
    await apiFetch('/api/me/data', { method: 'DELETE' });
    setConfirmDeleteOpen(false);
    await logout();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
        {t('settings.title')}
      </h1>

      <div className="bg-card border border-hairline rounded-2xl p-6 space-y-6">
        {/* Profile Name & Linked Accounts */}
        <form onSubmit={handleSaveName} className="space-y-3 pb-6 border-b border-hairline">
          <label className="block text-sm font-semibold text-body">Profile Name</label>
          <div className="flex gap-2.5">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={profile?.isGuest ? 'Guest session' : 'Enter your name'}
              className="flex-1 min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body"
            />
            <button
              type="submit"
              disabled={savingName}
              className="min-h-12 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold"
            >
              {savingName ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="text-xs text-muted">
            Account: {profile?.email || profile?.phone || 'Guest Session'}
            {profile?.digilockerLinked ? ` · DigiLocker (${profile.digilockerAccountRef})` : ''}
          </div>
          {profile?.isGuest && (
            <button
              type="button"
              onClick={() => signInWithGooglePopup()}
              className="min-h-11 px-4 rounded-xl border border-strong bg-elevated text-body text-xs font-semibold"
            >
              Link Google Account to Save Across Devices
            </button>
          )}
        </form>

        {/* Language */}
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-hairline">
          <div>
            <div className="font-semibold text-body">Language</div>
            <div className="text-sm text-muted">
              {currentLanguage.nativeName} · {currentLanguage.englishName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLangSheetOpen(true)}
            className="min-h-12 px-4 rounded-xl bg-tint text-tint-fg text-sm font-semibold"
          >
            Change Language
          </button>
        </div>

        {/* Voice Speed */}
        <div className="space-y-2.5 pb-6 border-b border-hairline">
          <div className="font-semibold text-body">{t('settings.voice_speed')}</div>
          <div className="grid grid-cols-4 gap-2">
            {[0.75, 1.0, 1.25, 1.5].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => updatePreferences({ voiceSpeed: spd })}
                className={`min-h-12 rounded-xl border text-sm font-mono tabular-nums font-medium ${
                  (profile?.voiceSpeed || 1.0) === spd
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-elevated border-hairline text-body'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* 4-Level Text Size */}
        <div className="space-y-2.5 pb-6 border-b border-hairline">
          <div className="font-semibold text-body">{t('settings.text_size')} (4 Levels)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { level: 1, label: '1 · Standard' },
              { level: 2, label: '2 · Comfortable' },
              { level: 3, label: '3 · Large' },
              { level: 4, label: '4 · Extra Large' },
            ].map((item) => (
              <button
                key={item.level}
                type="button"
                onClick={() => updatePreferences({ textSizeLevel: item.level })}
                className={`min-h-12 px-3 rounded-xl border text-sm font-medium ${
                  (profile?.textSizeLevel || 1) === item.level
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-elevated border-hairline text-body'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="space-y-2.5 pb-6 border-b border-hairline">
          <div className="font-semibold text-body">{t('settings.theme')}</div>
          <div className="grid grid-cols-3 gap-2">
            {(['system', 'light', 'dark'] as const).map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => updatePreferences({ theme: th })}
                className={`min-h-12 rounded-xl border text-sm font-medium capitalize ${
                  (profile?.theme || 'system') === th
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-elevated border-hairline text-body'
                }`}
              >
                {th}
              </button>
            ))}
          </div>
        </div>

        {/* Consent & Install */}
        <div className="space-y-4 pb-6 border-b border-hairline">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(profile?.consentGiven)}
              onChange={(e) => updatePreferences({ consentGiven: e.target.checked })}
              className="mt-1 w-5 h-5 accent-primary"
            />
            <span className="text-sm text-body">{t('auth.consent_text')}</span>
          </label>
          <PWAInstallControl />
        </div>

        {/* Sign Out & Real Delete My Data */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => logout()}
            className="min-h-12 px-5 rounded-xl border border-strong bg-elevated text-body text-sm font-semibold"
          >
            Sign Out
          </button>

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="min-h-12 px-5 rounded-xl bg-danger text-on-danger text-sm font-semibold flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t('settings.delete_data')}</span>
          </button>
        </div>
      </div>

      <LanguagePickerSheet open={langSheetOpen} onClose={() => setLangSheetOpen(false)} />

      <ResponsiveSheet
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Confirm Permanent Data Deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-body leading-relaxed">
            This permanently deletes your profile, conversations, uploaded personal documents,
            applications, grievances, notifications, and reminders from PostgreSQL. This action
            cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
              className="flex-1 min-h-12 rounded-xl border border-hairline bg-elevated text-body font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePermanentDelete}
              className="flex-1 min-h-12 rounded-xl bg-danger text-on-danger font-semibold"
            >
              Delete Everything
            </button>
          </div>
        </div>
      </ResponsiveSheet>
    </div>
  );
};

// Screen 13 & 14: Help, Privacy & Weak-Connection Mode Manager
export const CitizenHelpScreen: React.FC<{
  onNavigate: (screen: CitizenScreen, payload?: any) => void;
}> = ({ onNavigate }) => {
  const { currentLanguage, authToken, profile, network } = useApp();
  const voice = useVoiceAudio(profile?.voiceSpeed || 1.0);

  const guideSummary =
    'Sahayak lets you speak or type in 23 languages. Ask questions grounded in official documents, scan letters for plain-language explanations and deadline reminders, auto-fill service forms from your IDs, and track applications or grievances with reference numbers.';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
          Help, Privacy & Weak-Network Mode
        </h1>
        <button
          type="button"
          onClick={() =>
            voice.playServerTts({
              text: guideSummary,
              languageName: currentLanguage.englishName,
              localeCode: currentLanguage.localeCode,
              authToken,
            })
          }
          className="min-h-12 px-4 rounded-xl bg-tint text-tint-fg text-sm font-semibold flex items-center gap-2"
        >
          <Volume2 className="w-4 h-4" />
          <span>Listen to Guide</span>
        </button>
      </div>

      {/* Weak-Connection / Offline Text-Only Mode Control */}
      <section className="bg-card border border-hairline rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-body flex items-center gap-2">
              <WifiOff className="w-5 h-5 text-warm" />
              <span>Offline / Weak-Connection Text-Only Mode</span>
            </h2>
            <p className="text-sm text-muted">
              Saves mobile data by disabling audio streaming, serving cached answers offline, and
              queuing unanswered questions for retry or SMS dispatch.
            </p>
          </div>
          <button
            type="button"
            onClick={() => network.setManualTextOnlyMode(!network.manualTextOnlyMode)}
            className={`min-h-12 px-4 rounded-xl text-sm font-semibold shrink-0 ${
              network.manualTextOnlyMode
                ? 'bg-primary text-on-primary'
                : 'border border-strong bg-elevated text-body'
            }`}
          >
            {network.manualTextOnlyMode ? 'Active (Disable)' : 'Enable Text-Only'}
          </button>
        </div>

        {network.queuedQuestions.length > 0 && (
          <div className="pt-3 border-t border-hairline space-y-2">
            <div className="text-xs font-semibold text-body">Queued Questions</div>
            {network.queuedQuestions.map((q) => (
              <div
                key={q.id}
                className="p-3 rounded-xl bg-elevated flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">{q.question}</span>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      network.dequeueQuestion(q.id);
                      onNavigate('ask', { initialQuestion: q.question });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-medium"
                  >
                    Retry Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* How to Use */}
      <section className="bg-card border border-hairline rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-body">How to Use Sahayak</h2>
        <ol className="space-y-3 text-sm text-body">
          <li>
            <strong>1. Speak or Type in Your Language:</strong> Switch between any of the 22
            scheduled Indian languages and English at any time—even mid-conversation.
          </li>
          <li>
            <strong>2. Verified Sources Only:</strong> Sahayak answers strictly from published
            documents and shows clickable page citations. When no source exists, it connects you
            with a human support agent.
          </li>
          <li>
            <strong>3. Explain Letters & Set Reminders:</strong> Photograph or upload any notice to
            hear a plain-language explanation and schedule deadline reminders.
          </li>
          <li>
            <strong>4. Smart Form Auto-Fill:</strong> Upload your ID or certificate during
            application steps to extract fields automatically, review them, and get a tracking ID.
          </li>
        </ol>
      </section>

      {/* Privacy & Human Support */}
      <section className="bg-card border border-hairline rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-body">Privacy Policy & Human Support</h2>
        <p className="text-sm text-muted leading-relaxed">
          Your personal applications, documents, conversations, and reminders are strictly isolated
          to your account. API credentials and AI models run exclusively server-side. You can
          revoke consent or permanently delete all your data at any time in Settings.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate('ask', { initialQuestion: 'I would like to speak with a human support agent.' })}
            className="min-h-12 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center gap-2"
          >
            <Headphones className="w-4 h-4" />
            <span>Connect to Human Support</span>
          </button>
          <a
            href="tel:1800000000"
            className="min-h-12 px-5 rounded-xl border border-strong bg-elevated text-body text-sm font-semibold inline-flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            <span>Helpline Desk (Voice IVR)</span>
          </a>
        </div>
      </section>
    </div>
  );
};
