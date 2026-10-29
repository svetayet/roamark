import { createSupabaseRepository } from './repository';
import { RepositoryError } from '../repository';
import { encodePreview, decodePreview } from '../preview';

/* ---------- Фейковый supabase-клиент: Map-таблицы, Map-хранилище ---------- */

type Row = Record<string, unknown>;

class FakeQuery {
  eqCol: string | null = null;
  eqVal: unknown = null;
  orderCol: string | null = null;
  wantSingle = false;
  wantSelect = false;

  constructor(
    private fake: FakeSupabase,
    private table: string,
    private command: 'select' | 'insert' | 'update' | 'delete',
    private payload?: Row,
  ) {}

  select() {
    this.wantSelect = true;
    return this;
  }
  order(col: string) {
    this.orderCol = col;
    return this;
  }
  eq(col: string, val: unknown) {
    this.eqCol = col;
    this.eqVal = val;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  insert(row: Row) {
    this.command = 'insert';
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.command = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.command = 'delete';
    return this;
  }
  then(onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) {
    return this.exec().then(onFulfilled, onRejected);
  }

  private async exec() {
    const err = this.fake.takeError();
    if (err) return { data: null, error: err };
    const rows = this.fake.tables.get(this.table)!;
    if (this.command === 'select') {
      let out = [...rows];
      if (this.eqCol) out = out.filter((r) => r[this.eqCol!] === this.eqVal);
      if (this.orderCol) {
        out.sort((a, b) => String(a[this.orderCol!]).localeCompare(String(b[this.orderCol!])));
      }
      return { data: this.wantSingle ? (out[0] ?? null) : out, error: null };
    }
    if (this.command === 'insert') {
      const row = { ...(this.payload as Row) };
      if (!row.id) row.id = crypto.randomUUID();
      if (!row.created_at) row.created_at = new Date().toISOString();
      rows.push(row);
      return { data: this.wantSelect ? row : null, error: null };
    }
    if (this.command === 'update') {
      for (const r of rows) {
        if (!this.eqCol || r[this.eqCol] === this.eqVal) Object.assign(r, this.payload);
      }
      // Триггер БД: ровно один основной район (Task 10).
      if (this.table === 'districts' && this.payload?.is_primary === true) {
        for (const r of rows) {
          if (this.eqCol && r[this.eqCol] !== this.eqVal) r.is_primary = false;
        }
      }
      return { data: null, error: null };
    }
    const before = rows.length;
    this.fake.tables.set(
      this.table,
      rows.filter((r) => this.eqCol && r[this.eqCol] !== this.eqVal),
    );
    return { data: before - this.fake.tables.get(this.table)!.length, error: null };
  }
}

class FakeSupabase {
  tables = new Map<string, Row[]>([
    ['districts', []],
    ['tracks', []],
  ]);
  storageFiles = new Map<string, Blob>();
  otpCalls: { email: string }[] = [];
  signedUrlCalls: [string, number, { download?: string } | undefined][] = [];
  uploads: [string, Blob][] = [];
  removedFiles: string[] = [];
  failWith: { message: string; code?: string } | null = null;
  session: { user: { id: string; email: string } } | null = null;
  private authListeners = new Set<(event: string) => void>();

  private fire() {
    this.authListeners.forEach((cb) => cb('SIGNED_IN'));
  }
  takeError() {
    const e = this.failWith;
    this.failWith = null;
    return e;
  }

  auth = {
    signInWithOtp: async (args: { email: string; options?: { emailRedirectTo?: string } }) => {
      this.otpCalls.push(args);
      this.session = { user: { id: 'u1', email: args.email } };
      this.fire();
      return { data: null, error: null };
    },
    getSession: async () => ({ data: { session: this.session }, error: null }),
    onAuthStateChange: (cb: (event: string) => void) => {
      this.authListeners.add(cb);
      return {
        data: { subscription: { unsubscribe: () => this.authListeners.delete(cb) } },
      };
    },
    signOut: async () => {
      this.session = null;
      this.fire();
      return { error: null };
    },
  };

  from(table: string) {
    return new FakeQuery(this, table, 'select');
  }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, blob: Blob) => {
        const e = this.takeError();
        if (e) return { data: null, error: e };
        this.uploads.push([path, blob]);
        this.storageFiles.set(`${bucket}/${path}`, blob);
        return { data: { path }, error: null };
      },
      createSignedUrl: async (
        path: string,
        secs: number,
        options?: { download?: string },
      ) => {
        this.signedUrlCalls.push([path, secs, options]);
        const dl = options?.download ? `&download=${encodeURIComponent(options.download)}` : '';
        return {
          data: { signedUrl: `https://signed/${bucket}/${path}?t=${secs}${dl}` },
          error: null,
        };
      },
      download: async (path: string) => {
        const blob = this.storageFiles.get(`${bucket}/${path}`);
        return blob ? { data: blob, error: null } : { data: null, error: { message: 'not found' } };
      },
      remove: async (paths: string[]) => {
        this.removedFiles.push(...paths);
        paths.forEach((p) => this.storageFiles.delete(`${bucket}/${p}`));
        return { data: null, error: null };
      },
    }),
  };

  // Хелпер тестов: прямой доступ к строкам
  rows(table: string) {
    return this.tables.get(table)!;
  }
}

/* ---------- Тесты ---------- */

const GPX = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
<trkpt lat="52.0" lon="105.0"></trkpt>
</trkseg></trk></gpx>`;

const gpxFile = (name = 'кольцо 😎.gpx') =>
  new File([GPX], name, { type: 'application/gpx+xml' });

async function repoWithSession(fake: FakeSupabase) {
  const repo = createSupabaseRepository(fake);
  await repo.sendMagicLink('she@roamark.ru');
  const home = (await repo.listDistricts())[0];
  return { repo, home };
}

test('encodePreview/decodePreview ходят туда-обратно', () => {
  const segments = [
    [
      { lat: 51.8123, lon: 104.9456 },
      { lat: 51.9, lon: 104.8 },
    ],
    [{ lat: 52.0, lon: 105.0 }],
  ];
  const encoded = encodePreview(segments);
  expect(encoded).toBe('51.8123,104.9456;51.9,104.8|52,105');
  expect(decodePreview(encoded)).toEqual(segments);
});

test('sendMagicLink → signInWithOtp c emailRedirectTo на текущий адрес', async () => {
  const fake = new FakeSupabase();
  const repo = createSupabaseRepository(fake);
  const fired: string[] = [];
  repo.onAuth(() => fired.push('auth'));
  await repo.sendMagicLink('she@roamark.ru');
  expect(fake.otpCalls).toEqual([
    { email: 'she@roamark.ru', options: { emailRedirectTo: window.location.origin } },
  ]);
  expect(fired.length).toBeGreaterThan(0);
  expect((await repo.getSession())?.email).toBe('she@roamark.ru');
});

test('первый listDistricts пуст → создаётся «Рядом» основным', async () => {
  const fake = new FakeSupabase();
  const repo = createSupabaseRepository(fake);
  await fake.auth.signInWithOtp({ email: 'she@roamark.ru' });
  const list = await repo.listDistricts();
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe('Рядом');
  expect(list[0].isPrimary).toBe(true);
});

test('без сессии — RepositoryError «Нужно войти»', async () => {
  const fake = new FakeSupabase();
  const repo = createSupabaseRepository(fake);
  await expect(repo.listDistricts()).rejects.toBeInstanceOf(RepositoryError);
});

test('addTrack: upload {uuid}.gpx + insert с distance_km, original_filename, preview', async () => {
  const fake = new FakeSupabase();
  const { repo, home } = await repoWithSession(fake);
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо',
  });
  expect(fake.uploads).toHaveLength(1);
  expect(fake.uploads[0][0]).toMatch(/^[0-9a-f-]{36}\.gpx$/);
  const row = fake.rows('tracks')[0];
  expect(row.distance_km).toBeGreaterThan(10);
  expect(row.original_filename).toBe('кольцо 😎.gpx');
  expect(typeof row.preview).toBe('string');
  expect(row.user_id).toBe('u1');
  expect(track.previewSegments.length).toBeGreaterThan(0);
});

test('listTracks: snake_case → camelCase Track', async () => {
  const fake = new FakeSupabase();
  const { repo, home } = await repoWithSession(fake);
  const added = await repo.addTrack(gpxFile('a.gpx'), {
    districtId: home.id,
    category: 'bike',
    name: 'Покатушка',
    description: 'по вечеру',
  });
  const list = await repo.listTracks(home.id);
  expect(list).toHaveLength(1);
  const t = list[0];
  expect(t.id).toBe(added.id);
  expect(t.districtId).toBe(home.id);
  expect(t.category).toBe('bike');
  expect(t.name).toBe('Покатушка');
  expect(t.description).toBe('по вечеру');
  expect(t.originalFilename).toBe('a.gpx');
  expect(t.storagePath).toMatch(/\.gpx$/);
  expect(t.bounds).not.toBeNull();
  expect(t.distanceKm).toBeGreaterThan(0);
  expect(typeof t.createdAt).toBe('string');
});

test('getDownloadUrl → createSignedUrl(path, 3600, {download: оригинальное имя}); getGpxText байт-в-байт', async () => {
  const fake = new FakeSupabase();
  const { repo, home } = await repoWithSession(fake);
  const track = await repo.addTrack(gpxFile('б.gpx'), {
    districtId: home.id,
    category: 'ski',
    name: 'Лыжня',
  });
  const url = await repo.getDownloadUrl(track.id);
  // download-атрибут ссылки на кросс-доменный URL браузер игнорирует:
  // имя файла должен задать сам Supabase (Content-Disposition).
  expect(fake.signedUrlCalls).toEqual([
    [track.storagePath, 3600, { download: 'б.gpx' }],
  ]);
  expect(url).toContain(track.storagePath);
  expect(url).toContain('download');
  expect(await repo.getGpxText(track.id)).toBe(GPX);
});

test('deleteTrack: remove из storage + строка удалена', async () => {
  const fake = new FakeSupabase();
  const { repo, home } = await repoWithSession(fake);
  const track = await repo.addTrack(gpxFile('c.gpx'), {
    districtId: home.id,
    category: 'run',
    name: 'Пробежка',
  });
  await repo.deleteTrack(track.id);
  expect(fake.removedFiles).toEqual([track.storagePath]);
  expect(await repo.listTracks(home.id)).toHaveLength(0);
});

test('ошибка БД → RepositoryError; setPrimaryDistrict оставляет один основной', async () => {
  const fake = new FakeSupabase();
  const { repo, home } = await repoWithSession(fake);
  const far = await repo.createDistrict('Далеко');
  await repo.setPrimaryDistrict(far.id);
  const list = await repo.listDistricts();
  expect(list.filter((d) => d.isPrimary)).toHaveLength(1);
  expect(list.find((d) => d.id === far.id)?.isPrimary).toBe(true);
  expect(list.find((d) => d.id === home.id)?.isPrimary).toBe(false);

  fake.failWith = { message: 'connection lost', code: 'XX000' };
  await expect(repo.listDistricts()).rejects.toBeInstanceOf(RepositoryError);
});

test('deleteDistrict с треками (FK 23503) → подсказка «сначала перенесите треки»', async () => {
  const fake = new FakeSupabase();
  const { repo, home } = await repoWithSession(fake);
  await repo.addTrack(gpxFile('d.gpx'), { districtId: home.id, category: 'hike', name: 'Т' });
  fake.failWith = { message: 'violates foreign key constraint', code: '23503' };
  await expect(repo.deleteDistrict(home.id)).rejects.toThrow(/сначала перенесите их в другой район/i);
});
