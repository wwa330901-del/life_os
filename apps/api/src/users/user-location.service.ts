import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;
/** 同一個 IP 多久重新查一次。 */
const IP_REFRESH_MS = 6 * HOUR_MS;
/** LINE 傳的精確位置，這段時間內不被 IP 估的蓋掉。 */
const LINE_LOCATION_WINS_MS = 3 * 24 * HOUR_MS;

export interface UserLocation {
  lat: number;
  lon: number;
  name: string;
  source: 'ip' | 'line';
  updatedAt: Date;
}

/** 從 X-Forwarded-For（Render 在前面有 proxy）取出使用者的公網 IP。 */
export function clientIp(forwardedFor: string | string[] | undefined, remote: string | undefined): string | null {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = (header?.split(',')[0] ?? remote ?? '').trim().replace(/^::ffff:/, '');
  if (!ip || isPrivateIp(ip)) return null;
  return ip;
}

export function isPrivateIp(ip: string): boolean {
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd]/i.test(ip) ||
    /^fe80/i.test(ip)
  );
}

/** 使用者目前位置（2026-10-02）：問天氣、找附近的東西沒講地點時用。 */
@Injectable()
export class UserLocationService {
  private readonly logger = new Logger(UserLocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserLocation | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locationLat: true, locationLon: true, locationName: true, locationSource: true, locationUpdatedAt: true },
    });
    if (u?.locationLat == null || u.locationLon == null || !u.locationUpdatedAt) return null;
    return {
      lat: u.locationLat,
      lon: u.locationLon,
      name: u.locationName ?? '',
      source: u.locationSource === 'line' ? 'line' : 'ip',
      updatedAt: u.locationUpdatedAt,
    };
  }

  /** App 開啟時呼叫：用連線 IP 估城市。查不到或不需要更新就什麼都不做。 */
  async updateFromIp(userId: string, ip: string | null, now = new Date()): Promise<UserLocation | null> {
    if (!ip) return this.get(userId);
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locationIp: true, locationSource: true, locationUpdatedAt: true },
    });
    const age = u?.locationUpdatedAt ? now.getTime() - u.locationUpdatedAt.getTime() : Infinity;
    if (u?.locationSource === 'line' && age < LINE_LOCATION_WINS_MS) return this.get(userId);
    if (u?.locationIp === ip && age < IP_REFRESH_MS) return this.get(userId);

    const geo = await lookupIp(ip).catch((error) => {
      this.logger.warn(`IP 定位失敗：${String(error)}`);
      return null;
    });
    if (!geo) return this.get(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        locationLat: geo.lat,
        locationLon: geo.lon,
        locationName: geo.name,
        locationSource: 'ip',
        locationIp: ip,
        locationUpdatedAt: now,
      },
    });
    return this.get(userId);
  }

  /** LINE 傳「位置資訊」：精確位置。 */
  async updateFromLine(userId: string, lat: number, lon: number, name: string, now = new Date()) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { locationLat: lat, locationLon: lon, locationName: name, locationSource: 'line', locationUpdatedAt: now },
    });
  }
}

async function lookupIp(ip: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=zh-CN&fields=success,city,region,latitude,longitude`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { success?: boolean; city?: string; region?: string; latitude?: number; longitude?: number };
  if (!body.success || typeof body.latitude !== 'number' || typeof body.longitude !== 'number') return null;
  const name = [body.region, body.city].filter((p, i, all) => p && !(i === 1 && all[0]?.startsWith(p))).join('') || '目前位置';
  return { lat: body.latitude, lon: body.longitude, name };
}
