import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  KeyRound,
  Phone,
  Search,
  ShieldCheck,
  UserCheck,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useVoiceAudio } from '../hooks/usePWAAndNetwork.ts';
import { PWAInstallControl } from './SharedUI.tsx';

export const OnboardingFlow: React.FC = () => {
  const {
    languages,
    currentLanguage,
    suggestedDeviceLangCode,
    hasChosenLanguage,
    selectLanguage,
    t,
    signInWithGooglePopup,
    completeOtpOrGuestSession,
  } = useApp();

  const [step, setStep] = useState<'language' | 'verify'>(
    hasChosenLanguage ? 'verify' : 'language'
  );
  const [search, setSearch] = useState('');
  const [playingCode, setPlayingCode] = useState<string | null>(null);
  const voice = useVoiceAudio(1.0);

  // OTP & Consent state
  const [phoneInput, setPhoneInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sandboxHintCode, setSandboxHintCode] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  const suggestedLang = languages.find((l) => l.code === suggestedDeviceLangCode);

  const filteredLanguages = languages.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      l.nativeName.toLowerCase().includes(q) ||
      l.englishName.toLowerCase().includes(q) ||
      l.script.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    );
  });

  const handleListenLanguage = async (
    e: React.MouseEvent,
    lang: (typeof languages)[number]
  ) => {
    e.stopPropagation();
    setPlayingCode(lang.code);
    await voice.playServerTts({
      text: lang.sampleGreeting,
      languageName: lang.englishName,
      localeCode: lang.localeCode,
      languageCode: lang.code,
    });
    setPlayingCode(null);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!consentChecked) {
      setErrorMsg(t('auth.err_consent'));
      return;
    }
    if (phoneInput.trim().length < 8) {
      setErrorMsg(t('auth.err_phone'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: phoneInput.trim(), channel: 'phone' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('auth.err_phone'));
      setOtpSent(true);
      setResendSeconds(30);
      setSandboxHintCode(data.sandboxVerificationCode || null);
    } catch (err: any) {
      setErrorMsg(err.message || t('auth.err_phone'));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (otpCode.trim().length !== 6) {
      setErrorMsg(t('auth.err_otp'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: phoneInput.trim(),
          code: otpCode.trim(),
          channel: 'phone',
          fullName: fullNameInput.trim() || undefined,
          preferredLanguage: currentLanguage.code,
          consentGiven: consentChecked,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      completeOtpOrGuestSession(data.sessionToken, data.profile, data.roles);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    if (!consentChecked) {
      setErrorMsg(t('auth.err_consent'));
      return;
    }
    setBusy(true);
    try {
      await signInWithGooglePopup();
    } catch (err: any) {
      setErrorMsg(err.message || 'Google Sign-In was cancelled or failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleContinueAsGuest = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: currentLanguage.code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to start guest session.');
      completeOtpOrGuestSession(data.sessionToken, data.profile, data.roles);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not continue as guest.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'language') {
    return (
      <div className="min-h-screen bg-canvas text-body flex flex-col">
        <header className="border-b border-hairline bg-card/80 backdrop-blur-xs">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <span className="font-display text-xl font-bold text-primary whitespace-nowrap shrink-0">
              {t('app.name')}
            </span>
            <PWAInstallControl compact />
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="max-w-2xl space-y-2">
            <h1
              className="font-display text-2xl sm:text-4xl font-bold text-body"
              style={{ textWrap: 'balance' }}
            >
              {t('lang.select_title')}
            </h1>
            <p className="text-base sm:text-lg text-muted">{t('lang.select_subtitle')}</p>
          </div>

          {suggestedLang && (
            <div className="p-4 rounded-2xl bg-tint border border-hairline flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-tint-fg">{t('lang.suggested')}</p>
                <p
                  className="text-lg font-semibold text-body mt-0.5"
                  style={{ fontFamily: suggestedLang.fontStack }}
                >
                  {suggestedLang.nativeName}{' '}
                  <span className="text-sm font-normal text-muted">
                    · {suggestedLang.englishName}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleListenLanguage(e, suggestedLang)}
                  className="min-h-12 px-4 rounded-xl border border-hairline bg-card text-body text-sm font-medium flex items-center gap-2 hover:bg-elevated"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{t('lang.listen')}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await selectLanguage(suggestedLang.code);
                    setStep('verify');
                  }}
                  className="min-h-12 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center gap-2 hover:bg-primary-hover"
                >
                  <span>{t('lang.continue')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="relative max-w-xl">
            <Search className="w-5 h-5 text-muted absolute start-4 top-3.5 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('lang.search_placeholder')}
              aria-label={t('lang.search_placeholder')}
              className="w-full min-h-12 ps-12 pe-4 rounded-xl bg-card border border-hairline text-body placeholder:text-muted"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredLanguages.map((lang) => {
              const isSelected = lang.code === currentLanguage.code;
              return (
                <div
                  key={lang.code}
                  style={{ fontFamily: lang.fontStack }}
                  dir={lang.direction}
                  className={`p-4 rounded-2xl border transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-tint border-strong text-tint-fg'
                      : 'bg-card border-hairline text-body hover:bg-tint/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      await selectLanguage(lang.code);
                      setStep('verify');
                    }}
                    className="flex-1 min-h-12 text-start flex flex-col justify-center"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold leading-snug">{lang.nativeName}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </div>
                    <span className="text-xs text-muted mt-0.5">
                      {lang.englishName} · {lang.script}
                      {lang.direction === 'rtl' ? ' · RTL' : ''}
                    </span>
                  </button>

                  {lang.ttsSupported && (
                    <button
                      type="button"
                      onClick={(e) => handleListenLanguage(e, lang)}
                      aria-label={`${t('lang.listen')} ${lang.nativeName}`}
                      className="min-h-12 px-3 rounded-xl border border-hairline bg-elevated text-body hover:bg-tint flex items-center gap-1.5 text-xs font-medium shrink-0"
                    >
                      <Volume2 className="w-4 h-4 shrink-0" />
                      <span>{playingCode === lang.code ? '...' : t('lang.listen')}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-body flex flex-col">
      <header className="border-b border-hairline bg-card/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <span className="font-display text-xl font-bold text-primary whitespace-nowrap shrink-0">
            {t('app.name')}
          </span>
          <button
            type="button"
            onClick={() => setStep('language')}
            className="min-h-12 px-3.5 rounded-xl border border-hairline bg-card text-body text-sm font-medium hover:bg-tint whitespace-nowrap shrink-0"
          >
            {currentLanguage.nativeName} · {t('auth.change_lang')}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold text-body">{t('auth.title')}</h1>
            <p className="text-base text-muted">{t('auth.subtitle')}</p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-danger text-on-danger text-sm font-medium"
            >
              {errorMsg}
            </div>
          )}

          {/* Mandatory Explicit Consent Capture */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-elevated border border-hairline cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-1 w-5 h-5 accent-primary shrink-0"
            />
            <span className="text-sm text-body leading-relaxed">{t('auth.consent_text')}</span>
          </label>

          {/* Option 1: Verify Phone via 6-digit OTP */}
          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1.5">
                  {t('auth.name_label')}
                </label>
                <input
                  type="text"
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  placeholder={t('auth.name_placeholder')}
                  className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-body placeholder:text-muted"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1.5">
                  {t('auth.phone_label')}
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-muted absolute start-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full min-h-12 ps-11 pe-4 rounded-xl bg-elevated border border-hairline text-body font-mono tabular-nums placeholder:font-sans placeholder:text-muted"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover disabled:opacity-60"
              >
                <KeyRound className="w-4 h-4" />
                <span>{busy ? t('auth.sending') : t('auth.send_otp')}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {sandboxHintCode && (
                <div className="p-3 rounded-xl bg-tint text-tint-fg text-sm">
                  {t('auth.sandbox_otp_notice')}{' '}
                  <strong className="font-mono tabular-nums tracking-widest">
                    {sandboxHintCode}
                  </strong>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-body mb-1.5">
                  {t('auth.enter_otp')} ({phoneInput})
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-strong text-body text-center text-2xl tracking-[0.4em] font-mono tabular-nums"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover disabled:opacity-60"
              >
                <ShieldCheck className="w-5 h-5" />
                <span>{busy ? t('auth.verifying') : t('auth.verify_otp')}</span>
              </button>

              <div className="flex items-center justify-between text-sm text-muted">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode('');
                  }}
                  className="underline hover:text-body min-h-10"
                >
                  {t('auth.change_number')}
                </button>

                {resendSeconds > 0 ? (
                  <span className="font-mono tabular-nums">
                    {t('auth.resend_in')} {resendSeconds}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="font-medium text-primary underline min-h-10"
                  >
                    {t('auth.resend_now')}
                  </button>
                )}
              </div>
            </form>
          )}

          <div className="relative py-1 flex items-center justify-center">
            <div className="border-t border-hairline w-full" />
            <span className="bg-card px-3 text-xs text-muted">{t('common.or')}</span>
            <div className="border-t border-hairline w-full" />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="w-full min-h-12 rounded-xl border border-strong bg-elevated text-body font-medium flex items-center justify-center gap-2 hover:bg-tint transition-colors"
            >
              <UserCheck className="w-4 h-4" />
              <span>{t('auth.google_signin')}</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleContinueAsGuest}
              className="w-full min-h-12 rounded-xl bg-tint text-tint-fg font-medium flex items-center justify-center gap-2 hover:bg-tint-hover transition-colors"
            >
              <span>{t('auth.continue_guest')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
