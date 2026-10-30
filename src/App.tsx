/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck,
  FileSearch,
  HelpCircle,
  Home,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { AdminConsole } from './components/AdminConsole.tsx';
import { CitizenAskScreen, ExplainLetterScreen } from './components/CitizenAskAndExplain.tsx';
import {
  CitizenHomeScreen,
  CitizenServicesScreen,
  SmartFormScreen,
} from './components/CitizenHomeAndServices.tsx';
import {
  CitizenDocumentsScreen,
  CitizenGrievanceScreen,
  CitizenHelpScreen,
  CitizenNotificationsScreen,
  CitizenSettingsScreen,
  CitizenStatusScreen,
} from './components/CitizenRecordsAndSettings.tsx';
import { OnboardingFlow } from './components/OnboardingFlow.tsx';
import {
  LanguagePickerSheet,
  LanguageTriggerButton,
  PWAInstallControl,
  ResponsiveSheet,
  WeakConnectionStrip,
} from './components/SharedUI.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { useVoiceAudio } from './hooks/usePWAAndNetwork.ts';
import type { CitizenScreen, ServiceTemplate } from './types.ts';

const SahayakWorkspace: React.FC = () => {
  const {
    profile,
    isAuthReady,
    isAdminOrStaff,
    currentLanguage,
    t,
    services,
    network,
    apiFetch,
  } = useApp();

  const [portalMode, setPortalMode] = useState<'citizen' | 'admin'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#admin' ? 'admin' : 'citizen'
  );
  const [screen, setScreen] = useState<CitizenScreen>('home');
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>(undefined);
  const [selectedDomain, setSelectedDomain] = useState<string | undefined>(undefined);
  const [selectedService, setSelectedService] = useState<ServiceTemplate | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<number | undefined>(undefined);

  interface CitizenRouteSnapshot {
    screen: CitizenScreen;
    selectedDomain?: string;
    selectedService?: ServiceTemplate | null;
    selectedAppId?: number;
  }

  const [navHistory, setNavHistory] = useState<CitizenRouteSnapshot[]>([]);
  const navHistoryRef = useRef<CitizenRouteSnapshot[]>([]);
  useEffect(() => {
    navHistoryRef.current = navHistory;
  }, [navHistory]);

  // Adaptive navigation controls
  const [tabletRailExpanded, setTabletRailExpanded] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [stickyVoiceBusy, setStickyVoiceBusy] = useState(false);

  const stickyVoice = useVoiceAudio(profile?.voiceSpeed || 1.0);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#admin') {
        setPortalMode('admin');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const switchPortal = (target: 'citizen' | 'admin') => {
    setPortalMode(target);
    if (typeof window !== 'undefined') {
      if (target === 'admin') {
        window.history.replaceState(null, '', '#admin');
      } else if (window.location.hash === '#admin') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  const handleCitizenNavigate = (nextScreen: CitizenScreen, payload?: any) => {
    const nextDomain = payload?.domain !== undefined ? payload.domain : selectedDomain;
    const nextAppId = payload?.selectedAppId !== undefined ? payload.selectedAppId : selectedAppId;
    const nextService =
      payload?.serviceTemplate !== undefined ? payload.serviceTemplate : selectedService;

    const isSameDestination =
      nextScreen === screen &&
      nextDomain === selectedDomain &&
      nextAppId === selectedAppId &&
      nextService?.id === selectedService?.id &&
      !payload?.initialQuestion;

    if (!isSameDestination) {
      setNavHistory((prev) => [
        ...prev.slice(-29),
        {
          screen,
          selectedDomain,
          selectedService,
          selectedAppId,
        },
      ]);
      if (typeof window !== 'undefined') {
        window.history.pushState({ sahayakCitizenNav: true }, '');
      }
    }

    if (payload?.initialQuestion) {
      setPendingQuestion(payload.initialQuestion);
    }
    if (payload?.domain !== undefined) {
      setSelectedDomain(payload.domain);
    }
    if (payload?.selectedAppId !== undefined) {
      setSelectedAppId(payload.selectedAppId);
    }
    if (payload?.serviceTemplate !== undefined) {
      setSelectedService(payload.serviceTemplate);
    }
    setScreen(nextScreen);
    setMobileMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCitizenBack = useCallback(() => {
    const stack = navHistoryRef.current;
    if (stack.length > 0) {
      const prev = stack[stack.length - 1];
      setNavHistory(stack.slice(0, -1));
      setScreen(prev.screen);
      setSelectedDomain(prev.selectedDomain);
      setSelectedService(prev.selectedService ?? null);
      setSelectedAppId(prev.selectedAppId);
      setMobileMoreOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setScreen('home');
    setMobileMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (portalMode === 'citizen' && navHistoryRef.current.length > 0) {
        handleCitizenBack();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [portalMode, handleCitizenBack]);

  const handleStickyMicPress = async () => {
    if (network.isWeakNetworkActive || !currentLanguage.sttSupported) {
      handleCitizenNavigate('ask');
      return;
    }

    if (stickyVoice.isRecording) {
      setStickyVoiceBusy(true);
      try {
        const rec = await stickyVoice.stopRecording();
        const stt = await apiFetch<{ transcript: string }>('/api/voice/stt', {
          method: 'POST',
          body: JSON.stringify({
            base64Audio: rec.base64Audio,
            mimeType: rec.mimeType,
            languageHint: currentLanguage.englishName,
            languageCode: currentLanguage.code,
          }),
        });
        if (stt.transcript?.trim()) {
          handleCitizenNavigate('ask', { initialQuestion: stt.transcript.trim() });
        } else {
          handleCitizenNavigate('ask');
        }
      } catch {
        handleCitizenNavigate('ask');
      } finally {
        setStickyVoiceBusy(false);
      }
    } else {
      try {
        await stickyVoice.startRecording();
      } catch {
        handleCitizenNavigate('ask');
      }
    }
  };

  const handleRetryOfflineQueue = () => {
    if (network.queuedQuestions.length === 0) return;
    const next = network.queuedQuestions[0];
    network.dequeueQuestion(next.id);
    handleCitizenNavigate('ask', { initialQuestion: next.question });
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-canvas text-body flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="font-display text-2xl font-bold text-body">{t('app.name')}</div>
          <div className="text-sm text-muted">{t('app.loading_workspace')}</div>
        </div>
      </div>
    );
  }

  // Admin Console Portal (Role-gated with dedicated Admin Sign-In if not yet authorized)
  if (portalMode === 'admin') {
    return <AdminConsole onBackToCitizen={() => switchPortal('citizen')} />;
  }

  // First-launch Onboarding (Language Picker + Phone OTP / Google / Guest)
  if (!profile) {
    return (
      <div className="relative">
        <OnboardingFlow />
        <div className="max-w-5xl mx-auto px-4 pb-8 flex justify-end">
          <button
            type="button"
            onClick={() => switchPortal('admin')}
            className="min-h-10 px-3.5 rounded-xl text-xs font-medium text-muted hover:text-body underline"
          >
            {t('app.staff_signin')}
          </button>
        </div>
      </div>
    );
  }

  const sidebarItems: Array<{
    id: CitizenScreen;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'ask', label: t('nav.ask'), icon: MessageSquare },
    { id: 'services', label: t('nav.services'), icon: Briefcase },
    { id: 'explain', label: t('nav.explain'), icon: FileSearch },
    { id: 'status', label: t('nav.status'), icon: Clock },
    { id: 'documents', label: t('nav.documents'), icon: FileCheck },
    { id: 'grievance', label: t('nav.grievance'), icon: ShieldAlert },
    { id: 'notifications', label: t('nav.notifications'), icon: Bell },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
    { id: 'help', label: t('nav.help'), icon: HelpCircle },
  ];

  const showFloatingMicOnMobile = screen !== 'ask';
  const canGoBack = navHistory.length > 0 || screen !== 'home';
  const getScreenLabel = (scr: CitizenScreen, svc?: ServiceTemplate | null) => {
    if (scr === 'smart_form') {
      return svc?.title || t('nav.services');
    }
    return sidebarItems.find((i) => i.id === scr)?.label || t('app.name');
  };
  const previousSnapshot = navHistory.length > 0 ? navHistory[navHistory.length - 1] : null;
  const previousPageLabel = previousSnapshot
    ? getScreenLabel(previousSnapshot.screen, previousSnapshot.selectedService)
    : t('nav.home');
  const currentPageLabel = getScreenLabel(screen, selectedService);

  return (
    <div className="min-h-screen bg-canvas text-body flex flex-col">
      <WeakConnectionStrip
        onRetryQueue={handleRetryOfflineQueue}
        onOpenAsk={() => handleCitizenNavigate('ask')}
      />

      <div className="flex-1 flex min-w-0">
        {/* ===================================================================
            DESKTOP PERSISTENT LEFT SIDEBAR (>= 1200px)
            =================================================================== */}
        <aside className="hidden xl:flex xl:w-64 xl:flex-col xl:shrink-0 bg-card border-e border-hairline justify-between p-4 sticky top-0 h-screen overflow-y-auto">
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => handleCitizenNavigate('home')}
              className="w-full px-3 py-2 text-start rounded-xl hover:bg-tint/40 transition-colors"
            >
              <div className="font-display text-2xl font-bold text-body tracking-tight">
                {t('app.name')}
              </div>
              <div className="text-xs text-muted line-clamp-1">{t('app.tagline')}</div>
            </button>

            <nav className="space-y-1" aria-label="Citizen Navigation">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active =
                  screen === item.id || (screen === 'smart_form' && item.id === 'services');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleCitizenNavigate(item.id)}
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
              onClick={() => switchPortal('admin')}
              className="w-full min-h-12 px-3.5 rounded-xl border border-hairline bg-elevated text-body text-sm font-medium flex items-center gap-2.5 hover:bg-tint"
            >
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">
                {isAdminOrStaff ? t('nav.admin') : t('admin.title')}
              </span>
            </button>
          </div>
        </aside>

        {/* ===================================================================
            TABLET COLLAPSIBLE SIDE RAIL (768px - 1199px)
            =================================================================== */}
        <aside
          className={`hidden md:flex xl:hidden flex-col shrink-0 bg-card border-e border-hairline justify-between p-3 sticky top-0 h-screen overflow-y-auto transition-all ${
            tabletRailExpanded ? 'w-60' : 'w-20'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              {tabletRailExpanded && (
                <span className="font-display text-lg font-bold text-body truncate">
                  {t('app.name')}
                </span>
              )}
              <button
                type="button"
                onClick={() => setTabletRailExpanded((v) => !v)}
                aria-label={tabletRailExpanded ? 'Collapse navigation rail' : 'Expand navigation rail'}
                className="min-h-12 min-w-12 rounded-xl border border-hairline bg-elevated text-body flex items-center justify-center mx-auto"
              >
                {tabletRailExpanded ? (
                  <ChevronLeft className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            </div>

            <nav className="space-y-1" aria-label="Tablet Navigation">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active =
                  screen === item.id || (screen === 'smart_form' && item.id === 'services');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleCitizenNavigate(item.id)}
                    title={item.label}
                    className={`w-full min-h-12 px-3 rounded-xl flex items-center ${
                      tabletRailExpanded ? 'justify-start gap-3' : 'justify-center'
                    } text-sm font-medium transition-colors ${
                      active ? 'bg-primary text-on-primary' : 'text-body hover:bg-tint/50'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {tabletRailExpanded && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </nav>
          </div>

          <button
            type="button"
            onClick={() => switchPortal('admin')}
            title={t('nav.admin')}
            className={`w-full min-h-12 px-3 rounded-xl border border-hairline bg-elevated text-body flex items-center ${
              tabletRailExpanded ? 'justify-start gap-3' : 'justify-center'
            } text-xs font-semibold hover:bg-tint`}
          >
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            {tabletRailExpanded && <span className="truncate">{t('nav.admin')}</span>}
          </button>
        </aside>

        {/* ===================================================================
            MAIN ADAPTIVE VIEWPORT
            =================================================================== */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Compact Top Bar (<= 56px on Mobile, 64px on Tablet/Desktop) */}
          <header className="h-14 md:h-16 px-4 sm:px-6 lg:px-8 bg-card border-b border-hairline flex items-center justify-between gap-3 sticky top-0 z-30 pt-safe">
            <div className="flex items-center gap-2.5 min-w-0">
              {canGoBack && (
                <button
                  type="button"
                  onClick={handleCitizenBack}
                  aria-label={`${t('common.back')} · ${previousPageLabel}`}
                  className="min-h-11 px-3 rounded-xl bg-secondary text-on-secondary border border-strong hover:bg-secondary-hover text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="w-4 h-4 rtl:rotate-180 shrink-0" />
                  <span>{t('common.back')}</span>
                  <span className="hidden sm:inline text-muted font-normal max-w-[140px] truncate">
                    · {previousPageLabel}
                  </span>
                </button>
              )}

              {!canGoBack ? (
                <button
                  type="button"
                  onClick={() => handleCitizenNavigate('home')}
                  className="xl:hidden font-display text-lg font-bold text-primary tracking-tight truncate"
                >
                  {t('app.name')}
                </button>
              ) : (
                <span className="xl:hidden font-display text-base sm:text-lg font-bold text-body truncate">
                  {currentPageLabel}
                </span>
              )}

              <span className="hidden xl:inline font-display text-lg font-bold text-body truncate">
                {currentPageLabel}
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <PWAInstallControl compact />
              {/* Persistent Language Control on Tablet & Desktop; on Phone also accessible in Settings & More */}
              <div className="hidden md:block">
                <LanguageTriggerButton onClick={() => setLangPickerOpen(true)} />
              </div>
              <button
                type="button"
                onClick={() => setLangPickerOpen(true)}
                className="md:hidden min-h-11 px-3 rounded-xl border border-hairline bg-elevated text-body text-xs font-semibold"
                aria-label={t('settings.change_language')}
              >
                {currentLanguage.nativeName}
              </button>
            </div>
          </header>

          {/* Screen Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 md:pb-10 max-w-6xl w-full mx-auto">
            {screen === 'home' && <CitizenHomeScreen onNavigate={handleCitizenNavigate} />}

            {screen === 'ask' && (
              <CitizenAskScreen
                initialQuestion={pendingQuestion}
                onConsumeInitialQuestion={() => setPendingQuestion(undefined)}
                onStartService={(svc) =>
                  handleCitizenNavigate('smart_form', { serviceTemplate: svc })
                }
                onNavigate={handleCitizenNavigate}
              />
            )}

            {screen === 'services' && (
              <CitizenServicesScreen
                initialDomain={selectedDomain}
                onStartForm={(tpl) =>
                  handleCitizenNavigate('smart_form', { serviceTemplate: tpl })
                }
                onAskDomain={(q) => handleCitizenNavigate('ask', { initialQuestion: q })}
              />
            )}

            {screen === 'smart_form' && (
              <SmartFormScreen
                template={selectedService || services[0]}
                onBack={handleCitizenBack}
                onCompleted={(appId) =>
                  handleCitizenNavigate('status', { selectedAppId: appId })
                }
              />
            )}

            {screen === 'explain' && <ExplainLetterScreen />}

            {screen === 'status' && (
              <CitizenStatusScreen
                selectedAppId={selectedAppId}
                onAskAboutApp={(q) => handleCitizenNavigate('ask', { initialQuestion: q })}
                onNavigate={handleCitizenNavigate}
              />
            )}

            {screen === 'documents' && <CitizenDocumentsScreen />}

            {screen === 'grievance' && (
              <CitizenGrievanceScreen
                onSubmitted={() => handleCitizenNavigate('status')}
              />
            )}

            {screen === 'notifications' && <CitizenNotificationsScreen />}

            {screen === 'settings' && <CitizenSettingsScreen />}

            {screen === 'help' && <CitizenHelpScreen onNavigate={handleCitizenNavigate} />}
          </main>
        </div>
      </div>

      {/* =====================================================================
          PHONE (< 768px): STICKY MIC BUTTON + BOTTOM TAB BAR (Home, Ask, Status + More)
          ===================================================================== */}
      {showFloatingMicOnMobile && (
        <button
          type="button"
          onClick={handleStickyMicPress}
          disabled={stickyVoiceBusy}
          aria-label={t('home.tap_to_speak')}
          className={`md:hidden fixed end-4 bottom-20 z-40 min-h-14 min-w-14 px-4 rounded-full shadow-lg flex items-center justify-center gap-2 font-semibold text-sm transition-transform active:scale-95 ${
            stickyVoice.isRecording
              ? 'bg-danger text-on-danger'
              : 'bg-primary text-on-primary hover:bg-primary-hover'
          }`}
        >
          {stickyVoice.isRecording ? (
            <>
              <Square className="w-5 h-5 shrink-0" />
              <span>{t('common.stop')}</span>
            </>
          ) : (
            <Mic className="w-6 h-6 shrink-0" />
          )}
        </button>
      )}

      <nav
        aria-label="Mobile Primary Tabs"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-hairline pb-safe"
      >
        <div className="grid grid-cols-4 h-16">
          {(
            [
              { id: 'home', label: t('nav.home'), icon: Home },
              { id: 'ask', label: t('nav.ask'), icon: MessageSquare },
              { id: 'status', label: t('nav.status'), icon: Clock },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = screen === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleCitizenNavigate(tab.id)}
                className={`min-h-12 flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
                  active ? 'text-primary' : 'text-muted'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate max-w-[76px]">{tab.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMoreOpen(true)}
            className={`min-h-12 flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
              !['home', 'ask', 'status'].includes(screen) ? 'text-primary' : 'text-muted'
            }`}
          >
            <MoreHorizontal className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-[76px]">{t('common.more')}</span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Sheet for All Secondary Citizen Tools & Settings */}
      <ResponsiveSheet
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        title={t('app.name')}
      >
        <div className="grid grid-cols-1 gap-2">
          {sidebarItems
            .filter((item) => !['home', 'ask', 'status'].includes(item.id))
            .map((item) => {
              const Icon = item.icon;
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCitizenNavigate(item.id)}
                  className={`w-full min-h-12 px-4 rounded-xl flex items-center gap-3 text-sm font-semibold ${
                    active ? 'bg-primary text-on-primary' : 'bg-elevated text-body'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

          <div className="pt-3 mt-1 border-t border-hairline">
            <button
              type="button"
              onClick={() => {
                setMobileMoreOpen(false);
                switchPortal('admin');
              }}
              className="w-full min-h-12 px-4 rounded-xl border border-strong bg-card text-body text-sm font-semibold flex items-center gap-3"
            >
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              <span>{t('nav.admin')}</span>
            </button>
          </div>
        </div>
      </ResponsiveSheet>

      <LanguagePickerSheet open={langPickerOpen} onClose={() => setLangPickerOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <SahayakWorkspace />
    </AppProvider>
  );
}
