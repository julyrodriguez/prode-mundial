// src/lib/truco.ts — Custom Hook: usePartidaTruco
// Escucha en tiempo real el estado de una partida de Truco y provee acciones del jugador.
// Usa Firebase Cloud Functions (httpsCallable) en lugar de axios/Vercel.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from './firebase';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CartaTruco {
  id: string;
  numero: number;
  palo: 'espada' | 'basto' | 'copa' | 'oro';
  valorTruco: number;
  valorEnvido: number;
}

export interface JugadorPartida {
  uid: string;
  nombre: string;
  puntos: number;
  mano: CartaTruco[];
  envidoValor: number;
  ultimaActividad?: any;
}


export interface Baza {
  cartaA: CartaTruco;
  cartaB: CartaTruco;
  ganador: string;
}

export interface EstadoEnvido {
  estado: 'DISPONIBLE' | 'CANTADO' | 'ACEPTADO' | 'RECHAZADO' | 'RESUELTO';
  nivel: number;
  puntosEnJuego: number;
  cantadoPor: string | null;
  historial: Array<{ canto: string; por: string; respuesta?: string }>;
}

export interface EstadoTruco {
  estado: 'DISPONIBLE' | 'CANTADO' | 'ACEPTADO' | 'RECHAZADO';
  nivel: number;
  puntosEnJuego: number;
  cantadoPor: string | null;
  historial: Array<{ canto: string; por: string; respuesta?: string }>;
}

export interface PartidaTrucoData {
  estado: 'PENDIENTE_ACEPTACION' | 'EN_CURSO' | 'FINALIZADA' | 'ABANDONADA' | 'RECHAZADA' | 'CANCELADA';
  creadaEn: string;
  actualizadaEn: string;
  jugadores: { [uid: string]: JugadorPartida };
  jugadorA: string;
  jugadorB: string;
  ronda: {
    numero: number;
    mano: string;
    turno: string;
    bazas: Baza[];
    cartasEnMesa: { [uid: string]: CartaTruco | null };
    bazasGanadas: { [uid: string]: number };
  };
  cantos: {
    cantoActivo: string | null;
    cantadoPor: string | null;
    esperandoRespuesta: boolean;
    respondePor: string | null;
    envido: EstadoEnvido;
    truco: EstadoTruco;
  };
  puntosParaGanar: number;
  ganador?: string;
  ultimaBaza?: {
    cartaA: CartaTruco;
    cartaB: CartaTruco;
    ganador: string;
    id: string;
  };
}

export type AccionTruco =
  | 'TIRAR_CARTA'
  | 'ENVIDO'
  | 'REAL_ENVIDO'
  | 'FALTA_ENVIDO'
  | 'TRUCO'
  | 'RE_TRUCO'
  | 'VALE_CUATRO'
  | 'QUIERO'
  | 'NO_QUIERO'
  | 'MAZO'
  | 'TIEMPO_AGOTADO'
  | 'ABANDONAR_PARTIDA'
  | 'HEARTBEAT'
  | 'RECLAMAR_DESCONEXION';

// ─── Callable Functions (tipadas) ────────────────────────────────────────────

const callIniciarPartida = httpsCallable<
  { oponenteId: string },
  { partidaId: string; mano: string; mensaje: string }
>(functions, 'iniciarPartidaTruco');

const callTrucoAccion = httpsCallable<
  { partidaId: string; accion: string; payload?: Record<string, any> },
  { ok: boolean; mensaje: string }
>(functions, 'trucoAccion');

// ─── Hook principal ──────────────────────────────────────────────────────────

export function usePartidaTruco(partidaId: string | null) {
  const [partida, setPartida] = useState<PartidaTrucoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const miUid = auth.currentUser?.uid || '';

  // ─── Suscripción en tiempo real con onSnapshot ────────────────────────────
  useEffect(() => {
    if (!partidaId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const ref = doc(db, 'truco_partidas', partidaId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PartidaTrucoData;
          // ⚠️ Sanitizar: quitar campos secretos que no deberían llegar al cliente
          const { _mazoRestante, _mazoCompleto, ...cleanData } = data as any;

          // Ocultar la mano del oponente (solo ver las propias cartas)
          if (cleanData.jugadores && miUid) {
            for (const uid of Object.keys(cleanData.jugadores)) {
              if (uid !== miUid) {
                const cartasOponente = cleanData.jugadores[uid].mano?.length || 0;
                cleanData.jugadores[uid].mano = Array(cartasOponente).fill({
                  id: 'oculta', numero: 0, palo: 'dorso', valorTruco: 0, valorEnvido: 0,
                });
                cleanData.jugadores[uid].envidoValor = -1;
              }
            }
          }

          setPartida(cleanData);
        } else {
          setError('Partida no encontrada.');
          setPartida(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[usePartidaTruco] onSnapshot error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [partidaId, miUid]);

  // ─── Ejecutar acción via Cloud Function ───────────────────────────────────

  const ejecutarAccion = useCallback(
    async (accion: AccionTruco, payload?: Record<string, any>, options?: { silent?: boolean }) => {
      if (!partidaId || !miUid) return;

      if (!options?.silent) setActionLoading(true);
      try {
        const result = await callTrucoAccion({ partidaId, accion, payload });
        return result.data;
      } catch (err: any) {
        const msg = err.message || 'Error desconocido';
        // NUNCA hacer setError aquí — eso desmonta el tablero.
        // Solo tirar el error para que handleAccion lo muestre como toast.
        throw new Error(msg);
      } finally {
        if (!options?.silent) setActionLoading(false);
      }
    },
    [partidaId, miUid]
  );

  // ─── Acciones derivadas (atajos) ──────────────────────────────────────────

  const tirarCarta = useCallback(
    (cartaId: string) => ejecutarAccion('TIRAR_CARTA', { cartaId }),
    [ejecutarAccion]
  );

  const cantarEnvido = useCallback(
    () => ejecutarAccion('ENVIDO'),
    [ejecutarAccion]
  );

  const cantarRealEnvido = useCallback(
    () => ejecutarAccion('REAL_ENVIDO'),
    [ejecutarAccion]
  );

  const cantarFaltaEnvido = useCallback(
    () => ejecutarAccion('FALTA_ENVIDO'),
    [ejecutarAccion]
  );

  const cantarTruco = useCallback(
    () => ejecutarAccion('TRUCO'),
    [ejecutarAccion]
  );

  const cantarReTruco = useCallback(
    () => ejecutarAccion('RE_TRUCO'),
    [ejecutarAccion]
  );

  const cantarValeCuatro = useCallback(
    () => ejecutarAccion('VALE_CUATRO'),
    [ejecutarAccion]
  );

  const quiero = useCallback(
    () => ejecutarAccion('QUIERO'),
    [ejecutarAccion]
  );

  const noQuiero = useCallback(
    () => ejecutarAccion('NO_QUIERO'),
    [ejecutarAccion]
  );

  const irseAlMazo = useCallback(
    () => ejecutarAccion('MAZO'),
    [ejecutarAccion]
  );

  const abandonarPartida = useCallback(
    () => ejecutarAccion('ABANDONAR_PARTIDA'),
    [ejecutarAccion]
  );

  // ─── Heartbeat y Desconexiones ───
  useEffect(() => {
    if (!partida || partida.estado !== 'EN_CURSO') return;

    // Enviar heartbeat cada 5 segundos de forma silenciosa
    const heartbeatInterval = setInterval(() => {
      ejecutarAccion('HEARTBEAT', undefined, { silent: true }).catch(() => { });
    }, 30000);

    // Verificar desconexión del rival cada 5 segundos
    const oponenteUid = partida.jugadorA === miUid ? partida.jugadorB : partida.jugadorA;
    const disconnectCheck = setInterval(() => {
      const oponenteData = partida.jugadores[oponenteUid];
      // Si tenemos ultimaActividad registrada
      if (oponenteData && oponenteData.ultimaActividad) {
        // En cliente, serverTimestamp se convierte a veces en Timestamp que tiene .toMillis() 
        // o si es FieldValue aún, esperamos hasta que Firestore lo resuelva.
        const ts = oponenteData.ultimaActividad as any;
        const ultimaAct = typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();

        const ahora = Date.now();
        const diffSegundos = (ahora - ultimaAct) / 1000;

        if (diffSegundos > 60) {
          // Detectamos desconexión (más de 15 segundos)
          ejecutarAccion('RECLAMAR_DESCONEXION').catch(() => { });
        }
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(disconnectCheck);
    };
  }, [partida?.estado, partida?.ronda?.turno, miUid, ejecutarAccion]);

  // ─── Estado computado ─────────────────────────────────────────────────────

  const esMiTurno = useMemo(() => {
    if (!partida || !miUid) return false;
    return partida.ronda.turno === miUid;
  }, [partida, miUid]);

  const deboResponder = useMemo(() => {
    if (!partida || !miUid) return false;
    return partida.cantos.esperandoRespuesta && partida.cantos.respondePor === miUid;
  }, [partida, miUid]);

  const miMano = useMemo(() => {
    if (!partida || !miUid) return [];
    return partida.jugadores[miUid]?.mano || [];
  }, [partida, miUid]);

  const oponenteUid = useMemo(() => {
    if (!partida || !miUid) return '';
    return partida.jugadorA === miUid ? partida.jugadorB : partida.jugadorA;
  }, [partida, miUid]);

  const misPuntos = useMemo(() => {
    if (!partida || !miUid) return 0;
    return partida.jugadores[miUid]?.puntos || 0;
  }, [partida, miUid]);

  const puntosOponente = useMemo(() => {
    if (!partida || !oponenteUid) return 0;
    return partida.jugadores[oponenteUid]?.puntos || 0;
  }, [partida, oponenteUid]);

  const puedeEnvido = useMemo(() => {
    if (!partida || !esMiTurno) return false;
    return (
      partida.ronda.bazas.length === 0 &&
      partida.cantos.envido.estado === 'DISPONIBLE' &&
      !partida.cantos.esperandoRespuesta
    );
  }, [partida, esMiTurno]);

  const puedeTruco = useMemo(() => {
    if (!partida || !esMiTurno) return false;
    return (
      partida.cantos.truco.nivel === 0 &&
      partida.cantos.truco.estado === 'DISPONIBLE' &&
      !partida.cantos.esperandoRespuesta
    );
  }, [partida, esMiTurno]);

  const puedeReTruco = useMemo(() => {
    if (!partida || !miUid) return false;
    return (
      partida.cantos.truco.nivel === 1 &&
      partida.cantos.truco.estado === 'ACEPTADO' &&
      partida.cantos.truco.cantadoPor !== miUid
    );
  }, [partida, miUid]);

  const puedeValeCuatro = useMemo(() => {
    if (!partida || !miUid) return false;
    return (
      partida.cantos.truco.nivel === 2 &&
      partida.cantos.truco.estado === 'ACEPTADO' &&
      partida.cantos.truco.cantadoPor !== miUid
    );
  }, [partida, miUid]);

  // ─── Escalada de Envido (recantar como respuesta) ─────────────────────────

  const puedeReplicarEnvido = useMemo(() => {
    if (!partida || !deboResponder) return false;
    const ca = partida.cantos.cantoActivo;
    return ca === 'ENVIDO' && partida.cantos.envido.nivel <= 1;
  }, [partida, deboResponder]);

  const puedeReplicarRealEnvido = useMemo(() => {
    if (!partida || !deboResponder) return false;
    const ca = partida.cantos.cantoActivo;
    return ['ENVIDO'].includes(ca || '') && partida.cantos.envido.nivel < 3;
  }, [partida, deboResponder]);

  const puedeReplicarFaltaEnvido = useMemo(() => {
    if (!partida || !deboResponder) return false;
    const ca = partida.cantos.cantoActivo;
    return ['ENVIDO', 'REAL_ENVIDO'].includes(ca || '') && partida.cantos.envido.nivel < 4;
  }, [partida, deboResponder]);

  // ─── Escalada de Truco (recantar como respuesta) ─────────────────────────

  const puedeReplicarReTruco = useMemo(() => {
    if (!partida || !deboResponder) return false;
    // Responder a TRUCO con RE_TRUCO: nivel actual es 1, el canto activo es TRUCO y lo cantó el otro
    return (
      partida.cantos.truco.nivel === 1 &&
      partida.cantos.truco.estado === 'CANTADO' &&
      partida.cantos.truco.cantadoPor !== miUid
    );
  }, [partida, deboResponder, miUid]);

  const puedeReplicarValeCuatro = useMemo(() => {
    if (!partida || !deboResponder) return false;
    // Responder a RE_TRUCO con VALE_CUATRO: nivel actual es 2, lo cantó el otro
    return (
      partida.cantos.truco.nivel === 2 &&
      partida.cantos.truco.estado === 'CANTADO' &&
      partida.cantos.truco.cantadoPor !== miUid
    );
  }, [partida, deboResponder, miUid]);

  return {
    // Estado
    partida,
    loading,
    error,
    actionLoading,

    // Datos computados
    miUid,
    oponenteUid,
    esMiTurno,
    deboResponder,
    miMano,
    misPuntos,
    puntosOponente,
    puedeEnvido,
    puedeTruco,
    puedeReTruco,
    puedeValeCuatro,
    puedeReplicarEnvido,
    puedeReplicarRealEnvido,
    puedeReplicarFaltaEnvido,
    puedeReplicarReTruco,
    puedeReplicarValeCuatro,

    // Acciones
    tirarCarta,
    cantarEnvido,
    cantarRealEnvido,
    cantarFaltaEnvido,
    cantarTruco,
    cantarReTruco,
    cantarValeCuatro,
    quiero,
    noQuiero,
    irseAlMazo,
    abandonarPartida,

    // Computados
    ejecutarAccion,
  };
}

// ─── Helper: Iniciar nueva partida via Cloud Function ────────────────────────

export async function iniciarPartidaTruco(jugadorBId: string): Promise<{ partidaId: string }> {
  if (!auth.currentUser) throw new Error('No estás logueado.');

  const result = await callIniciarPartida({ oponenteId: jugadorBId });
  return { partidaId: result.data.partidaId };
}

// ─── Helper: Aceptar o Rechazar desafío via Cloud Function ───────────────────

export async function responderDesafioTruco(
  partidaId: string,
  aceptar: boolean
): Promise<{ ok: boolean; mensaje: string }> {
  if (!auth.currentUser) throw new Error('No estás logueado.');

  const result = await callTrucoAccion({
    partidaId,
    accion: aceptar ? 'ACEPTAR_DESAFIO' : 'RECHAZAR_DESAFIO',
  });

  return result.data;
}
