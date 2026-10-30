import { useCallback, useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export interface QueuedQuestion {
  id: string;
  question: string;
  languageCode: string;
  createdAt: string;
}

export interface CachedQA {
  questionNormalized: string;
  answer: string;
  languageCode: string;
  timestamp: string;
}

export function useNetworkAndOfflineQueue() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSlowConnection, setIsSlowConnection] = useState<boolean>(false);
  const [manualTextOnlyMode, setManualTextOnlyMode] = useState<boolean>(false);
  const [queuedQuestions, setQueuedQuestions] = useState<QueuedQuestion[]>([]);
  const [answerCache, setAnswerCache] = useState<CachedQA[]>([]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const conn = (navigator as any).connection;
    const checkSpeed = () => {
      if (conn) {
        const slow =
          conn.saveData === true ||
          conn.effectiveType === 'slow-2g' ||
          conn.effectiveType === '2g';
        setIsSlowConnection(slow);
      }
    };
    checkSpeed();
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', checkSpeed);
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', checkSpeed);
      }
    };
  }, []);

  const enqueueQuestion = useCallback((question: string, languageCode: string) => {
    const item: QueuedQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      question,
      languageCode,
      createdAt: new Date().toISOString(),
    };
    setQueuedQuestions((prev) => [...prev, item]);
    return item;
  }, []);

  const dequeueQuestion = useCallback((id: string) => {
    setQueuedQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const cacheAnswer = useCallback((question: string, answer: string, languageCode: string) => {
    const norm = question.trim().toLowerCase();
    setAnswerCache((prev) => {
      const filtered = prev.filter(
        (c) => !(c.questionNormalized === norm && c.languageCode === languageCode)
      );
      return [
        {
          questionNormalized: norm,
          answer,
          languageCode,
          timestamp: new Date().toISOString(),
        },
        ...filtered,
      ].slice(0, 30);
    });
  }, []);

  const findCachedAnswer = useCallback(
    (question: string, languageCode: string): CachedQA | undefined => {
      const norm = question.trim().toLowerCase();
      return answerCache.find(
        (c) =>
          c.languageCode === languageCode &&
          (c.questionNormalized === norm ||
            (norm.length > 8 && c.questionNormalized.includes(norm)))
      );
    },
    [answerCache]
  );

  const isWeakNetworkActive = !isOnline || isSlowConnection || manualTextOnlyMode;

  return {
    isOnline,
    isSlowConnection,
    manualTextOnlyMode,
    setManualTextOnlyMode,
    isWeakNetworkActive,
    queuedQuestions,
    enqueueQuestion,
    dequeueQuestion,
    cacheAnswer,
    findCachedAnswer,
  };
}

export function useVoiceAudio(voiceSpeed = 1.0) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): Promise<{ base64Audio: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        setIsRecording(false);
        return reject(new Error('No active recording.'));
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        recorder.stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = String(reader.result || '');
          const base64Audio = result.includes(',') ? result.split(',')[1] : result;
          resolve({ base64Audio, mimeType: mimeType.split(';')[0] });
        };
        reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    });
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingTts(false);
  }, []);

  const playServerTts = useCallback(
    async (params: {
      text: string;
      languageName: string;
      localeCode: string;
      languageCode?: string;
      authToken?: string | null;
    }) => {
      stopPlayback();
      setIsPlayingTts(true);
      try {
        const endpoint = params.authToken ? '/api/voice/tts' : '/api/public/tts';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (params.authToken) headers.Authorization = `Bearer ${params.authToken}`;
        const derivedLangCode =
          params.languageCode || (params.localeCode ? params.localeCode.split('-')[0] : 'en');

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: params.text,
            languageName: params.languageName,
            languageCode: derivedLangCode,
          }),
        });
        if (!res.ok) throw new Error('Server TTS unavailable');
        const data = await res.json();
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        audio.playbackRate = Math.min(2.0, Math.max(0.6, voiceSpeed));
        audioRef.current = audio;
        audio.onended = () => setIsPlayingTts(false);
        audio.onerror = () => setIsPlayingTts(false);
        await audio.play();
      } catch {
        // Offline / browser fallback speech synthesis
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const utter = new SpeechSynthesisUtterance(params.text);
          utter.lang = params.localeCode || 'en-IN';
          utter.rate = voiceSpeed;
          utter.onend = () => setIsPlayingTts(false);
          utter.onerror = () => setIsPlayingTts(false);
          window.speechSynthesis.speak(utter);
        } else {
          setIsPlayingTts(false);
        }
      }
    },
    [stopPlayback, voiceSpeed]
  );

  return {
    isRecording,
    isPlayingTts,
    startRecording,
    stopRecording,
    playServerTts,
    stopPlayback,
  };
}

export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result || '');
      const base64 = str.includes(',') ? str.split(',')[1] : str;
      resolve({ base64, mimeType: file.type || 'application/octet-stream' });
    };
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}
