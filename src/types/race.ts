import type { OfficialStanding, RacePhase } from '../game/raceSchedule';

export interface LiveParticipant {
  id: string;
  name: string;
  locationName: string;
  locationCode: string;
  originLat: number;
  originLng: number;
  vehicleId: string;
  distanceMeters: number;
  speedKmh: number;
  topSpeedKmh: number;
  lap: number;
  lat: number;
  lng: number;
  heading: number;
  agenticMode: boolean;
  agenticDecision: string;
  ready: boolean;
  joinedAtMs: number;
}

export interface AnnouncedRaceResult {
  raceId: string;
  roomId: string;
  roomLabel: string;
  circuitId: string;
  circuitName: string;
  startedAtMs: number;
  finishedAtMs: number;
  participantCount: number;
  standings: OfficialStanding[];
}

export interface RoomStatePayload {
  serverNowMs: number;
  roomId: string;
  roomLabel: string;
  roomType: 'global' | 'private' | 'practice';
  circuitId: string;
  phase: RacePhase;
  raceStartAtMs: number | null;
  nextGlobalSlotAtMs: number;
  notice: string | null;
  participants: LiveParticipant[];
  lastAnnouncement: AnnouncedRaceResult | null;
  history: AnnouncedRaceResult[];
}

export interface AgenticServerEvent {
  type: 'agentic:status';
  status: 'holding' | 'engaged' | 'rejected' | 'disengaged' | 'cancelled';
  reason?: string;
  message: string;
}
