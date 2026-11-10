/**
 * A minimal obs-websocket 5 client (Node only): connect with the password from OBS's own config,
 * send requests, and wait for events. https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
 */
import { createHash, randomUUID } from 'node:crypto';

type Pending = { resolve: (data: Record<string, unknown>) => void; reject: (e: Error) => void };
type Listener = (data: Record<string, unknown>) => void;

export class Obs {
  private ws!: WebSocket;
  private pending = new Map<string, Pending>();
  private listeners = new Map<string, Set<Listener>>();
  closed: Promise<void> = Promise.resolve();

  /** Opens the socket and identifies, with the password when OBS asks for one. */
  static async connect(url: string, password: string | undefined): Promise<Obs> {
    const obs = new Obs();
    await obs.open(url, password);
    return obs;
  }

  private open(url: string, password: string | undefined) {
    return new Promise<void>((done, fail) => {
      const ws = new WebSocket(url, 'obswebsocket.json');
      this.ws = ws;
      let identified = false;
      this.closed = new Promise<void>((closed) => ws.addEventListener('close', () => closed()));
      ws.addEventListener('error', () => !identified && fail(new Error(`Cannot reach OBS at ${url}`)));
      ws.addEventListener('close', (e) => {
        if (!identified) fail(new Error(`OBS closed the connection (${e.code} ${e.reason})`));
        for (const p of this.pending.values()) p.reject(new Error('OBS closed the connection'));
        this.pending.clear();
      });
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(String(e.data)) as { op: number; d: Record<string, unknown> };
        if (msg.op === 0) {
          // Hello: answer with Identify, authenticated when asked; every event subscribed.
          const auth = msg.d.authentication as { challenge: string; salt: string } | undefined;
          const d: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 0x7ff };
          if (auth) {
            if (!password) return fail(new Error('OBS asks for a password'));
            const secret = sha256(password + auth.salt);
            d.authentication = sha256(secret + auth.challenge);
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (msg.op === 2) {
          identified = true;
          done();
        } else if (msg.op === 5) {
          const type = msg.d.eventType as string;
          for (const l of this.listeners.get(type) ?? []) l((msg.d.eventData ?? {}) as Record<string, unknown>);
        } else if (msg.op === 7) {
          const p = this.pending.get(msg.d.requestId as string);
          if (!p) return;
          this.pending.delete(msg.d.requestId as string);
          const status = msg.d.requestStatus as { result: boolean; code: number; comment?: string };
          if (status.result) p.resolve((msg.d.responseData ?? {}) as Record<string, unknown>);
          else p.reject(new Error(`OBS ${msg.d.requestType}: ${status.comment ?? `code ${status.code}`}`));
        }
      });
    });
  }

  call<T = Record<string, unknown>>(requestType: string, requestData: Record<string, unknown> = {}): Promise<T> {
    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as Pending['resolve'], reject });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  on(eventType: string, listener: Listener): () => void {
    const set = this.listeners.get(eventType) ?? new Set();
    set.add(listener);
    this.listeners.set(eventType, set);
    return () => set.delete(listener);
  }

  /** The next event of this type for which `match` holds. */
  next(eventType: string, match: (data: Record<string, unknown>) => boolean = () => true, timeoutMs = 30_000) {
    return new Promise<Record<string, unknown>>((done, fail) => {
      const timer = setTimeout(() => (off(), fail(new Error(`OBS: no ${eventType} within ${timeoutMs / 1000} s`))), timeoutMs);
      const off = this.on(eventType, (d) => {
        if (!match(d)) return;
        clearTimeout(timer);
        off();
        done(d);
      });
    });
  }

  close() {
    this.ws.close();
    return this.closed;
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('base64');
