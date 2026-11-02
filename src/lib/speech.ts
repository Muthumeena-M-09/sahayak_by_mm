export class SpeechError extends Error {
 constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}
export function normalizeSpeechAudio(base64Audio: unknown, mimeType: unknown) {
 if (typeof base64Audio !== 'string' || !base64Audio.trim()) throw new SpeechError('Audio data is required.',400);
 const url = /^data:([^;,]+);base64,/.exec(base64Audio);
 const data = url ? base64Audio.slice(url[0].length) : base64Audio;
 const mime = (typeof mimeType === 'string' ? mimeType : url?.[1] || 'audio/webm').split(';')[0].trim().toLowerCase();
 if (!['audio/webm','audio/ogg','audio/mp4','audio/m4a','audio/x-m4a','audio/wav','audio/x-wav','audio/mpeg','audio/mp3','audio/flac','audio/aac'].includes(mime)) throw new SpeechError('Unsupported audio format.',415);
 if (data.length > 14*1024*1024) throw new SpeechError('Recording is too large. Please record a shorter message.',413);
 if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new SpeechError('Invalid audio encoding.',400);
 const bytes=Buffer.from(data,'base64');
 if (!bytes.length || bytes.toString('base64') !== data) throw new SpeechError('Invalid audio encoding.',400);
 if (bytes.length > 10*1024*1024) throw new SpeechError('Recording is too large.',413);
 return { base64Audio:data, mimeType: mime === 'audio/x-wav' ? 'audio/wav' : ['audio/m4a','audio/x-m4a'].includes(mime) ? 'audio/mp4' : mime };
}

export class SpeechProviderError extends Error {
 constructor(public readonly provider:string,public readonly status:number,public readonly code:string){super(`${provider} STT HTTP ${status}: ${code}`);}
}
