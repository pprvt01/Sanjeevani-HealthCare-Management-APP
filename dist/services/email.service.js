"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = require("../config");
class EmailService {
    static transporter = nodemailer_1.default.createTransport({
        host: config_1.CONFIG.SMTP_HOST,
        port: config_1.CONFIG.SMTP_PORT,
        secure: config_1.CONFIG.SMTP_PORT === 465,
        auth: config_1.CONFIG.SMTP_USER ? {
            user: config_1.CONFIG.SMTP_USER,
            pass: config_1.CONFIG.SMTP_PASS,
        } : undefined,
    });
    static async sendEmail(to, subject, text, html) {
        console.log(`[EMAIL DISPATCH] To: ${to} | Subject: "${subject}"`);
        if (config_1.CONFIG.EMAIL_DRIVER === 'console' || !config_1.CONFIG.SMTP_USER) {
            console.log(`[EMAIL BODY (Console Driver)]\n${text}\n----------------------------------`);
            return true;
        }
        try {
            await this.transporter.sendMail({
                from: '"Healthcare Clinic" <no-reply@healthcareclinic.com>',
                to,
                subject,
                text,
                html: html || text.replace(/\n/g, '<br>'),
            });
            return true;
        }
        catch (error) {
            console.error(`Failed to send email to ${to}:`, error);
            throw error; // Let queue handler handle retry with backoff
        }
    }
}
exports.EmailService = EmailService;
