import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../models/prisma';
import { CONFIG } from '../config';
import { AuthRequest } from '../middleware/auth';
import { GCalService } from '../services/gcal.service';

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const userRole = role === 'ADMIN' ? 'ADMIN' : 'PATIENT';
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: userRole,
        },
      });

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        CONFIG.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: { doctorProfile: true },
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        CONFIG.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          doctorId: user.doctorProfile?.id || null,
        },
      });
    } catch (error: any) {
      console.error('Login error:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  static async me(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          doctorProfile: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({ user });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  static async getGoogleAuthUrl(req: Request, res: Response) {
    try {
      const host = req.headers.host || '127.0.0.1:5000';
      const redirectUri = `http://${host}/api/auth/google/callback`;
      const url = GCalService.getAuthUrl(redirectUri);

      if (req.query.redirect === 'true') {
        return res.redirect(url);
      }
      return res.json({ url });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to generate Google auth URL' });
    }
  }

  static async handleGoogleCallback(req: Request, res: Response) {
    try {
      const code = req.query.code as string;
      const host = req.headers.host || '127.0.0.1:5000';
      const redirectUri = `http://${host}/api/auth/google/callback`;

      if (code) {
        await GCalService.setCredentialsFromCode(code, redirectUri);
      }
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Calendar Authorization</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #fff; text-align: center; padding: 4rem 2rem; }
            .card { background: #121a2c; border: 1px solid rgba(255,255,255,0.1); padding: 2.5rem; border-radius: 16px; max-width: 480px; margin: 0 auto; }
            h2 { color: #34d399; margin-bottom: 0.5rem; }
            p { color: #9ca3af; font-size: 0.95rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Google Calendar Authorized!</h2>
            <p>Sanjeevani is now connected to Google Calendar API.</p>
            <p style="font-size: 0.8rem; margin-top: 1.5rem; color: #6b7280;">This window will close automatically in 3 seconds...</p>
          </div>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Google OAuth callback error:', error);
      return res.status(500).send(`Google Calendar Auth Failed: ${error.message}`);
    }
  }
}
