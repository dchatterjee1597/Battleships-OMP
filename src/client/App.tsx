import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Identity } from '../shared/protocol';
import { api, useRoom } from './network';
import { Admin } from './Admin';
import { Lobby } from './Lobby';
import { Match } from './Match';
import { ShipArt } from './ShipArt';
import { CommandMark } from './CommandMark';
export function App() {
  const admin = location.pathname === '/admin';
  const invite = location.pathname.startsWith('/join/')
    ? decodeURIComponent(location.pathname.slice(6))
    : '';
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const refresh = useCallback(() => {
    void api<{ user: Identity | null }>('/session')
      .then(({ user }) => {
        setIdentity(user);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);
  useEffect(() => {
    if (!admin) refresh();
  }, [admin, refresh]);
  useEffect(() => {
    if (!identity || identity.status === 'approved') return;
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [identity?.status, refresh]);
  const room = useRoom(admin ? null : identity, refresh);
  useEffect(() => {
    if (!room.state) return;
    const prefix = `battleships-fleet:${room.state.me.id}:`;
    const keep = room.state.match?.phase === 'placement' ? `${prefix}${room.state.match.id}` : '';
    try {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith(prefix) && key !== keep) sessionStorage.removeItem(key);
    } catch {
      /* Optional local drafts. */
    }
  }, [room.state?.match?.id, room.state?.match?.phase, room.state?.me.id]);
  async function join(e: FormEvent) {
    e.preventDefault();
    setJoining(true);
    setError('');
    try {
      await api('/join', { name, invite });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  }
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (room.state?.match) e.preventDefault();
          }}
        >
          <span className="brand-mark">
            <CommandMark />
          </span>
          <span>
            BATTLESHIPS<small>NAVAL STRATEGY</small>
          </span>
        </a>
        <div className="topbar-right">
          <span className="private-label">PRIVATE MULTIPLAYER · OMP V1.1</span>
          {identity?.status === 'approved' && !admin ? (
            <span className={`connection ${room.status === 'online' ? 'live' : ''}`}>
              <i />
              {room.status === 'online'
                ? 'Live'
                : room.status === 'superseded'
                  ? 'Other tab active'
                  : room.status === 'full'
                    ? 'Community full'
                    : 'Connecting'}
            </span>
          ) : (
            <span className="badge">INVITE ONLY</span>
          )}
        </div>
      </header>
      {admin ? (
        <Admin />
      ) : !loaded ? (
        <main className="auth-layout">
          <div className="panel auth-card">
            <span className="eyebrow">CONNECTING</span>
            <h1>Preparing command…</h1>
          </div>
        </main>
      ) : identity?.status === 'approved' ? (
        <>
          {room.status === 'superseded' ? (
            <main className="auth-layout">
              <div className="panel auth-card">
                <h1>Command has moved.</h1>
                <p>This device is active in another tab. That tab controls your fleet.</p>
                <button className="primary" onClick={() => location.reload()}>
                  Take control in this tab
                </button>
              </div>
            </main>
          ) : room.status === 'full' ? (
            <main className="auth-layout">
              <div className="panel auth-card">
                <span className="eyebrow">25 PLAYER PLACES</span>
                <h1>The community is full.</h1>
                <p>
                  Your approval is remembered. All places are occupied, including reservations for
                  reconnecting captains. This page checks for a place every ten seconds.
                </p>
              </div>
            </main>
          ) : (
            <>
              {room.status !== 'online' && (
                <div className="connection-banner" role="status">
                  Reconnecting to command. Your match pauses for up to 90 seconds after the server
                  detects a disconnect.
                </div>
              )}
              {room.error && (
                <div className="error floating-error" role="alert">
                  {room.error}
                  <button aria-label="Dismiss error" onClick={() => room.setError('')}>
                    ×
                  </button>
                </div>
              )}
              {room.state ? (
                room.state.match ? (
                  <Match
                    key={room.state.match.id}
                    state={room.state}
                    send={room.send}
                    busy={room.busy || room.status !== 'online'}
                  />
                ) : (
                  <Lobby
                    state={room.state}
                    send={room.send}
                    busy={room.busy || room.status !== 'online'}
                  />
                )
              ) : (
                <main className="auth-layout">
                  <div className="panel auth-card">
                    <span className="eyebrow">CONNECTING</span>
                    <h1>Assembling the ready room…</h1>
                  </div>
                </main>
              )}
            </>
          )}
        </>
      ) : (
        <main className="auth-layout">
          <section className="welcome-copy">
            <span className="eyebrow">PRIVATE MULTIPLAYER NAVAL STRATEGY</span>
            <h1 className="landing-brand">BATTLESHIPS</h1>
            <h2 className="landing-tagline">
              Two fleets.
              <br />
              <em>One ocean.</em>
            </h2>
            <p>
              Deploy in secret. Strike with precision.
              <br />
              Victory is earned, one coordinate at a time.
            </p>
            <div className="fleet-duel" aria-hidden="true">
              <span className="duel-axis" />
              <ShipArt id="carrier" className="duel-one" />
              <ShipArt id="battleship" className="duel-two" />
              <span className="duel-caption">OPPOSING ARMADAS / PREPARE FOR ENGAGEMENT</span>
            </div>
            <div className="hero-pills">
              <span>2 captains</span>
              <span>5 vessels</span>
              <span>3-shot salvo</span>
            </div>
          </section>
          <section className="panel auth-card">
            {identity?.status === 'pending' ? (
              <>
                <div className="waiting-icon">◎</div>
                <span className="eyebrow">REQUEST RECEIVED</span>
                <h2>
                  Awaiting clearance,
                  <br />
                  {identity.name}.
                </h2>
                <p className="muted">
                  Your administrator must approve this device. Keep this page open — the ready room
                  opens automatically when access is granted.
                </p>
                <div className="notice mint">● Waiting for approval</div>
                <small className="muted">You only need approval once on this browser.</small>
              </>
            ) : (
              <>
                <span className="eyebrow">
                  {invite ? 'PLAYER CLEARANCE' : 'INVITATION REQUIRED'}
                </span>
                <h2>{invite ? 'Take command.' : 'Prepare for battle.'}</h2>
                <p className="muted">
                  {invite
                    ? 'Choose a callsign. Your administrator will approve this browser before your first match.'
                    : 'Private multiplayer naval strategy. Ask your administrator for an invitation link to enter the ready room.'}
                </p>
                {identity && (
                  <p className="notice">
                    Your previous access was {identity.status}.{' '}
                    {invite
                      ? 'You may request approval again.'
                      : 'Use the invitation link to request access again.'}
                  </p>
                )}
                {invite && (
                  <form onSubmit={join}>
                    <label htmlFor="callsign">Your callsign</label>
                    <input
                      id="callsign"
                      autoComplete="nickname"
                      minLength={2}
                      maxLength={20}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Maya"
                    />
                    <small className="muted">2–20 characters. Your name in the ready room.</small>
                    <button className="primary full" disabled={joining}>
                      {joining ? 'Requesting…' : 'Request Access →'}
                    </button>
                  </form>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <div className="auth-footer">Private by invitation. Remembered on this device.</div>
                <a href="/admin" className="admin-link">
                  Administrator access ↗
                </a>
              </>
            )}
          </section>
        </main>
      )}
      <footer className="site-footer">
        <span>
          BATTLESHIPS <span className="muted">/ STRATEGY AT SEA</span>
        </span>
        <span>PRIVATE MULTIPLAYER · OMP V1.1</span>
      </footer>
    </>
  );
}
