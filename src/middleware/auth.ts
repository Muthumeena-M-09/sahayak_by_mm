import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { resolveSessionToken, upsertProfileAndRoles } from '../db/repositories.ts';

export interface AuthContext {
  uid: string;
  email: string | null;
  roles: string[];
  isGuest: boolean;
}

export interface AuthRequest extends Request {
  authContext?: AuthContext;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    if (token.startsWith('sahayak_session_')) {
      const resolved = await resolveSessionToken(token);
      if (!resolved) {
        return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      }
      req.authContext = {
        uid: resolved.profile.uid,
        email: resolved.profile.email,
        roles: resolved.roles,
        isGuest: resolved.profile.isGuest,
      };
      return next();
    }

    // Verify Firebase Auth ID Token
    const decoded = await adminAuth.verifyIdToken(token);
    const { profile, roles } = await upsertProfileAndRoles({
      uid: decoded.uid,
      email: decoded.email || null,
      fullName: decoded.name || null,
      phone: decoded.phone_number || null,
      isGuest: false,
      consentGiven: true,
    });

    if (!profile.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated by an administrator.' });
    }

    req.authContext = {
      uid: profile.uid,
      email: profile.email,
      roles: roles.length > 0 ? roles : ['citizen'],
      isGuest: false,
    };
    return next();
  } catch (error) {
    console.error('Authentication verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication credentials.' });
  }
};

export const requireRole = (allowedRoles: Array<'admin' | 'content_editor' | 'support_agent'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const ctx = req.authContext;
    if (!ctx) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const hasAccess = ctx.roles.some((r) => allowedRoles.includes(r as any));
    if (!hasAccess) {
      return res.status(403).json({
        error: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role permissions.`,
      });
    }
    return next();
  };
};
