import nodemailer from 'nodemailer';
import { CONFIG } from '../config';

export class EmailService {
  private static getTransporter() {
    const isGmail = CONFIG.SMTP_USER && CONFIG.SMTP_USER.includes('@gmail.com');
    const host = isGmail ? 'smtp.gmail.com' : CONFIG.SMTP_HOST;
    const port = isGmail ? 587 : CONFIG.SMTP_PORT;

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: CONFIG.SMTP_USER ? {
        user: CONFIG.SMTP_USER,
        pass: CONFIG.SMTP_PASS,
      } : undefined,
    });
  }

  static async sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    console.log(`[EMAIL DISPATCH] To: ${to} | Subject: "${subject}"`);

    // Force SMTP if real user credentials provided
    const isConfiguredSmtp = CONFIG.SMTP_USER && CONFIG.SMTP_PASS && !CONFIG.SMTP_USER.startsWith('mock');
    
    if (CONFIG.EMAIL_DRIVER === 'console' && !isConfiguredSmtp) {
      console.log(`[EMAIL BODY (Console Driver)]\n${text}\n----------------------------------`);
      return true;
    }

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: CONFIG.SMTP_USER ? `"Sanjeevani" <${CONFIG.SMTP_USER}>` : '"Sanjeevani" <no-reply@sanjeevani.com>',
        to,
        subject,
        text,
        html: html || text.replace(/\n/g, '<br>'),
      });
      console.log(`Email successfully sent via SMTP to ${to}`);
      return true;
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);
      throw error; // Let queue handler handle retry with backoff
    }
  }
}
