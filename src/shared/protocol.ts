import { z } from 'zod';
import type { Fleet, Shot, ShipId } from './game';
export const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(
    /^[\p{L}\p{M}\p{N} ._'’-]+$/u,
    'Use letters, numbers, spaces, apostrophes, dots, underscores or hyphens.',
  );
const placementSchema = z
  .object({
    id: z.enum(['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer']),
    x: z.number().int().min(0).max(9),
    y: z.number().int().min(0).max(9),
    vertical: z.boolean(),
  })
  .strict();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spectate'), match: z.string().max(64) }).strict(),
  z.object({ type: z.literal('leaveSpectating') }).strict(),
  z.object({ type: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('challenge'), target: z.string().max(64) }).strict(),
  z
    .object({ type: z.literal('respond'), challenge: z.string().max(64), accept: z.boolean() })
    .strict(),
  z.object({ type: z.literal('cancelChallenge'), challenge: z.string().max(64) }).strict(),
  z
    .object({
      type: z.literal('fleet'),
      match: z.string().max(64),
      fleet: z.array(placementSchema).length(5),
    })
    .strict(),
  z
    .object({
      type: z.literal('fire'),
      match: z.string().max(64),
      revision: z.number().int().nonnegative(),
      targets: z.array(z.number().int().min(0).max(99)).min(1).max(3),
    })
    .strict(),
  z.object({ type: z.literal('forfeit'), match: z.string().max(64) }).strict(),
  z.object({ type: z.literal('lobby'), match: z.string().max(64) }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export type AccessStatus = 'pending' | 'approved' | 'denied' | 'revoked';
export type Identity = { id: string; name: string; status: AccessStatus };
export const MAX_PLAYERS = 25;
export const MAX_MATCHES = 4;
export const RECONNECT_MS = 90_000;
export type PublicUser = {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  activity:
    'ready' | 'unready' | 'placement' | 'playing' | 'finished' | 'reconnecting' | 'spectating';
  matchId?: string;
};
export type Capacity = { used: number; limit: number; canConnect: boolean };
export type Session = { user: Identity | null; capacity: Capacity };
export type MatchSummary = {
  id: string;
  players: [string, string];
  phase: 'placement' | 'playing' | 'finished';
  reconnecting: string[];
  spectators: number;
};
export type Challenge = { id: string; from: string; to: string; expires: number };
export type PublicBoard = {
  player: string;
  locked: boolean;
  shots: Shot[];
  sunk: ShipId[];
  fleet?: Fleet;
  turns: number;
  cooldown: number;
};
export type MatchView = {
  id: string;
  phase: 'placement' | 'playing' | 'finished';
  players: [string, string];
  turn: string;
  revision: number;
  boards: PublicBoard[];
  events: string[];
  winner?: string;
  reason?: string;
  resetAt?: number;
  disconnected: Record<string, number>;
};
export type Snapshot = {
  type: 'snapshot';
  version: number;
  serverNow: number;
  me: Identity;
  users: PublicUser[];
  challenges: Challenge[];
  match: MatchView | null;
  matches: MatchSummary[];
  capacity: Capacity;
  notice: string;
};
export type ServerMessage = Snapshot | { type: 'error'; message: string } | { type: 'superseded' };
