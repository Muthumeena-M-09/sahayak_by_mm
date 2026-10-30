import React, { useState } from 'react';
import {
  Check,
  Download,
  Globe,
  MessageSquare,
  RefreshCw,
  Search,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { usePWAInstall, useVoiceAudio } from '../hooks/usePWAAndNetwork.ts';

export const ResponsiveSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
  const { t } = useApp();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-body/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full md:max-w-xl max-h-[88vh] flex flex-col bg-card text-body border-t md:border border-hairline rounded-t-3xl md:rounded-2xl overflow-hidden">
        {/* Grab handle on mobile bottom sheet */}
        <div className="md:hidden pt-3 pb-1 flex justify-center">
          <div className="w-11 h-1.5 rounded-full bg-hairline" />
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-hairline">
          <h2 className="font-display text-lg font-semibold text-body truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl text-muted hover:bg-tint transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto pb-safe">{children}</div>
      </div>
    </div>
  );
};

export const PWAInstallControl: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t } = useApp();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`min-h-12 flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary font-medium transition-colors hover:bg-primary-hover whitespace-nowrap shrink-0 ${
          compact ? 'px-3.5 text-sm' : 'px-4 py-2.5 text-base w-full'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{t('pwa.install')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`min-h-12 flex items-center justify-center gap-2 rounded-xl border border-strong bg-card text-body font-medium hover:bg-tint transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'px-3.5 text-sm' : 'px-4 py-2.5 text-base w-full'
          }`}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{t('pwa.install')}</span>
        </button>

        <ResponsiveSheet
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title={t('pwa.install')}
        >
          <div className="space-y-3 text-base text-body">
            <p>{t('pwa.ios_step1')}</p>
            <p>{t('pwa.ios_step2')}</p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full min-h-12 rounded-xl bg-primary text-on-primary font-medium"
            >
              {t('common.done')}
            </button>
          </div>
        </ResponsiveSheet>
      </>
    );
  }

  return null;
};

export const WeakConnectionStrip: React.FC<{
  onRetryQueue?: () => void;
  onOpenAsk?: () => void;
}> = ({ onRetryQueue, onOpenAsk }) => {
  const { t, network, formatNumber } = useApp();

  if (!network.isWeakNetworkActive && network.queuedQuestions.length === 0) {
    return null;
  }

  const latestQueued = network.queuedQuestions[network.queuedQuestions.length - 1];
  const smsBody = encodeURIComponent(
    latestQueued ? `SAHAYAK ${latestQueued.question}` : 'SAHAYAK HELP'
  );

  return (
    <div className="bg-warm-soft border-b border-hairline px-4 py-2.5 text-sm text-body">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WifiOff className="w-4 h-4 text-body shrink-0" />
          <span>
            {t('weak_net.banner')}
            {network.queuedQuestions.length > 0 && (
              <span className="ms-2 font-mono tabular-nums font-semibold">
                · {formatNumber(network.queuedQuestions.length)} {t('weak_net.queued')}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {network.isOnline && network.queuedQuestions.length > 0 && onRetryQueue && (
            <button
              type="button"
              onClick={onRetryQueue}
              className="min-h-10 px-3 rounded-lg bg-primary text-on-primary text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('weak_net.retry_queue')}</span>
            </button>
          )}
          <a
            href={`sms:?body=${smsBody}`}
            onClick={() => onOpenAsk?.()}
            className="min-h-10 px-3 rounded-lg border border-strong bg-card text-body text-xs font-medium flex items-center gap-1.5 hover:bg-tint whitespace-nowrap shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t('weak_net.ask_sms')}</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export const LanguagePickerSheet: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { languages, currentLanguage, selectLanguage, t, authToken, profile } = useApp();
  const [search, setSearch] = useState('');
  const [playingCode, setPlayingCode] = useState<string | null>(null);
  const voice = useVoiceAudio(profile?.voiceSpeed || 1.0);

  const filtered = languages.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      l.nativeName.toLowerCase().includes(q) ||
      l.englishName.toLowerCase().includes(q) ||
      l.script.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    );
  });

  const handleListen = async (e: React.MouseEvent, lang: typeof currentLanguage) => {
    e.stopPropagation();
    setPlayingCode(lang.code);
    await voice.playServerTts({
      text: lang.sampleGreeting,
      languageName: lang.englishName,
      localeCode: lang.localeCode,
      languageCode: lang.code,
      authToken,
    });
    setPlayingCode(null);
  };

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={t('lang.select_title')}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="w-5 h-5 text-muted absolute start-3.5 top-3.5 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('lang.search_placeholder')}
            className="w-full min-h-12 ps-11 pe-4 rounded-xl bg-elevated border border-hairline text-body placeholder:text-muted"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[55vh] overflow-y-auto pe-1">
          {filtered.map((lang) => {
            const isSelected = lang.code === currentLanguage.code;
            return (
              <div
                key={lang.code}
                style={{ fontFamily: lang.fontStack }}
                dir={lang.direction}
                className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-tint border-strong text-tint-fg'
                    : 'bg-elevated border-hairline text-body hover:bg-tint/50'
                }`}
              >
                <button
                  type="button"
                  onClick={async () => {
                    await selectLanguage(lang.code);
                    onClose();
                  }}
                  className="flex-1 min-h-12 text-start flex flex-col justify-center"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold leading-snug">{lang.nativeName}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </div>
                  <span className="text-xs text-muted">
                    {lang.englishName} · {lang.script}
                    {lang.direction === 'rtl' ? ' · RTL' : ''}
                  </span>
                </button>

                {lang.ttsSupported && (
                  <button
                    type="button"
                    onClick={(e) => handleListen(e, lang)}
                    aria-label={`${t('lang.listen')} ${lang.englishName}`}
                    className="min-h-12 min-w-12 px-2.5 rounded-xl border border-hairline bg-card text-body hover:bg-tint flex items-center justify-center gap-1.5 text-xs font-medium shrink-0"
                  >
                    <Volume2 className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">
                      {playingCode === lang.code ? '...' : t('lang.listen')}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ResponsiveSheet>
  );
};

export const DomainLabel: React.FC<{ domain: string }> = ({ domain }) => {
  const { t } = useApp();
  const map: Record<string, string> = {
    government: t('domain.government'),
    education: t('domain.education'),
    healthcare: t('domain.healthcare'),
    banking: t('domain.banking'),
    business: t('domain.business'),
    customer_support: t('domain.customer_support'),
  };
  return <>{map[domain] || domain}</>;
};

export const LanguageTriggerButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { currentLanguage, t } = useApp();
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-12 px-3.5 rounded-xl border border-hairline bg-card text-body hover:bg-tint transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap shrink-0"
      aria-label={t('settings.change_language')}
    >
      <Globe className="w-4 h-4 shrink-0" />
      <span>{currentLanguage.nativeName}</span>
    </button>
  );
};
