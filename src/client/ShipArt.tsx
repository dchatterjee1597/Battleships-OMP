import { useId } from 'react';
import { SHIPS, type ShipId } from '../shared/game';

// Original enamel miniatures. Color is presentation-only; geometry stays in game.ts.
const finishes: Record<ShipId, { light: string; body: string; edge: string }> = {
  carrier: { light: '#97acb5', body: '#34566c', edge: '#193544' },
  battleship: { light: '#acb1be', body: '#626c85', edge: '#343e52' },
  cruiser: { light: '#afc6b4', body: '#597b6c', edge: '#304f43' },
  submarine: { light: '#e0c991', body: '#b09359', edge: '#72603e' },
  destroyer: { light: '#c59486', body: '#936354', edge: '#623e35' },
};
const hulls: Record<ShipId, string> = {
  carrier: 'M7 9L143 6Q174 9 195 21Q174 33 143 36L7 33Z',
  battleship: 'M8 13L44 8H139Q173 8 195 21Q173 34 139 34H44L8 29Z',
  cruiser: 'M9 15L45 10H140Q174 11 193 21Q174 31 140 32H45L9 27Z',
  submarine: 'M10 21Q15 7 39 7H157Q180 7 192 21Q180 35 157 35H39Q15 35 10 21Z',
  destroyer: 'M12 15L52 11H140L174 15L193 21L174 27L140 31H52L12 27Z',
};
export function ShipArt({
  id,
  className = '',
  variant,
}: {
  id: ShipId;
  className?: string;
  variant?: 'sunk-public';
}) {
  const type = SHIPS.find((ship) => ship.id === id)!;
  const finish = finishes[id];
  const enamel = 'enamel-' + useId();
  const damageClip = enamel + '-damage';
  return (
    <svg className={'ship-art ' + className} viewBox="0 0 200 42" role="img" aria-label={type.name}>
      <defs>
        <linearGradient id={enamel} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={finish.light} />
          <stop offset="0.45" stopColor={finish.body} />
          <stop offset="1" stopColor={finish.edge} />
        </linearGradient>
        {variant === 'sunk-public' && (
          <clipPath id={damageClip}>
            <path d={hulls[id]} />
          </clipPath>
        )}
      </defs>
      <path d={hulls[id]} transform="translate(0 2)" fill={finish.edge} opacity="0.8" />
      <path d={hulls[id]} fill={'url(#' + enamel + ')'} stroke={finish.edge} strokeWidth="2" />
      <path d={hulls[id]} fill="none" stroke="#e4d3aa" strokeWidth="0.9" opacity="0.85" />
      {id === 'carrier' ? (
        <>
          <path d="M18 12H139L175 21L139 30H18Z" fill="#e4e7df" stroke="#607a83" />
          <path d="M27 21H159" stroke="#415d6c" strokeWidth="1.3" strokeDasharray="9 5" />
          <path d="M44 15l7 6-7 6M118 15l7 6-7 6" fill="none" stroke="#415d6c" strokeWidth="1.6" />
          <rect x="72" y="7" width="35" height="8" rx="2" fill="#294555" stroke="#a2b0af" />
          <path d="M23 13v15M139 13l27 8-27 8" fill="none" stroke="#a8b4b2" strokeWidth="0.9" />
        </>
      ) : id === 'submarine' ? (
        <>
          <path d="M22 21H177" stroke="#e8d9b2" strokeWidth="1" opacity="0.75" />
          <rect x="74" y="13" width="52" height="16" rx="8" fill="#ddd1ad" stroke="#665c43" />
          <rect x="85" y="16" width="28" height="9" rx="4" fill="#b39966" />
          <path d="M100 13V6h9M24 16v10M168 16v10" fill="none" stroke="#5e5845" strokeWidth="2" />
        </>
      ) : (
        <>
          <path d="M20 21H177" stroke="#d9d8c5" strokeWidth="0.8" opacity="0.7" />
          <rect
            x="68"
            y="12"
            width={id === 'destroyer' ? 43 : 56}
            height="18"
            rx={id === 'destroyer' ? 2 : 5}
            fill="#e2e2d2"
            stroke={finish.edge}
          />
          <rect x="82" y="16" width="23" height="10" rx="2" fill={finish.edge} />
          <path d="M71 15v12M119 15v12" stroke="#b9bba9" />
          {id === 'destroyer' ? (
            <>
              <path d="M138 16h12l4 5-4 5h-12Z" fill="#ddd7c6" stroke={finish.edge} />
              <path d="M143 21h24M38 21h20M99 12V7" stroke={finish.edge} strokeWidth="2" />
              <rect x="35" y="17" width="9" height="8" rx="2" fill="#ddd7c6" stroke={finish.edge} />
            </>
          ) : (
            <>
              <circle
                cx="144"
                cy="21"
                r={id === 'battleship' ? 8 : 6}
                fill="#dedfd0"
                stroke={finish.edge}
              />
              <circle
                cx="42"
                cy="21"
                r={id === 'battleship' ? 7 : 5}
                fill="#dedfd0"
                stroke={finish.edge}
              />
              <path
                d={
                  id === 'battleship'
                    ? 'M144 19h23M144 23h23M42 19h18M42 23h18'
                    : 'M144 21h23M42 21h18'
                }
                stroke={finish.edge}
                strokeWidth="2.3"
              />
              <path d="M112 12V6" stroke={finish.edge} strokeWidth="2" />
            </>
          )}
        </>
      )}
      <path d="M18 11L137 8" stroke="#fff7dc" strokeWidth="1" opacity="0.6" />
      {variant === 'sunk-public' && (
        <g className="ship-damage">
          <g clipPath={'url(#' + damageClip + ')'}>
            <path d={hulls[id]} fill="#211e1b" opacity="0.18" />
            <path
              d="M61 13l7-3 10 4 3 7-5 7-13-2-5-6ZM124 20l9-5 11 3 3 8-8 6-12-3Z"
              fill="#191b19"
              opacity="0.82"
            />
            <path
              d="M49 9l6 8-4 5 10 6-4 6M100 8l-5 7 10 7-5 4 7 9M154 10l-5 8 8 6-4 7"
              fill="none"
              stroke="#1e2423"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M51 11l6 6-4 5 9 6M102 9l-5 6 10 7"
              fill="none"
              stroke="#ded0ae"
              strokeWidth="0.8"
            />
          </g>
          <g stroke="#713b2c" strokeWidth="0.9" strokeLinejoin="round">
            <path
              d="M70 25C63 22 64 18 67 15L69 19C73 16 72 11 75 9C76 15 82 19 77 24Z"
              fill="#bc5134"
            />
            <path d="M70 24C68 21 72 19 73 16C74 20 77 21 74 24Z" fill="#dda354" stroke="none" />
            <path
              d="M132 29C126 26 129 22 130 21L132 24C136 21 133 18 136 16C136 22 141 25 137 29Z"
              fill="#bc5134"
            />
            <path
              d="M133 28C131 26 135 24 135 22C137 25 137 27 135 28Z"
              fill="#dda354"
              stroke="none"
            />
          </g>
        </g>
      )}
    </svg>
  );
}
