const en = {
  title:'Sahayak ISL Assist', text:'Text', start:'Start camera', stop:'Stop camera', on:'Camera is on', off:'Camera is off',
  consent:'Video is processed on this device. Nothing is recorded or uploaded. Only text you review and send enters the chat.',
  confirm:'Confirm word', retry:'Retry', edit:'Edit text', clear:'Clear', draft:'Use phrase in chat draft',
  phrase:'Reviewed phrase', word:'Review word', fallback:'Return to text / voice', vocabulary:'Model vocabulary (experimental)',
  disabled:'Recognition is disabled until the trained model passes validation. You can still use text.',
  loading:'Loading local model…', ready:'Sign clearly with both shoulders and hands visible.',
  unsure:'Not sure. Try a supported sign again, or type your request.', lowlight:'The preview looks dark. Try brighter lighting.',
  denied:'Camera permission was denied. Allow it in browser settings or use text.',
  missing:'No camera was found. Connect a camera or use text.', busy:'The camera is busy. Close other camera apps and retry.',
  failed:'Camera could not start. Use HTTPS or localhost and check browser camera settings.',
};
type Messages = typeof en;
const translations: Record<string, Partial<Messages>> = {
  ta:{start:'கேமராவை தொடங்கு',stop:'கேமராவை நிறுத்து',on:'கேமரா இயங்குகிறது',off:'கேமரா அணைக்கப்பட்டுள்ளது',confirm:'சொல்லை உறுதிசெய்',retry:'மீண்டும் முயற்சி',edit:'உரையை திருத்து',clear:'அழி',draft:'அரட்டை வரைவில் சேர்',phrase:'சரிபார்த்த சொற்றொடர்',word:'சொல்லை சரிபார்',fallback:'உரை / குரலுக்கு திரும்பு',consent:'வீடியோ இந்த சாதனத்தில் மட்டுமே செயலாக்கப்படுகிறது. பதிவு அல்லது பதிவேற்றம் இல்லை. நீங்கள் சரிபார்த்து அனுப்பும் உரை மட்டுமே அரட்டைக்கு செல்லும்.',disabled:'மாதிரி சரிபார்க்கப்படும் வரை சைகை அறிதல் முடக்கப்பட்டுள்ளது. உரையை பயன்படுத்தலாம்.'},
  hi:{start:'कैमरा शुरू करें',stop:'कैमरा बंद करें',on:'कैमरा चालू है',off:'कैमरा बंद है',confirm:'शब्द की पुष्टि',retry:'फिर कोशिश करें',edit:'टेक्स्ट बदलें',clear:'साफ करें',draft:'चैट ड्राफ्ट में जोड़ें',phrase:'समीक्षित वाक्यांश',word:'शब्द की समीक्षा',fallback:'टेक्स्ट / आवाज़ पर लौटें',consent:'वीडियो इसी डिवाइस पर प्रोसेस होता है। कोई रिकॉर्डिंग या अपलोड नहीं होता। केवल आपके द्वारा जाँचा और भेजा गया टेक्स्ट चैट में जाता है।',disabled:'मॉडल की जाँच पूरी होने तक पहचान बंद है। आप टेक्स्ट इस्तेमाल कर सकते हैं।'},
  te:{start:'కెమెరా ప్రారంభించండి',stop:'కెమెరా ఆపండి',on:'కెమెరా ఆన్‌లో ఉంది',off:'కెమెరా ఆఫ్‌లో ఉంది',confirm:'పదాన్ని నిర్ధారించండి',retry:'మళ్లీ ప్రయత్నించండి',edit:'టెక్స్ట్ సవరించండి',clear:'తొలగించండి',draft:'చాట్ డ్రాఫ్ట్‌లో చేర్చండి',phrase:'సమీక్షించిన పదబంధం',word:'పదాన్ని సమీక్షించండి',fallback:'టెక్స్ట్ / వాయిస్‌కు తిరిగి',consent:'వీడియో ఈ పరికరంలోనే ప్రాసెస్ అవుతుంది. రికార్డింగ్ లేదా అప్‌లోడ్ లేదు. మీరు సమీక్షించి పంపిన టెక్స్ట్ మాత్రమే చాట్‌కు వెళ్తుంది.'},
  kn:{start:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ',stop:'ಕ್ಯಾಮೆರಾ ನಿಲ್ಲಿಸಿ',on:'ಕ್ಯಾಮೆರಾ ಆನ್ ಆಗಿದೆ',off:'ಕ್ಯಾಮೆರಾ ಆಫ್ ಆಗಿದೆ',confirm:'ಪದ ದೃಢೀಕರಿಸಿ',retry:'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',edit:'ಪಠ್ಯ ತಿದ್ದಿ',clear:'ಅಳಿಸಿ',draft:'ಚಾಟ್ ಕರಡಿಗೆ ಸೇರಿಸಿ',phrase:'ಪರಿಶೀಲಿಸಿದ ಪದಗುಚ್ಛ',word:'ಪದ ಪರಿಶೀಲಿಸಿ',fallback:'ಪಠ್ಯ / ಧ್ವನಿಗೆ ಹಿಂತಿರುಗಿ',consent:'ವೀಡಿಯೊ ಈ ಸಾಧನದಲ್ಲೇ ಪ್ರಕ್ರಿಯೆಯಾಗುತ್ತದೆ. ರೆಕಾರ್ಡಿಂಗ್ ಅಥವಾ ಅಪ್‌ಲೋಡ್ ಇಲ್ಲ. ನೀವು ಪರಿಶೀಲಿಸಿ ಕಳುಹಿಸಿದ ಪಠ್ಯ ಮಾತ್ರ ಚಾಟ್‌ಗೆ ಹೋಗುತ್ತದೆ.'},
};
export function islMessages(language: string): Messages { return {...en,...translations[language]}; }
