import { useEffect, useRef, useState } from 'react';
import type { CitizenScreen } from '../types';
import { extractWakeCommand, parseVoiceCommand, validateAiVoiceResult, type VoiceIntent } from '../lib/voiceCommands';
import { useApp } from '../context/AppContext';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const instructions = 'Say take me to my documents, show my application status, find scholarship, go back, read this page, where am I, or repeat. In wake phrase mode, say Hey Sahayak before each new command. After a question, reply directly within 15 seconds. While listening, say stop listening to turn off the microphone. Use the Stop button or Escape during a spoken reply.';
const hindiInstructions = 'आप बोल सकते हैं: मेरे दस्तावेज़ दिखाओ, आवेदन की स्थिति दिखाओ, छात्रवृत्ति खोजो, वापस जाओ, यह पेज पढ़ो, मैं कहाँ हूँ, या फिर से बोलो। हर नई कमांड से पहले हे सहायक बोलें। सवाल के बाद 15 सेकंड में सीधे जवाब दें। सुनते समय माइक बंद करने के लिए सुनना बंद करो बोलें। बोलकर जवाब देते समय स्टॉप बटन या एस्केप दबाएँ।';

export function VoiceAssistantDemo({ onNavigate, onBack, onSearchServices, pageLabel }: {
  onNavigate: (screen: CitizenScreen) => void;
  onBack: () => void;
  onSearchServices: (query: string) => void;
  pageLabel: string;
}) {
  const { apiFetch } = useApp();
  const [thinking, setThinking] = useState(false);
  const pendingAi = useRef<AbortController | null>(null);
  const clarificationContext = useRef<{previousText:string; clarification:string; expires:number} | null>(null);
  const executeRef = useRef<(intent:VoiceIntent, command:string) => void>(() => {});
  const [voiceLanguage, setVoiceLanguage] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const languageRef = useRef(voiceLanguage);
  const lastSpoken = useRef<{text:string; lang:string} | null>(null);
  const hindi = voiceLanguage === 'hi-IN';
  const local = (en: string, hi: string) => hindi ? hi : en;
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('Ready. English voice commands.');
  const recognition = useRef<Recognition | null>(null);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const wakeRef = useRef(false);
  const armedUntil = useRef(0);
  const followUp = useRef(false);
  const armAfterSpeech = useRef(false);
  const playbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechSerial = useRef(0);
  const [heard, setHeard] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [typedCommand, setTypedCommand] = useState('');
  const [spokenReplies, setSpokenReplies] = useState(true);
  const spokenRepliesRef = useRef(true);
  const [speechRate, setSpeechRate] = useState(0.95);
  const speechRateRef = useRef(0.95);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkRetries = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<(wake: boolean) => void>(() => {});
  const stopRef = useRef<() => void>(() => {});
  const failures = useRef(0);
  const toggleRef = useRef<() => void>(() => {});
  const speechWindow = window as SpeechWindow;
  const RecognitionApi = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window;

  function speak(text: string, lang: string = languageRef.current) {
    cancelAi();
    setStatus(text);
    lastSpoken.current = {text, lang};
    // Suspend recognition during playback so the assistant cannot hear itself.
    detachRecognition();
    if (!canSpeak || !spokenRepliesRef.current) { setSpeaking(false); scheduleRestart(); return; }
    if (playbackTimer.current) clearInterval(playbackTimer.current);
    const serial = ++speechSerial.current;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = speechRateRef.current;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const voice = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase())
      || voices.find(v => v.lang.split('-')[0] === lang.split('-')[0]);
    if (voice) utterance.voice = voice;
    setSpeaking(true);
    let finished = false;
    const finish = () => {
      if (finished || serial !== speechSerial.current) return;
      finished = true;
      if (playbackTimer.current) clearInterval(playbackTimer.current);
      playbackTimer.current = null;
      setSpeaking(false);
      scheduleRestart();
    };
    utterance.onend = utterance.onerror = finish;
    // Some speech engines omit end/error for cancelled or silent playback.
    const startedAt = Date.now();
    const deadline = Math.min(600000, Math.max(10000, text.length * 120 + 5000));
    playbackTimer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= deadline) { window.speechSynthesis.cancel(); finish(); }
      else if (elapsed >= 1500 && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) finish();
    }, 500);
    try { window.speechSynthesis.speak(utterance); } catch { finish(); }
  }

  function detachRecognition() {
    if (startupTimer.current) clearTimeout(startupTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    const session = recognition.current;
    recognition.current = null;
    if (session) {
      session.onresult = null;
      session.onerror = null;
      session.onend = null;
      session.onstart = null;
      session.abort();
    }
    setListening(false);
  }

  function clearReplyWindow() {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = null;
    armedUntil.current = 0;
    armAfterSpeech.current = false;
    setAwaitingReply(false);
  }

  function scheduleRestart(delay = 500) {
    if (!RecognitionApi) return;
    if ((!wakeRef.current && !followUp.current) || document.hidden || pendingAi.current) return;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => {
      if (!wakeRef.current && !followUp.current) return;
      if (armAfterSpeech.current || followUp.current) {
        clearReplyWindow();
        armedUntil.current = Date.now() + 15000;
        setAwaitingReply(true);
        replyTimer.current = setTimeout(() => {
          clearReplyWindow();
          if (!wakeRef.current) detachRecognition();
          setStatus(local('No reply heard. Say Hey Sahayak again, or use Speak command.', 'जवाब नहीं मिला। फिर से हे सहायक बोलें या बोलने का बटन दबाएँ।'));
        }, 15000);
      }
      followUp.current = false;
      startRef.current(wakeRef.current);
    }, delay);
  }

  function stop() {
    cancelAi();
    clarificationContext.current = null;
    networkRetries.current = 0;
    wakeRef.current = false;
    setWakeEnabled(false);
    clearReplyWindow();
    followUp.current = false;
    armAfterSpeech.current = false;
    speechSerial.current++;
    if (playbackTimer.current) clearInterval(playbackTimer.current);
    playbackTimer.current = null;
    setSpeaking(false);
    detachRecognition();
    if (canSpeak) window.speechSynthesis.cancel();
  }
  stopRef.current = stop;

  function cancelAi() {
    pendingAi.current?.abort();
    pendingAi.current = null;
    setThinking(false);
  }

  async function understand(command: string) {
    cancelAi();
    detachRecognition();
    speechSerial.current++;
    if (playbackTimer.current) clearInterval(playbackTimer.current);
    playbackTimer.current = null;
    setSpeaking(false);
    if (canSpeak) window.speechSynthesis.cancel();
    const controller = new AbortController();
    pendingAi.current = controller;
    setThinking(true);
    setStatus(local('Understanding your request…', 'आपकी बात समझ रहे हैं…'));
    const previous = clarificationContext.current;
    const context = previous && previous.expires > Date.now() ? previous : null;
    clarificationContext.current = null;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await apiFetch<{intent?:VoiceIntent; clarification?:string}>('/api/voice/intent', {
        method:'POST', signal:controller.signal,
        body:JSON.stringify({text:command, language:languageRef.current, pageLabel:pageLabel.slice(0,120),
          ...(context ? {previousText:context.previousText, clarification:context.clarification} : {})}),
      });
      if (pendingAi.current !== controller || controller.signal.aborted) return;
      pendingAi.current = null;
      setThinking(false);
      const checked = validateAiVoiceResult({...result.intent, confidence:1, clarification:result.clarification});
      if (checked.intent.type === 'unknown') {
        const question = checked.clarification || local('Which page or service would you like? Please name one.', 'कौन सा पेज या सेवा चाहिए? एक नाम बताइए।');
        clarificationContext.current = {previousText:command, clarification:question, expires:Date.now()+60000};
        armAfterSpeech.current = true;
        followUp.current = !wakeRef.current;
        speak(question + local(' You can reply directly after I finish.', ' मेरे बोलने के बाद सीधे जवाब दीजिए।'));
      } else executeRef.current(checked.intent, command);
    } catch {
      if (pendingAi.current !== controller) return;
      pendingAi.current = null;
      setThinking(false);
      speak(local('AI understanding is unavailable right now. Try a direct command such as open documents, find scholarship, or read this page.', 'अभी एआई उपलब्ध नहीं है। सीधे बोलें: मेरे दस्तावेज़ दिखाओ, छात्रवृत्ति खोजो, या यह पेज पढ़ो।'));
    } finally {
      clearTimeout(timeout);
      // A response racing the timeout must also release the suspended listener.
      if (pendingAi.current === controller && controller.signal.aborted) {
        pendingAi.current = null;
        setThinking(false);
        speak(local('That took too long. Please try a direct command.', 'समझने में समय लग गया। कृपया सीधी कमांड बोलें।'));
      }
    }
  }

  function executeIntent(intent: VoiceIntent, command: string) {
      switch (intent.type) {
        case 'help': speak(hindi ? hindiInstructions : instructions); break;
        case 'read': readPage(); break;
        case 'back': onBack(); speak(local('Going back.', 'पिछले पेज पर जा रहे हैं।')); break;
        case 'stop': stop(); speak(local('Microphone off.', 'माइक बंद है।')); break;
        case 'location': speak(local(`You are on ${pageLabel}.`, `आप ${pageLabel} पेज पर हैं।`)); break;
        case 'repeat': {
          const last = lastSpoken.current;
          if (last) speak(last.text, last.lang);
          else speak(local('Nothing to repeat yet.', 'अभी दोहराने के लिए कुछ नहीं है।'));
          break;
        }
        case 'search':
          onSearchServices(intent.query);
          speak(local(`Searching services for ${intent.query}. Say read this page to hear the results.`, `${intent.query} की सेवाएँ खोज रहे हैं। परिणाम सुनने के लिए यह पेज पढ़ो बोलें।`));
          break;
        case 'navigate':
          onNavigate(intent.screen);
          speak(local('Opening the requested page. Say read this page to hear the content.', 'पेज खोल रहे हैं। सुनने के लिए यह पेज पढ़ो बोलें।'));
          break;
        default: void understand(command);
      }
  }
  executeRef.current = executeIntent;

  function readPage() {
    const content = document.getElementById('citizen-page-content');
    // Read the visible screen only, excluding this assistant and navigation.
    const text = content?.innerText.trim();
    speak(text ? text.slice(0, 6000) : 'There is no page content to read.', content?.lang || document.documentElement.lang || 'en-IN');
  }

  function toggle() {
    if (pendingAi.current) { stop(); setStatus('Microphone off.'); return; }
    if (recognition.current || wakeRef.current) { stop(); setStatus('Microphone off.'); return; }
    start(false);
  }

  function start(wake: boolean) {
    if (!RecognitionApi) { speak(local('Voice recognition is unavailable. Use Read page or Hear commands, or try Chrome or Edge.', 'इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। पेज सुनें या कमांड सुनें दबाएँ।')); return; }
    speechSerial.current++;
    if (playbackTimer.current) clearInterval(playbackTimer.current);
    playbackTimer.current = null;
    setSpeaking(false);
    followUp.current = false;
    detachRecognition();
    if (canSpeak) window.speechSynthesis.cancel();
    const session = new RecognitionApi();
    const startedAt = Date.now();
    recognition.current = session;
    session.lang = languageRef.current;
    session.continuous = wake;
    session.interimResults = true;
    session.onstart = () => {
      if (recognition.current !== session) return;
      if (startupTimer.current) clearTimeout(startupTimer.current);
      setListening(true);
      setStatus(armedUntil.current > Date.now() ? local('Listening for your reply. No wake phrase needed.', 'आपके जवाब के लिए सुन रहे हैं। हे सहायक दोबारा कहना ज़रूरी नहीं है।') : wake ? local('Microphone on. Say “Hey Sahayak” followed by a command.', 'माइक चालू है। हे सहायक बोलकर अपनी कमांड बोलें।') : local('Listening. Say a command.', 'सुन रहे हैं। अपनी कमांड बोलें।'));
    };
    session.onresult = event => {
      if (recognition.current !== session) return;
      const final: string[] = [], transcripts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0]?.transcript) continue;
        transcripts.push(result[0].transcript);
        if (result.isFinal) final.push(result[0].transcript);
      }
      setHeard(transcripts.join(' ').slice(0, 300));
      if (!final.length) return;
      failures.current = 0;
      networkRetries.current = 0;
      const transcript = final.join(' ');
      let command = transcript;
      const wakeCommand = extractWakeCommand(command);
      // An exact stop command always releases an enabled microphone; no wake
      // phrase is required for this control. Other actions remain wake-gated.
      if (parseVoiceCommand(command).type === 'stop') { executeRef.current({type:'stop'}, command); return; }
      if (wakeCommand !== null) {
          command = wakeCommand;
          if (!command) {
            armAfterSpeech.current = true;
            followUp.current = !wake;
            speak(local('Yes? Say your command.', 'जी, अपनी कमांड बोलिए।'));
            return;
          }
      } else if (wake && Date.now() > armedUntil.current) {
        setStatus(local('Speech heard, but no wake phrase matched. Say “Hey Sahayak” or check the Heard text below.', 'आवाज़ मिली, पर हे सहायक नहीं मिला। नीचे सुनी गई बात जाँचें।'));
        return;
      }
      clearReplyWindow();
      const intent = parseVoiceCommand(command);
      if (intent.type !== 'unknown') clarificationContext.current = null;
      executeRef.current(intent, command);
    };
    session.onerror = event => {
      if (recognition.current !== session) return;
      if (event.error === 'aborted' || (wake && event.error === 'no-speech')) return;
      if (event.error === 'network' && wakeRef.current && networkRetries.current < 3) {
        networkRetries.current++;
        detachRecognition();
        setStatus(local(`Speech connection interrupted. Retrying (${networkRetries.current}/3)…`, `आवाज़ सेवा से संपर्क टूटा। फिर कोशिश (${networkRetries.current}/3)…`));
        scheduleRestart(1000 * 2 ** (networkRetries.current - 1));
        return;
      }
      stop();
      speak(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? local('Microphone access was denied. Allow microphone access in your browser and try again.', 'माइक की अनुमति नहीं मिली। ब्राउज़र में माइक की अनुमति देकर फिर कोशिश करें।')
        : event.error === 'audio-capture'
          ? local('No microphone is available. Connect one or close other apps using it. You can type a command below.', 'माइक नहीं मिला। माइक जोड़ें या उसे इस्तेमाल कर रहे दूसरे ऐप बंद करें। नीचे कमांड लिख सकते हैं।')
          : local('Speech service is unavailable. Check your connection, then enable it again. You can type a command below.', 'आवाज़ सेवा उपलब्ध नहीं है। इंटरनेट जाँचकर फिर चालू करें। नीचे कमांड लिख सकते हैं।'));
    };
    session.onend = () => {
      if (recognition.current !== session) return;
      recognition.current = null;
      if (startupTimer.current) clearTimeout(startupTimer.current);
      setListening(false);
      if (wakeRef.current) {
        // A normal continuous recognition session may end after silence. Only
        // repeated immediate endings indicate a broken restart loop.
        failures.current = Date.now() - startedAt < 2000 ? failures.current + 1 : 0;
        if (failures.current >= 5) { stop(); speak('Voice listening stopped repeatedly. Please enable wake phrase mode again.'); return; }
        scheduleRestart();
        return;
      }
      setStatus(previous => previous === 'Listening. Say a command.' ? 'No command heard. Press Speak command to try again.' : previous);
    };
    try {
      setStatus(local('Starting microphone…', 'माइक शुरू हो रहा है…'));
      startupTimer.current = setTimeout(() => {
        if (recognition.current !== session) return;
        stop(); setStatus(local('Microphone did not start. Check browser permission or type a command below.', 'माइक शुरू नहीं हुआ। ब्राउज़र की अनुमति जाँचें या नीचे कमांड लिखें।'));
      }, 10000);
      session.start();
    }
    catch { stop(); speak(local('Could not start the microphone. Please try again.', 'माइक चालू नहीं हो पाया। फिर कोशिश करें।')); }
  }
  startRef.current = start;
  toggleRef.current = toggle;

  useEffect(() => {
    cancelAi();
    clarificationContext.current = null;
  }, [pageLabel]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyV') { event.preventDefault(); toggleRef.current(); }
      if (event.key === 'Escape') {
        stopRef.current();
        setStatus('Microphone off.');
      }
    };
    const visibility = () => {
      if (document.hidden) { stopRef.current(); setStatus('Microphone off because the page was hidden. Enable it again to continue.'); }
    };
    window.addEventListener('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
      wakeRef.current = false;
      pendingAi.current?.abort();
      pendingAi.current = null;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      if (replyTimer.current) clearTimeout(replyTimer.current);
      if (startupTimer.current) clearTimeout(startupTimer.current);
      speechSerial.current++;
      if (playbackTimer.current) clearInterval(playbackTimer.current);
      const session = recognition.current;
      if (session) { session.onstart = null; session.onend = null; session.onerror = null; session.onresult = null; session.abort(); }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const buttonClass = 'min-h-12 px-4 rounded-xl border border-strong bg-card text-body font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  return <section aria-label="Sahayak voice assistant" lang="en" className="mb-6 rounded-2xl border border-strong bg-elevated p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold text-body">Hey Sahayak</h2>
      <span className="rounded-full border border-strong bg-card px-3 py-1 text-sm font-semibold text-body">
        {thinking ? local('Understanding…', 'समझ रहे हैं…') : speaking ? local('Speaking · microphone paused', 'बोल रहे हैं · माइक रुका है') : listening ? awaitingReply ? local('Listening for your reply', 'आपके जवाब के लिए सुन रहे हैं') : local('Listening', 'सुन रहे हैं') : wakeEnabled ? local('Reconnecting…', 'दोबारा जुड़ रहे हैं…') : local('Microphone off', 'माइक बंद है')}
      </span>
    </div>
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-body">
      Voice language / बोलने की भाषा
      <select value={voiceLanguage} onChange={event => {
        const next = event.target.value as 'en-IN' | 'hi-IN';
        stop();
        languageRef.current = next;
        setVoiceLanguage(next);
        speak(next === 'hi-IN' ? 'हिंदी चुनी गई। शुरू करने के लिए हे सहायक चालू करें।' : 'English selected. Enable Hey Sahayak to begin.', next);
      }} className={buttonClass}>
        <option value="en-IN">English (India)</option>
        <option value="hi-IN">हिंदी (भारत)</option>
      </select>
    </label>
    <p className="text-sm text-muted" lang={hindi ? 'hi' : 'en'}>{local('Try “take me to my documents”, “find scholarship”, “where am I”, or “read this page”. Alt + Shift + V starts one command; Escape stops audio.', 'बोलें: “मेरे दस्तावेज़ दिखाओ”, “छात्रवृत्ति खोजो”, “मैं कहाँ हूँ” या “यह पेज पढ़ो”। एस्केप से माइक बंद होता है।')}</p>
    <p className="text-sm text-body" lang={hindi ? 'hi' : 'en'}>{local('Enable once, then say “Hey Sahayak, open services”. After a question, you have 15 seconds to reply directly. While listening, say “stop listening” to switch off the microphone. The Stop button works during spoken replies too.', 'एक बार चालू करें, फिर बोलें “हे सहायक, सेवाएँ दिखाओ”। सवाल के बाद 15 सेकंड में सीधे जवाब दें। सुनते समय माइक बंद करने के लिए “सुनना बंद करो” बोलें। बोलकर जवाब देते समय भी स्टॉप बटन काम करता है।')}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!RecognitionApi} aria-pressed={wakeEnabled} onClick={() => {
        if (wakeRef.current) { stop(); speak(local('Microphone off.', 'माइक बंद है।')); }
        else { stop(); failures.current = 0; wakeRef.current = true; setWakeEnabled(true); start(true); }
      }} className={buttonClass}>{wakeEnabled ? local('Disable Hey Sahayak', 'हे सहायक बंद करें') : local('Enable Hey Sahayak', 'हे सहायक चालू करें')}</button>
      <button type="button" onClick={toggle} aria-pressed={listening} aria-keyshortcuts="Alt+Shift+V" className={buttonClass}>{thinking ? 'Cancel request' : listening ? 'Stop listening' : 'Speak command'}</button>
      <button type="button" onClick={() => speak(hindi ? hindiInstructions : instructions)} disabled={!canSpeak} className={buttonClass}>{local('Hear commands', 'कमांड सुनें')}</button>
      <button type="button" onClick={readPage} disabled={!canSpeak} className={buttonClass}>{local('Read page', 'पेज सुनें')}</button>
      <button type="button" onClick={() => { stop(); setStatus('Microphone and audio off.'); }} className={buttonClass}>Stop microphone and audio</button>
    </div>
    <div className="flex flex-wrap items-center gap-4 text-sm text-body">
      <label className="min-h-12 flex items-center gap-2"><input type="checkbox" checked={spokenReplies} disabled={!canSpeak} onChange={event => {
        spokenRepliesRef.current = event.target.checked; setSpokenReplies(event.target.checked);
        if (!event.target.checked && speaking) {
          speechSerial.current++;
          if (playbackTimer.current) clearInterval(playbackTimer.current);
          playbackTimer.current = null;
          window.speechSynthesis.cancel(); setSpeaking(false); scheduleRestart();
        }
      }} />{local('Spoken replies', 'बोलकर जवाब')}</label>
      <label className="flex items-center gap-2">{local('Speech speed', 'बोलने की गति')}
        <select aria-label={local('Speech speed', 'बोलने की गति')} className={buttonClass} value={speechRate} onChange={event => { speechRateRef.current = Number(event.target.value); setSpeechRate(Number(event.target.value)); }}>
          <option value={0.8}>{local('Slow', 'धीरे')}</option><option value={0.95}>{local('Normal', 'सामान्य')}</option><option value={1.15}>{local('Fast', 'तेज़')}</option>
        </select>
      </label>
      {speaking && <button type="button" className={buttonClass} onClick={() => {
        speechSerial.current++;
        if (playbackTimer.current) clearInterval(playbackTimer.current);
        playbackTimer.current = null;
        window.speechSynthesis.cancel(); setSpeaking(false); scheduleRestart();
      }}>{local('Skip spoken reply', 'बोलना छोड़ें')}</button>}
    </div>
    <p role="status" lang={hindi ? 'hi' : 'en'} className="text-sm text-body">{status}</p>
    {heard && <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted break-words min-w-0">Heard: <span>{heard}</span></p><button type="button" className={buttonClass} onClick={() => { setTypedCommand(extractWakeCommand(heard) ?? heard); document.getElementById('voice-command-input')?.focus(); }}>{local('Edit heard command', 'सुनी कमांड सुधारें')}</button></div>}
    <form className="flex flex-wrap gap-2" onSubmit={event => {
      event.preventDefault();
      const command = (extractWakeCommand(typedCommand) ?? typedCommand).trim();
      if (!command || thinking) return;
      clearReplyWindow(); setHeard(typedCommand.trim());
      const intent = parseVoiceCommand(command);
      if (intent.type !== 'unknown') clarificationContext.current = null;
      executeRef.current(intent, command); setTypedCommand('');
    }}>
      <label className="sr-only" htmlFor="voice-command-input">{local('Type or correct a voice command', 'आवाज़ की कमांड लिखें या सुधारें')}</label>
      <input id="voice-command-input" value={typedCommand} onChange={event => setTypedCommand(event.target.value)} maxLength={500} disabled={thinking} placeholder={local('Type a command if speech gets it wrong', 'आवाज़ गलत समझी गई तो कमांड लिखें')} className="flex-1 min-w-0 min-h-12 px-3 bg-card text-body border border-strong rounded-xl" />
      <button type="submit" className={buttonClass} disabled={!typedCommand.trim() || thinking}>{local('Run command', 'कमांड चलाएँ')}</button>
    </form>
    {!RecognitionApi && <p className="text-sm text-body">Speech recognition is unavailable in this browser. Type a command above, or try Chrome or Edge.</p>}
    <p className="text-xs text-muted">Microphone permission is required. While enabled, speech may be processed by your browser’s speech service, including speech before the wake phrase. Keep this page visible. Internet may be required.</p>
    <details className="text-sm text-body"><summary className="min-h-12 cursor-pointer">{local('Commands and how it works', 'कमांड और इस्तेमाल का तरीका')}</summary>
      <p>{hindi ? hindiInstructions : instructions}</p>
      <p>Also try “How is my application going?”, “mere documents dikhao”, or “scholarship dhundo”.</p>
      <p>Common commands are handled directly. Other requests use AI and need internet: unmatched command text and the current page name are sent for interpretation. Voice language controls recognition and replies; page reading follows the display language. Available spoken voices depend on your device.</p>
    </details>
  </section>;
}
