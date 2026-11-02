import React, { useState } from 'react';
import { ISLAssist } from './ISLAssist.tsx';
export default function ISLTestPage() {
  const [text, setText] = useState('');
  return <main className="max-w-3xl mx-auto p-4 space-y-4 bg-page min-h-screen text-body">
    <h1 className="text-2xl font-bold">ISL local camera test</h1>
    <p>This test page never sends a phrase to the server. To ask Sahayak, open Ask in the main app.</p>
    <ISLAssist onSubmit={setText} onClose={() => { location.href = '/'; }} />
    {text && <p role="status">Confirmed locally: {text}</p>}
  </main>;
}
