"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = require("../config");
class EmailService {
    static getTransporter() {
        const isGmail = config_1.CONFIG.SMTP_USER && config_1.CONFIG.SMTP_USER.includes('@gmail.com');
        const host = isGmail ? 'smtp.gmail.com' : config_1.CONFIG.SMTP_HOST;
        const port = isGmail ? 587 : config_1.CONFIG.SMTP_PORT;
        return nodemailer_1.default.createTransport({
            host,
            port,
            secure: port === 465,
            auth: config_1.CONFIG.SMTP_USER ? {
                user: config_1.CONFIG.SMTP_USER,
                pass: config_1.CONFIG.SMTP_PASS,
            } : undefined,
        });
    }
    static async sendEmail(to, subject, text, html) {
        console.log(`[EMAIL DISPATCH] To: ${to} | Subject: "${subject}"`);
        // Force SMTP if real user credentials provided
        const isConfiguredSmtp = config_1.CONFIG.SMTP_USER && config_1.CONFIG.SMTP_PASS && !config_1.CONFIG.SMTP_USER.startsWith('mock');
        if (config_1.CONFIG.EMAIL_DRIVER === 'console' && !isConfiguredSmtp) {
            console.log(`[EMAIL BODY (Console Driver)]\n${text}\n----------------------------------`);
            return true;
        }
        try {
            const transporter = this.getTransporter();
            await transporter.sendMail({
                from: config_1.CONFIG.SMTP_USER ? `"Sanjeevani" <${config_1.CONFIG.SMTP_USER}>` : '"Sanjeevani" <no-reply@sanjeevani.com>',
                to,
                subject,
                text,
                html: html || text.replace(/\n/g, '<br>'),
            });
            console.log(`Email successfully sent via SMTP to ${to}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to send email to ${to}:`, error);
            throw error; // Let queue handler handle retry with backoff
        }
    }
}
exports.EmailService = EmailService;
