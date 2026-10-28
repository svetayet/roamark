import type { TrackMetaInput } from './types';
import {
  PREVIEW_MAX_POINTS,
  RepositoryError,
  type District,
  type Track,
  type TrackRepository,
} from './repository';
import { parseGpxSegments } from '../logic/gpx';
import { segmentsBounds, segmentsDistanceKm } from '../logic/geo';
import { buildPreview } from './preview';

/**
 * Реализация TrackRepository в памяти: демо-режим и тесты.
 * После «входа» (sendMagicLink) автоматически создаётся район «Рядом»,
 * как ensureDefaultDistrict в Supabase-реализации.
 */
export class InMemoryTrackRepository implements TrackRepository {
  private email: string | null;
  private authListeners = new Set<() => void>();
  private districts = new Map<string, District>();
  private tracks = new Map<string, Track & { gpxText: string }>();

  constructor(opts?: { demo?: boolean }) {
    this.email = opts?.demo ? 'demo@roamark.local' : null;
    if (opts?.demo) this.ensureBootstrap();
  }

  async getSession() {
    return this.email ? { email: this.email } : null;
  }

  async sendMagicLink(email: string): Promise<void> {
    this.email = email;
    this.ensureBootstrap();
    this.authListeners.forEach((cb) => cb());
  }

  async signOut(): Promise<void> {
    this.email = null;
    this.authListeners.forEach((cb) => cb());
  }

  onAuth(cb: () => void): () => void {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  async listDistricts(): Promise<District[]> {
    this.requireSession();
    return [...this.districts.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async createDistrict(name: string): Promise<District> {
    this.requireSession();
    const district: District = {
      id: crypto.randomUUID(),
      name: name.trim(),
      isPrimary: this.districts.size === 0,
    };
    this.districts.set(district.id, district);
    return district;
  }

  async renameDistrict(id: string, name: string): Promise<void> {
    this.requireSession();
    const district = this.getDistrict(id);
    this.districts.set(id, { ...district, name: name.trim() });
  }

  async setPrimaryDistrict(id: string): Promise<void> {
    this.requireSession();
    this.getDistrict(id);
    for (const [key, d] of this.districts) {
      this.districts.set(key, { ...d, isPrimary: key === id });
    }
  }

  async deleteDistrict(id: string): Promise<void> {
    this.requireSession();
    this.getDistrict(id);
    const hasTracks = [...this.tracks.values()].some((t) => t.districtId === id);
    if (hasTracks) {
      throw new RepositoryError(
        'В районе есть треки — сначала перенесите их в другой район.',
      );
    }
    this.districts.delete(id);
  }

  async listTracks(districtId: string): Promise<Track[]> {
    this.requireSession();
    return [...this.tracks.values()]
      .filter((t) => t.districtId === districtId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTrack(id: string): Promise<Track> {
    this.requireSession();
    return this.getTrackInternal(id);
  }

  async addTrack(file: File, meta: TrackMetaInput): Promise<Track> {
    this.requireSession();
    this.getDistrict(meta.districtId);
    const gpxText = await file.text();
    const segments = parseGpxSegments(gpxText);
    const id = crypto.randomUUID();
    const entry: Track & { gpxText: string } = {
      id,
      districtId: meta.districtId,
      category: meta.category,
      name: meta.name.trim(),
      description: meta.description?.trim() || null,
      distanceKm: segmentsDistanceKm(segments),
      originalFilename: file.name,
      storagePath: `${id}.gpx`,
      bounds: segmentsBounds(segments),
      previewSegments: buildPreview(segments, PREVIEW_MAX_POINTS),
      createdAt: new Date().toISOString(),
      gpxText,
    };
    this.tracks.set(id, entry);
    return entry;
  }

  async updateTrackMeta(id: string, meta: TrackMetaInput): Promise<void> {
    this.requireSession();
    this.getDistrict(meta.districtId);
    const track = this.getTrackInternal(id);
    this.tracks.set(id, {
      ...track,
      districtId: meta.districtId,
      category: meta.category,
      name: meta.name.trim(),
      description: meta.description?.trim() || null,
    });
  }

  async deleteTrack(id: string): Promise<void> {
    this.requireSession();
    if (!this.tracks.delete(id)) {
      throw new RepositoryError('Трек не найден.');
    }
  }

  async getGpxText(id: string): Promise<string> {
    this.requireSession();
    return this.getTrackInternal(id).gpxText;
  }

  async getDownloadUrl(id: string): Promise<string> {
    this.requireSession();
    const text = this.getTrackInternal(id).gpxText;
    return `data:application/gpx+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }

  private ensureBootstrap(): void {
    if (this.email && this.districts.size === 0) {
      const id = crypto.randomUUID();
      this.districts.set(id, { id, name: 'Рядом', isPrimary: true });
    }
  }

  private requireSession(): void {
    if (!this.email) throw new RepositoryError('Нужно войти в приложение.');
  }

  private getDistrict(id: string): District {
    const district = this.districts.get(id);
    if (!district) throw new RepositoryError('Район не найден.');
    return district;
  }

  private getTrackInternal(id: string): Track & { gpxText: string } {
    const track = this.tracks.get(id);
    if (!track) throw new RepositoryError('Трек не найден.');
    return track;
  }
}
