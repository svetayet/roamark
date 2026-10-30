/**
 * Клиент реле-переводчика: ровно 5 операций из openapi.yaml (источник правды).
 * Урок этапа 1: ответы внешних API кэшируются — все запросы no-store.
 */

export type SyncFailure = 'token' | 'missing' | 'relay' | 'network';

export class SyncError extends Error {
  readonly failure: SyncFailure;

  constructor(failure: SyncFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

/** Текст для настроек: по виду сбоя, человеческим языком. */
export function syncErrorText(e: unknown): string {
  if (!(e instanceof SyncError)) return 'Не получилось. Попробуй ещё раз.';
  switch (e.failure) {
    case 'token':
      return 'Сессия Яндекса истекла — подключи заново.';
    case 'missing':
      return 'Файл не найден на Диске.';
    case 'network':
      return 'Сервер недоступен — проверь связь или адрес сервера.';
    default:
      return e.message;
  }
}

interface FileInfo {
  name: string;
  size: number;
  modified: string;
}

export class RelayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async health(): Promise<{ status: string; time: string }> {
    const r = await this.request('GET', '/v1/health', { withToken: false });
    return (await this.json(r)) as { status: string; time: string };
  }

  async listFiles(prefix: string): Promise<FileInfo[]> {
    const r = await this.request('GET', `/v1/files?prefix=${encodeURIComponent(prefix)}`);
    const body = (await this.json(r)) as { files?: FileInfo[] };
    return body.files ?? [];
  }

  async getFile(path: string): Promise<ArrayBuffer> {
    const r = await this.request('GET', `/v1/file?path=${encodeURIComponent(path)}`);
    if (r.status === 404) throw new SyncError('missing', 'Файл не найден на Диске.');
    if (!r.ok) await this.failWith(r);
    return r.arrayBuffer();
  }

  async putFile(path: string, bytes: ArrayBuffer): Promise<void> {
    const r = await this.request('PUT', `/v1/file?path=${encodeURIComponent(path)}`, { body: bytes });
    if (!r.ok) await this.failWith(r);
  }

  async deleteFile(path: string): Promise<void> {
    const r = await this.request('DELETE', `/v1/file?path=${encodeURIComponent(path)}`);
    if (!r.ok) await this.failWith(r);
  }

  private async request(
    method: string,
    path: string,
    options: { withToken?: boolean; body?: ArrayBuffer } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.withToken !== false) headers['Authorization'] = `Bearer ${this.token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/octet-stream';
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.body,
        cache: 'no-store',
      });
    } catch {
      throw new SyncError('network', 'Сервер синхронизации недоступен.');
    }
    if (response.status === 401) {
      throw new SyncError('token', 'Токен Яндекса протух.');
    }
    return response;
  }

  private async json(r: Response): Promise<unknown> {
    if (!r.ok) await this.failWith(r);
    try {
      return await r.json();
    } catch {
      throw new SyncError('relay', 'Сервер ответил не-JSON.');
    }
  }

  private async failWith(r: Response): Promise<never> {
    let message = `Сервер ответил ${r.status}.`;
    try {
      const body = (await r.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* тела нет или не JSON — остаётся статус */
    }
    throw new SyncError('relay', message);
  }
}
