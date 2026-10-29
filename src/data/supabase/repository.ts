import type { Category, TrackMetaInput } from '../types';
import {
  PREVIEW_MAX_POINTS,
  RepositoryError,
  type District,
  type Track,
  type TrackRepository,
} from '../repository';
import { parseGpxSegments } from '../../logic/gpx';
import { segmentsBounds, segmentsDistanceKm } from '../../logic/geo';
import { buildPreview, decodePreview, encodePreview } from '../preview';
import { getSupabaseClient } from './client';

/**
 * Supabase-реализация TrackRepository — единственное место работы с @supabase/supabase-js.
 * Схема (Task 10): districts(id, user_id, name, is_primary),
 * tracks(id, user_id, district_id, category, name, description, distance_km,
 * original_filename, storage_path, min_lat, min_lon, max_lat, max_lon, preview,
 * created_at), приватный bucket «gpx».
 */

type Rows = Record<string, unknown>;
interface DbError {
  message: string;
  code?: string;
}
interface Builder extends PromiseLike<{ data: unknown; error: DbError | null }> {
  select(): Builder;
  order(col: string, opts?: unknown): Builder;
  eq(col: string, val: unknown): Builder;
  insert(row: Rows): Builder;
  update(patch: Rows): Builder;
  delete(): Builder;
  single(): PromiseLike<{ data: Rows | null; error: DbError | null }>;
}

/** Минимальная структурная маска клиента: реальный supabase-js ей удовлетворяет. */
export interface SupabaseLike {
  auth: {
    signInWithOtp(args: {
      email: string;
      options?: { emailRedirectTo?: string };
    }): PromiseLike<{ error: DbError | null }>;
    getSession(): PromiseLike<{
      data: { session: { user: { id: string; email: string } } | null } | null;
      error: DbError | null;
    }>;
    onAuthStateChange(cb: (event: string) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
    signOut(): PromiseLike<{ error: DbError | null }>;
  };
  from(table: string): Builder;
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        blob: Blob,
        options?: { upsert?: boolean },
      ): PromiseLike<{ error: DbError | null }>;
      createSignedUrl(
        path: string,
        seconds: number,
        options?: { download?: string },
      ): PromiseLike<{ data: { signedUrl: string } | null; error: DbError | null }>;
      download(path: string): PromiseLike<{ data: Blob | null; error: DbError | null }>;
      remove(paths: string[]): PromiseLike<{ error: DbError | null }>;
    };
  };
}

export function createSupabaseRepository(
  client: SupabaseLike = getSupabaseClient() as unknown as SupabaseLike,
): TrackRepository {
  return new SupabaseTrackRepository(client);
}

class SupabaseTrackRepository implements TrackRepository {
  constructor(private client: SupabaseLike) {}

  async getSession(): Promise<{ email: string } | null> {
    const { data } = await this.client.auth.getSession();
    const email = data?.session?.user?.email;
    return email ? { email } : null;
  }

  async sendMagicLink(email: string): Promise<void> {
    // Ссылка из письма должна возвращать в приложение, а не на supabase.co.
    // BASE_URL — подпуть приложения ('/roamark/' на GitHub Pages, '/' локально),
    // без него ссылка ведёт на пустой корень домена.
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    throwIf(error);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    throwIf(error);
  }

  onAuth(cb: () => void): () => void {
    const { data } = this.client.auth.onAuthStateChange(() => cb());
    return () => data.subscription.unsubscribe();
  }

  async listDistricts(): Promise<District[]> {
    await this.requireSession();
    const { data, error } = await this.client.from('districts').select().order('name');
    throwIf(error);
    let rows = (data as Rows[]) ?? [];
    if (rows.length === 0) {
      const created = await this.insertDefaultDistrict();
      rows = [created];
    }
    return rows.map(mapDistrict);
  }

  async createDistrict(name: string): Promise<District> {
    const { user } = await this.requireSession();
    const { data, error } = await this.client
      .from('districts')
      .insert({ user_id: user.id, name: name.trim(), is_primary: false })
      .select()
      .single();
    throwIf(error);
    if (!data) throw new RepositoryError('Не получилось создать район.');
    return mapDistrict(data);
  }

  async renameDistrict(id: string, name: string): Promise<void> {
    await this.requireSession();
    const { error } = await this.client.from('districts').update({ name: name.trim() }).eq('id', id);
    throwIf(error);
  }

  async setPrimaryDistrict(id: string): Promise<void> {
    await this.requireSession();
    // Ровно один основной гарантирует триггер в БД (Task 10).
    const { error } = await this.client.from('districts').update({ is_primary: true }).eq('id', id);
    throwIf(error);
  }

  async deleteDistrict(id: string): Promise<void> {
    await this.requireSession();
    const { error } = await this.client.from('districts').delete().eq('id', id);
    throwIf(error);
  }

  async listTracks(districtId: string): Promise<Track[]> {
    await this.requireSession();
    const { data, error } = await this.client
      .from('tracks')
      .select()
      .eq('district_id', districtId)
      .order('created_at', { ascending: false });
    throwIf(error);
    return ((data as Rows[]) ?? []).map(mapTrack);
  }

  async getTrack(id: string): Promise<Track> {
    await this.requireSession();
    const row = await this.trackRow(id);
    return mapTrack(row);
  }

  async addTrack(file: File, meta: TrackMetaInput): Promise<Track> {
    const { user } = await this.requireSession();
    const gpxText = await file.text();
    const segments = parseGpxSegments(gpxText);
    const id = crypto.randomUUID();
    const storagePath = `${id}.gpx`;
    const bounds = segmentsBounds(segments);

    // Обрывы на медленном интернете лечатся повторами; upsert делает повтор
    // идемпотентным (перезапишет файл, а не упрётся в «уже существует»).
    const upErr = await uploadWithRetry(() =>
      this.client.storage
        .from('gpx')
        .upload(storagePath, new Blob([gpxText], { type: 'application/gpx+xml' }), {
          upsert: true,
        }),
    );
    if (upErr) {
      // Причину (обрыв сети, политика бакета) показываем рядом с человеческой фразой.
      throw new RepositoryError(`Не получилось загрузить GPX-файл. Причина: ${upErr.message}`);
    }

    const { data, error } = await this.client
      .from('tracks')
      .insert({
        id,
        user_id: user.id,
        district_id: meta.districtId,
        category: meta.category,
        name: meta.name.trim(),
        description: meta.description?.trim() || null,
        distance_km: segmentsDistanceKm(segments),
        original_filename: file.name,
        storage_path: storagePath,
        min_lat: bounds?.minLat ?? null,
        min_lon: bounds?.minLon ?? null,
        max_lat: bounds?.maxLat ?? null,
        max_lon: bounds?.maxLon ?? null,
        preview: encodePreview(buildPreview(segments, PREVIEW_MAX_POINTS)),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !data) {
      // Не оставляем сироту в хранилище.
      await this.client.storage.from('gpx').remove([storagePath]);
      throw dbError(error);
    }
    return mapTrack(data);
  }

  async updateTrackMeta(id: string, meta: TrackMetaInput): Promise<void> {
    await this.requireSession();
    const { error } = await this.client
      .from('tracks')
      .update({
        district_id: meta.districtId,
        category: meta.category,
        name: meta.name.trim(),
        description: meta.description?.trim() || null,
      })
      .eq('id', id);
    throwIf(error);
  }

  async deleteTrack(id: string): Promise<void> {
    await this.requireSession();
    const row = await this.trackRow(id);
    const rm = await this.client.storage.from('gpx').remove([String(row.storage_path)]);
    throwIf(rm.error);
    const { error } = await this.client.from('tracks').delete().eq('id', id);
    throwIf(error);
  }

  async getGpxText(id: string): Promise<string> {
    await this.requireSession();
    const row = await this.trackRow(id);
    const { data, error } = await this.client.storage.from('gpx').download(String(row.storage_path));
    if (error || !data) throw new RepositoryError('GPX-файл не найден.');
    return data.text();
  }

  async getDownloadUrl(id: string): Promise<string> {
    await this.requireSession();
    const row = await this.trackRow(id);
    // download: файл сохраняется под оригинальным именем — атрибут ссылки
    // на кросс-доменный URL браузеры игнорируют.
    const { data, error } = await this.client.storage
      .from('gpx')
      .createSignedUrl(String(row.storage_path), 3600, {
        download: String(row.original_filename),
      });
    throwIf(error);
    if (!data) throw new RepositoryError('Не получилось получить ссылку на файл.');
    return data.signedUrl;
  }

  private async requireSession(): Promise<{ user: { id: string; email: string } }> {
    const { data, error } = await this.client.auth.getSession();
    throwIf(error);
    if (!data?.session?.user) throw new RepositoryError('Нужно войти в приложение.');
    return { user: data.session.user };
  }

  private async insertDefaultDistrict(): Promise<Rows> {
    const { user } = await this.requireSession();
    const { data, error } = await this.client
      .from('districts')
      .insert({ user_id: user.id, name: 'Рядом', is_primary: true })
      .select()
      .single();
    throwIf(error);
    if (!data) throw new RepositoryError('Не получилось создать район «Рядом».');
    return data;
  }

  private async trackRow(id: string): Promise<Rows> {
    const { data, error } = await this.client.from('tracks').select().eq('id', id).single();
    if (error || !data) throw new RepositoryError('Трек не найден.');
    return data;
  }
}

function mapDistrict(row: Rows): District {
  return {
    id: String(row.id),
    name: String(row.name),
    isPrimary: Boolean(row.is_primary),
  };
}

function mapTrack(row: Rows): Track {
  const bounds =
    row.min_lat != null && row.min_lon != null && row.max_lat != null && row.max_lon != null
      ? {
          minLat: Number(row.min_lat),
          minLon: Number(row.min_lon),
          maxLat: Number(row.max_lat),
          maxLon: Number(row.max_lon),
        }
      : null;
  return {
    id: String(row.id),
    districtId: String(row.district_id),
    category: row.category as Category,
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    distanceKm: Number(row.distance_km),
    originalFilename: String(row.original_filename),
    storagePath: String(row.storage_path),
    bounds,
    previewSegments: decodePreview(row.preview as string | null),
    createdAt: String(row.created_at ?? ''),
  };
}

function dbError(e: DbError | null): RepositoryError {
  if (e?.code === '23503') {
    return new RepositoryError('В районе есть треки — сначала перенесите их в другой район.');
  }
  // supabase-js оборачивает обрыв сети в «TypeError: Failed to fetch» — сырой
  // английский текст в подсказке ни о чём не говорит.
  if (e?.message?.startsWith('TypeError:')) {
    return new RepositoryError('Связь с сервером оборвалась. Проверьте интернет и попробуйте ещё раз.');
  }
  return new RepositoryError(e?.message || 'Ошибка хранилища. Попробуйте ещё раз.');
}

const UPLOAD_ATTEMPTS = 3;
const UPLOAD_RETRY_DELAY_MS = 1500;

/**
 * Повтор загрузки файла при обрывах сети («Failed to fetch» и похожее).
 * Систематические ошибки (политика бакета, нет бакета) повторами не лечатся —
 * возвращаются сразу.
 */
export async function uploadWithRetry(
  upload: () => PromiseLike<{ error: DbError | null }>,
  attempts: number = UPLOAD_ATTEMPTS,
  delayMs: number = UPLOAD_RETRY_DELAY_MS,
): Promise<DbError | null> {
  for (let attempt = 1; ; attempt++) {
    const { error } = await upload();
    if (!error) return null;
    const transient = /fetch|network/i.test(error.message);
    if (!transient || attempt >= attempts) return error;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function throwIf(e: DbError | null): void {
  if (e) throw dbError(e);
}
