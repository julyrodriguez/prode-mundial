// src/lib/casinoHooks.ts
// Capa de conexión al backend "Vacas Locas" Casino.
// Exporta:
//   • Funciones httpsCallable para cada Cloud Function del casino.
//   • useBilletera(uid)       → saldo en tiempo real con auto-creación.
//   • useMesaRuleta(uid)      → estado de la mesa + apuesta activa del usuario.
//   • useMesaBlackjack(mesaId, uid) → estado de la mesa de BJ en tiempo real.

import { useEffect, useState, useCallback } from "react";
import { httpsCallable }                     from "firebase/functions";
import { doc, collection, onSnapshot }       from "firebase/firestore";
import { functions, db }                     from "./firebase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EstadoRuleta = "ESPERANDO" | "APOSTANDO" | "GIRANDO" | "PAGANDO" | null;

export interface MesaRuleta {
  estado:       EstadoRuleta;
  numeroGanador: number | null;
  timerFin?:     number;
  fichasGlobales?: Record<string, number>;
  ultimaRonda?: {
    numero:    number;
    ganadores: Array<{
      uid: string;
      gananciaBruta: number;
      premioNeto: number;
    }>;
    timestamp?: any;
  };
}

export interface FichaApuesta {
  key: string;
  tipo: string;
  numeros: number[];
  monto: number;
}

export interface ApuestaRuleta {
  fichas?: FichaApuesta[];
  tipo?:    string; // Legacy
  numeros?: number[]; // Legacy
  monto?:   number; // Legacy
  uid:     string;
  timestamp?: any;
}

export type EstadoBJ =
  | "ESPERANDO"
  | "REPARTIENDO"
  | "TURNO_JUGADORES"
  | "TURNO_CASA"
  | "FINALIZADO"
  | null;

export interface CartaBJ {
  palo:   string; // ♠ ♥ ♦ ♣
  valor:  string; // A 2..10 J Q K
}

export interface JugadorBJ {
  uid:      string;
  name?:    string;
  nombre?:  string;
  estado:   "SENTADO" | "JUGANDO" | "PLANTADO" | "PASADO" | "FINALIZADO";
  mano:     CartaBJ[];
  apuesta:  number;
  resultado?: "GANA" | "PIERDE" | "EMPATE" | "BLACKJACK" | null;
  pago?:    number | null;
}

export interface MesaBJ {
  estado:    EstadoBJ;
  jugadores: Record<string, JugadorBJ>;
  casa: {
    mano:      CartaBJ[];
    valor?:    number;
    cartaVista?: number;
  };
  turnoActual?: string | null;
  ordenTurnos?: string[];
  timerApuestasFin?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALLABLES — wrappers tipados sobre httpsCallable
// ═══════════════════════════════════════════════════════════════════════════════

/** Crea la billetera del usuario (si no existe) y devuelve el saldo inicial. */
export const crearBilletera = () =>
  httpsCallable(functions, "crearBilletera")() as Promise<{ data: { saldo: number } }>;

export const apostarRuleta = (payload: {
  monto?:    number;
  mesaId?:  string;
  esJacobo?: boolean;
  tipo?:    string;
  numeros?: number[];
  fichas?:  FichaApuesta[];
}) => httpsCallable(functions, "apostarRuleta")(payload);



/** Apostar en blackjack. */
export const apostarBj = (mesaId: "mesa_1" | "mesa_2", monto: number) =>
  httpsCallable(functions, "apostarBj")({ mesaId, monto });

/** Hit: pedir una carta más. */
export const pedirCartaBj = (mesaId: "mesa_1" | "mesa_2") =>
  httpsCallable(functions, "pedirCartaBj")({ mesaId });

/** Stand: plantarse. */
export const quedarseBj = (mesaId: "mesa_1" | "mesa_2") =>
  httpsCallable(functions, "quedarseBj")({ mesaId });

/** Levantarse de la mesa BJ. */
export const levantarseBj = (mesaId: "mesa_1" | "mesa_2") =>
  httpsCallable(functions, "levantarseBj")({ mesaId });

/** Reiniciar la mesa BJ (Nueva Mano). */
export const reiniciarMesaBj = (mesaId: "mesa_1" | "mesa_2") =>
  httpsCallable(functions, "reiniciarMesaBj")({ mesaId });

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK: useBilletera
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Escucha en tiempo real el saldo del usuario (Firestore onSnapshot).
 * Si el documento no existe, llama automáticamente a crearBilletera.
 *
 * OPTIMIZACIÓN: 1 sola lectura en tiempo real sobre un único doc. El listener
 * de Firestore usa el caché local y solo trae el delta cuando hay cambios.
 */
export function useBilletera(uid: string | null) {
  const [saldo,   setSaldo]   = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }

    const ref = doc(db, "billeteras", uid);

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          // Auto-crear billetera la primera vez (100 monedas de bienvenida)
          try {
            const res = await crearBilletera();
            setSaldo((res as any).data?.saldo ?? 100);
          } catch (e: any) {
            setError(e.message);
          }
        } else {
          setSaldo(snap.data().saldo ?? 0);
        }
        setLoading(false);
      },
      (e) => { setError(e.message); setLoading(false); }
    );

    return () => unsub();
  }, [uid]);

  return { saldo, loading, error };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK: useMesaRuleta
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Escucha en tiempo real:
 *   1. El documento casino/ruleta_1 (estado general de la mesa).
 *   2. La subcolección casino/ruleta_1/apuestas/{uid} (apuesta del usuario actual).
 *
 * OPTIMIZACIÓN: El usuario solo escucha SU propio documento de apuesta,
 * no toda la subcolección → 1 lectura en vez de N.
 */
export function useMesaRuleta(uid: string | null, mesaId: string = "ruleta_1") {
  const [mesa,   setMesa]    = useState<MesaRuleta | null>(null);
  const [apuesta, setApuesta] = useState<ApuestaRuleta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setMesa(null);
    setApuesta(null);

    // Listener 1: estado de la mesa
    const mesaUnsub = onSnapshot(
      doc(db, "casino", mesaId),
      (snap) => {
        if (snap.exists()) {
          setMesa(snap.data() as MesaRuleta);
        } else {
          setMesa(null);
        }
        setLoading(false);
      }
    );

    // Listener 2: apuesta del usuario actual (su propio doc en la subcolección)
    let apuestaUnsub: (() => void) | undefined;
    if (uid) {
      apuestaUnsub = onSnapshot(
        doc(db, "casino", mesaId, "apuestas", uid),
        (snap) => {
          setApuesta(snap.exists() ? (snap.data() as ApuestaRuleta) : null);
        }
      );
    }

    return () => {
      mesaUnsub();
      if (apuestaUnsub) apuestaUnsub();
    };
  }, [uid, mesaId]);

  return { mesa, apuesta, loading };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK: useMesaBlackjack
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Escucha en tiempo real el documento blackjack/{mesaId}.
 * Retorna también la info del jugador actual aislada del resto del mapa.
 */
export function useMesaBlackjack(mesaId: "mesa_1" | "mesa_2" | null, uid: string | null) {
  const [mesa,   setMesa]   = useState<MesaBJ | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mesaId) { setLoading(false); return; }

    const unsub = onSnapshot(
      doc(db, "blackjack", mesaId),
      (snap) => {
        setMesa(snap.exists() ? (snap.data() as MesaBJ) : null);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [mesaId]);

  // Extraer info del jugador actual sin re-render innecesario
  const miInfo: JugadorBJ | null = (uid && mesa?.jugadores?.[uid]) || null;
  const estoyEnMesa = !!miInfo;

  return { mesa, miInfo, estoyEnMesa, loading };
}
