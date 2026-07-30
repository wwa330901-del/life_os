import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

export interface GoogleCalendarEventInput {
  title: string;
  location?: string | null;
  notes?: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
}

export interface GoogleCalendarEventRemote {
  id: string;
  status: string; // 'confirmed' | 'cancelled' | ...
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
/** Refresh 1 minute before actual expiry to avoid racing a request that's
 * about to fire with a token that expires mid-flight. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Wraps Google Calendar API v3 (raw REST via fetch, no `googleapis` SDK
 * dependency — same lean-dependency approach as the LINE integration) plus
 * the OAuth token lifecycle for a `GoogleCalendarConnection`: exchanging an
 * incremental-consent authorization code for a refresh token, and
 * transparently refreshing the cached access token when it's expired.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly oauthClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  constructor(private readonly prisma: PrismaService) {}

  /** Exchanges a code obtained with `access_type=offline&prompt=consent`
   * and the calendar scope for a refresh token, and persists (or replaces)
   * this space's `GoogleCalendarConnection`. */
  async connect(spaceId: string, connectedByUserId: string, code: string, redirectUri: string) {
    const { tokens } = await this.oauthClient.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.refresh_token) {
      throw new UnauthorizedException(
        'Google 沒有回傳 refresh token，請確認授權時有帶上 access_type=offline 與 prompt=consent。',
      );
    }
    return this.prisma.googleCalendarConnection.upsert({
      where: { spaceId },
      create: {
        spaceId,
        connectedByUserId,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        connectedByUserId,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        syncToken: null, // reconnecting invalidates any prior incremental cursor
      },
    });
  }

  async disconnect(spaceId: string) {
    await this.prisma.googleCalendarConnection.deleteMany({ where: { spaceId } });
  }

  /** Returns a valid access token for this connection, refreshing (and
   * persisting) it first if it's expired or about to be. */
  private async getAccessToken(connection: { id: string; refreshToken: string; accessToken: string | null; accessTokenExpiresAt: Date | null }): Promise<string> {
    const stillValid =
      connection.accessToken &&
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now();
    if (stillValid) return connection.accessToken!;

    this.oauthClient.setCredentials({ refresh_token: connection.refreshToken });
    const { credentials } = await this.oauthClient.refreshAccessToken();
    if (!credentials.access_token) {
      throw new UnauthorizedException('無法刷新 Google 存取權杖，可能需要重新連結行事曆。');
    }
    await this.prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: credentials.access_token,
        accessTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      },
    });
    return credentials.access_token;
  }

  /** Lists changes since `syncToken` (or a full listing if null — pass
   * `null` to force a full resync). Returns the events page plus Google's
   * next sync token to store for the following incremental call. Handles
   * pagination internally. */
  async listChanges(
    connection: { id: string; refreshToken: string; accessToken: string | null; accessTokenExpiresAt: Date | null },
    syncToken: string | null,
  ): Promise<{ events: GoogleCalendarEventRemote[]; nextSyncToken: string | null }> {
    const accessToken = await this.getAccessToken(connection);
    const events: GoogleCalendarEventRemote[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;

    do {
      const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' });
      if (syncToken) params.set('syncToken', syncToken);
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 410) {
        // syncToken expired/invalid on Google's side — restart as a full
        // resync so the caller still gets a complete, valid result.
        if (syncToken) return this.listChanges(connection, null);
        return { events: [], nextSyncToken: null };
      }
      if (!res.ok) {
        throw new Error(`Google Calendar list 失敗：${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as {
        items: GoogleCalendarEventRemote[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };
      events.push(...body.items);
      pageToken = body.nextPageToken;
      if (body.nextSyncToken) nextSyncToken = body.nextSyncToken;
    } while (pageToken);

    return { events, nextSyncToken };
  }

  async insertEvent(
    connection: { id: string; refreshToken: string; accessToken: string | null; accessTokenExpiresAt: Date | null },
    input: GoogleCalendarEventInput,
  ): Promise<string> {
    const accessToken = await this.getAccessToken(connection);
    const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGoogleBody(input)),
    });
    if (!res.ok) throw new Error(`Google Calendar insert 失敗：${res.status} ${await res.text()}`);
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  async updateEvent(
    connection: { id: string; refreshToken: string; accessToken: string | null; accessTokenExpiresAt: Date | null },
    googleEventId: string,
    input: GoogleCalendarEventInput,
  ): Promise<void> {
    const accessToken = await this.getAccessToken(connection);
    const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${googleEventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGoogleBody(input)),
    });
    if (res.status === 404 || res.status === 410) return; // deleted on Google's side already
    if (!res.ok) throw new Error(`Google Calendar update 失敗：${res.status} ${await res.text()}`);
  }

  async deleteEvent(
    connection: { id: string; refreshToken: string; accessToken: string | null; accessTokenExpiresAt: Date | null },
    googleEventId: string,
  ): Promise<void> {
    const accessToken = await this.getAccessToken(connection);
    const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${googleEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      this.logger.warn(`Google Calendar delete 失敗（忽略，視為已刪除）：${res.status} ${await res.text()}`);
    }
  }

  private toGoogleBody(input: GoogleCalendarEventInput) {
    return {
      summary: input.title,
      location: input.location ?? undefined,
      description: input.notes ?? undefined,
      start: input.allDay
        ? { date: toDateOnly(input.startAt) }
        : { dateTime: input.startAt.toISOString() },
      end: input.allDay
        ? { date: toDateOnly(input.endAt ?? input.startAt) }
        : { dateTime: (input.endAt ?? input.startAt).toISOString() },
    };
  }
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
