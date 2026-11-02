import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarPlus,
  Camera,
  Check,
  FileText,
  FileUp,
  Headphones,
  Mic,
  Plus,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { fileToBase64, useVoiceAudio } from '../hooks/usePWAAndNetwork.ts';
import { ISLAssist } from './isl/ISLAssist.tsx';
import { confirmedISLPayload } from '../lib/isl/chat.ts';
import { islMessages } from '../lib/isl/messages.ts';
import type {
  CitationItem,
  CitizenScreen,
  ConversationItem,
  MessageItem,
  ServiceTemplate,
} from '../types.ts';
import { ResponsiveSheet } from './SharedUI.tsx';

function renderInlineBold(line: string): React.ReactNode {
  const segments = line.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
}

function renderFormattedMessage(content: string): React.ReactNode {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, idx) => {
        const trimmed = rawLine.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }
        const bulletMatch = trimmed.match(/^([*\-•]|\d+\.)\s+(.*)$/);
        if (bulletMatch) {
          const marker = /^\d+\./.test(bulletMatch[1]) ? bulletMatch[1] : '•';
          return (
            <div key={idx} className="flex items-start gap-2 ps-1">
              <span className="font-semibold shrink-0 select-none">{marker}</span>
              <span className="flex-1">{renderInlineBold(bulletMatch[2])}</span>
            </div>
          );
        }
        const headingMatch = trimmed.match(/^#{1,4}\s+(.*)$/);
        if (headingMatch) {
          return (
            <div key={idx} className="font-semibold pt-1">
              {renderInlineBold(headingMatch[1])}
            </div>
          );
        }
        return <p key={idx}>{renderInlineBold(rawLine)}</p>;
      })}
    </div>
  );
}

interface PendingAttachment {
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export const CitizenAskScreen: React.FC<{
  initialQuestion?: string;
  onConsumeInitialQuestion?: () => void;
  onStartService: (svc: ServiceTemplate) => void;
  onNavigate: (screen: CitizenScreen) => void;
}> = ({ initialQuestion, onConsumeInitialQuestion, onStartService, onNavigate }) => {
  const {
    authToken,
    profile,
    currentLanguage,
    t,
    tStatus,
    apiFetch,
    services,
    network,
    subscribeRealtime,
    formatDate,
  } = useApp();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState('');
  const [islOpen, setIslOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<'text'|'isl'>('text');
  const [streamingText, setStreamingText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceReviewHint, setVoiceReviewHint] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationItem | null>(null);
  const [feedbackMsgId, setFeedbackMsgId] = useState<number | null>(null);
  const [ratedMessageIds, setRatedMessageIds] = useState<Record<number, 'up' | 'down'>>({});
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);

  const voice = useVoiceAudio(profile?.voiceSpeed || 1.0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadConversations = async () => {
    try {
      const res = await apiFetch<{ conversations: ConversationItem[] }>('/api/conversations');
      setConversations(res.conversations || []);
    } catch {
      // Offline tolerance
    }
  };

  const openConversation = async (convId: number) => {
    setErrorBanner(null);
    try {
      const res = await apiFetch<{ conversation: ConversationItem; messages: MessageItem[] }>(
        `/api/conversations/${convId}/messages`
      );
      setActiveConv(res.conversation);
      setMessages(res.messages || []);
      setMobileThreadsOpen(false);
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not load conversation.');
    }
  };

  useEffect(() => {
    loadConversations();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Subscribe to real-time human agent replies over WebSocket
  useEffect(() => {
    return subscribeRealtime((evt) => {
      if (
        evt.type === 'message:created' &&
        evt.payload?.conversationId &&
        activeConv &&
        evt.payload.conversationId === activeConv.id
      ) {
        const incoming: MessageItem = evt.payload.message;
        setMessages((prev) =>
          prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
        );
      }
      if (
        evt.type === 'conversation:updated' &&
        evt.payload?.conversation &&
        activeConv &&
        evt.payload.conversation.id === activeConv.id
      ) {
        setActiveConv(evt.payload.conversation);
      }
    });
  }, [activeConv, subscribeRealtime]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, isSending]);

  const sendQuestion = async (rawQuestion: string, attachmentOverride?: PendingAttachment | null, inputMode:'text'|'isl'='text') => {
    const attachmentToSend =
      attachmentOverride !== undefined ? attachmentOverride : pendingAttachment;
    const trimmed =
      rawQuestion.trim() ||
      (attachmentToSend ? t('ask.default_doc_prompt') : '');

    if ((!trimmed && !attachmentToSend) || isSending) return;

    setErrorBanner(null);
    setFeedbackBanner(null);
    setVoiceReviewHint(false);

    // Weak-network / offline handling: serve cached answer if available, else queue
    if (!network.isOnline) {
      const cached = network.findCachedAnswer(trimmed, currentLanguage.code);
      if (cached) {
        const syntheticId = Date.now();
        setMessages((prev) => [
          ...prev,
          {
            id: syntheticId,
            conversationId: activeConv?.id || 0,
            senderRole: 'user',
            senderUid: profile?.uid || null,
            content: trimmed,
            translatedContent: null,
            detectedLanguage: currentLanguage.code,
            confidence: null,
            citations: [],
            suggestedActions: [],
            latencyMs: null,
            createdAt: new Date().toISOString(),
          },
          {
            id: syntheticId + 1,
            conversationId: activeConv?.id || 0,
            senderRole: 'assistant',
            senderUid: null,
            content: `${cached.answer}\n\n(${t('ask.offline_cached_note')})`,
            translatedContent: null,
            detectedLanguage: currentLanguage.code,
            confidence: 0.9,
            citations: [],
            suggestedActions: [],
            latencyMs: 0,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        network.enqueueQuestion(trimmed, currentLanguage.code);
        setErrorBanner(t('ask.offline_queued_note'));
      }
      setInput('');
      setPendingAttachment(null);
      return;
    }

    // Optimistically display user's message immediately so UI is responsive in 0ms
    const optimisticTempId = -Date.now();
    const optimisticContent = attachmentToSend
      ? `[${attachmentToSend.fileName}]\n${trimmed}`
      : trimmed;

    setMessages((prev) => [
      ...prev,
      {
        id: optimisticTempId,
        conversationId: activeConv?.id || 0,
        senderRole: 'user',
        senderUid: profile?.uid || null,
        content: optimisticContent,
        translatedContent: null,
        detectedLanguage: currentLanguage.code,
        confidence: null,
        citations: [],
        suggestedActions: [],
        latencyMs: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    setIsSending(true);
    setInput('');
    setPendingAttachment(null);
    setStreamingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let streamFinished = false;
    let userMessageSaved = false;
    const handleSseFrame = (frame: string) => {
      const dataLine = frame
        .split('\n')
        .find((l) => l.startsWith('data: '));
      if (!dataLine) return;
      const jsonStr = dataLine.slice(6);
      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'meta' && event.userMessage) {
          userMessageSaved = true;
          if (event.conversationId && !activeConv) {
            setActiveConv((prev) =>
              prev || {
                id: event.conversationId,
                userUid: profile?.uid || '',
                title: trimmed.slice(0, 80),
                domain: 'general',
                languageCode: event.detectedLanguage || currentLanguage.code,
                status: 'ai_active',
                handoverReason: null,
                assignedAgentUid: null,
                resolvedWithoutAgent: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            );
          }
          setMessages((prev) => {
            const withoutTemp = prev.filter((m) => m.id !== optimisticTempId);
            return withoutTemp.some((m) => m.id === event.userMessage.id)
              ? withoutTemp
              : [...withoutTemp, event.userMessage];
          });
        } else if (event.type === 'delta' && event.text) {
          setStreamingText((prev) => prev + event.text);
        } else if (event.type === 'done') {
          streamFinished = true;
          setStreamingText('');
          if (event.conversation) {
            setActiveConv(event.conversation);
          }
          if (event.assistantMessage) {
            setMessages((prev) =>
              prev.some((m) => m.id === event.assistantMessage.id)
                ? prev
                : [...prev, event.assistantMessage]
            );
            network.cacheAnswer(
              trimmed,
              event.assistantMessage.content,
              event.assistantMessage.detectedLanguage || currentLanguage.code
            );
          }
          loadConversations();
        } else if (event.type === 'error') {
          streamFinished = true;
          setStreamingText('');
          setErrorBanner(event.error || 'Assistant failed to respond.');
        }
      } catch {
        // Ignore partial frame
      }
    };

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(inputMode==='isl' ? confirmedISLPayload(trimmed,currentLanguage.code,activeConv?.id) : {
          message: trimmed,
          conversationId: activeConv?.id,
          preferredLanguageCode: currentLanguage.code,
          attachment: attachmentToSend || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || `Assistant stream failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            handleSseFrame(buffer.trim());
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const frame of parts) {
          handleSseFrame(frame);
        }
      }
      if (!streamFinished) throw new Error('Connection interrupted before the answer was saved. Please retry.');
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setErrorBanner(err.message || 'Failed to send question.');
        if (!userMessageSaved && !navigator.onLine) network.enqueueQuestion(trimmed, currentLanguage.code);
      }
    } finally {
      setIsSending(false);
      setStreamingText('');
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (initialQuestion && initialQuestion.trim()) {
      const q = initialQuestion;
      onConsumeInitialQuestion?.();
      sendQuestion(q, null);
    }
  }, [initialQuestion]);

  const handleVoiceToggle = async () => {
    setIslOpen(false);
    setDraftMode('text');
    setErrorBanner(null);
    if (voice.isRecording) {
      setIsTranscribing(true);
      try {
        const rec = await voice.stopRecording();
        const stt = await apiFetch<{ transcript: string }>('/api/voice/stt', {
          method: 'POST',
          body: JSON.stringify({
            base64Audio: rec.base64Audio,
            mimeType: rec.mimeType,
            languageHint: currentLanguage.englishName,
            languageCode: currentLanguage.code,
          }),
        });
        const cleanTranscript = (stt.transcript || '').trim();
        if (cleanTranscript) {
          setInput((prev) => (prev.trim() ? `${prev.trim()} ${cleanTranscript}` : cleanTranscript));
          setVoiceReviewHint(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          setErrorBanner(t('home.err_no_speech'));
        }
      } catch (err: any) {
        setErrorBanner(err.message || t('home.err_no_speech'));
      } finally {
        setIsTranscribing(false);
      }
    } else {
      try {
        setVoiceReviewHint(false);
        await voice.startRecording();
      } catch {
        setErrorBanner(t('home.err_mic'));
      }
    }
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setErrorBanner('Please select a PDF or image smaller than 12 MB.');
      return;
    }
    setErrorBanner(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      setPendingAttachment({
        fileName: file.name,
        mimeType,
        base64Data: base64,
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not read the selected file.');
    }
  };

  const handleTalkToHuman = async () => {
    setErrorBanner(null);
    try {
      const targetId = activeConv?.id ?? 0;
      const res = await apiFetch<{ conversation: ConversationItem; systemMessage: MessageItem }>(
        `/api/conversations/${targetId}/handover`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: 'user_requested',
            preferredLanguageCode: currentLanguage.code,
            initialTopic: input.trim() || activeConv?.title || t('ask.talk_human'),
          }),
        }
      );
      setActiveConv(res.conversation);
      if (res.systemMessage) {
        setMessages((prev) =>
          prev.some((m) => m.id === res.systemMessage.id) ? prev : [...prev, res.systemMessage]
        );
      }
      loadConversations();
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to request human support.');
    }
  };

  const handleNewConversation = () => {
    abortControllerRef.current?.abort();
    voice.stopPlayback();
    setIsSending(false);
    setStreamingText('');
    setActiveConv(null);
    setMessages([]);
    setPendingAttachment(null);
    setVoiceReviewHint(false);
    setErrorBanner(null);
    setFeedbackBanner(null);
  };

  const handleRateMessage = async (msgId: number, rating: 'up' | 'down', reason?: string) => {
    if (msgId <= 0) return;
    try {
      await apiFetch(`/api/messages/${msgId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating, reason }),
      });
      setRatedMessageIds((prev) => ({ ...prev, [msgId]: rating }));
      setFeedbackMsgId(null);
      setFeedbackBanner(t('ask.feedback_saved'));
      setTimeout(() => setFeedbackBanner(null), 3500);
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not submit feedback.');
    }
  };

  const allCitationsInThread = messages
    .flatMap((m) => m.citations || [])
    .filter(
      (c, idx, arr) =>
        arr.findIndex(
          (x) =>
            x.documentTitle === c.documentTitle && x.pageNumber === c.pageNumber
        ) === idx
    );

  const starterPrompts = [
    t('ask.starter_gov'),
    t('ask.starter_edu'),
    t('ask.starter_bank'),
    t('ask.starter_grievance'),
  ];

  const formatTimer = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
      {/* Main Chat Pane */}
      <div className="md:col-span-8 bg-card border border-hairline rounded-2xl flex flex-col min-h-[70vh] max-h-[84vh]">
        <div className="px-4 sm:px-5 py-3.5 border-b border-hairline flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-bold text-body truncate">
              {activeConv ? activeConv.title : t('ask.title')}
            </h1>
            {activeConv && (
              <p className="text-xs text-muted">
                {t('common.status')}: {tStatus(activeConv.status)}
                {activeConv.languageCode ? ` · ${activeConv.languageCode.toUpperCase()}` : ''}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileThreadsOpen(true)}
                className="md:hidden min-h-11 px-3 rounded-xl border border-hairline bg-elevated text-body text-xs font-medium"
              >
                {t('ask.recent_threads')} ({conversations.length})
              </button>
            )}

            {(!activeConv || activeConv.status === 'ai_active') && (
              <button
                type="button"
                onClick={handleTalkToHuman}
                className="min-h-11 px-3.5 rounded-xl border border-strong bg-elevated text-body text-xs font-medium flex items-center gap-1.5 hover:bg-tint whitespace-nowrap shrink-0"
              >
                <Headphones className="w-4 h-4 shrink-0" />
                <span>{t('ask.talk_human')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNewConversation}
              aria-label={t('ask.new')}
              className="min-h-11 px-3 rounded-xl bg-tint text-tint-fg text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 hover:opacity-90"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t('ask.new')}</span>
            </button>
          </div>
        </div>

        {activeConv &&
          (activeConv.status === 'needs_human' || activeConv.status === 'agent_assigned') && (
            <div className="mx-5 mt-3 px-4 py-2.5 rounded-xl bg-warm-soft border border-hairline text-body text-xs font-medium flex items-center gap-2">
              <Headphones className="w-4 h-4 text-primary shrink-0" />
              <span>{t('ask.human_queue_banner')}</span>
            </div>
          )}

        {errorBanner && (
          <div
            role="alert"
            className="mx-5 mt-3 p-3 rounded-xl bg-danger text-on-danger text-sm flex items-center justify-between gap-3"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs underline shrink-0"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        {feedbackBanner && (
          <div className="mx-5 mt-3 px-3.5 py-2.5 rounded-xl bg-tint text-tint-fg text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {messages.length === 0 && !streamingText && !isSending ? (
            <div className="h-full py-6 sm:py-10 flex flex-col justify-center max-w-xl mx-auto space-y-6">
              <div className="space-y-2">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-body">
                  {t('ask.empty_title')}
                </h2>
                <p className="text-sm sm:text-base text-muted leading-relaxed">
                  {t('ask.empty_desc')}
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-muted">{t('ask.starter_heading')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {starterPrompts.map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => sendQuestion(promptText, null)}
                      className="p-3.5 rounded-xl bg-elevated border border-hairline hover:bg-tint text-start text-sm text-body leading-snug transition-colors"
                    >
                      {promptText}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.senderRole === 'user';
              const isSystem = msg.senderRole === 'system';

              if (isSystem) {
                return (
                  <div
                    key={msg.id}
                    className="p-3 rounded-xl bg-warm-soft text-body text-xs font-medium text-center"
                  >
                    {msg.content}
                  </div>
                );
              }

              const isThisPlaying = voice.playingId === msg.id && voice.isPlayingTts;
              const isThisLoadingAudio = voice.loadingTtsId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[84%] p-4 rounded-2xl text-base leading-relaxed ${
                      isUser
                        ? 'bg-primary text-on-primary whitespace-pre-wrap'
                        : 'bg-tint text-tint-fg border border-hairline'
                    }`}
                  >
                    {msg.senderRole === 'human_agent' && (
                      <div className="text-xs font-semibold mb-1.5 opacity-80">
                        {t('ask.human_agent_badge')}
                      </div>
                    )}
                    {isUser ? msg.content : renderFormattedMessage(msg.content)}
                  </div>

                  {/* Grounded Citations + Actions + TTS + Feedback for Assistant/Agent messages */}
                  {!isUser && (
                    <div className="max-w-[94%] space-y-2.5">
                      {typeof msg.confidence === 'number' && msg.confidence < 0.52 && (
                        <div className="flex items-center gap-2 text-xs text-danger font-medium">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{t('ask.low_confidence')}</span>
                        </div>
                      )}

                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          {msg.citations.map((cit, idx) => (
                            <button
                              key={`${cit.documentId}-${idx}`}
                              type="button"
                              onClick={() => setSelectedCitation(cit)}
                              className="min-h-10 px-3 py-1.5 rounded-lg bg-elevated border border-hairline text-xs font-medium text-body hover:bg-tint flex items-center gap-1.5"
                            >
                              <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="truncate max-w-[200px]">{cit.sourceNumber ? `[SOURCE ${cit.sourceNumber}] ` : ''}{cit.documentTitle}</span>
                              <span className="font-mono tabular-nums text-muted">
                                · {t('ask.page')} {cit.pageNumber}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {!network.isWeakNetworkActive && currentLanguage.ttsSupported && (
                          <button
                            type="button"
                            onClick={() =>
                              voice.playServerTts({
                                id: msg.id,
                                text: msg.content,
                                languageName: currentLanguage.englishName,
                                localeCode: currentLanguage.localeCode,
                                languageCode: msg.detectedLanguage || currentLanguage.code,
                                authToken,
                              })
                            }
                            className={`min-h-10 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                              isThisPlaying
                                ? 'bg-primary text-on-primary border-primary'
                                : 'border-hairline bg-card text-body hover:bg-tint'
                            }`}
                          >
                            {isThisPlaying ? (
                              <Square className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>
                              {isThisLoadingAudio
                                ? t('ask.loading_audio')
                                : isThisPlaying
                                  ? t('ask.stop_audio')
                                  : t('ask.listen_answer')}
                            </span>
                          </button>
                        )}

                        {msg.suggestedActions?.map((act, idx) => {
                          if (act.type === 'talk_to_human') {
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={handleTalkToHuman}
                                className="min-h-10 px-3 rounded-lg border border-hairline bg-card text-xs font-medium text-body hover:bg-tint flex items-center gap-1.5"
                              >
                                <Headphones className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('ask.talk_human')}</span>
                              </button>
                            );
                          }
                          if (act.type === 'start_application') {
                            const matched =
                              (act.serviceSlug &&
                                services.find((s) => s.slug === act.serviceSlug)) ||
                              services[0];
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() =>
                                  matched ? onStartService(matched) : onNavigate('services')
                                }
                                className="min-h-10 px-3 rounded-lg bg-primary text-on-primary text-xs font-medium flex items-center gap-1.5 hover:bg-primary-hover"
                              >
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('ask.start_application')}</span>
                              </button>
                            );
                          }
                          if (act.type === 'file_grievance') {
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => onNavigate('grievance')}
                                className="min-h-10 px-3 rounded-lg border border-strong bg-elevated text-xs font-medium text-body hover:bg-tint flex items-center gap-1.5"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('ask.file_grievance')}</span>
                              </button>
                            );
                          }
                          return null;
                        })}

                        {/* Thumbs Up / Down */}
                        {msg.id > 0 && (
                          <div className="flex items-center gap-1 ms-1">
                            <button
                              type="button"
                              aria-label={t('ask.helpful')}
                              onClick={() => handleRateMessage(msg.id, 'up')}
                              className={`min-h-10 min-w-10 rounded-lg border border-hairline flex items-center justify-center transition-colors ${
                                ratedMessageIds[msg.id] === 'up'
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-card text-muted hover:text-body'
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={t('ask.not_helpful')}
                              onClick={() => setFeedbackMsgId(msg.id)}
                              className={`min-h-10 min-w-10 rounded-lg border border-hairline flex items-center justify-center transition-colors ${
                                ratedMessageIds[msg.id] === 'down'
                                  ? 'bg-danger text-on-danger'
                                  : 'bg-card text-muted hover:text-body'
                              }`}
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isSending && !streamingText && (
            <div className="flex flex-col items-start">
              <div className="px-4 py-3 rounded-2xl bg-tint text-tint-fg border border-hairline text-sm font-medium flex items-center gap-2.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span>{t('ask.thinking')}</span>
              </div>
            </div>
          )}

          {streamingText && (
            <div className="flex flex-col items-start">
              <div className="max-w-[90%] sm:max-w-[84%] p-4 rounded-2xl bg-tint text-tint-fg border border-hairline text-base leading-relaxed">
                {renderFormattedMessage(streamingText)}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Active Voice Recording / Transcript Review / Attached File Context Strips */}
        <div className="border-t border-hairline">
          {voice.isRecording && (
            <div className="px-4 py-2.5 bg-warm-soft border-b border-hairline flex items-center justify-between gap-3 text-xs font-semibold text-body">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
                <span>
                  {t('home.listening')} ·{' '}
                  <span className="font-mono tabular-nums">
                    {formatTimer(voice.recordingSeconds)}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => voice.cancelRecording()}
                  className="min-h-9 px-3 rounded-lg border border-hairline bg-card text-body"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  className="min-h-9 px-3 rounded-lg bg-danger text-on-danger"
                >
                  {t('common.stop')}
                </button>
              </div>
            </div>
          )}

          {isTranscribing && (
            <div className="px-4 py-2 bg-tint border-b border-hairline text-xs font-medium text-tint-fg">
              {t('home.transcribing')}
            </div>
          )}

          {voiceReviewHint && !voice.isRecording && !isTranscribing && (
            <div className="px-4 py-2 bg-tint border-b border-hairline text-xs font-medium text-tint-fg flex items-center justify-between gap-2">
              <span>{t('ask.voice_review_hint')}</span>
              <button
                type="button"
                onClick={() => setVoiceReviewHint(false)}
                className="underline shrink-0"
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {pendingAttachment && (
            <div className="px-4 py-2.5 bg-elevated border-b border-hairline flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-body truncate">
                    {pendingAttachment.fileName}
                  </div>
                  <div className="text-muted truncate">{t('ask.attached_ready')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                className="min-h-9 px-2.5 rounded-lg border border-hairline bg-card text-body font-medium shrink-0"
              >
                {t('common.delete')}
              </button>
            </div>
          )}

          {/* Input Composer */}
          <div className="flex flex-wrap items-center gap-2 px-4 pt-2 border-t border-hairline" aria-label="Input mode">
            <button type="button" onClick={()=>{setIslOpen(false);setDraftMode('text');}} aria-pressed={!islOpen} className="min-h-11 px-3 border border-hairline rounded-xl">{islMessages(currentLanguage.code).text}</button>
            <button type="button" disabled={isSending || voice.isRecording || isTranscribing} aria-pressed={islOpen} onClick={()=>{voice.stopPlayback();setIslOpen(open=>!open);}} className="min-h-11 px-3 border border-strong rounded-xl disabled:opacity-50">Sahayak ISL Assist</button>
          </div>
          {islOpen && <ISLAssist language={currentLanguage.code} onClose={()=>setIslOpen(false)} onDraft={phrase=>{setInput(phrase);setPendingAttachment(null);setDraftMode('isl');setIslOpen(false);requestAnimationFrame(()=>inputRef.current?.focus());}}/>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion(input,draftMode==='isl'?null:undefined,draftMode);
            }}
            className="p-3.5 sm:p-4 flex items-center gap-2"
          >
            <label
              title={t('ask.attach_doc')}
              aria-label={t('ask.attach_doc')}
              className={`min-h-12 min-w-12 rounded-xl border border-hairline bg-elevated text-body hover:bg-tint flex items-center justify-center shrink-0 cursor-pointer ${
                isSending ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <FileUp className="w-5 h-5" />
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={isSending}
                onChange={handleAttachFile}
                className="sr-only"
              />
            </label>

            {!network.isWeakNetworkActive && currentLanguage.sttSupported && (
              <button
                type="button"
                disabled={isSending || isTranscribing}
                onClick={handleVoiceToggle}
                aria-label={t('home.tap_to_speak')}
                title={t('home.tap_to_speak')}
                className={`min-h-12 min-w-12 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 ${
                  voice.isRecording
                    ? 'bg-danger text-on-danger'
                    : 'bg-secondary text-on-secondary border border-strong hover:bg-secondary-hover'
                }`}
              >
                {voice.isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('home.type_question')}
              disabled={isSending}
              className="flex-1 min-w-0 min-h-12 px-4 rounded-xl bg-elevated border border-strong text-body placeholder:text-muted"
            />

            <button
              type="submit"
              disabled={isSending || (!input.trim() && !pendingAttachment)}
              aria-label={t('nav.ask')}
              className="min-h-12 min-w-12 px-4 rounded-xl bg-primary text-on-primary font-semibold flex items-center justify-center hover:bg-primary-hover disabled:opacity-50 shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* Tablet & Desktop Secondary Pane: Sources & Past Threads */}
      <aside className="hidden md:block md:col-span-4 space-y-5">
        <div className="bg-card border border-hairline rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-body">{t('ask.sources')}</h2>
          {allCitationsInThread.length === 0 ? (
            <p className="text-sm text-muted">{t('ask.sources_empty')}</p>
          ) : (
            <div className="space-y-3">
              {allCitationsInThread.map((c, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedCitation(c)}
                  className="w-full text-start p-3.5 rounded-xl bg-elevated border border-hairline hover:bg-tint/40 space-y-1.5 transition-colors"
                >
                  <div className="text-sm font-semibold text-body">{c.documentTitle}</div>
                  <div className="text-xs text-muted font-mono tabular-nums">
                    {t('ask.page')} {c.pageNumber} · {t('ask.source_lang')}:{' '}
                    {c.languageCode.toUpperCase()}
                  </div>
                  <p className="text-xs text-body leading-relaxed line-clamp-3">{c.snippet}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-hairline rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-body">{t('ask.recent_threads')}</h2>
          {conversations.length === 0 ? (
            <p className="text-sm text-muted">{t('ask.no_threads')}</p>
          ) : (
            <div className="divide-y divide-hairline max-h-72 overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`w-full py-3 px-2.5 rounded-lg text-start transition-colors ${
                    activeConv?.id === c.id ? 'bg-tint text-tint-fg' : 'hover:bg-tint/30'
                  }`}
                >
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {formatDate(c.updatedAt)} · {tStatus(c.status)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Sheet for Recent Conversations & Sources */}
      <ResponsiveSheet
        open={mobileThreadsOpen}
        onClose={() => setMobileThreadsOpen(false)}
        title={t('ask.recent_threads')}
      >
        <div className="space-y-4">
          {allCitationsInThread.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted">{t('ask.sources')}</div>
              {allCitationsInThread.map((c, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setMobileThreadsOpen(false);
                    setSelectedCitation(c);
                  }}
                  className="w-full text-start p-3 rounded-xl bg-elevated border border-hairline text-xs space-y-1"
                >
                  <div className="font-semibold text-body">{c.documentTitle}</div>
                  <div className="text-muted">
                    {t('ask.page')} {c.pageNumber} · {c.languageCode.toUpperCase()}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={`w-full p-3.5 rounded-xl border border-hairline text-start ${
                  activeConv?.id === c.id ? 'bg-tint text-tint-fg' : 'bg-elevated text-body'
                }`}
              >
                <div className="text-sm font-semibold truncate">{c.title}</div>
                <div className="text-xs text-muted mt-0.5">
                  {formatDate(c.updatedAt)} · {tStatus(c.status)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </ResponsiveSheet>

      {/* Citation Inspection Sheet */}
      <ResponsiveSheet
        open={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        title={selectedCitation?.documentTitle || t('ask.sources')}
      >
        {selectedCitation && (
          <div className="space-y-3">
            <div className="text-xs text-muted font-mono tabular-nums">
              {t('ask.page')} {selectedCitation.pageNumber} · {t('ask.source_lang')}:{' '}
              {selectedCitation.languageCode.toUpperCase()}
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-hairline text-sm text-body leading-relaxed whitespace-pre-wrap">
              {selectedCitation.snippet}
            </div>
            {selectedCitation.sourceUrl && /^https?:\/\//i.test(selectedCitation.sourceUrl) && (
              <a href={selectedCitation.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">
                {selectedCitation.sourceUrl}
              </a>
            )}
          </div>
        )}
      </ResponsiveSheet>

      {/* Negative Feedback Reason Sheet */}
      <ResponsiveSheet
        open={feedbackMsgId !== null}
        onClose={() => setFeedbackMsgId(null)}
        title={t('ask.feedback_title')}
      >
        <div className="space-y-2.5">
          {[
            t('ask.fb_incomplete'),
            t('ask.fb_unclear'),
            t('ask.fb_outdated'),
            t('ask.fb_need_human'),
          ].map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => feedbackMsgId && handleRateMessage(feedbackMsgId, 'down', reason)}
              className="w-full min-h-12 px-4 rounded-xl bg-elevated border border-hairline text-start text-sm font-medium text-body hover:bg-tint"
            >
              {reason}
            </button>
          ))}
        </div>
      </ResponsiveSheet>
    </div>
  );
};

export const ExplainLetterScreen: React.FC = () => {
  const { t, apiFetch, currentLanguage, authToken, profile, formatDate } = useApp();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [result, setResult] = useState<{
    documentId: number;
    ocrText: string;
    senderOrAuthority: string;
    plainSummary: string;
    whatYouNeedToDo: string[];
    detectedDeadlineIso: string | null;
    deadlineLabel: string | null;
    referenceNumbers: string[];
  } | null>(null);
  const [reminderSaved, setReminderSaved] = useState(false);

  const voice = useVoiceAudio(profile?.voiceSpeed || 1.0);

  const processFile = async (file: File) => {
    setErrorMsg(null);
    setReminderSaved(false);
    setBusy(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await apiFetch<{ document: { id: number }; explanation: any }>(
        '/api/explain-letter',
        {
          method: 'POST',
          body: JSON.stringify({
            title: file.name,
            base64Data: base64,
            mimeType,
            targetLanguageCode: currentLanguage.code,
          }),
        }
      );
      setResult({
        documentId: res.document.id,
        ...res.explanation,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not read or explain this file.');
    } finally {
      setBusy(false);
    }
  };

  const handleExplainText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;
    setErrorMsg(null);
    setReminderSaved(false);
    setBusy(true);
    try {
      const res = await apiFetch<{ document: { id: number }; explanation: any }>(
        '/api/explain-letter',
        {
          method: 'POST',
          body: JSON.stringify({
            title: t('explain.official_doc'),
            rawText: pastedText.trim(),
            targetLanguageCode: currentLanguage.code,
          }),
        }
      );
      setResult({
        documentId: res.document.id,
        ...res.explanation,
      });
    } catch (err: any) {
      setErrorMsg(err.message || t('explain.subtitle'));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDeadlineReminder = async () => {
    if (!result?.detectedDeadlineIso) return;
    try {
      await apiFetch('/api/reminders', {
        method: 'POST',
        body: JSON.stringify({
          title:
            result.deadlineLabel ||
            `${t('explain.detected_deadline')}: ${result.senderOrAuthority || t('explain.official_doc')}`,
          notes: result.plainSummary.slice(0, 200),
          dueAt: result.detectedDeadlineIso,
          channel: 'push',
          sourceDocumentId: result.documentId,
          languageCode: currentLanguage.code,
        }),
      });
      setReminderSaved(true);
    } catch (err: any) {
      setErrorMsg(err.message || t('explain.set_reminder'));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-body">
          {t('explain.title')}
        </h1>
        <p className="text-base text-muted">{t('explain.subtitle')}</p>

      </div>

      {errorMsg && (
        <div role="alert" className="p-4 rounded-xl bg-danger text-on-danger text-sm">
          {errorMsg}
        </div>
      )}

      <div className="bg-card border border-hairline rounded-2xl p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="min-h-16 p-4 rounded-2xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-3 cursor-pointer hover:bg-primary-hover">
            <FileUp className="w-5 h-5 shrink-0" />
            <span>{busy ? t('explain.scanning') : t('explain.upload_btn')}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
              className="sr-only"
            />
          </label>

          <label className="min-h-16 p-4 rounded-2xl bg-secondary text-on-secondary border border-strong font-bold text-lg flex items-center justify-center gap-3 cursor-pointer hover:bg-secondary-hover">
            <Camera className="w-5 h-5 shrink-0" />
            <span>{t('explain.camera_btn')}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
              className="sr-only"
            />
          </label>
        </div>

        <form onSubmit={handleExplainText} className="space-y-3 pt-3 border-t border-hairline">
          <label className="block text-sm font-medium text-body">
            {t('explain.paste_label')}
          </label>
          <textarea
            rows={3}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={t('explain.paste_placeholder')}
            className="w-full p-4 rounded-xl bg-elevated border border-hairline text-body placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy || !pastedText.trim()}
            className="min-h-12 px-5 rounded-xl border border-strong bg-elevated text-body text-sm font-semibold hover:bg-tint disabled:opacity-50"
          >
            {t('explain.explain_in')} {currentLanguage.nativeName}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted">
                {result.senderOrAuthority || t('explain.official_doc')}
                {result.referenceNumbers.length > 0 && (
                  <span className="font-mono tabular-nums">
                    {' '}
                    · {result.referenceNumbers.join(', ')}
                  </span>
                )}
              </div>
              <h2 className="font-display text-xl font-bold text-body mt-1">
                {t('explain.plain_heading')} ({currentLanguage.nativeName})
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                voice.playServerTts({
                  text: `${result.plainSummary}. ${result.whatYouNeedToDo.join('. ')}`,
                  languageName: currentLanguage.englishName,
                  localeCode: currentLanguage.localeCode,
                  languageCode: currentLanguage.code,
                  authToken,
                })
              }
              className="min-h-12 px-4 rounded-xl bg-tint text-tint-fg text-sm font-semibold flex items-center gap-2 hover:bg-tint-hover shrink-0"
            >
              <Volume2 className="w-4 h-4" />
              <span>{t('explain.read_aloud')}</span>
            </button>
          </div>

          <p className="text-base text-body leading-relaxed whitespace-pre-wrap">
            {result.plainSummary}
          </p>

          {result.whatYouNeedToDo.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="font-display text-base font-semibold text-body">
                {t('explain.next_steps')}
              </h3>
              <ul className="space-y-2">
                {result.whatYouNeedToDo.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-body">
                    <span className="font-mono font-bold text-primary">{i + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.detectedDeadlineIso && (
            <div className="p-4 rounded-xl bg-danger text-on-danger flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium opacity-90">
                  {t('explain.detected_deadline')}
                </div>
                <div className="font-semibold text-base">
                  {result.deadlineLabel || t('explain.action_due')} ·{' '}
                  <span className="font-mono tabular-nums">
                    {formatDate(result.detectedDeadlineIso)}
                  </span>
                </div>
              </div>
              {reminderSaved ? (
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Check className="w-4 h-4" />
                  <span>{t('explain.reminder_scheduled')}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateDeadlineReminder}
                  className="min-h-11 px-4 rounded-xl bg-card text-body text-sm font-semibold flex items-center gap-2"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>{t('explain.set_reminder')}</span>
                </button>
              )}
            </div>
          )}

          {result.ocrText && (
            <details className="pt-2 border-t border-hairline">
              <summary className="cursor-pointer text-sm font-medium text-muted py-2">
                {t('explain.view_ocr')}
              </summary>
              <pre className="mt-2 p-4 rounded-xl bg-elevated text-xs text-body whitespace-pre-wrap font-sans leading-relaxed">
                {result.ocrText}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
