import { useEffect, useState } from 'react';
import type { Action, Snapshot } from '../shared/protocol';
import { shipName, coordinate } from '../shared/game';
import { Board } from './Board';
import { Placement } from './Placement';
export function Match({
  state,
  send,
  busy,
}: {
  state: Snapshot;
  send: (a: Action) => void;
  busy: boolean;
}) {
  const m = state.match!;
  const id = state.me.id;
  const player = m.players.includes(id);
  const paused = Object.keys(m.disconnected).length > 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const offset = state.serverNow - Date.now();
    setNow(Date.now() + offset);
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [state.serverNow]);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? 'Captain';
  const own = m.boards.find((b) => b.player === id);
  const enemy = m.boards.find((b) => b.player !== id)!;
  const [targets, setTargets] = useState<number[]>([]);
  const [salvo, setSalvo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const myTurn = player && !paused && m.turn === id && m.phase === 'playing';
  useEffect(() => {
    setTargets([]);
    setSalvo(false);
    setConfirming(false);
  }, [m.revision, m.phase, paused]);
  function target(cell: number) {
    setTargets((current) =>
      current.includes(cell)
        ? current.filter((c) => c !== cell)
        : current.length < (salvo ? 3 : 1)
          ? [...current, cell]
          : salvo
            ? current
            : [cell],
    );
  }
  const spectators = state.users.filter(
    (u) => u.connected && u.activity === 'spectating' && u.matchId === m.id,
  );
  const forfeit =
    player && m.phase !== 'finished' ? (
      <div className="forfeit-area">
        {confirming ? (
          <div className="confirm-box">
            <p>
              {m.phase === 'placement'
                ? 'Cancel this fleet setup?'
                : 'Forfeit this match to your opponent?'}
            </p>
            <div className="button-row">
              <button
                className="danger"
                onClick={() => send({ type: 'forfeit', match: m.id })}
                disabled={busy}
              >
                Confirm forfeit
              </button>
              <button className="secondary" onClick={() => setConfirming(false)}>
                Keep playing
              </button>
            </div>
          </div>
        ) : (
          <button className="text-button danger-text" onClick={() => setConfirming(true)}>
            Forfeit Match
          </button>
        )}
      </div>
    ) : null;
  const controls = (
    <aside className="panel battle-controls">
      <span className="eyebrow">
        {m.phase === 'finished'
          ? 'DEBRIEF'
          : paused
            ? 'MATCH PAUSED'
            : m.phase === 'placement'
              ? 'DEPLOYMENT STATUS'
              : 'FIRE CONTROL'}
      </span>
      <h2 className={myTurn ? 'turn-active' : ''}>
        {m.phase === 'finished'
          ? 'Engagement ended.'
          : paused
            ? 'Waiting for reconnection.'
            : m.phase === 'placement'
              ? 'Fleets deploying.'
              : myTurn
                ? 'YOUR TURN'
                : player
                  ? 'OPPONENT’S TURN'
                  : `${name(m.turn)}’s turn`}
      </h2>
      <p className="muted">
        {m.phase === 'finished'
          ? 'The battle is resolved. Review the confirmed shots.'
          : paused
            ? 'Your fleets and turn are preserved until the reconnect window expires.'
            : m.phase === 'placement'
              ? 'Both captains are placing their fleets in secret.'
              : player
                ? myTurn
                  ? 'Read the grid. Choose your target.'
                  : 'Awaiting your opponent’s move.'
                : 'Observe confirmed shots on both boards.'}
      </p>
      {player && m.phase === 'playing' && (
        <>
          <div className="mode-toggle">
            <button
              aria-pressed={!salvo}
              disabled={!myTurn || busy}
              onClick={() => {
                setSalvo(false);
                setTargets([]);
              }}
            >
              Normal Shot
            </button>
            <button
              aria-pressed={salvo}
              disabled={!myTurn || busy || !!own!.cooldown}
              onClick={() => {
                setSalvo(true);
                setTargets([]);
              }}
            >
              Salvo ×3
            </button>
          </div>
          <div className={`salvo-status ${own!.cooldown === 0 ? 'charged' : ''}`}>
            <span>◎</span>
            <div>
              <strong>{own!.cooldown === 0 ? 'Salvo available' : 'Salvo charging'}</strong>
              <small>
                {own!.cooldown === 0
                  ? 'Three shots. One decisive turn.'
                  : `${own!.cooldown} normal firing turn${own!.cooldown === 1 ? '' : 's'} until ready`}
              </small>
            </div>
          </div>
          <div className="fire-dock">
            <div>
              <small>{salvo ? 'SALVO TARGETS' : 'SELECTED TARGET'}</small>
              <strong>
                {targets.length ? targets.map(coordinate).join(' · ') : 'Choose your waters'}
              </strong>
            </div>
            <button
              className="primary"
              disabled={busy || !myTurn || targets.length !== (salvo ? 3 : 1)}
              onClick={() => send({ type: 'fire', match: m.id, revision: m.revision, targets })}
            >
              {busy ? 'Sending…' : salvo ? 'Fire Salvo' : 'Fire'} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </>
      )}
      {forfeit}
      <details className="event-feed" open={matchMedia('(min-width: 601px)').matches}>
        <summary>
          Signal log <span>↙</span>
        </summary>
        <ol aria-live="polite">
          {m.events
            .slice(-12)
            .reverse()
            .map((event, i) => (
              <li key={`${m.events.length - i}-${event}`}>{event}</li>
            ))}
        </ol>
      </details>
    </aside>
  );
  return (
    <main className="match-wrap">
      <div className="match-title">
        <div>
          <span className="eyebrow">
            {m.phase === 'placement'
              ? '01 / DEPLOYMENT'
              : m.phase === 'finished'
                ? '03 / DEBRIEF'
                : '02 / ENGAGEMENT'}
          </span>
          <h1>
            {m.phase === 'placement'
              ? player
                ? 'Fleet deployment.'
                : 'Awaiting deployment.'
              : m.phase === 'finished'
                ? 'Engagement complete.'
                : player
                  ? 'Battle underway.'
                  : 'Battle observation.'}
          </h1>
        </div>
        <span className="badge lavender">{player ? 'Captain' : 'Spectator'} · Private room</span>
        {!player && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => send({ type: 'leaveSpectating' })}
          >
            Return to lobby
          </button>
        )}
      </div>
      {paused && (
        <section className="notice reconnect-notice" role="status">
          <strong>Match paused — waiting for reconnection.</strong>
          {Object.entries(m.disconnected).map(([captain, deadline]) => (
            <span key={captain}>
              {name(captain)} · {Math.max(0, Math.ceil((deadline - now) / 1000))} seconds remaining
            </span>
          ))}
          <small>
            Both captains must be connected to resume. Your fleets and turns are preserved.
          </small>
        </section>
      )}
      {m.phase === 'finished' && (
        <section
          className={`result-card ${player && m.winner ? (m.winner === id ? 'victory' : 'defeat') : 'neutral'}`}
          role="status"
        >
          <span className="eyebrow">
            {!m.winner
              ? 'MATCH ABANDONED'
              : player
                ? m.winner === id
                  ? 'VICTORY'
                  : 'DEFEAT'
                : 'MATCH COMPLETE'}
          </span>
          <h2>
            {m.winner ? `${name(m.winner)} wins at sea.` : 'No winner. Both captains disconnected.'}
          </h2>
          <p>
            {!m.winner
              ? 'The reconnect window expired.'
              : m.reason === 'fleet destroyed'
                ? 'Fleet destroyed. All five vessels sunk.'
                : m.reason?.includes('disconnected')
                  ? 'Match forfeited after a player disconnected.'
                  : 'Match forfeited.'}{' '}
            {m.boards.reduce((sum, b) => sum + b.turns, 0)} firing turns ·{' '}
            {m.boards.reduce((sum, b) => sum + b.shots.length, 0)} shots.
          </p>
          {player && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => send({ type: 'lobby', match: m.id })}
            >
              Return to Lobby →
            </button>
          )}
          <small>This match’s viewers return to the lobby automatically within 15 seconds.</small>
        </section>
      )}
      <div className="match-layout">
        <details className="crew-sidebar panel" open={matchMedia('(min-width: 801px)').matches}>
          <summary>
            Match roster <span className="count">{m.players.length + spectators.length}</span>
          </summary>
          <span className="eyebrow">CAPTAINS</span>
          {m.players.map((p) => (
            <div className="captain-card" key={p}>
              <div
                className={`avatar ${p === m.turn && m.phase === 'playing' ? 'mint' : 'lavender'}`}
              >
                {name(p).slice(0, 1).toUpperCase()}
              </div>
              <strong>
                {name(p)}
                {p === id ? ' / you' : ''}
              </strong>
              <small>
                {m.phase === 'placement'
                  ? m.boards.find((b) => b.player === p)!.locked
                    ? 'Fleet locked'
                    : 'Deploying fleet'
                  : `${5 - m.boards.find((b) => b.player === p)!.sunk.length} vessels afloat`}
              </small>
            </div>
          ))}
          <span className="eyebrow spectator-label">SPECTATORS · {spectators.length}</span>
          <div className="spectator-list">
            {spectators.length ? (
              spectators.map((u) => (
                <div className="spectator-name" key={u.id}>
                  <i className="presence-dot available" />
                  {u.name}
                </div>
              ))
            ) : (
              <p className="muted small">Just the two captains.</p>
            )}
          </div>
          <div className="privacy-note">
            ◈
            <p>
              Hidden fleets stay hidden.
              <br />
              Every spectator sees only confirmed shots.
            </p>
          </div>
        </details>
        {m.phase === 'placement' && player ? (
          <div className="deployment-main">
            <Placement
              draftKey={`battleships-fleet:${id}:${m.id}`}
              locked={own?.fleet}
              busy={busy || paused}
              onReady={(fleet) => send({ type: 'fleet', match: m.id, fleet })}
            />
            {forfeit}
          </div>
        ) : (
          <>
            <div className="boards-stack">
              {(player ? [enemy, own!] : m.boards).map((board, i) => (
                <div key={board.player}>
                  <Board
                    title={
                      player
                        ? i === 0
                          ? `${name(board.player)}’s waters`
                          : 'Your home waters'
                        : `${name(board.player)} waters`
                    }
                    subtitle={
                      player
                        ? i === 0
                          ? 'ENEMY WATERS / TARGET GRID'
                          : 'YOUR FLEET / DEFENSIVE GRID'
                        : 'PUBLIC WATERS / OBSERVATION ONLY'
                    }
                    shots={board.shots}
                    fleet={board.fleet}
                    interactive={player && i === 0 && myTurn && !busy}
                    targets={i === 0 ? targets : []}
                    onCell={target}
                  />
                  <div className="fleet-status">
                    {board.sunk.length
                      ? `Sunk: ${board.sunk.map(shipName).join(', ')}`
                      : m.phase === 'placement'
                        ? board.locked
                          ? 'Fleet locked'
                          : 'Fleet deployment in progress…'
                        : 'All five vessels still afloat'}
                  </div>
                </div>
              ))}
            </div>
            {controls}
          </>
        )}
      </div>
    </main>
  );
}
