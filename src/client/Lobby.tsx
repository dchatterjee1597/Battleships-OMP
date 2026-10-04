import { MAX_MATCHES, type Action, type Snapshot, type PublicUser } from '../shared/protocol';
export function Lobby({
  state,
  send,
  busy,
}: {
  state: Snapshot;
  send: (a: Action) => void;
  busy: boolean;
}) {
  const me = state.users.find((u) => u.id === state.me.id)!;
  const users = state.users;
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? 'Captain';
  const full = state.matches.length >= MAX_MATCHES;
  const activity = (u: PublicUser) => {
    const match = state.matches.find((m) => m.id === u.matchId);
    const pairing = match?.players.map(name).join(' vs ');
    switch (u.activity) {
      case 'spectating':
        return `Spectating ${pairing ?? 'results'}`;
      case 'placement':
        return `Deploying · ${pairing}`;
      case 'playing':
        return `In battle · ${pairing}`;
      case 'reconnecting':
        return `Reconnecting · ${pairing}`;
      case 'finished':
        return 'Reviewing results';
      case 'unready':
        return 'Not ready';
      default:
        return 'Ready for a challenge';
    }
  };
  return (
    <main className="lobby-wrap">
      <section className="lobby-hero">
        <div>
          <span className="eyebrow">PRIVATE MULTIPLAYER · NAVAL STRATEGY</span>
          <h1>
            Armadas ready. <em>Choose your rival.</em>
          </h1>
          <p>Challenge a captain or watch a battle. One community, four independent matches.</p>
          <div className="hero-pills">
            <span>10 × 10 waters</span>
            <span>5 vessels</span>
            <span>3-shot salvo</span>
          </div>
        </div>
      </section>
      <div className="lobby-columns">
        <section className="panel crew-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FLEET MUSTER</span>
              <h2>Ready room.</h2>
            </div>
            <span className="badge mint">{state.capacity.used}/25 places</span>
          </div>
          <div className="your-status">
            <div className="avatar">{me.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>
                {me.name} <span className="muted">/ you</span>
              </strong>
              <small>{me.ready ? 'Ready for engagement' : 'Not ready for a match'}</small>
            </div>
            <button
              className={`ready-toggle ${me.ready ? 'on' : ''}`}
              aria-pressed={me.ready}
              disabled={busy}
              onClick={() => send({ type: 'ready', ready: !me.ready })}
            >
              <span /> {me.ready ? 'Ready' : 'Not Ready'}
            </button>
          </div>
          {users
            .filter((u) => u.id !== me.id)
            .map((u) => (
              <div className="crew-row" key={u.id}>
                <div className="avatar lavender">{u.name.slice(0, 1).toUpperCase()}</div>
                <div className="crew-name">
                  <strong>{u.name}</strong>
                  <small>
                    <i className={`presence-dot ${u.ready ? 'available' : ''}`} />
                    {activity(u)}
                  </small>
                </div>
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    full ||
                    !u.ready ||
                    !me.ready ||
                    state.challenges.some((c) => c.from === me.id)
                  }
                  onClick={() => send({ type: 'challenge', target: u.id })}
                >
                  Challenge <span aria-hidden="true">↗</span>
                </button>
              </div>
            ))}
          {users.length === 1 && (
            <div className="empty-state">
              <span className="empty-symbol">≈</span>
              <h3>Awaiting challenger.</h3>
              <p>Approved players appear here when they connect. Keep this tab open.</p>
            </div>
          )}
          {state.challenges.map((c) => (
            <div className="challenge-card" key={c.id}>
              {c.to === me.id ? (
                <>
                  <div>
                    <span className="eyebrow">INCOMING CHALLENGE</span>
                    <h3>{name(c.from)} challenges you.</h3>
                  </div>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={busy || full}
                      onClick={() => send({ type: 'respond', challenge: c.id, accept: true })}
                    >
                      Accept
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => send({ type: 'respond', challenge: c.id, accept: false })}
                    >
                      Decline
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Challenge issued to <strong>{name(c.to)}</strong>. Awaiting a reply…
                  </p>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => send({ type: 'cancelChallenge', challenge: c.id })}
                  >
                    Cancel challenge
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
        <aside className="lobby-aside">
          <section className="panel match-list">
            <div className="section-heading">
              <h2>Battles underway.</h2>
              <span className="badge">{state.matches.length}/4</span>
            </div>
            {full && (
              <p className="notice">All four match slots are occupied. You can still spectate.</p>
            )}
            {!state.matches.length && (
              <p className="muted">No battles yet. Challenge a ready captain.</p>
            )}
            {state.matches.map((m) => (
              <div className="battle-list-row" key={m.id}>
                <div>
                  <strong>{m.players.map(name).join(' vs ')}</strong>
                  <small>
                    {m.reconnecting.length
                      ? 'Paused · reconnecting'
                      : m.phase === 'placement'
                        ? 'Deploying fleets'
                        : 'In battle'}{' '}
                    · {m.spectators} watching
                  </small>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => send({ type: 'spectate', match: m.id })}
                >
                  Spectate
                </button>
              </div>
            ))}
          </section>
          <details className="panel briefing" open={matchMedia('(min-width: 801px)').matches}>
            <summary>Rules of engagement.</summary>
            <span className="eyebrow">BATTLE BRIEFING</span>
            <h2>Rules of engagement.</h2>
            <div>
              <span className="step">01</span>
              <h3>Deploy in secret</h3>
              <p>Place five vessels. Only you can see your fleet.</p>
            </div>
            <div>
              <span className="step">02</span>
              <h3>Make every shot count</h3>
              <p>Take turns finding enemy ships. Sink all five to win.</p>
            </div>
            <div>
              <span className="step">03</span>
              <h3>Three-shot salvo</h3>
              <p>Salvo unlocks on your third firing turn. Three targets, one turn.</p>
            </div>
            <div className="briefing-note">
              A disconnect pauses the match for 90 seconds. Return in time to resume; otherwise
              combat is forfeited.
            </div>
          </details>
        </aside>
      </div>
      {state.notice && (
        <div className="notice" role="status">
          {state.notice}
        </div>
      )}
    </main>
  );
}
