import { google } from 'googleapis';
import { CONFIG } from '../config';

export class GCalService {
  private static isAuthorized = false;

  private static createOAuthClient(redirectUri?: string) {
    return new google.auth.OAuth2(
      CONFIG.GOOGLE_CLIENT_ID,
      CONFIG.GOOGLE_CLIENT_SECRET,
      redirectUri || CONFIG.GOOGLE_REDIRECT_URI
    );
  }

  private static sharedClient = new google.auth.OAuth2(
    CONFIG.GOOGLE_CLIENT_ID,
    CONFIG.GOOGLE_CLIENT_SECRET,
    CONFIG.GOOGLE_REDIRECT_URI
  );

  static getAuthUrl(redirectUri?: string): string {
    const client = this.createOAuthClient(redirectUri);
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
    });
  }

  static async setCredentialsFromCode(code: string, redirectUri?: string) {
    const client = this.createOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    this.sharedClient.setCredentials(tokens);
    this.isAuthorized = true;
    console.log('Google Calendar OAuth 2.0 Access Token successfully acquired!');
    return tokens;
  }

  static async createAppointmentEvent(details: {
    patientEmail: string;
    doctorEmail: string;
    doctorName: string;
    date: string;       // YYYY-MM-DD
    timeSlot: string;   // HH:mm
    slotDurationMinutes: number;
    symptoms: string;
  }): Promise<string> {
    const isMock = !CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.startsWith('mock');
    const mockEventId = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    console.log(`[GOOGLE CALENDAR] Creating event for ${details.doctorName} on ${details.date} at ${details.timeSlot}`);

    if (isMock || !this.isAuthorized) {
      console.log(`[GOOGLE CALENDAR (Mock/Pending Auth)] Created Event ID: ${mockEventId}`);
      return mockEventId;
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth: this.sharedClient });
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
    } catch (error) {
      console.error('Google Calendar event creation failed:', error);
      return mockEventId;
    }
  }

  static async deleteAppointmentEvent(eventId: string): Promise<boolean> {
    console.log(`[GOOGLE CALENDAR] Deleting event ID: ${eventId}`);
    const isMock = !CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.startsWith('mock');

    if (isMock || !eventId || !this.isAuthorized) {
      return true;
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth: this.sharedClient });
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });
      return true;
    } catch (error) {
      console.error(`Google Calendar deletion failed for event ${eventId}:`, error);
      return false;
    }
  }
}
