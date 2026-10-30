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
import type {
  CitationItem,
  CitizenScreen,
  ConversationItem,
  MessageItem,
  ServiceTemplate,
} from '../types.ts';
import { ResponsiveSheet } from './SharedUI.tsx';

export const CitizenAskScreen: React.FC<{
  initialQuestion?: string;
  onConsumeInitialQuestion?: () => void;
  onStartService: (svc: ServiceTemplate) => void;
  onNavigate: (screen: CitizenScreen) => void;
}> = ({ initialQuestion, onConsumeInitialQuestion, onStartService }) => {
  const {
    authToken,
    profile,
    currentLanguage,
    t,
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
  const [streamingText, setStreamingText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<CitationItem | null>(null);
  const [feedbackMsgId, setFeedbackMsgId] = useState<number | null>(null);
  const [ratedMessageIds, setRatedMessageIds] = useState<Record<number, 'up' | 'down'>>({});
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const voice = useVoiceAudio(profile?.voiceSpeed || 1.0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => {
    try {
      const res = await apiFetch<{ conversations: ConversationItem[] }>('/api/conversations');
      setConversations(res.conversations || []);
    } catch {
      // Offline tolerance
    }
  };

  const openConversation = async (convId: number) => {
    try {
      const res = await apiFetch<{ conversation: ConversationItem; messages: MessageItem[] }>(
        `/api/conversations/${convId}/messages`
      );
      setActiveConv(res.conversation);
      setMessages(res.messages || []);
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not load conversation.');
    }
  };

  useEffect(() => {
    loadConversations();
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
  }, [messages, streamingText]);

  const sendQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isSending) return;
    setErrorBanner(null);

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
            content: `${cached.answer}\n\n(Served from offline cache)`,
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
        setErrorBanner(
          'You are currently offline. Your question has been queued and will be sent when connection returns, or tap "Ask via SMS" above.'
        );
      }
      setInput('');
      return;
    }

    setIsSending(true);
    setInput('');
    setStreamingText('');

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          conversationId: activeConv?.id,
          preferredLanguageCode: currentLanguage.code,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('Could not connect to assistant stream.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const frame of parts) {
          if (!frame.startsWith('data: ')) continue;
          const jsonStr = frame.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'meta' && event.userMessage) {
              setMessages((prev) =>
                prev.some((m) => m.id === event.userMessage.id)
                  ? prev
                  : [...prev, event.userMessage]
              );
            } else if (event.type === 'delta' && event.text) {
              setStreamingText((prev) => prev + event.text);
            } else if (event.type === 'done') {
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
              setErrorBanner(event.error || 'Assistant failed to respond.');
            }
          } catch {
            // Ignore partial frame
          }
        }
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to send question.');
      network.enqueueQuestion(trimmed, currentLanguage.code);
    } finally {
      setIsSending(false);
      setStreamingText('');
    }
  };

  useEffect(() => {
    if (initialQuestion && initialQuestion.trim()) {
      const q = initialQuestion;
      onConsumeInitialQuestion?.();
      sendQuestion(q);
    }
  }, [initialQuestion]);

  const handleVoiceToggle = async () => {
    if (voice.isRecording) {
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
          sendQuestion(stt.transcript);
        }
      } catch (err: any) {
        setErrorBanner(err.message || 'Voice transcription failed.');
      }
    } else {
      try {
        await voice.startRecording();
      } catch {
        setErrorBanner('Microphone permission is unavailable.');
      }
    }
  };

  const handleTalkToHuman = async () => {
    if (!activeConv) return;
    try {
      const res = await apiFetch<{ conversation: ConversationItem; systemMessage: MessageItem }>(
        `/api/conversations/${activeConv.id}/handover`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'user_requested' }),
        }
      );
      setActiveConv(res.conversation);
      if (res.systemMessage) {
        setMessages((prev) => [...prev, res.systemMessage]);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to request human support.');
    }
  };

  const handleRateMessage = async (msgId: number, rating: 'up' | 'down', reason?: string) => {
    try {
      await apiFetch(`/api/messages/${msgId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating, reason }),
      });
      setRatedMessageIds((prev) => ({ ...prev, [msgId]: rating }));
      setFeedbackMsgId(null);
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not submit feedback.');
    }
  };

  const allCitationsInThread = messages
    .flatMap((m) => m.citations || [])
    .filter((c, idx, arr) => arr.findIndex((x) => x.documentId === c.documentId && x.pageNumber === c.pageNumber) === idx);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
      {/* Main Chat Pane */}
      <div className="md:col-span-8 bg-card border border-hairline rounded-2xl flex flex-col min-h-[70vh] max-h-[82vh]">
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-body truncate">
              {activeConv ? activeConv.title : t('ask.title')}
            </h1>
            {activeConv && (
              <p className="text-xs text-muted">
                Status: {activeConv.status.replace(/_/g, ' ')}
                {activeConv.languageCode ? ` · ${activeConv.languageCode.toUpperCase()}` : ''}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeConv && activeConv.status === 'ai_active' && (
              <button
                type="button"
                onClick={handleTalkToHuman}
                className="min-h-11 px-3.5 rounded-xl border border-strong bg-elevated text-body text-xs font-medium flex items-center gap-1.5 hover:bg-tint whitespace-nowrap shrink-0"
              >
                <Headphones className="w-4 h-4" />
                <span>{t('ask.talk_human')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setActiveConv(null);
                setMessages([]);
              }}
              aria-label="New conversation"
              className="min-h-11 px-3 rounded-xl bg-tint text-tint-fg text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          </div>
        </div>

        {errorBanner && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-danger text-on-danger text-sm">
            {errorBanner}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 && !streamingText ? (
            <div className="h-full py-12 flex flex-col items-start justify-center max-w-lg mx-auto space-y-3">
              <h2 className="font-display text-xl font-bold text-body">{t('ask.empty_title')}</h2>
              <p className="text-base text-muted leading-relaxed">{t('ask.empty_desc')}</p>
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

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[82%] p-4 rounded-2xl text-base leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-primary text-on-primary'
                        : 'bg-tint text-tint-fg border border-hairline'
                    }`}
                  >
                    {msg.senderRole === 'human_agent' && (
                      <div className="text-xs font-semibold mb-1.5 opacity-80">
                        Human Support Agent
                      </div>
                    )}
                    {msg.content}
                  </div>

                  {/* Grounded Citations + Actions + TTS + Feedback for Assistant/Agent messages */}
                  {!isUser && (
                    <div className="max-w-[92%] space-y-2.5">
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
                              <span className="truncate max-w-[200px]">{cit.documentTitle}</span>
                              <span className="font-mono tabular-nums text-muted">
                                · p.{cit.pageNumber}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {!network.isWeakNetworkActive && (
                          <button
                            type="button"
                            onClick={() =>
                              voice.playServerTts({
                                text: msg.content,
                                languageName: currentLanguage.englishName,
                                localeCode: currentLanguage.localeCode,
                                authToken,
                              })
                            }
                            className="min-h-10 px-3 rounded-lg border border-hairline bg-card text-xs font-medium text-body hover:bg-tint flex items-center gap-1.5"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>{t('ask.listen_answer')}</span>
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
                                <Headphones className="w-3.5 h-3.5" />
                                <span>{t('ask.talk_human')}</span>
                              </button>
                            );
                          }
                          if (act.type === 'start_application' && act.serviceSlug) {
                            const matched = services.find((s) => s.slug === act.serviceSlug);
                            if (!matched) return null;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => onStartService(matched)}
                                className="min-h-10 px-3 rounded-lg bg-primary text-on-primary text-xs font-medium flex items-center gap-1.5"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>{t('ask.start_application')}</span>
                              </button>
                            );
                          }
                          return null;
                        })}

                        {/* Thumbs Up / Down */}
                        <div className="flex items-center gap-1 ms-1">
                          <button
                            type="button"
                            aria-label={t('ask.helpful')}
                            onClick={() => handleRateMessage(msg.id, 'up')}
                            className={`min-h-10 min-w-10 rounded-lg border border-hairline flex items-center justify-center ${
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
                            className={`min-h-10 min-w-10 rounded-lg border border-hairline flex items-center justify-center ${
                              ratedMessageIds[msg.id] === 'down'
                                ? 'bg-danger text-on-danger'
                                : 'bg-card text-muted hover:text-body'
                            }`}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {streamingText && (
            <div className="flex flex-col items-start">
              <div className="max-w-[85%] p-4 rounded-2xl bg-tint text-tint-fg border border-hairline text-base whitespace-pre-wrap">
                {streamingText}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="p-4 border-t border-hairline flex items-center gap-2.5"
        >
          {!network.isWeakNetworkActive && currentLanguage.sttSupported && (
            <button
              type="button"
              onClick={handleVoiceToggle}
              aria-label={t('home.tap_to_speak')}
              className={`min-h-12 min-w-12 rounded-xl flex items-center justify-center shrink-0 ${
                voice.isRecording
                  ? 'bg-danger text-on-danger'
                  : 'bg-voice text-on-voice hover:bg-voice-hover'
              }`}
            >
              {voice.isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('home.type_question')}
            disabled={isSending}
            className="flex-1 min-h-12 px-4 rounded-xl bg-elevated border border-strong text-body placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            aria-label="Send"
            className="min-h-12 min-w-12 px-4 rounded-xl bg-primary text-on-primary font-semibold flex items-center justify-center hover:bg-primary-hover disabled:opacity-50 shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Tablet & Desktop Secondary Pane: Sources & Past Threads */}
      <aside className="md:col-span-4 space-y-5">
        <div className="bg-card border border-hairline rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-body">{t('ask.sources')}</h2>
          {allCitationsInThread.length === 0 ? (
            <p className="text-sm text-muted">
              Verified knowledge base citations for this conversation will appear here with
              original document excerpts and page numbers.
            </p>
          ) : (
            <div className="space-y-3">
              {allCitationsInThread.map((c, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-elevated border border-hairline space-y-1.5"
                >
                  <div className="text-sm font-semibold text-body">{c.documentTitle}</div>
                  <div className="text-xs text-muted font-mono tabular-nums">
                    Page {c.pageNumber} · Source lang: {c.languageCode.toUpperCase()}
                  </div>
                  <p className="text-xs text-body leading-relaxed">{c.snippet}...</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-hairline rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-body">Recent Conversations</h2>
          {conversations.length === 0 ? (
            <p className="text-sm text-muted">No previous conversations yet.</p>
          ) : (
            <div className="divide-y divide-hairline max-h-64 overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`w-full py-3 px-2 rounded-lg text-start transition-colors ${
                    activeConv?.id === c.id ? 'bg-tint text-tint-fg' : 'hover:bg-tint/30'
                  }`}
                >
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {formatDate(c.updatedAt)} · {c.status.replace(/_/g, ' ')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Citation Inspection Sheet (Especially helpful on Mobile) */}
      <ResponsiveSheet
        open={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        title={selectedCitation?.documentTitle || t('ask.sources')}
      >
        {selectedCitation && (
          <div className="space-y-3">
            <div className="text-xs text-muted font-mono tabular-nums">
              Page {selectedCitation.pageNumber} · Original Language:{' '}
              {selectedCitation.languageCode.toUpperCase()}
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-hairline text-sm text-body leading-relaxed whitespace-pre-wrap">
              {selectedCitation.snippet}
            </div>
          </div>
        )}
      </ResponsiveSheet>

      {/* Negative Feedback Reason Sheet */}
      <ResponsiveSheet
        open={feedbackMsgId !== null}
        onClose={() => setFeedbackMsgId(null)}
        title="Help us improve this answer"
      >
        <div className="space-y-2.5">
          {[
            'Answer was incomplete or missing steps',
            'Translation or wording was unclear',
            'Source document seemed outdated',
            'Needed direct human support instead',
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
            title: 'Official Notice Text',
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
      setErrorMsg(err.message || 'Could not analyze notice text.');
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
          title: result.deadlineLabel || `Deadline: ${result.senderOrAuthority || 'Official Notice'}`,
          notes: result.plainSummary.slice(0, 200),
          dueAt: result.detectedDeadlineIso,
          channel: 'push',
          sourceDocumentId: result.documentId,
          languageCode: currentLanguage.code,
        }),
      });
      setReminderSaved(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not schedule reminder.');
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
            <span>{busy ? 'Scanning & Explaining...' : t('explain.upload_btn')}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
              className="sr-only"
            />
          </label>

          <label className="min-h-16 p-4 rounded-2xl bg-voice text-on-voice font-bold text-lg flex items-center justify-center gap-3 cursor-pointer hover:bg-voice-hover">
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
            Or paste text from an SMS, email, or official notice:
          </label>
          <textarea
            rows={3}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste official notice text in any language..."
            className="w-full p-4 rounded-xl bg-elevated border border-hairline text-body placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy || !pastedText.trim()}
            className="min-h-12 px-5 rounded-xl border border-strong bg-elevated text-body text-sm font-semibold hover:bg-tint disabled:opacity-50"
          >
            Explain in {currentLanguage.nativeName}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-card border border-hairline rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted">
                {result.senderOrAuthority || 'Official Document'}
                {result.referenceNumbers.length > 0 && (
                  <span className="font-mono tabular-nums">
                    {' '}
                    · Ref: {result.referenceNumbers.join(', ')}
                  </span>
                )}
              </div>
              <h2 className="font-display text-xl font-bold text-body mt-1">
                Plain-Language Explanation ({currentLanguage.nativeName})
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                voice.playServerTts({
                  text: `${result.plainSummary}. ${result.whatYouNeedToDo.join('. ')}`,
                  languageName: currentLanguage.englishName,
                  localeCode: currentLanguage.localeCode,
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
                Recommended Next Steps
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
                <div className="text-xs font-medium opacity-90">Detected Deadline</div>
                <div className="font-semibold text-base">
                  {result.deadlineLabel || 'Action Due'} ·{' '}
                  <span className="font-mono tabular-nums">
                    {formatDate(result.detectedDeadlineIso)}
                  </span>
                </div>
              </div>
              {reminderSaved ? (
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Check className="w-4 h-4" />
                  <span>Reminder Scheduled</span>
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
                View Extracted Original Text (OCR)
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
