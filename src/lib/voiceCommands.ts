import type { CitizenScreen } from '../types';

export function normalizeVoice(text: string) {
  return text.toLowerCase().normalize('NFKC').replace(/[.!?,।:;“”"'‘’\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractWakeCommand(text: string): string | null {
  const command = normalizeVoice(text);
  const phrase = /^(?:(?:ok|okay|ओके)\s+)?(?:hey|hi|hello|हे|हाय|है|हेय|नमस्ते)\s+(?:sahayak|sahayaka|sahayyak|sahaayak|saahayak|saha\s+yak|सहायक)(?=\s|$)/.exec(command);
  return phrase ? command.slice(phrase.index + phrase[0].length).trim() : null;
}

export type VoiceIntent =
  | { type: 'navigate'; screen: CitizenScreen }
  | { type: 'search'; query: string }
  | { type: 'help' | 'read' | 'back' | 'stop' | 'location' | 'repeat' | 'unknown' };

export const voiceScreens = ['home', 'services', 'documents', 'status', 'centres', 'explain', 'grievance', 'notifications', 'settings', 'help', 'ask'] as const;
export interface AiVoiceResult { intent: VoiceIntent; clarification?: string }

// Validate on both sides of the API boundary; model output never selects arbitrary actions.
export function validateAiVoiceResult(value: unknown): AiVoiceResult {
  const fallback: AiVoiceResult = {intent:{type:'unknown'}};
  if (!value || typeof value !== 'object') return fallback;
  const result = value as Record<string, unknown>;
  if (typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0.8 || result.confidence > 1 || result.type === 'unknown') {
    return typeof result.clarification === 'string' && result.clarification.trim()
      ? {...fallback, clarification:result.clarification.trim().slice(0, 240)} : fallback;
  }
  if (result.type === 'navigate' && voiceScreens.includes(result.screen as typeof voiceScreens[number])) {
    return {intent:{type:'navigate', screen:result.screen as CitizenScreen}};
  }
  if (result.type === 'search' && typeof result.query === 'string' && result.query.trim() && result.query.length <= 120) {
    return {intent:{type:'search', query:result.query.trim()}};
  }
  if (['help','read','back','stop','location','repeat'].includes(String(result.type))) {
    return {intent:{type:result.type as 'help' | 'read' | 'back' | 'stop' | 'location' | 'repeat'}};
  }
  return fallback;
}

const aliases: Array<[CitizenScreen, string[]]> = [
  ['home', ['home', 'home page', 'होम', 'मुख्य पृष्ठ']],
  ['services', ['services', 'service', 'available services', 'सेवाएं', 'सेवाएँ', 'सेवा']],
  ['documents', ['documents', 'my documents', 'document', 'my uploaded papers', 'uploaded papers', 'my papers', 'mere documents', 'mere dastavez', 'दस्तावेज', 'दस्तावेज़', 'मेरे दस्तावेज', 'मेरे दस्तावेज़', 'मेरे कागज़', 'मेरे कागज']],
  ['status', ['status', 'application status', 'my application status', 'my applications', 'आवेदन की स्थिति', 'आवेदन स्थिति', 'मेरे आवेदन', 'स्टेटस']],
  ['centres', ['centres', 'centers', 'service centres', 'service centers', 'सेवा केंद्र', 'सेवा केन्द्र', 'केंद्र']],
  ['explain', ['explain letter', 'explain a letter', 'letter explanation', 'पत्र समझाएं', 'पत्र समझाएँ']],
  ['grievance', ['grievance', 'complaints', 'complaint', 'शिकायत']],
  ['notifications', ['notifications', 'my notifications', 'सूचनाएं', 'सूचनाएँ']],
  ['settings', ['settings', 'सेटिंग्स', 'सेटिंग']],
  ['help', ['help', 'help page', 'help screen', 'सहायता पृष्ठ']],
  ['ask', ['ask', 'ask sahayak', 'सवाल पूछें', 'सहायक से पूछें']],
];

export function parseVoiceCommand(text: string): VoiceIntent {
  let command = normalizeVoice(text).replace(/^(?:(?:please|kindly|can you|could you|would you|कृपया)\s+)+/, '').replace(/\s+(?:please|for me)$/, '');
  if (['help', 'commands', 'what can i say', 'मदद', 'कमांड बताओ', 'क्या बोलूं', 'क्या बोलूँ'].includes(command)) return {type:'help'};
  if (['read this page', 'read page', 'read aloud', 'read the page', 'यह पेज पढ़ो', 'पेज पढ़ो', 'इसे पढ़ो', 'यह पढ़ो'].includes(command)) return {type:'read'};
  if (['go back', 'back', 'previous page', 'take me back', 'वापस', 'वापस जाओ', 'पीछे जाओ', 'पिछला पेज'].includes(command)) return {type:'back'};
  if (['stop', 'stop listening', 'turn off', 'microphone off', 'stop microphone', 'mic off', 'band karo', 'sunna band karo', 'बंद करो', 'सुनना बंद करो', 'माइक बंद करो', 'रुको'].includes(command)) return {type:'stop'};
  if (['where am i', 'which page is this', 'मैं कहाँ हूँ', 'मैं कहां हूं', 'यह कौन सा पेज है'].includes(command)) return {type:'location'};
  if (['repeat', 'say that again', 'repeat that', 'फिर से बोलो', 'दोहराओ'].includes(command)) return {type:'repeat'};
  const everyday: Record<string, VoiceIntent> = {
    'where are my documents': {type:'navigate', screen:'documents'},
    'where are my uploaded papers': {type:'navigate', screen:'documents'},
    'how is my application going': {type:'navigate', screen:'status'},
    'check my application status': {type:'navigate', screen:'status'},
    'mera application status': {type:'navigate', screen:'status'},
    'मेरा आवेदन कहाँ तक पहुँचा': {type:'navigate', screen:'status'},
    'what services are available': {type:'navigate', screen:'services'},
    'nearby help centres': {type:'navigate', screen:'centres'},
    'nearby help centers': {type:'navigate', screen:'centres'},
    'read this page to me': {type:'read'}, 'ye page padho': {type:'read'},
    'wapis jao': {type:'back'}, 'wapas jao': {type:'back'},
  };
  if (everyday[command]) return everyday[command];
  const search = /^(?:search(?: for)?|find|look for|search services for)\s+(.+)$/.exec(command)
    || /^(?:खोजो|ढूंढो|ढूँढो|खोजें)\s+(.+)$/.exec(command)
    || /^(.+?)\s+(?:खोजो|ढूंढो|ढूँढो|खोजें|dhundo|dhoondo|khojo)$/.exec(command);
  if (search) {
    const translations: Record<string,string> = {'छात्रवृत्ति':'scholarship','पेंशन':'pension','राशन कार्ड':'ration','आधार':'aadhaar','स्वास्थ्य':'health','शिक्षा':'education','बैंकिंग':'banking'};
    return {type:'search', query: translations[search[1]] || search[1]};
  }
  command = command.replace(/^(?:open|go to|take me to|show me|show|navigate to)\s+(?:the\s+)?/, '')
    .replace(/\s+(?:dikhao|kholo)$/, '')
    .replace(/^(?:मुझे|मेरे लिए)\s+/, '').replace(/\s+(?:खोलो|खोलें|दिखाओ|दिखाएं|दिखाएँ|पर जाओ)$/, '');
  const destination = aliases.find(([, names]) => names.includes(command));
  return destination ? {type:'navigate', screen:destination[0]} : {type:'unknown'};
}
