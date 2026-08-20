"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GCalService = void 0;
const googleapis_1 = require("googleapis");
const config_1 = require("../config");
class GCalService {
    static isAuthorized = false;
    static createOAuthClient(redirectUri) {
        return new googleapis_1.google.auth.OAuth2(config_1.CONFIG.GOOGLE_CLIENT_ID, config_1.CONFIG.GOOGLE_CLIENT_SECRET, redirectUri || config_1.CONFIG.GOOGLE_REDIRECT_URI);
    }
    static sharedClient = new googleapis_1.google.auth.OAuth2(config_1.CONFIG.GOOGLE_CLIENT_ID, config_1.CONFIG.GOOGLE_CLIENT_SECRET, config_1.CONFIG.GOOGLE_REDIRECT_URI);
    static getAuthUrl(redirectUri) {
        const client = this.createOAuthClient(redirectUri);
        return client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: ['https://www.googleapis.com/auth/calendar.events'],
        });
    }
    static async setCredentialsFromCode(code, redirectUri) {
        const client = this.createOAuthClient(redirectUri);
        const { tokens } = await client.getToken(code);
        this.sharedClient.setCredentials(tokens);
        this.isAuthorized = true;
        console.log('Google Calendar OAuth 2.0 Access Token successfully acquired!');
        return tokens;
    }
    static async createAppointmentEvent(details) {
        const isMock = !config_1.CONFIG.GOOGLE_CLIENT_ID || config_1.CONFIG.GOOGLE_CLIENT_ID.startsWith('mock');
        const mockEventId = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        console.log(`[GOOGLE CALENDAR] Creating event for ${details.doctorName} on ${details.date} at ${details.timeSlot}`);
        if (isMock || !this.isAuthorized) {
            console.log(`[GOOGLE CALENDAR (Mock/Pending Auth)] Created Event ID: ${mockEventId}`);
            return mockEventId;
        }
        try {
            const calendar = googleapis_1.google.calendar({ version: 'v3', auth: this.sharedClient });
            const startDateTime = new Date(`${details.date}T${details.timeSlot}:00`);
            const endDateTime = new Date(startDateTime.getTime() + details.slotDurationMinutes * 60000);
            const event = {
                summary: `Medical Appointment with ${details.doctorName}`,
                description: `Patient Symptoms: ${details.symptoms}`,
                start: { dateTime: startDateTime.toISOString() },
                end: { dateTime: endDateTime.toISOString() },
                attendees: [
                    { email: details.patientEmail },
                    { email: details.doctorEmail },
                ],
            };
            const response = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: event,
            });
            return response.data.id || mockEventId;
        }
        catch (error) {
            console.error('Google Calendar event creation failed:', error);
            return mockEventId;
        }
    }
    static async deleteAppointmentEvent(eventId) {
        console.log(`[GOOGLE CALENDAR] Deleting event ID: ${eventId}`);
        const isMock = !config_1.CONFIG.GOOGLE_CLIENT_ID || config_1.CONFIG.GOOGLE_CLIENT_ID.startsWith('mock');
        if (isMock || !eventId || !this.isAuthorized) {
            return true;
        }
        try {
            const calendar = googleapis_1.google.calendar({ version: 'v3', auth: this.sharedClient });
            await calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId,
            });
            return true;
        }
        catch (error) {
            console.error(`Google Calendar deletion failed for event ${eventId}:`, error);
            return false;
        }
    }
}
exports.GCalService = GCalService;
