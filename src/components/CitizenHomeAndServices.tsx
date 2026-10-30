import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileSearch,
  FileUp,
  GraduationCap,
  HeartPulse,
  HelpCircle,
  Landmark,
  Mic,
  Send,
  ShieldAlert,
  Square,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { fileToBase64, useVoiceAudio } from '../hooks/usePWAAndNetwork.ts';
import type {
  ApplicationItem,
  CitizenScreen,
  ReminderItem,
  ServiceTemplate,
} from '../types.ts';
import { DomainLabel } from './SharedUI.tsx';

export const CitizenHomeScreen: React.FC<{
  onNavigate: (screen: CitizenScreen, payload?: any) => void;
}> = ({ onNavigate }) => {
  const { profile, currentLanguage, t, apiFetch, network, formatDate, formatNumber, subscribeRealtime } =
    useApp();
  const [questionText, setQuestionText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const voice = useVoiceAudio(profile?.voiceSpeed || 1.0);

  const loadSummary = async () => {
    try {
      const [appRes, remRes] = await Promise.all([
        apiFetch<{ applications: ApplicationItem[] }>('/api/applications'),
        apiFetch<{ reminders: ReminderItem[] }>('/api/reminders'),
      ]);
      setApplications(appRes.applications || []);
      setReminders((remRes.reminders || []).filter((r) => !r.isCompleted));
    } catch {
      // Offline graceful state
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadSummary();
    return subscribeRealtime((evt) => {
      if (evt.type === 'application:updated' || evt.type === 'notification:created') {
        loadSummary();
      }
    });
  }, []);

  const handleToggleVoice = async () => {
    setVoiceError(null);
    if (voice.isRecording) {
      setTranscribing(true);
      try {
        const recorded = await voice.stopRecording();
        const sttRes = await apiFetch<{ transcript: string }>('/api/voice/stt', {
          method: 'POST',
          body: JSON.stringify({
            base64Audio: recorded.base64Audio,
            mimeType: recorded.mimeType,
            languageHint: currentLanguage.englishName,
          }),
        });
        if (sttRes.transcript) {
          onNavigate('ask', { initialQuestion: sttRes.transcript });
        } else {
          setVoiceError('No speech detected. Please speak clearly or type your question.');
        }
      } catch (err: any) {
        setVoiceError(err.message || 'Could not process voice input.');
      } finally {
        setTranscribing(false);
      }
    } else {
      try {
        await voice.startRecording();
      } catch {
        setVoiceError('Microphone permission is unavailable. You can type your question below.');
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    onNavigate('ask', { initialQuestion: questionText.trim() });
  };

  const domains = [
    { key: 'government', icon: Landmark },
    { key: 'education', icon: GraduationCap },
    { key: 'healthcare', icon: HeartPulse },
    { key: 'banking', icon: Building2 },
    { key: 'business', icon: Briefcase },
    { key: 'customer_support', icon: HelpCircle },
  ];

  const greetingText =
    !profile?.isGuest && profile?.fullName
      ? `${t('home.greeting_user')} ${profile.fullName}`
      : t('home.greeting_guest');

  return (
    <div className="@container space-y-8">
      {/* Dominant Focal Anchor: Greeting + Voice-First / Text Assistance Box */}
      <section className="bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted">{greetingText}</p>
          <h1
            className="font-display text-2xl sm:text-3xl font-bold text-body"
            style={{ textWrap: 'balance' }}
          >
            {t('home.hero_prompt')}
          </h1>
        </div>

        {voiceError && (
          <div className="p-3.5 rounded-xl bg-danger text-on-danger text-sm font-medium">
            {voiceError}
          </div>
        )}

        <div className="flex flex-col @2xl:flex-row items-stretch gap-4">
          {!network.isWeakNetworkActive && currentLanguage.sttSupported && (
            <button
              type="button"
              disabled={transcribing}
              onClick={handleToggleVoice}
              className={`min-h-16 px-6 py-4 rounded-2xl font-display text-lg font-bold flex items-center justify-center gap-3 transition-transform active:scale-[0.99] shrink-0 ${
                voice.isRecording
                  ? 'bg-danger text-on-danger'
                  : 'bg-voice text-on-voice hover:bg-voice-hover'
              }`}
            >
              {voice.isRecording ? (
                <>
                  <Square className="w-6 h-6 shrink-0" />
                  <span>{t('home.listening')}</span>
                </>
              ) : (
                <>
                  <Mic className="w-6 h-6 shrink-0" />
                  <span>{transcribing ? 'Transcribing...' : t('home.tap_to_speak')}</span>
                </>
              )}
            </button>
          )}

          <form onSubmit={handleTextSubmit} className="flex-1 flex items-stretch gap-2.5">
            <input
              type="text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={t('home.type_question')}
              aria-label={t('home.type_question')}
              className="flex-1 min-h-14 px-4 rounded-2xl bg-elevated border border-strong text-body text-base placeholder:text-muted"
            />
            <button
              type="submit"
              aria-label="Ask"
              className="min-h-14 min-w-14 px-5 rounded-2xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover shrink-0"
            >
              <Send className="w-5 h-5" />
              <span className="hidden sm:inline">{t('nav.ask')}</span>
            </button>
          </form>
        </div>

        {/* High-Utility Quick Tools */}
        <div className="pt-2 border-t border-hairline grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('explain')}
            className="min-h-14 p-3.5 rounded-xl bg-tint text-tint-fg hover:bg-tint-hover transition-colors flex items-center justify-between gap-3 text-start"
          >
            <div className="flex items-center gap-3">
              <FileSearch className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-semibold text-base">{t('nav.explain')}</div>
                <div className="text-xs text-muted">Scan image or PDF · Plain language</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('grievance')}
            className="min-h-14 p-3.5 rounded-xl bg-elevated border border-hairline text-body hover:bg-tint/40 transition-colors flex items-center justify-between gap-3 text-start"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-warm shrink-0" />
              <div>
                <div className="font-semibold text-base">{t('nav.grievance')}</div>
                <div className="text-xs text-muted">Voice or text · Tracked reference ID</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </section>

      {/* Quick Service Domains */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-body">
            {t('home.quick_services')}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('services')}
            className="text-sm font-medium text-primary hover:underline min-h-10 flex items-center gap-1"
          >
            <span>All {t('nav.services')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-6 gap-3">
          {domains.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate('services', { domain: key })}
              className="min-h-24 p-4 rounded-2xl bg-card border border-hairline hover:bg-tint/40 transition-colors flex flex-col items-start justify-between gap-3 text-start"
            >
              <Icon className="w-6 h-6 text-primary shrink-0" />
              <span className="font-medium text-sm text-body leading-snug">
                <DomainLabel domain={key} />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Active Applications & Upcoming Reminders */}
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
        <section className="bg-card border border-hairline rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-body">
              {t('home.active_applications')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('status')}
              className="text-sm font-medium text-primary hover:underline min-h-10"
            >
              {t('nav.status')}
            </button>
          </div>

          {loadingData ? (
            <div className="space-y-2.5">
              <div className="h-14 rounded-xl bg-elevated animate-pulse" />
              <div className="h-14 rounded-xl bg-elevated animate-pulse" />
            </div>
          ) : applications.length === 0 ? (
            <div className="py-6 text-start space-y-3">
              <p className="text-sm text-muted">{t('home.no_applications')}</p>
              <button
                type="button"
                onClick={() => onNavigate('services')}
                className="min-h-12 px-4 rounded-xl bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-2"
              >
                <span>{t('services.title')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {applications.slice(0, 4).map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onNavigate('status', { selectedAppId: app.id })}
                  className="w-full py-3.5 flex items-center justify-between gap-3 text-start hover:bg-tint/30 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-body truncate">{app.serviceTitle}</div>
                    <div className="text-xs text-muted mt-0.5">
                      <span className="font-mono tabular-nums">{app.referenceNumber}</span>
                      <span> · </span>
                      <span>
                        {t('form.step_of')} {formatNumber(app.currentStep)}/
                        {formatNumber(app.totalSteps)}
                      </span>
                      <span> · </span>
                      <span>{app.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card border border-hairline rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-body">
              {t('home.upcoming_reminders')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="text-sm font-medium text-primary hover:underline min-h-10"
            >
              Manage
            </button>
          </div>

          {loadingData ? (
            <div className="space-y-2.5">
              <div className="h-14 rounded-xl bg-elevated animate-pulse" />
            </div>
          ) : reminders.length === 0 ? (
            <div className="py-6 text-start space-y-3">
              <p className="text-sm text-muted">{t('home.no_reminders')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('explain')}
                  className="min-h-12 px-4 rounded-xl border border-strong bg-elevated text-body text-sm font-medium"
                >
                  {t('nav.explain')}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('notifications')}
                  className="min-h-12 px-4 rounded-xl bg-tint text-tint-fg text-sm font-medium"
                >
                  Add Reminder
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {reminders.slice(0, 4).map((rem) => (
                <div key={rem.id} className="py-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CalendarClock className="w-5 h-5 text-warm mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-body">{rem.title}</div>
                      <div className="text-xs text-muted font-mono tabular-nums mt-0.5">
                        Due {formatDate(rem.dueAt)} · {rem.channel.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export const CitizenServicesScreen: React.FC<{
  initialDomain?: string;
  onStartForm: (template: ServiceTemplate) => void;
  onAskDomain: (question: string) => void;
}> = ({ initialDomain, onStartForm, onAskDomain }) => {
  const { services, t, formatNumber } = useApp();
  const [selectedDomain, setSelectedDomain] = useState<string>(initialDomain || 'all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (initialDomain) setSelectedDomain(initialDomain);
  }, [initialDomain]);

  const domains = [
    'all',
    'government',
    'education',
    'healthcare',
    'banking',
    'business',
    'customer_support',
  ];

  const filtered = services.filter((s) => {
    if (selectedDomain !== 'all' && s.domain !== selectedDomain) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.domain.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="@container space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
          {t('services.title')}
        </h1>
        <p className="text-base text-muted">
          Select a service to start guided smart form filling with automatic document field
          extraction.
        </p>
      </div>

      {/* Interactive Segmented Domain Filter */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-card border border-hairline">
        {domains.map((dom) => (
          <button
            key={dom}
            type="button"
            onClick={() => setSelectedDomain(dom)}
            className={`min-h-11 px-4 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedDomain === dom
                ? 'bg-primary text-on-primary'
                : 'text-body hover:bg-tint/50'
            }`}
          >
            {dom === 'all' ? 'All Domains' : <DomainLabel domain={dom} />}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter services by keyword..."
        className="w-full max-w-md min-h-12 px-4 rounded-xl bg-card border border-hairline text-body placeholder:text-muted"
      />

      {filtered.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-hairline text-start space-y-2">
          <p className="font-medium text-body">No services matched your filter.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedDomain('all');
              setQuery('');
            }}
            className="text-sm text-primary underline min-h-10"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4">
          {filtered.map((svc) => (
            <article
              key={svc.id}
              className="p-6 rounded-2xl bg-card border border-hairline flex flex-col justify-between gap-5"
            >
              <div className="space-y-2.5">
                <div className="text-xs text-muted">
                  <DomainLabel domain={svc.domain} />
                  <span> · </span>
                  <span className="font-mono tabular-nums">
                    {formatNumber(svc.estimatedDays)} days
                  </span>
                  <span> · </span>
                  <span className="font-mono tabular-nums">
                    {formatNumber(svc.formSchema.length)} fields
                  </span>
                </div>
                <h2 className="font-display text-xl font-bold text-body">{svc.title}</h2>
                <p className="text-sm text-muted leading-relaxed">{svc.description}</p>
                {svc.requiredDocuments.length > 0 && (
                  <p className="text-xs text-body pt-1">
                    <span className="font-semibold">{t('services.required_docs')}:</span>{' '}
                    {svc.requiredDocuments.join(' · ')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => onStartForm(svc)}
                  className="min-h-12 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center gap-2 hover:bg-primary-hover whitespace-nowrap shrink-0"
                >
                  <span>{t('services.start_form')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onAskDomain(`How do I apply for ${svc.title}?`)}
                  className="min-h-12 px-4 rounded-xl border border-hairline bg-elevated text-body text-sm font-medium hover:bg-tint/40 whitespace-nowrap shrink-0"
                >
                  Ask eligibility & steps
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export const SmartFormScreen: React.FC<{
  template: ServiceTemplate;
  onBack: () => void;
  onCompleted: (appId: number) => void;
}> = ({ template, onBack, onCompleted }) => {
  const { t, apiFetch, currentLanguage, formatNumber } = useApp();
  const [step, setStep] = useState<number>(1);
  const totalSteps = 4;

  const [values, setValues] = useState<Record<string, string>>({});
  const [autoFilledKeys, setAutoFilledKeys] = useState<string[]>([]);
  const [attachedDocIds, setAttachedDocIds] = useState<number[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractNotice, setExtractNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedApp, setSubmittedApp] = useState<ApplicationItem | null>(null);

  const handleUploadExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setExtractNotice(null);
    setExtracting(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await apiFetch<{
        extractedValues: Record<string, string>;
        documentSummary: string;
        document?: { id: number };
      }>('/api/forms/extract', {
        method: 'POST',
        body: JSON.stringify({
          serviceSlug: template.slug,
          base64Data: base64,
          mimeType,
          fileName: file.name,
          saveToVault: true,
        }),
      });

      const extractedKeys = Object.keys(res.extractedValues || {});
      setValues((prev) => ({ ...prev, ...res.extractedValues }));
      setAutoFilledKeys((prev) => Array.from(new Set([...prev, ...extractedKeys])));
      if (res.document?.id) {
        setAttachedDocIds((prev) => [...prev, res.document!.id]);
      }
      setExtractNotice(
        extractedKeys.length > 0
          ? `Auto-extracted ${extractedKeys.length} field(s) from "${file.name}". Please review each highlighted value.`
          : `Uploaded "${file.name}" (${res.documentSummary}). Fill any remaining fields manually.`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not extract fields from document.');
    } finally {
      setExtracting(false);
    }
  };

  const fieldsForCurrentStep = template.formSchema.filter((f) => f.step === step);

  const validateCurrentStep = () => {
    for (const f of fieldsForCurrentStep) {
      if (f.required && !String(values[f.key] || '').trim()) {
        setErrorMsg(`Please complete required field: "${f.label}"`);
        return false;
      }
    }
    setErrorMsg(null);
    return true;
  };

  const handleSubmitApplication = async () => {
    for (const f of template.formSchema) {
      if (f.required && !String(values[f.key] || '').trim()) {
        setErrorMsg(`Missing required field: "${f.label}"`);
        return;
      }
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ application: ApplicationItem }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify({
          serviceSlug: template.slug,
          serviceTitle: template.title,
          domain: template.domain,
          formData: values,
          autoFilledFields: autoFilledKeys,
          attachedDocumentIds: attachedDocIds,
          languageCode: currentLanguage.code,
        }),
      });
      setSubmittedApp(res.application);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedApp) {
    return (
      <div className="max-w-2xl mx-auto bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3 text-primary">
          <CheckCircle2 className="w-8 h-8 shrink-0" />
          <h1 className="font-display text-2xl font-bold text-body">Application Submitted</h1>
        </div>
        <p className="text-base text-muted">{t('form.submitted_ref')}</p>
        <div className="p-4 rounded-xl bg-tint text-tint-fg font-mono text-xl font-bold tabular-nums">
          {submittedApp.referenceNumber}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onCompleted(submittedApp.id)}
            className="min-h-12 px-5 rounded-xl bg-primary text-on-primary font-semibold"
          >
            Track Application Timeline
          </button>
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 px-4 rounded-xl border border-hairline bg-elevated text-body font-medium"
          >
            Back to Services
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 px-3 rounded-xl text-sm font-medium text-body hover:bg-tint inline-flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Services</span>
      </button>

      <div className="bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>
              <DomainLabel domain={template.domain} />
            </span>
            <span className="font-mono tabular-nums">
              {t('form.step_of')} {formatNumber(step)}/{formatNumber(totalSteps)}
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-body">{template.title}</h1>
          {/* Progress Bar using copper warm accent */}
          <div className="w-full h-2.5 rounded-full bg-elevated overflow-hidden">
            <div
              className="h-full bg-warm transition-transform duration-200 origin-left"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Document Upload Auto-Extraction Box */}
        <div className="p-4 rounded-xl bg-warm-soft border border-hairline flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="font-semibold text-sm text-body">{t('form.upload_autofill')}</div>
            <div className="text-xs text-muted">
              Upload ID card, certificate, or statement (Image or PDF) to extract fields
              automatically.
            </div>
          </div>
          <label className="min-h-12 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold inline-flex items-center gap-2 cursor-pointer hover:bg-primary-hover shrink-0">
            <FileUp className="w-4 h-4" />
            <span>{extracting ? 'Extracting...' : 'Choose Document'}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleUploadExtract}
              disabled={extracting}
              className="sr-only"
            />
          </label>
        </div>

        {extractNotice && (
          <div className="p-3.5 rounded-xl bg-tint text-tint-fg text-sm">{extractNotice}</div>
        )}

        {errorMsg && (
          <div role="alert" className="p-3.5 rounded-xl bg-danger text-on-danger text-sm">
            {errorMsg}
          </div>
        )}

        {/* Step Fields */}
        <div className="space-y-5">
          {fieldsForCurrentStep.map((field) => {
            const isAutoFilled = autoFilledKeys.includes(field.key);
            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-body">
                    {field.label}
                    {field.required && <span className="text-danger ms-1">*</span>}
                  </label>
                  {isAutoFilled && (
                    <span className="text-xs font-medium text-body bg-warm-soft px-2.5 py-0.5 rounded-md">
                      {t('form.autofilled_tag')}
                    </span>
                  )}
                </div>

                {field.type === 'select' ? (
                  <select
                    value={values[field.key] || ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body"
                  >
                    <option value="">Select an option...</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={values[field.key] || ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full p-4 rounded-xl bg-elevated border border-hairline text-body"
                  />
                ) : (
                  <input
                    type={field.type}
                    value={values[field.key] || ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body"
                  />
                )}
              </div>
            );
          })}

          {step === totalSteps && (
            <div className="p-4 rounded-xl bg-elevated border border-hairline space-y-3">
              <h3 className="font-display text-base font-semibold text-body">
                Review Application Summary
              </h3>
              <dl className="divide-y divide-hairline text-sm">
                {template.formSchema.map((f) => (
                  <div key={f.key} className="py-2 flex flex-wrap justify-between gap-2">
                    <dt className="text-muted">
                      {f.label}
                      {autoFilledKeys.includes(f.key) ? ' · Auto-filled' : ''}
                    </dt>
                    <dd className="font-medium text-body">{values[f.key] || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-hairline flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="min-h-12 px-5 rounded-xl border border-hairline bg-elevated text-body font-medium disabled:opacity-40"
          >
            Previous
          </button>

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => {
                if (validateCurrentStep()) setStep((s) => Math.min(totalSteps, s + 1));
              }}
              className="min-h-12 px-6 rounded-xl bg-primary text-on-primary font-semibold flex items-center gap-2 hover:bg-primary-hover"
            >
              <span>Next Step</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitApplication}
              className="min-h-12 px-6 rounded-xl bg-primary text-on-primary font-semibold flex items-center gap-2 hover:bg-primary-hover disabled:opacity-60"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{submitting ? 'Submitting...' : t('form.review_submit')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
