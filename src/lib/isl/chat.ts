export function confirmedISLPayload(message:string, preferredLanguageCode:string, conversationId?:number) {
  if (!message.trim() || message.length>4000) throw new Error('Review a short text phrase before sending.');
  return {message:message.trim(),preferredLanguageCode,conversationId,input_mode:'isl' as const};
}
/** Existing text/voice/document requests remain backward compatible. */
export function validateISLChatBody(body: Record<string,unknown>): string|null {
  if(body?.input_mode!=='isl')return null;
  const allowed=['message','preferredLanguageCode','conversationId','input_mode'];
  if(Object.keys(body).some(key=>!allowed.includes(key)))return 'ISL requests accept confirmed text only; camera data and attachments are not accepted.';
  if(typeof body.message!=='string' || !body.message.trim() || body.message.length>4000)return 'ISL message must contain reviewed text.';
  return null;
}
