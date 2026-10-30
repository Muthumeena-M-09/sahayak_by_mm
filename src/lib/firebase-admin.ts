import fs from 'fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function resolveFirebaseProjectId(): string | undefined {
  try {
    const configUrl = new URL('../../firebase-applet-config.json', import.meta.url);
    const parsed = JSON.parse(fs.readFileSync(configUrl, 'utf8'));
    if (typeof parsed?.projectId === 'string' && parsed.projectId.trim()) {
      return parsed.projectId.trim();
    }
  } catch {
    // Fallback to standard Cloud Run / Google Cloud environment variables
  }
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;
}

if (!getApps().length) {
  const projectId = resolveFirebaseProjectId();
  initializeApp(projectId ? { projectId } : undefined);
}

export const adminAuth = getAuth();
