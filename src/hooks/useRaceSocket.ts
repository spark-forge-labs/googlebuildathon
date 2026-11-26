import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgenticInputType } from '../game/raceSchedule';
import type { AgenticServerEvent, RoomStatePayload } from '../types/race';

export interface JoinRoomConfig {
  roomId: string;
  circuitId: string;
  name: string;
  locationName: string;
  locationCode: string;
  originLat: number;
  originLng: number;
  vehicleId: string;
}

interface UseRaceSocketReturn {
  connected: boolean;
  participantId: string | null;
  roomState: RoomStatePayload | null;
  serverTimeOffsetMs: number;
  lastAgenticEvent: AgenticServerEvent | null;
  joinRoom: (config: JoinRoomConfig) => void;
  selectCircuit: (circuitId: string) => void;
  setReady: (ready: boolean) => void;
  launchNow: () => void;
  finishNow: () => void;
  sendTelemetry: (data: {
    distanceMeters: number;
    speedKmh: number;
    lat: number;
    lng: number;
    heading: number;
    lap: number;
    agenticDecision?: string;
  }) => void;
  sendAgenticHoldStart: (inputType: AgenticInputType, isTrusted: boolean, pressure?: number) => void;
  sendAgenticHoldCancel: () => void;
  sendAgenticHoldCommit: (isTrusted: boolean, pressure?: number) => void;
  sendAgenticDisengage: () => void;
  clearAgenticEvent: () => void;
}

function getOrCreateClientId(): string {
  try {
    const existing = sessionStorage.getItem('svgp_client_id');
    if (existing) return existing;
    const next = `racer-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('svgp_client_id', next);
    return next;
  } catch {
    return `racer-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function useRaceSocket(): UseRaceSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(getOrCreateClientId());
  const pendingJoinRef = useRef<JoinRoomConfig | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [lastAgenticEvent, setLastAgenticEvent] = useState<AgenticServerEvent | null>(null);

  const sendRaw = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setConnected(true);
        if (pendingJoinRef.current) {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              clientId: clientIdRef.current,
              ...pendingJoinRef.current,
            })
          );
        }
      };

      ws.onmessage = (ev) => {
        if (unmounted) return;
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'room:joined') {
            setParticipantId(msg.participantId);
            if (typeof msg.serverNowMs === 'number') {
              setServerTimeOffsetMs(msg.serverNowMs - Date.now());
            }
          } else if (msg.type === 'room:state' && msg.payload) {
            const payload = msg.payload as RoomStatePayload;
            setRoomState(payload);
            setServerTimeOffsetMs(payload.serverNowMs - Date.now());
          } else if (msg.type === 'agentic:status') {
            setLastAgenticEvent(msg as AgenticServerEvent);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnected(false);
        reconnectTimerRef.current = window.setTimeout(connect, 1600);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    const initialTimer = window.setTimeout(connect, 20);

    return () => {
      unmounted = true;
      window.clearTimeout(initialTimer);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    };
  }, []);

  const joinRoom = useCallback(
    (config: JoinRoomConfig) => {
      pendingJoinRef.current = config;
      sendRaw({
        type: 'room:join',
        clientId: clientIdRef.current,
        ...config,
      });
    },
    [sendRaw]
  );

  const selectCircuit = useCallback(
    (circuitId: string) => {
      if (pendingJoinRef.current) {
        pendingJoinRef.current = { ...pendingJoinRef.current, circuitId };
      }
      sendRaw({ type: 'room:select_circuit', circuitId });
    },
    [sendRaw]
  );

  const setReady = useCallback(
    (ready: boolean) => {
      sendRaw({ type: 'room:ready', ready });
    },
    [sendRaw]
  );

  const launchNow = useCallback(() => {
    sendRaw({ type: 'room:launch_now' });
  }, [sendRaw]);

  const finishNow = useCallback(() => {
    sendRaw({ type: 'room:finish_now' });
  }, [sendRaw]);

  const sendTelemetry = useCallback(
    (data: {
      distanceMeters: number;
      speedKmh: number;
      lat: number;
      lng: number;
      heading: number;
      lap: number;
      agenticDecision?: string;
    }) => {
      sendRaw({ type: 'race:telemetry', ...data });
    },
    [sendRaw]
  );

  const sendAgenticHoldStart = useCallback(
    (inputType: AgenticInputType, isTrusted: boolean, pressure?: number) => {
      sendRaw({ type: 'agentic:hold_start', inputType, isTrusted, pressure });
    },
    [sendRaw]
  );

  const sendAgenticHoldCancel = useCallback(() => {
    sendRaw({ type: 'agentic:hold_cancel' });
  }, [sendRaw]);

  const sendAgenticHoldCommit = useCallback(
    (isTrusted: boolean, pressure?: number) => {
      sendRaw({ type: 'agentic:hold_commit', isTrusted, pressure });
    },
    [sendRaw]
  );

  const sendAgenticDisengage = useCallback(() => {
    sendRaw({ type: 'agentic:disengage' });
  }, [sendRaw]);

  const clearAgenticEvent = useCallback(() => {
    setLastAgenticEvent(null);
  }, []);

  return {
    connected,
    participantId,
    roomState,
    serverTimeOffsetMs,
    lastAgenticEvent,
    joinRoom,
    selectCircuit,
    setReady,
    launchNow,
    finishNow,
    sendTelemetry,
    sendAgenticHoldStart,
    sendAgenticHoldCancel,
    sendAgenticHoldCommit,
    sendAgenticDisengage,
    clearAgenticEvent,
  };
}
