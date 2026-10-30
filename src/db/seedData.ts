import type { ServiceFormField, WorkflowStepDef } from './schema.ts';
import {
  FULL_BUNDLED_TRANSLATIONS,
  FULL_DEFAULT_UI_STRINGS,
  SERVICE_TERM_TRANSLATIONS,
} from '../i18n/catalog.ts';

export interface SeedLanguage {
  code: string;
  nativeName: string;
  englishName: string;
  script: string;
  direction: 'ltr' | 'rtl';
  sttSupported: boolean;
  ttsSupported: boolean;
  fontStack: string;
  localeCode: string;
  sampleGreeting: string;
  sortOrder: number;
}

// All 22 Scheduled Languages of India + English (23 languages)
export const SCHEDULED_LANGUAGES: SeedLanguage[] = [
  {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    script: 'Latin',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'DM Sans', 'Plus Jakarta Sans', sans-serif",
    localeCode: 'en-IN',
    sampleGreeting: 'Welcome to Sahayak. Select English to get assistance by voice or text.',
    sortOrder: 1,
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'hi-IN',
    sampleGreeting: 'सहायक में आपका स्वागत है। बोलकर या लिखकर सहायता पाने के लिए हिन्दी चुनें।',
    sortOrder: 2,
  },
  {
    code: 'bn',
    nativeName: 'বাংলা',
    englishName: 'Bengali',
    script: 'Bengali',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Bengali', 'DM Sans', sans-serif",
    localeCode: 'bn-IN',
    sampleGreeting: 'সহায়কে আপনাকে স্বাগতম। কণ্ঠস্বর বা লেখার মাধ্যমে সহায়তা পেতে বাংলা নির্বাচন করুন।',
    sortOrder: 3,
  },
  {
    code: 'ta',
    nativeName: 'தமிழ்',
    englishName: 'Tamil',
    script: 'Tamil',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Tamil', 'DM Sans', sans-serif",
    localeCode: 'ta-IN',
    sampleGreeting: 'சஹாயக்கிற்கு நல்வரவு. குரல் அல்லது எழுத்து மூலம் உதவி பெற தமிழைத் தேர்ந்தெடுக்கவும்.',
    sortOrder: 4,
  },
  {
    code: 'te',
    nativeName: 'తెలుగు',
    englishName: 'Telugu',
    script: 'Telugu',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Telugu', 'DM Sans', sans-serif",
    localeCode: 'te-IN',
    sampleGreeting: 'సహాయక్‌కు స్వాగతం. వాయిస్ లేదా టెక్స్ట్ ద్వారా సహాయం పొందడానికి తెలుగును ఎంచుకోండి.',
    sortOrder: 5,
  },
  {
    code: 'mr',
    nativeName: 'मराठी',
    englishName: 'Marathi',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'mr-IN',
    sampleGreeting: 'सहायकमध्ये आपले स्वागत आहे. आवाज किंवा मजकुराद्वारे मदत मिळवण्यासाठी मराठी निवडा.',
    sortOrder: 6,
  },
  {
    code: 'ur',
    nativeName: 'اردو',
    englishName: 'Urdu',
    script: 'Perso-Arabic',
    direction: 'rtl',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Nastaliq Urdu', 'Noto Sans Arabic', 'DM Sans', sans-serif",
    localeCode: 'ur-IN',
    sampleGreeting: 'سہایک میں خوش آمدید۔ آواز یا تحریر کے ذریعے مدد حاصل کرنے کے لیے اردو منتخب کریں۔',
    sortOrder: 7,
  },
  {
    code: 'gu',
    nativeName: 'ગુજરાતી',
    englishName: 'Gujarati',
    script: 'Gujarati',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Gujarati', 'DM Sans', sans-serif",
    localeCode: 'gu-IN',
    sampleGreeting: 'સહાયકમાં આપનું સ્વાગત છે. અવાજ અથવા લખાણ દ્વારા મદદ મેળવવા ગુજરાતી પસંદ કરો.',
    sortOrder: 8,
  },
  {
    code: 'kn',
    nativeName: 'ಕನ್ನಡ',
    englishName: 'Kannada',
    script: 'Kannada',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Kannada', 'DM Sans', sans-serif",
    localeCode: 'kn-IN',
    sampleGreeting: 'ಸಹಾಯಕ್‌ಗೆ ಸ್ವಾಗತ. ಧ್ವನಿ ಅಥವಾ ಪಠ್ಯದ ಮೂಲಕ ಸಹಾಯ ಪಡೆಯಲು ಕನ್ನಡವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
    sortOrder: 9,
  },
  {
    code: 'ml',
    nativeName: 'മലയാളം',
    englishName: 'Malayalam',
    script: 'Malayalam',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Malayalam', 'DM Sans', sans-serif",
    localeCode: 'ml-IN',
    sampleGreeting: 'സഹായക്കിലേക്ക് സ്വാഗതം. ശബ്ദത്തിലൂടെയോ എഴുത്തിലൂടെയോ സഹായം ലഭിക്കാൻ മലയാളം തിരഞ്ഞെടുക്കുക.',
    sortOrder: 10,
  },
  {
    code: 'or',
    nativeName: 'ଓଡ଼ିଆ',
    englishName: 'Odia',
    script: 'Odia',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Oriya', 'DM Sans', sans-serif",
    localeCode: 'or-IN',
    sampleGreeting: 'ସହାୟକକୁ ସ୍ୱାଗତ। ସ୍ୱର କିମ୍ବା ଲେଖା ମାଧ୍ୟମରେ ସହାୟତା ପାଇବାକୁ ଓଡ଼ିଆ ବାଛନ୍ତୁ।',
    sortOrder: 11,
  },
  {
    code: 'pa',
    nativeName: 'ਪੰਜਾਬੀ',
    englishName: 'Punjabi',
    script: 'Gurmukhi',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Gurmukhi', 'DM Sans', sans-serif",
    localeCode: 'pa-IN',
    sampleGreeting: 'ਸਹਾਇਕ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ। ਆਵਾਜ਼ ਜਾਂ ਲਿਖਤ ਰਾਹੀਂ ਮਦਦ ਲੈਣ ਲਈ ਪੰਜਾਬੀ ਚੁਣੋ।',
    sortOrder: 12,
  },
  {
    code: 'as',
    nativeName: 'অসমীয়া',
    englishName: 'Assamese',
    script: 'Bengali-Assamese',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Bengali', 'DM Sans', sans-serif",
    localeCode: 'as-IN',
    sampleGreeting: 'সহায়কলৈ স্বাগতম। মাত বা লিখনিৰ জৰিয়তে সহায় পাবলৈ অসমীয়া বাছনি কৰক।',
    sortOrder: 13,
  },
  {
    code: 'mai',
    nativeName: 'मैथिली',
    englishName: 'Maithili',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'mai-IN',
    sampleGreeting: 'सहायक मे अहाँक स्वागत अछि। आवाज वा लिखि कऽ सहायता लेल मैथिली चुनू।',
    sortOrder: 14,
  },
  {
    code: 'sat',
    nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ',
    englishName: 'Santali',
    script: 'Ol Chiki',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Ol Chiki', 'DM Sans', sans-serif",
    localeCode: 'sat-IN',
    sampleGreeting: 'ᱥᱟᱦᱟᱭᱚᱠ ᱨᱮ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ᱾ ᱟᱲᱟᱝ ᱟᱨᱵᱟᱝ ᱚᱞ ᱛᱮ ᱜᱚᱲᱚ ᱧᱟᱢ ᱞᱟᱹᱜᱤᱫ ᱥᱟᱱᱛᱟᱲᱤ ᱵᱟᱪᱷᱟᱣ ᱢᱮ᱾',
    sortOrder: 15,
  },
  {
    code: 'ks',
    nativeName: 'کٲشُر',
    englishName: 'Kashmiri',
    script: 'Perso-Arabic',
    direction: 'rtl',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Nastaliq Urdu', 'Noto Sans Arabic', 'DM Sans', sans-serif",
    localeCode: 'ks-IN',
    sampleGreeting: 'سہایکس منز چھُ تۄہِہ خٲر مقدم۔ مدد حٲصل کرنہٕ خٲطرٕ ژٲرِو کٲشُر۔',
    sortOrder: 16,
  },
  {
    code: 'ne',
    nativeName: 'नेपाली',
    englishName: 'Nepali',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'ne-IN',
    sampleGreeting: 'सहायकमा स्वागत छ। आवाज वा पाठ मार्फत सहयोग पाउन नेपाली छान्नुहोस्।',
    sortOrder: 17,
  },
  {
    code: 'sd',
    nativeName: 'سنڌي',
    englishName: 'Sindhi',
    script: 'Perso-Arabic',
    direction: 'rtl',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Arabic', 'Noto Nastaliq Urdu', 'DM Sans', sans-serif",
    localeCode: 'sd-IN',
    sampleGreeting: 'سهايڪ ۾ ڀليڪار. آواز يا لکت ذريعي مدد حاصل ڪرڻ لاءِ سنڌي چونڊيو.',
    sortOrder: 18,
  },
  {
    code: 'kok',
    nativeName: 'कोंकणी',
    englishName: 'Konkani',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'kok-IN',
    sampleGreeting: 'सहायकांत तुमचें येवकार. आवाज वा मजकुरा वरवीं आदार मेळोवपाक कोंकणी निवडात.',
    sortOrder: 19,
  },
  {
    code: 'doi',
    nativeName: 'डोगरी',
    englishName: 'Dogri',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'doi-IN',
    sampleGreeting: 'सहायक च तुंदा सुआगत ऐ। बोलियै जां लिखियै मदद लेई डोगरी चुनो।',
    sortOrder: 20,
  },
  {
    code: 'mni',
    nativeName: 'মৈতৈলোন্',
    englishName: 'Manipuri (Meitei)',
    script: 'Meetei Mayek / Bengali',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Meetei Mayek', 'Noto Sans Bengali', 'DM Sans', sans-serif",
    localeCode: 'mni-IN',
    sampleGreeting: 'সহায়ক্তা তরাম্না ওকচরি। খোঞ্জেল নত্ত্রগা ইদুনা মতেং লৌনবা মৈতৈলোন্ খল্লু।',
    sortOrder: 21,
  },
  {
    code: 'brx',
    nativeName: 'बड़ो',
    englishName: 'Bodo',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'brx-IN',
    sampleGreeting: 'सहायकाव नोंथांखौ बरायबाय। गारां एबा लिरनायजों हेफाजाब मोननो बड़ो बासिख।',
    sortOrder: 22,
  },
  {
    code: 'sa',
    nativeName: 'संस्कृतम्',
    englishName: 'Sanskrit',
    script: 'Devanagari',
    direction: 'ltr',
    sttSupported: true,
    ttsSupported: true,
    fontStack: "'Noto Sans Devanagari', 'DM Sans', sans-serif",
    localeCode: 'sa-IN',
    sampleGreeting: 'सहायके भवतां स्वागतम्। वाचा लेखनेन वा साहाय्यं प्राप्तुं संस्कृतं वृणुत।',
    sortOrder: 23,
  },
];

// Built below after NEUTRAL_SERVICE_TEMPLATES so all svc_term.* keys are included automatically

export interface SeedServiceTemplate {
  slug: string;
  domain: string;
  title: string;
  description: string;
  requiredDocuments: string[];
  estimatedDays: number;
  formSchema: ServiceFormField[];
}

// Neutral domain templates across the 6 required domains (zero hardcoded personas or fake stories)
export const NEUTRAL_SERVICE_TEMPLATES: SeedServiceTemplate[] = [
  {
    slug: 'gov-civil-certificate-request',
    domain: 'government',
    title: 'Civil & Residence Certificate Application',
    description: 'Submit an official request for residence, income, or civil record verification with automated field extraction from identity documents.',
    requiredDocuments: ['Proof of Identity', 'Proof of Address'],
    estimatedDays: 7,
    formSchema: [
      { key: 'applicantFullName', label: 'Applicant Full Name', type: 'text', required: true, step: 1, extractHint: 'Full name on ID document' },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true, step: 1, extractHint: 'Date of birth in YYYY-MM-DD' },
      { key: 'idDocumentNumber', label: 'Identity Reference Number', type: 'text', required: true, step: 1, extractHint: 'ID card number or registration ID' },
      { key: 'residentialAddress', label: 'Residential Address', type: 'textarea', required: true, step: 2, extractHint: 'Full street address, district, state' },
      { key: 'postalCode', label: 'PIN / Postal Code', type: 'text', required: true, step: 2, extractHint: '6-digit PIN or postal code' },
      { key: 'certificateType', label: 'Certificate Type', type: 'select', required: true, step: 3, options: ['Residence / Domicile', 'Income Verification', 'Birth / Civil Extract'] },
      { key: 'purposeOfRequest', label: 'Purpose of Application', type: 'textarea', required: true, step: 3 },
      { key: 'declarationConfirmed', label: 'Applicant Confirmation Notes (Optional)', type: 'text', required: false, step: 4 },
    ],
  },
  {
    slug: 'edu-institutional-enrollment',
    domain: 'education',
    title: 'Academic Verification & Institutional Enrollment',
    description: 'Apply for institutional enrollment, transcript verification, or transfer certificate processing using academic records.',
    requiredDocuments: ['Identity Card', 'Previous Academic Marksheet'],
    estimatedDays: 10,
    formSchema: [
      { key: 'studentFullName', label: 'Candidate Full Name', type: 'text', required: true, step: 1, extractHint: 'Student or candidate full name' },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true, step: 1, extractHint: 'Date of birth in YYYY-MM-DD' },
      { key: 'previousInstitution', label: 'Institution / Board Name', type: 'text', required: true, step: 2, extractHint: 'School, university, or board name' },
      { key: 'rollOrRegNumber', label: 'Registration / Roll Number', type: 'text', required: true, step: 2, extractHint: 'Roll number or enrollment number' },
      { key: 'completionYear', label: 'Year of Examination', type: 'number', required: true, step: 2, extractHint: '4-digit year' },
      { key: 'serviceCategory', label: 'Requested Academic Service', type: 'select', required: true, step: 3, options: ['Enrollment Verification', 'Official Transcript', 'Migration / Transfer Certificate'] },
      { key: 'additionalRemarks', label: 'Additional Details', type: 'textarea', required: false, step: 4 },
    ],
  },
  {
    slug: 'health-patient-registration',
    domain: 'healthcare',
    title: 'Health Card & Clinical Service Registration',
    description: 'Register for public health benefits, outpatient referral scheduling, or medical record digitization.',
    requiredDocuments: ['Identity Proof', 'Clinical Referral or Prescription (Optional)'],
    estimatedDays: 3,
    formSchema: [
      { key: 'patientFullName', label: 'Patient Full Name', type: 'text', required: true, step: 1, extractHint: 'Patient full name' },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true, step: 1, extractHint: 'Date of birth in YYYY-MM-DD' },
      { key: 'contactPhone', label: 'Contact Phone Number', type: 'text', required: true, step: 2, extractHint: 'Phone number' },
      { key: 'residentialAddress', label: 'Address / District', type: 'textarea', required: true, step: 2, extractHint: 'Address on card' },
      { key: 'departmentRequested', label: 'Medical Department / Service', type: 'select', required: true, step: 3, options: ['General Medicine', 'Maternal & Child Health', 'Diagnostic & Lab Referral', 'Health ID Enrollment'] },
      { key: 'medicalSummary', label: 'Referral Reference or Notes', type: 'textarea', required: false, step: 4, extractHint: 'Hospital or prescription reference details' },
    ],
  },
  {
    slug: 'bank-kyc-account-service',
    domain: 'banking',
    title: 'Banking KYC Update & Account Service Request',
    description: 'Submit standardized Know Your Customer (KYC) updates, linkage requests, or account service forms.',
    requiredDocuments: ['Officially Valid Identity Document', 'Address Proof'],
    estimatedDays: 5,
    formSchema: [
      { key: 'accountHolderName', label: 'Account Holder Name', type: 'text', required: true, step: 1, extractHint: 'Full name on ID or bank passbook' },
      { key: 'idDocumentNumber', label: 'Officially Valid ID Number', type: 'text', required: true, step: 1, extractHint: 'PAN, Voter ID, Passport, or ID number' },
      { key: 'accountOrCustomerRef', label: 'Account / Customer Reference', type: 'text', required: true, step: 2, extractHint: 'Account number or CIF' },
      { key: 'registeredAddress', label: 'Current Communication Address', type: 'textarea', required: true, step: 2, extractHint: 'Full postal address' },
      { key: 'bankingRequestType', label: 'Service Type', type: 'select', required: true, step: 3, options: ['Periodic KYC Update', 'Direct Benefit Linkage', 'Address & Contact Update'] },
      { key: 'branchName', label: 'Branch Name or IFSC', type: 'text', required: false, step: 4, extractHint: 'Branch name or IFSC code' },
    ],
  },
  {
    slug: 'biz-enterprise-compliance',
    domain: 'business',
    title: 'Small Enterprise Registration & Trade Filing',
    description: 'File enterprise registration details, trade license renewals, or statutory compliance declarations.',
    requiredDocuments: ['Business Identity Proof', 'Establishment Address Proof'],
    estimatedDays: 7,
    formSchema: [
      { key: 'enterpriseName', label: 'Enterprise / Trade Name', type: 'text', required: true, step: 1, extractHint: 'Registered business or shop name' },
      { key: 'authorizedSignatory', label: 'Authorized Applicant Name', type: 'text', required: true, step: 1, extractHint: 'Proprietor or director name' },
      { key: 'registrationNumber', label: 'Tax / Registration ID', type: 'text', required: false, step: 2, extractHint: 'GSTIN, Udyam, or license number' },
      { key: 'businessAddress', label: 'Principal Place of Business', type: 'textarea', required: true, step: 2, extractHint: 'Business premises address' },
      { key: 'filingCategory', label: 'Filing Category', type: 'select', required: true, step: 3, options: ['New Micro-Enterprise Registration', 'Trade License Renewal', 'Compliance Certificate'] },
      { key: 'activityDescription', label: 'Primary Business Activity', type: 'textarea', required: true, step: 4 },
    ],
  },
  {
    slug: 'support-institutional-service',
    domain: 'customer_support',
    title: 'Utility & Institutional Service Request',
    description: 'Submit billing corrections, connection transfers, or institutional support requests with supporting bills or receipts.',
    requiredDocuments: ['Latest Statement / Receipt', 'Identity Proof (if transferring)'],
    estimatedDays: 4,
    formSchema: [
      { key: 'consumerName', label: 'Consumer / Subscriber Name', type: 'text', required: true, step: 1, extractHint: 'Consumer name on bill or receipt' },
      { key: 'consumerAccountNo', label: 'Consumer / Service Account ID', type: 'text', required: true, step: 1, extractHint: 'Consumer number, invoice ID, or policy ID' },
      { key: 'serviceAddress', label: 'Service Location Address', type: 'textarea', required: true, step: 2, extractHint: 'Service address on bill' },
      { key: 'requestType', label: 'Support Request Category', type: 'select', required: true, step: 3, options: ['Billing / Metering Review', 'Name or Address Update', 'Service Restoration Request'] },
      { key: 'issueDetails', label: 'Summary of Request', type: 'textarea', required: true, step: 4, extractHint: 'Bill amount, date, or discrepancy summary' },
    ],
  },
];

export const DEFAULT_WORKFLOWS: Array<{
  name: string;
  description: string;
  domain: string;
  triggerType: string;
  steps: WorkflowStepDef[];
}> = [
  {
    name: 'Standard Application Processing',
    description: 'Validates submitted details, verifies attached documents, dispatches to the departmental adapter, and notifies the applicant.',
    domain: 'government',
    triggerType: 'application_submitted',
    steps: [
      { id: 'step-1', type: 'collect_details', label: 'Validate collected form fields', config: { requiredCheck: 'strict' } },
      { id: 'step-2', type: 'verify_documents', label: 'Verify attached supporting documents', config: { autoTagVerified: 'true' } },
      { id: 'step-3', type: 'send_to_office', label: 'Forward dossier to departmental queue', config: { adapter: 'departmental_gateway' } },
      { id: 'step-4', type: 'notify_user', label: 'Send localized reference confirmation', config: { channel: 'in_app' } },
    ],
  },
  {
    name: 'Detected Deadline Reminder',
    description: 'Creates an actionable reminder and notification whenever a user schedules a deadline from an official notice or letter.',
    domain: 'government',
    triggerType: 'deadline_detected',
    steps: [
      { id: 'step-1', type: 'set_reminder', label: 'Schedule citizen deadline reminder', config: { advanceHours: '24' } },
      { id: 'step-2', type: 'notify_user', label: 'Confirm reminder in preferred language', config: { channel: 'push' } },
    ],
  },
  {
    name: 'Grievance Triage & SLA Routing',
    description: 'Classifies incoming grievances, assigns departmental routing and SLA window, and sends acknowledgement.',
    domain: 'customer_support',
    triggerType: 'grievance_created',
    steps: [
      { id: 'step-1', type: 'route_grievance', label: 'Classify & assign departmental queue', config: { slaHours: '72' } },
      { id: 'step-2', type: 'notify_user', label: 'Send grievance tracking reference', config: { channel: 'in_app' } },
    ],
  },
];

export const DEFAULT_INTEGRATIONS = [
  {
    name: 'Departmental Service Gateway',
    adapterType: 'rest',
    domain: 'government',
    endpointUrl: 'https://sandbox.gateway.gov.example/v1/submissions',
    mode: 'sandbox',
    status: 'untested',
  },
  {
    name: 'DigiLocker Document Verification Adapter',
    adapterType: 'oauth2',
    domain: 'government',
    endpointUrl: 'https://sandbox.digilocker.example/oauth2/v1/pull',
    mode: 'sandbox',
    status: 'untested',
  },
  {
    name: 'Multichannel Citizen Notification Webhook',
    adapterType: 'webhook',
    domain: 'customer_support',
    endpointUrl: 'https://sandbox.notify.example/webhooks/dispatch',
    mode: 'sandbox',
    status: 'untested',
  },
];

// Build complete DEFAULT_UI_STRINGS + BUNDLED_TRANSLATIONS including every service field/doc/option term
const serviceTermsSource: Record<string, string> = {};
for (const tpl of NEUTRAL_SERVICE_TEMPLATES) {
  serviceTermsSource[`svc.${tpl.slug}.title`] = tpl.title;
  serviceTermsSource[`svc.${tpl.slug}.desc`] = tpl.description;
  for (const doc of tpl.requiredDocuments) {
    serviceTermsSource[`svc_term.${doc}`] = doc;
  }
  for (const field of tpl.formSchema) {
    serviceTermsSource[`svc_term.${field.label}`] = field.label;
    for (const opt of field.options || []) {
      serviceTermsSource[`svc_term.${opt}`] = opt;
    }
  }
}

export const DEFAULT_UI_STRINGS: Record<string, string> = {
  ...serviceTermsSource,
  ...FULL_DEFAULT_UI_STRINGS,
};

export const BUNDLED_TRANSLATIONS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(FULL_BUNDLED_TRANSLATIONS).map(([lang, dict]) => {
    const extraTerms: Record<string, string> = {};
    const termLookup = SERVICE_TERM_TRANSLATIONS[lang] || {};
    for (const [enTerm, localTerm] of Object.entries(termLookup)) {
      extraTerms[`svc_term.${enTerm}`] = localTerm;
    }
    return [lang, { ...extraTerms, ...dict }];
  })
);

