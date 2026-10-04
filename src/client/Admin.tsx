import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from './network';
import type { Identity } from '../shared/protocol';
type AdminUser = Identity & { connected: boolean; created: number };
export function Admin() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ users: AdminUser[] }>('/admin/users');
      setUsers(result.users);
    } catch {
      setUsers(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/login', { passphrase });
      setPassphrase('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(user: AdminUser, action: string) {
    if (
      action === 'revoke' &&
      !confirm(`Revoke ${user.name}'s device? An active match will be forfeited.`)
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api('/admin/decision', { id: user.id, action });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!users)
    return (
      <main className="auth-layout">
        <section className="panel auth-card">
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>Command access.</h1>
          <p className="muted">Manage player clearance and approved devices.</p>
          <form onSubmit={login}>
            <label htmlFor="passphrase">Admin passphrase</label>
            <input
              id="passphrase"
              type="password"
              autoComplete="current-password"
              required
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <button className="primary full" disabled={busy}>
              Enter command →
            </button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <a href="/" className="admin-link">
            ← Back to Battleships
          </a>
        </section>
      </main>
    );
  return (
    <main className="lobby-wrap">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>Access control.</h1>
          <p className="muted">
            Approvals belong to a browser and device. Updates every three seconds.
          </p>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            await api('/admin/logout', {});
            setUsers(null);
          }}
        >
          Sign out
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-grid">
        {([['pending', 'denied', 'revoked'], ['approved']] as const).map((statuses, column) => (
          <div className="admin-column" key={column}>
            {statuses.map((status) => (
              <section className="panel" key={status}>
                <span className="eyebrow">
                  {status === 'pending' ? 'AWAITING CLEARANCE' : status.toUpperCase()}
                </span>
                <h2>
                  {status === 'pending'
                    ? 'Access requests'
                    : `${status[0].toUpperCase()}${status.slice(1)} devices`}{' '}
                  <span className="count">{users.filter((u) => u.status === status).length}</span>
                </h2>
                {!users.some((u) => u.status === status) && (
                  <p className="muted">Nothing here. All clear.</p>
                )}
                {users
                  .filter((u) => u.status === status)
                  .map((u) => (
                    <div className="admin-user" key={u.id}>
                      <div>
                        <strong>{u.name}</strong>
                        <small>
                          {u.connected ? '● Connected' : 'Offline'} ·{' '}
                          {new Date(u.created).toLocaleDateString()}
                        </small>
                        <small className="device-id">Device {u.id.slice(0, 8)}</small>
                      </div>
                      <div className="button-row">
                        {status === 'pending' ? (
                          <>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() => void decide(u, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => void decide(u, 'deny')}
                            >
                              Deny
                            </button>
                          </>
                        ) : status === 'approved' ? (
                          <button
                            className="danger"
                            disabled={busy}
                            onClick={() => void decide(u, 'revoke')}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
              </section>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
