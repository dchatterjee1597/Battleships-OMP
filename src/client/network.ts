import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, Identity, ServerMessage, Snapshot, Session } from '../shared/protocol';
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Connection interrupted. Please try again.');
  return result;
}
export function useRoom(identity: Identity | null, refresh: () => void) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline' | 'superseded' | 'full'>(
    'connecting',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (identity?.status !== 'approved') return;
    let stopped = false;
    let superseded = false;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let probeTimeout: ReturnType<typeof setTimeout>;
    let opening = false;
    let version = -1;
    async function open() {
      if (stopped || superseded || opening) return;
      opening = true;
      clearTimeout(retry);
      setStatus('connecting');
      try {
        const session = await api<Session>('/session');
        if (stopped || superseded) return;
        if (session.user?.status !== 'approved') {
          refresh();
          return;
        }
        if (!session.capacity.canConnect) {
          setStatus('full');
          setState(null);
          retry = setTimeout(() => void open(), 10_000);
          return;
        }
      } catch {
        setStatus('offline');
        retry = setTimeout(() => void open(), 5000);
        return;
      } finally {
        opening = false;
      }
      if (stopped || superseded) return;
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`,
      );
      socket.current = ws;
      ws.onopen = () => {
        if (socket.current !== ws || stopped) {
          ws.close();
          return;
        }
        setStatus('online');
        heartbeat = setInterval(probe, 25_000);
      };
      ws.onmessage = (e) => {
        if (socket.current !== ws || stopped) return;
        if (e.data === 'pong') {
          clearTimeout(probeTimeout);
          return;
        }
        const message: ServerMessage = JSON.parse(e.data);
        if (message.type === 'superseded') {
          superseded = true;
          clearTimeout(retry);
          clearTimeout(probeTimeout);
          clearInterval(heartbeat);
          setStatus('superseded');
          return;
        }
        if (message.type === 'error') {
          setError(message.message);
          setBusy(false);
          return;
        }
        if (message.version >= version) {
          version = message.version;
          setState(message);
          setBusy(false);
        }
      };
      ws.onclose = (e) => {
        if (socket.current !== ws) return;
        clearInterval(heartbeat);
        clearTimeout(probeTimeout);
        setBusy(false);
        if (e.code === 4001) {
          superseded = true;
          setStatus('superseded');
        }
        if (stopped || superseded) return;
        setStatus('offline');
        refresh();
        retry = setTimeout(() => void open(), 4000);
      };
      ws.onerror = () => ws.close();
    }
    function probe() {
      const ws = socket.current;
      if (stopped || superseded || document.visibilityState === 'hidden') return;
      if (ws?.readyState === WebSocket.OPEN) {
        clearTimeout(probeTimeout);
        ws.send('ping');
        probeTimeout = setTimeout(() => {
          if (
            socket.current !== ws ||
            stopped ||
            superseded ||
            document.visibilityState === 'hidden'
          )
            return;
          // Replace without waiting for a dead transport's closing handshake.
          socket.current = null;
          clearInterval(heartbeat);
          setBusy(false);
          ws.close();
          void open();
        }, 5000);
      } else if (!ws || ws.readyState === WebSocket.CLOSED) void open();
    }
    function foreground() {
      if (document.visibilityState === 'visible') probe();
      else clearTimeout(probeTimeout);
    }
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('focus', foreground);
    void open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      clearTimeout(probeTimeout);
      document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener('focus', foreground);
      socket.current?.close(1000, 'Page left');
    };
  }, [identity?.id, identity?.status, refresh]);
  const send = useCallback((action: Action) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError('Reconnecting. Wait for the live indicator.');
      return;
    }
    setError('');
    setBusy(true);
    socket.current.send(JSON.stringify(action));
  }, []);
  return { state, status, error, setError, busy, send };
}
