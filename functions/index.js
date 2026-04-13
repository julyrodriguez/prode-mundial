// Firebase Cloud Functions v2 — Backend del Truco Argentino + Casino "Vacas Locas"
// Reemplaza las Vercel API Routes con Callable Functions (onCall).
// Usa firebase-admin para operar Firestore con privilegios de servidor.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

// ─── Inicializar Firebase Admin ──────────────────────────────────────────────
initializeApp();
const db = getFirestore();

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DEL MAZO ESPAÑOL (40 cartas)
// ═══════════════════════════════════════════════════════════════════════════════

const PALOS = ["espada", "basto", "copa", "oro"];
const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]; // 10=sota, 11=caballo, 12=rey

function valorEnvido(numero) {
  return numero >= 10 ? 0 : numero;
}

function valorTruco(numero, palo) {
  if (numero === 1 && palo === "espada") return 14;
  if (numero === 1 && palo === "basto") return 13;
  if (numero === 7 && palo === "espada") return 12;
  if (numero === 7 && palo === "oro") return 11;
  if (numero === 3) return 10;
  if (numero === 2) return 9;
  if (numero === 1) return 8;
  if (numero === 12) return 7;
  if (numero === 11) return 6;
  if (numero === 10) return 5;
  if (numero === 7) return 4;
  if (numero === 6) return 3;
  if (numero === 5) return 2;
  if (numero === 4) return 1;
  return 0;
}

/** Fisher-Yates shuffle con crypto.randomBytes (seguro, server-side). */
function barajar(arr) {
  const mazo = [...arr];
  for (let i = mazo.length - 1; i > 0; i--) {
    const buf = crypto.randomBytes(4);
    const j = buf.readUInt32BE(0) % (i + 1);
    [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
  }
  return mazo;
}

function generarMazo() {
  const cartas = [];
  for (const palo of PALOS) {
    for (const num of NUMEROS) {
      cartas.push({
        id: `${num}_${palo}`,
        numero: num,
        palo,
        valorTruco: valorTruco(num, palo),
        valorEnvido: valorEnvido(num),
      });
    }
  }
  return cartas;
}

function calcularEnvido(mano) {
  const porPalo = {};
  for (const c of mano) {
    if (!porPalo[c.palo]) porPalo[c.palo] = [];
    porPalo[c.palo].push(c.valorEnvido);
  }
  let max = 0;
  for (const palo in porPalo) {
    const vals = porPalo[palo].sort((a, b) => b - a);
    if (vals.length >= 2) max = Math.max(max, 20 + vals[0] + vals[1]);
    if (vals.length >= 1) max = Math.max(max, vals[0]);
  }
  return max;
}

function getOponente(partida, jugadorId) {
  return partida.jugadorA === jugadorId ? partida.jugadorB : partida.jugadorA;
}

function resolverBaza(cartaA, cartaB, jugadorA, jugadorB) {
  if (cartaA.valorTruco > cartaB.valorTruco) return jugadorA;
  if (cartaB.valorTruco > cartaA.valorTruco) return jugadorB;
  return "PARDA";
}

function determinarGanadorRonda(bazas, mano) {
  const ganadores = bazas.map((b) => b.ganador);
  const cuentas = {};
  for (const g of ganadores) cuentas[g] = (cuentas[g] || 0) + 1;

  // 1. Si alguien ganó 2 bazas limpias (ej: ganó la 1ra y la 2da)
  for (const [jugador, count] of Object.entries(cuentas)) {
    if (jugador !== "PARDA" && count >= 2) return jugador;
  }

  // 2. EL BUGFIX: Si recién se jugó UNA sola baza, nadie puede ganar la ronda todavía.
  // Hay que esperar a que jueguen la segunda carta.
  if (ganadores.length === 1) return null;

  // 3. REGLAS DE LA PARDA
  // Caso A: La primera carta fue parda
  if (ganadores[0] === "PARDA") {
    // Si ya jugaron la 2da y alguien la ganó, gana la ronda
    if (ganadores.length >= 2 && ganadores[1] !== "PARDA") return ganadores[1];

    // Si la 2da también fue parda, y alguien ganó la 3ra, gana la ronda
    if (ganadores.length === 3 && ganadores[2] !== "PARDA") return ganadores[2];

    // Si las tres cartas fueron pardas (ej: 3vs3, 2vs2, 11vs11), el ganador es el "mano"
    if (ganadores.length === 3) return mano;

    // Si van 2 cartas y ambas son pardas, todavía falta jugar la 3ra
    return null;
  }

  // Caso B: La 1ra tuvo un ganador, pero la 2da fue parda. (Gana el que hizo la primera)
  if (ganadores.length >= 2 && ganadores[1] === "PARDA") {
    return ganadores[0];
  }

  // Caso C: Empate en la tercera. (La 1ra la ganó uno, la 2da otro, y empatan la 3ra).
  // La regla general del Truco dice que ante parda en la 3ra, gana el que hizo la 1ra.
  if (ganadores.length === 3 && ganadores[2] === "PARDA") {
    return ganadores[0];
  }

  return null;
}

function nuevaRonda(partida) {
  const mazo = barajar(generarMazo());
  const manoA = mazo.slice(0, 3);
  const manoB = mazo.slice(3, 6);
  const nuevaMano =
    partida.ronda.mano === partida.jugadorA
      ? partida.jugadorB
      : partida.jugadorA;
  return {
    manoA,
    manoB,
    nuevaMano,
    envidoA: calcularEnvido(manoA),
    envidoB: calcularEnvido(manoB),
    mazoRestante: mazo.slice(6),
  };
}

// ─── Guardar historial (con set/merge + increment, auto-crea documentos) ────────
async function guardarHistorial(partida, ganadorId) {
  try {
    const perdedorId = getOponente(partida, ganadorId);
    const ahora = new Date().toISOString();

    const registroBase = {
      partidaId: partida.partidaId || "unknown",
      fecha: ahora,
    };

    // Ganador
    await db.collection("truco_historial").doc(ganadorId).set({
      uid: ganadorId,
      nombre: partida.jugadores[ganadorId].nombre,
      ganadas: FieldValue.increment(1),
      ultimaPartida: ahora,
      partidas: FieldValue.arrayUnion({
        ...registroBase,
        resultado: "GANADA",
        puntosAFavor: partida.jugadores[ganadorId].puntos,
        puntosEnContra: partida.jugadores[perdedorId].puntos,
        rivalId: perdedorId,
        rivalNombre: partida.jugadores[perdedorId].nombre,
      }),
    }, { merge: true });

    // Perdedor
    await db.collection("truco_historial").doc(perdedorId).set({
      uid: perdedorId,
      nombre: partida.jugadores[perdedorId].nombre,
      perdidas: FieldValue.increment(1),
      ultimaPartida: ahora,
      partidas: FieldValue.arrayUnion({
        ...registroBase,
        resultado: "PERDIDA",
        puntosAFavor: partida.jugadores[perdedorId].puntos,
        puntosEnContra: partida.jugadores[ganadorId].puntos,
        rivalId: ganadorId,
        rivalNombre: partida.jugadores[ganadorId].nombre,
      }),
    }, { merge: true });

    // ─── 2. Actualizar documento ÚNICO de stats (truco_system/players) ────────
    try {
      const playersRef = db.collection("truco_system").doc("players");
      const playersSnap = await playersRef.get();
      const playersData = playersSnap.exists ? (playersSnap.data().players || {}) : {};

      const ganadorActual = playersData[ganadorId] || {
        uid: ganadorId,
        name: partida.jugadores[ganadorId].nombre,
        ganadas: 0,
        perdidas: 0,
      };
      const perdedorActual = playersData[perdedorId] || {
        uid: perdedorId,
        name: partida.jugadores[perdedorId].nombre,
        ganadas: 0,
        perdidas: 0,
      };

      await playersRef.set({
        players: {
          [ganadorId]: {
            ...ganadorActual,
            ganadas: (ganadorActual.ganadas || 0) + 1,
            lastSeen: ahora,
          },
          [perdedorId]: {
            ...perdedorActual,
            perdidas: (perdedorActual.perdidas || 0) + 1,
            lastSeen: ahora,
          },
        }
      }, { merge: true });
    } catch (e) {
      console.warn('[guardarHistorial] Error actualizando truco_system/players:', e.message);
    }

    // ─── 3. Actualizar documento ÚNICO del Historial Global (truco_system/global_history)
    try {
      const globalHistRef = db.collection("truco_system").doc("global_history");
      const globalHistSnap = await globalHistRef.get();
      let historyList = globalHistSnap.exists ? (globalHistSnap.data().partidas || []) : [];

      const abstractPartida = {
        id: partida.partidaId || 'unknown',
        estado: 'FINALIZADA',
        jugadorA: partida.jugadorA,
        jugadorB: partida.jugadorB,
        jugadores: partida.jugadores,
        actualizadaEn: ahora, // Guardamos la fecha ISO para ordenarla en el frontend
      };

      historyList.unshift(abstractPartida);
      if (historyList.length > 50) historyList = historyList.slice(0, 50);

      await globalHistRef.set({ partidas: historyList }, { merge: true });
    } catch (e) {
      console.warn('[guardarHistorial] Error actualizando truco_system/global_history:', e.message);
    }

    console.log(`[TRUCO 📊] Historial guardado y stats actualizadas: ${ganadorId} ganó vs ${perdedorId}`);
  } catch (err) {
    console.error("[TRUCO ❌] Error guardando historial:", err);
    // No relanzar — no queremos que un error de historial rompa la partida
  }
}
// ─── Generar reset de ronda (DRY helper) ─────────────────────────────────────
function generarResetRonda(partida) {
  const nr = nuevaRonda(partida);
  return {
    [`jugadores.${partida.jugadorA}.mano`]: nr.manoA,
    [`jugadores.${partida.jugadorB}.mano`]: nr.manoB,
    [`jugadores.${partida.jugadorA}.envidoValor`]: nr.envidoA,
    [`jugadores.${partida.jugadorB}.envidoValor`]: nr.envidoB,
    "ronda.numero": partida.ronda.numero + 1,
    "ronda.mano": nr.nuevaMano,
    "ronda.turno": nr.nuevaMano,
    "ronda.bazas": [],
    "ronda.bazasGanadas": {
      [partida.jugadorA]: 0,
      [partida.jugadorB]: 0,
    },
    "ronda.cartasEnMesa": {
      [partida.jugadorA]: null,
      [partida.jugadorB]: null,
    },
    "cantos": {
      cantoActivo: null,
      cantadoPor: null,
      esperandoRespuesta: false,
      respondePor: null,
      envido: { estado: "DISPONIBLE", nivel: 0, puntosEnJuego: 0, cantadoPor: null, historial: [] },
      truco: { estado: "DISPONIBLE", nivel: 0, puntosEnJuego: 1, cantadoPor: null, historial: [] },
    },
    "_mazoRestante": nr.mazoRestante,
  };
}

// ─── Verificar si alguien llegó al límite de puntos y finalizar ──────────────
async function verificarYFinalizar(partida, updates, ganadorId, nuevosPuntos) {
  if (nuevosPuntos >= partida.puntosParaGanar) {
    updates["estado"] = "FINALIZADA";
    updates["ganador"] = ganadorId;
    updates[`jugadores.${ganadorId}.puntos`] = nuevosPuntos;

    const ph = { ...partida, partidaId: partida.partidaId };
    ph.jugadores = { ...partida.jugadores };
    ph.jugadores[ganadorId] = { ...partida.jugadores[ganadorId], puntos: nuevosPuntos };
    await guardarHistorial(ph, ganadorId);
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN 1: iniciarPartidaTruco (onCall)
// El frontend llama: httpsCallable(functions, 'iniciarPartidaTruco')({ oponenteId })
// ═══════════════════════════════════════════════════════════════════════════════

exports.iniciarPartidaTruco = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    // ─── Validar autenticación ───────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Tenés que estar logueado.");
    }

    const jugadorA = request.auth.uid;
    const jugadorB = request.data.oponenteId;

    if (!jugadorB) {
      throw new HttpsError(
        "invalid-argument",
        "Se requiere oponenteId."
      );
    }

    if (jugadorA === jugadorB) {
      throw new HttpsError(
        "invalid-argument",
        "No podés jugar contra vos mismo, crack."
      );
    }

    // 1. Obtener nombres
    const [snapA, snapB] = await Promise.all([
      db.collection("users").doc(jugadorA).get(),
      db.collection("users").doc(jugadorB).get(),
    ]);

    const nombreA = snapA.exists ? snapA.data().name : "Jugador A";
    const nombreB = snapB.exists ? snapB.data().name : "Jugador B";

    // 2. Crear y barajar el mazo
    const mazoBarajado = barajar(generarMazo());

    // 3. Repartir 3 cartas
    const manoA = mazoBarajado.slice(0, 3);
    const manoB = mazoBarajado.slice(3, 6);
    const mazoRestante = mazoBarajado.slice(6);

    // 4. Envido precalculado
    const envidoA = calcularEnvido(manoA);
    const envidoB = calcularEnvido(manoB);

    // 5. Mano inicial aleatoria
    const manoInicial = Math.random() < 0.5 ? jugadorA : jugadorB;

    // 6. Estado inicial
    const ahora = new Date().toISOString();
    const partidaData = {
      estado: "PENDIENTE_ACEPTACION",
      creadaEn: ahora,
      actualizadaEn: ahora,

      jugadores: {
        [jugadorA]: {
          uid: jugadorA,
          nombre: nombreA,
          puntos: 0,
          mano: manoA,
          envidoValor: envidoA,
        },
        [jugadorB]: {
          uid: jugadorB,
          nombre: nombreB,
          puntos: 0,
          mano: manoB,
          envidoValor: envidoB,
        },
      },
      jugadorA,
      jugadorB,

      ronda: {
        numero: 1,
        mano: manoInicial,
        turno: manoInicial,
        bazas: [],
        cartasEnMesa: { [jugadorA]: null, [jugadorB]: null },
        bazasGanadas: { [jugadorA]: 0, [jugadorB]: 0 },
      },

      cantos: {
        cantoActivo: null,
        cantadoPor: null,
        esperandoRespuesta: false,
        respondePor: null,
        envido: {
          estado: "DISPONIBLE",
          nivel: 0,
          puntosEnJuego: 0,
          cantadoPor: null,
          historial: [],
        },
        truco: {
          estado: "DISPONIBLE",
          nivel: 0,
          puntosEnJuego: 1,
          cantadoPor: null,
          historial: [],
        },
      },

      florHabilitada: false,
      puntosParaGanar: 30,
      tipoPartida: "1v1",

      _mazoRestante: mazoRestante,
      _mazoCompleto: mazoBarajado,
    };

    // 7. Guardar en Firestore
    const partidaRef = await db
      .collection("truco_partidas")
      .add(partidaData);

    console.log(
      `[TRUCO ♠️] Partida creada: ${partidaRef.id} | ${nombreA} vs ${nombreB}`
    );

    // 8. Retornar al frontend (SIN datos secretos)
    return {
      partidaId: partidaRef.id,
      mano: manoInicial,
      mensaje: `🃏 ¡Partida creada! ${nombreA} vs ${nombreB}.`,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN 2: trucoAccion (onCall)
// Procesa TODAS las acciones del juego.
// El frontend llama: httpsCallable(functions, 'trucoAccion')({ partidaId, accion, payload })
// ═══════════════════════════════════════════════════════════════════════════════

exports.trucoAccion = onCall(
  { region: "southamerica-east1", maxInstances: 20 },
  async (request) => {
    // ─── Validar autenticación ───────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Tenés que estar logueado.");
    }

    const jugadorId = request.auth.uid;
    const { partidaId, accion, payload } = request.data;

    if (!partidaId || !accion) {
      throw new HttpsError(
        "invalid-argument",
        "Se requieren partidaId y accion."
      );
    }

    // Leer partida
    const partidaRef = db.collection("truco_partidas").doc(partidaId);
    const snap = await partidaRef.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Partida no encontrada.");
    }

    const partida = { ...snap.data(), partidaId };

    // Verificar que es jugador válido
    if (jugadorId !== partida.jugadorA && jugadorId !== partida.jugadorB) {
      throw new HttpsError(
        "permission-denied",
        "No sos jugador de esta partida."
      );
    }

    // ═════════════════════════════════════════════════════════════════════
    // ACCIONES DE DESAFÍO (funcionan con estado PENDIENTE_ACEPTACION)
    // Se procesan ANTES del guard de EN_CURSO
    // ═════════════════════════════════════════════════════════════════════

    if (accion === "ACEPTAR_DESAFIO") {
      if (partida.estado !== "PENDIENTE_ACEPTACION") {
        throw new HttpsError(
          "failed-precondition",
          "Esta partida no está pendiente de aceptación."
        );
      }
      if (jugadorId !== partida.jugadorB) {
        throw new HttpsError(
          "permission-denied",
          "Solo el jugador desafiado puede aceptar."
        );
      }

      // FIJATE QUE ACÁ YA NO ESTÁ EL "if (mensaje)"

      await partidaRef.update({
        estado: "EN_CURSO",
        actualizadaEn: new Date().toISOString(),
      });

      console.log(`[TRUCO ✅] Desafío aceptado: ${partidaId} por ${jugadorId}`);
      return {
        ok: true,
        mensaje: `✅ ¡${partida.jugadores[jugadorId].nombre} aceptó el desafío!`,
      };
    }

    if (accion === "RECHAZAR_DESAFIO") {
      if (partida.estado !== "PENDIENTE_ACEPTACION") {
        throw new HttpsError(
          "failed-precondition",
          "Esta partida no está pendiente de aceptación."
        );
      }
      if (jugadorId !== partida.jugadorB) {
        throw new HttpsError(
          "permission-denied",
          "Solo el jugador desafiado puede rechazar."
        );
      }

      await partidaRef.update({
        estado: "RECHAZADA",
        actualizadaEn: new Date().toISOString(),
      });

      console.log(`[TRUCO ❌] Desafío rechazado: ${partidaId} por ${jugadorId}`);
      return {
        ok: true,
        mensaje: `❌ ${partida.jugadores[jugadorId].nombre} rechazó el desafío.`,
      };
    }

    // ═════════════════════════════════════════════════════════════════════
    // GUARD: A partir de acá solo acciones de juego (requiere EN_CURSO)
    // ═════════════════════════════════════════════════════════════════════

    if (partida.estado !== "EN_CURSO") {
      throw new HttpsError("failed-precondition", "La partida no está en curso.");
    }

    const oponente = getOponente(partida, jugadorId);
    // Registramos la actividad en CUALQUIER acción válida que haga el jugador
    let updates = {
      actualizadaEn: new Date().toISOString(),
      [`jugadores.${jugadorId}.ultimaActividad`]: FieldValue.serverTimestamp()
    };
    let mensaje = "";

    switch (accion) {
      // ═════════════════════════════════════════════════════════════════════
      // TIRAR CARTA
      // ═════════════════════════════════════════════════════════════════════
      case "TIRAR_CARTA": {
        if (partida.ronda.turno !== jugadorId) {
          throw new HttpsError("failed-precondition", "No es tu turno.");
        }
        if (partida.cantos.esperandoRespuesta) {
          throw new HttpsError(
            "failed-precondition",
            "Hay un canto pendiente de respuesta."
          );
        }

        const cartaId = payload?.cartaId;
        if (!cartaId) {
          throw new HttpsError("invalid-argument", "Falta cartaId.");
        }

        const mano = partida.jugadores[jugadorId].mano;
        const cartaIdx = mano.findIndex((c) => c.id === cartaId);
        if (cartaIdx === -1) {
          throw new HttpsError(
            "invalid-argument",
            "Esa carta no está en tu mano."
          );
        }

        const carta = mano[cartaIdx];
        const nuevaMano = mano.filter((_, i) => i !== cartaIdx);
        const cartasEnMesa = { ...partida.ronda.cartasEnMesa };
        cartasEnMesa[jugadorId] = carta;

        updates[`jugadores.${jugadorId}.mano`] = nuevaMano;
        updates["ronda.cartasEnMesa"] = cartasEnMesa;

        if (cartasEnMesa[oponente]) {
          const ganadorBaza = resolverBaza(
            cartasEnMesa[partida.jugadorA],
            cartasEnMesa[partida.jugadorB],
            partida.jugadorA,
            partida.jugadorB
          );
          const nuevaBaza = {
            cartaA: cartasEnMesa[partida.jugadorA],
            cartaB: cartasEnMesa[partida.jugadorB],
            ganador: ganadorBaza,
          };
          const bazas = [...partida.ronda.bazas, nuevaBaza];
          const bazasGanadas = { ...partida.ronda.bazasGanadas };

          // 👇 AGREGAR ESTA LÍNEA 👇 
          // Guardamos "la foto" de la jugada para que el frontend la pause 3 segundos
          updates["ultimaBaza"] = { ...nuevaBaza, id: Date.now().toString() };
          if (ganadorBaza !== "PARDA") {
            bazasGanadas[ganadorBaza] =
              (bazasGanadas[ganadorBaza] || 0) + 1;
          }

          updates["ronda.bazas"] = bazas;
          updates["ronda.bazasGanadas"] = bazasGanadas;
          updates["ronda.cartasEnMesa"] = {
            [partida.jugadorA]: null,
            [partida.jugadorB]: null,
          };

          const ganadorRonda = determinarGanadorRonda(
            bazas,
            partida.ronda.mano
          );

          if (ganadorRonda) {
            const puntosGanados = partida.cantos.truco.puntosEnJuego;
            const nuevosPuntos =
              partida.jugadores[ganadorRonda].puntos + puntosGanados;
            updates[`jugadores.${ganadorRonda}.puntos`] = nuevosPuntos;

            const finalizo = await verificarYFinalizar(partida, updates, ganadorRonda, nuevosPuntos);
            if (finalizo) {
              mensaje = `🏆 ¡${partida.jugadores[ganadorRonda].nombre} ganó la partida!`;
            } else {
              Object.assign(updates, generarResetRonda(partida));
              mensaje = `✅ Ronda ganada por ${partida.jugadores[ganadorRonda].nombre}. (+${puntosGanados} pts)`;
            }
          } else {
            const siguienteTurno =
              ganadorBaza === "PARDA" ? partida.ronda.mano : ganadorBaza;
            updates["ronda.turno"] = siguienteTurno;
            mensaje = `Baza ${bazas.length}: ${ganadorBaza === "PARDA" ? "PARDA" : `ganó ${partida.jugadores[ganadorBaza].nombre}`}`;
          }
        } else {
          updates["ronda.turno"] = oponente;
          mensaje = `${partida.jugadores[jugadorId].nombre} tiró carta.`;
        }
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // CANTAR ENVIDO / REAL ENVIDO / FALTA ENVIDO
      // ═════════════════════════════════════════════════════════════════════
      case "ENVIDO":
      case "REAL_ENVIDO":
      case "FALTA_ENVIDO": {
        if (partida.ronda.bazas.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            "El envido solo se canta en la primera baza."
          );
        }
        if (
          partida.cantos.envido.estado === "RESUELTO" ||
          partida.cantos.envido.estado === "RECHAZADO"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "El envido ya se jugó en esta ronda."
          );
        }

        // ── Validar escalada: si hay un canto pendiente, solo el que debe responder puede escalar ──
        const esEscalada = partida.cantos.esperandoRespuesta &&
          ["ENVIDO", "REAL_ENVIDO", "FALTA_ENVIDO"].includes(partida.cantos.cantoActivo || "");

        if (esEscalada) {
          // Solo el respondedor puede escalar
          if (partida.cantos.respondePor !== jugadorId) {
            throw new HttpsError(
              "failed-precondition",
              "No te toca responder. No podés cantar envido."
            );
          }
          // Validar jerarquía: no se puede bajar
          const jerarquia = { "ENVIDO": 1, "REAL_ENVIDO": 3, "FALTA_ENVIDO": 4 };
          if (jerarquia[accion] <= jerarquia[partida.cantos.cantoActivo]) {
            // Excepción: Envido sobre Envido (nivel 1 → nivel 2) es válido
            if (!(accion === "ENVIDO" && partida.cantos.envido.nivel <= 1)) {
              throw new HttpsError(
                "failed-precondition",
                `No podés cantar ${accion} sobre ${partida.cantos.cantoActivo}.`
              );
            }
          }
        } else if (partida.cantos.esperandoRespuesta) {
          // Hay un canto pendiente que NO es envido → no se puede cantar envido
          throw new HttpsError(
            "failed-precondition",
            "Hay un canto de truco pendiente."
          );
        }

        let nivelNuevo = partida.cantos.envido.nivel;
        let puntosEnvido = partida.cantos.envido.puntosEnJuego;

        if (accion === "ENVIDO") {
          nivelNuevo += 1;
          puntosEnvido += 2;
        } else if (accion === "REAL_ENVIDO") {
          nivelNuevo = 3;
          puntosEnvido += 3;
        } else {
          nivelNuevo = 4;
          const puntosMax = Math.max(
            partida.jugadores[jugadorId].puntos,
            partida.jugadores[oponente].puntos
          );
          puntosEnvido = partida.puntosParaGanar - puntosMax;
        }

        updates["cantos.cantoActivo"] = accion;
        updates["cantos.cantadoPor"] = jugadorId;
        updates["cantos.esperandoRespuesta"] = true;
        // El turno de responder pasa al otro jugador (el que cantó originalmente)
        updates["cantos.respondePor"] = oponente;
        updates["cantos.envido.estado"] = "CANTADO";
        updates["cantos.envido.nivel"] = nivelNuevo;
        updates["cantos.envido.puntosEnJuego"] = puntosEnvido;
        updates["cantos.envido.cantadoPor"] = jugadorId;
        updates["cantos.envido.historial"] = [
          ...partida.cantos.envido.historial,
          { canto: accion, por: jugadorId },
        ];

        mensaje = `🎯 ${partida.jugadores[jugadorId].nombre} cantó ${accion.replace("_", " ")}! (${puntosEnvido} pts)`;
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // CANTAR TRUCO / RE TRUCO / VALE CUATRO
      // ═════════════════════════════════════════════════════════════════════
      case "TRUCO":
      case "RE_TRUCO":
      case "VALE_CUATRO": {
        const nivelReq = { TRUCO: 0, RE_TRUCO: 1, VALE_CUATRO: 2 };
        const nivelNuevoT = { TRUCO: 1, RE_TRUCO: 2, VALE_CUATRO: 3 };
        const puntosN = { TRUCO: 2, RE_TRUCO: 3, VALE_CUATRO: 4 };

        // ── Detectar escalada como respuesta a un truco pendiente ──
        const esEscaladaTruco = partida.cantos.esperandoRespuesta &&
          ["TRUCO", "RE_TRUCO", "VALE_CUATRO"].includes(partida.cantos.cantoActivo || "");

        if (esEscaladaTruco) {
          // Solo el respondedor puede escalar
          if (partida.cantos.respondePor !== jugadorId) {
            throw new HttpsError(
              "failed-precondition",
              "No te toca responder. No podés cantar truco."
            );
          }
          // Validar que el nivel es correcto
          if (partida.cantos.truco.nivel !== nivelReq[accion]) {
            throw new HttpsError(
              "failed-precondition",
              `No se puede cantar ${accion} ahora.`
            );
          }
        } else {
          // Canto iniciado libremente (no como respuesta)
          if (partida.cantos.truco.nivel !== nivelReq[accion]) {
            throw new HttpsError(
              "failed-precondition",
              `No se puede cantar ${accion} ahora.`
            );
          }
          if (
            accion !== "TRUCO" &&
            partida.cantos.truco.cantadoPor === jugadorId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "No podés subir tu propio canto."
            );
          }
          if (partida.cantos.esperandoRespuesta) {
            throw new HttpsError(
              "failed-precondition",
              "Hay un canto pendiente de respuesta."
            );
          }
        }

        updates["cantos.cantoActivo"] = accion;
        updates["cantos.cantadoPor"] = jugadorId;
        updates["cantos.esperandoRespuesta"] = true;
        updates["cantos.respondePor"] = oponente;
        updates["cantos.truco.estado"] = "CANTADO";
        updates["cantos.truco.nivel"] = nivelNuevoT[accion];
        updates["cantos.truco.puntosEnJuego"] = puntosN[accion];
        updates["cantos.truco.cantadoPor"] = jugadorId;
        updates["cantos.truco.historial"] = [
          ...partida.cantos.truco.historial,
          { canto: accion, por: jugadorId },
        ];

        mensaje = `⚡ ${partida.jugadores[jugadorId].nombre} cantó ${accion.replace(/_/g, " ")}!`;
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // QUIERO / NO QUIERO
      // ═════════════════════════════════════════════════════════════════════
      case "QUIERO":
      case "NO_QUIERO": {
        if (!partida.cantos.esperandoRespuesta) {
          throw new HttpsError(
            "failed-precondition",
            "No hay canto pendiente."
          );
        }
        if (partida.cantos.respondePor !== jugadorId) {
          throw new HttpsError(
            "failed-precondition",
            "No te toca responder."
          );
        }

        const cantoActivo = partida.cantos.cantoActivo;
        const esEnvido = ["ENVIDO", "REAL_ENVIDO", "FALTA_ENVIDO"].includes(
          cantoActivo
        );

        if (accion === "QUIERO") {
          if (esEnvido) {
            // Identificar quién es el Mano y quién es el Pie
            const idMano = partida.ronda.mano;
            const idPie = idMano === partida.jugadorA ? partida.jugadorB : partida.jugadorA;

            const envidoMano = partida.jugadores[idMano].envidoValor;
            const envidoPie = partida.jugadores[idPie].envidoValor;

            const nombreMano = partida.jugadores[idMano].nombre;
            const nombrePie = partida.jugadores[idPie].nombre;

            let ganadorEnvido;
            let textoEnvido = "";

            // Lógica de "Son buenas": el Mano siempre gana en caso de empate
            if (envidoMano >= envidoPie) {
              ganadorEnvido = idMano;
              textoEnvido = `🎯 Envido: ${nombreMano} tiene ${envidoMano}. ${nombrePie} dice "Son buenas".`;
            } else {
              // Si el pie tiene estrictamente más puntos, revela su puntaje
              ganadorEnvido = idPie;
              textoEnvido = `🎯 Envido: ${nombreMano} tiene ${envidoMano}. ${nombrePie} tiene ${envidoPie}.`;
            }

            const puntosE = partida.cantos.envido.puntosEnJuego;
            const nuevosPuntosEnvido = partida.jugadores[ganadorEnvido].puntos + puntosE;

            updates[`jugadores.${ganadorEnvido}.puntos`] = nuevosPuntosEnvido;
            updates["cantos.envido.estado"] = "RESUELTO";
            updates["cantos.esperandoRespuesta"] = false;
            updates["cantos.cantoActivo"] = null;
            updates["cantos.respondePor"] = null;
            updates["cantos.cantadoPor"] = null;

            const finalizoEnvido = await verificarYFinalizar(partida, updates, ganadorEnvido, nuevosPuntosEnvido);

            if (finalizoEnvido) {
              mensaje = `${textoEnvido} 🏆 ¡${partida.jugadores[ganadorEnvido].nombre} ganó la partida por envido!`;
            } else {
              mensaje = `${textoEnvido} Ganó ${partida.jugadores[ganadorEnvido].nombre} (+${puntosE})`;
            }
          } else {
            updates["cantos.truco.estado"] = "ACEPTADO";
            updates["cantos.esperandoRespuesta"] = false;
            updates["cantos.cantoActivo"] = null;
            updates["cantos.respondePor"] = null;
            updates["cantos.cantadoPor"] = null;
            mensaje = `✅ ¡QUIERO! (${partida.cantos.truco.puntosEnJuego} pts en juego)`;
          }
        } else {
          const cantadoPor = partida.cantos.cantadoPor;
          if (esEnvido) {
            // BUG 2 CATCH: Cálculo estricto de puntos de rechazo leyendo el historial
            const historialE = partida.cantos.envido.historial || [];
            let ptsSumar = 1;

            if (historialE.length > 1) {
              let acumulados = 0;
              // Sumamos todos los cantos aceptados IMPLÍCITAMENTE (todos menos el último)
              for (let i = 0; i < historialE.length - 1; i++) {
                if (historialE[i].canto === "ENVIDO") acumulados += 2;
                else if (historialE[i].canto === "REAL_ENVIDO") acumulados += 3;
              }
              ptsSumar = acumulados > 0 ? acumulados : 1;
            }

            const nuevosPtsRechazo = partida.jugadores[cantadoPor].puntos + ptsSumar;
            updates[`jugadores.${cantadoPor}.puntos`] = nuevosPtsRechazo;
            updates["cantos.envido.estado"] = "RECHAZADO";
            updates["cantos.esperandoRespuesta"] = false;
            updates["cantos.cantoActivo"] = null;
            updates["cantos.respondePor"] = null;
            updates["cantos.cantadoPor"] = null;

            const finalizoRechazoE = await verificarYFinalizar(partida, updates, cantadoPor, nuevosPtsRechazo);
            if (finalizoRechazoE) {
              mensaje = `❌ No quiso envido. 🏆 ¡${partida.jugadores[cantadoPor].nombre} ganó la partida!`;
            } else {
              mensaje = `❌ No quiso. +${ptsSumar} para ${partida.jugadores[cantadoPor].nombre}`;
            }
          } else {
            const puntosRonda =
              partida.cantos.truco.nivel === 1
                ? 1
                : partida.cantos.truco.nivel === 2
                  ? 2
                  : 3;
            const nuevosPtsTruco = partida.jugadores[cantadoPor].puntos + puntosRonda;
            updates[`jugadores.${cantadoPor}.puntos`] = nuevosPtsTruco;

            // BUG 1 FIX: NO actualizar "cantos.truco.estado" individualmente. 
            // Firebase tira 'internal error / ancestor path' si luego pisamos todo el objeto "cantos" con generarResetRonda.
            // GenerarResetRonda ya resetea todo a { estado: "DISPONIBLE" }

            try {
              const finalizoRechazoT = await verificarYFinalizar(partida, updates, cantadoPor, nuevosPtsTruco);
              if (finalizoRechazoT) {
                mensaje = `🏆 ¡${partida.jugadores[cantadoPor].nombre} ganó por rechazo!`;
              } else {
                Object.assign(updates, generarResetRonda(partida));
                mensaje = `❌ No quiso. +${puntosRonda} para ${partida.jugadores[cantadoPor].nombre}.`;
              }
            } catch (err) {
              console.error("[TRUCO ❌] Error en rechazo de Truco:", err);
              throw new HttpsError("internal", "Error crítico validando el Truco.");
            }
          }
        }
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // MAZO (Rendirse)
      // ═════════════════════════════════════════════════════════════════════
      case "MAZO": {
        const puntosRondaMazo = partida.cantos.truco.puntosEnJuego;
        const nuevosPtsMazo = partida.jugadores[oponente].puntos + puntosRondaMazo;
        updates[`jugadores.${oponente}.puntos`] = nuevosPtsMazo;

        const finalizoMazo = await verificarYFinalizar(partida, updates, oponente, nuevosPtsMazo);
        if (finalizoMazo) {
          mensaje = `🏳️ Mazo. 🏆 ¡${partida.jugadores[oponente].nombre} ganó!`;
        } else {
          Object.assign(updates, generarResetRonda(partida));
          mensaje = `🏳️ Mazo. +${puntosRondaMazo} para ${partida.jugadores[oponente].nombre}. Nueva ronda.`;
        }
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // HEARTBEAT Y DESCONEXIÓN
      // ═════════════════════════════════════════════════════════════════════
      // ═════════════════════════════════════════════════════════════════════
      // HEARTBEAT Y DESCONEXIÓN
      // ═════════════════════════════════════════════════════════════════════
      case "HEARTBEAT": {
        mensaje = "Heartbeat ok.";
        break;
      }

      case "RECLAMAR_DESCONEXION": {
        const oponenteData = partida.jugadores[oponente];
        if (!oponenteData.ultimaActividad) {
          throw new HttpsError("failed-precondition", "Aún no hay datos de actividad del oponente.");
        }

        // Calcular la diferencia en segundos
        const ahora = Date.now();
        const ultimaAct = oponenteData.ultimaActividad.toDate().getTime();
        const diffSegundos = (ahora - ultimaAct) / 1000;

        if (diffSegundos < 60) {
          throw new HttpsError("failed-precondition", `El oponente sigue activo (último latido hace ${Math.floor(diffSegundos)}s).`);
        }

        // Si realmente pasaron más de 15 segundos, aplicar la misma regla de ABANDONO
        const puntosA = partida.jugadores[jugadorId].puntos;

        if (puntosA >= 15) {
          // El que reclama tenía 15 puntos o más, gana por desconexión.
          updates["estado"] = "FINALIZADA";
          updates["ganador"] = jugadorId;
          updates[`jugadores.${jugadorId}.puntos`] = partida.puntosParaGanar;
          await verificarYFinalizar(partida, updates, jugadorId, partida.puntosParaGanar);
          mensaje = `🚨 Oponente desconectado. 🏆 ${partida.jugadores[jugadorId].nombre} gana la partida.`;
        } else {
          // El que reclama no tiene 15 puntos, la partida se cancela.
          updates["estado"] = "CANCELADA";
          updates["canceladaPor"] = oponente;
          mensaje = `🚨 Oponente desconectado. La partida fue CANCELADA (no sumas victoria porque no llegaste a 15 puntos).`;
        }
        console.log(`[TRUCO 🚨] Partida ${partidaId} desconexión de ${oponente} reclamada por ${jugadorId}`);
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // ABANDONAR PARTIDA (Botón "Salir al Lobby")
      // ═════════════════════════════════════════════════════════════════════
      case "ABANDONAR_PARTIDA": {
        const puntosB = partida.jugadores[oponente].puntos;

        // Si el RIVAL (oponente) ya tenía 15 puntos o más, le damos la victoria de 30.
        if (puntosB >= 15) {
          updates["estado"] = "FINALIZADA";
          updates["ganador"] = oponente;
          updates[`jugadores.${oponente}.puntos`] = partida.puntosParaGanar;
          await verificarYFinalizar(partida, updates, oponente, partida.puntosParaGanar);
          mensaje = `🚨 ${partida.jugadores[jugadorId].nombre} abandonó. 🏆 ${partida.jugadores[oponente].nombre} gana la partida.`;
        } else {
          // Si el RIVAL NO tenía 15 puntos, cancelamos la partida.
          updates["estado"] = "CANCELADA";
          updates["canceladaPor"] = jugadorId;
          mensaje = `🚨 ${partida.jugadores[jugadorId].nombre} abandonó y la partida fue CANCELADA.`;
        }

        console.log(`[TRUCO 🚨] Partida ${partidaId} abandonada por ${jugadorId}`);
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // TIEMPO AGOTADO (AFK — penalización automática)
      // ═════════════════════════════════════════════════════════════════════
      case "TIEMPO_AGOTADO": {
        const esSuTurno = partida.ronda.turno === jugadorId;
        const debeResponder = partida.cantos.esperandoRespuesta && partida.cantos.respondePor === jugadorId;

        if (!esSuTurno && !debeResponder) {
          throw new HttpsError(
            "failed-precondition",
            "No es tu turno, no podés agotar tiempo."
          );
        }

        const puntosJugadorAfk = partida.jugadores[jugadorId].puntos;
        const puntosOponenteAfk = partida.jugadores[oponente].puntos;
        const hayAlguienCon15 = puntosJugadorAfk >= 15 || puntosOponenteAfk >= 15;

        // Regla: si alguien ya está en las malas (>= 15), el AFK pierde la partida entera
        if (hayAlguienCon15) {
          await verificarYFinalizar(partida, updates, oponente, partida.puntosParaGanar);
          mensaje = `⏰ ¡Tiempo agotado! ${partida.jugadores[jugadorId].nombre} perdió por AFK. 🏆 ${partida.jugadores[oponente].nombre} gana la partida.`;
        } else {

          // --- NUEVA LÓGICA: Calcular puntos simulando respuestas automáticas ---
          let puntosParaOponente = 0;
          let accionAfk = "";

          if (debeResponder) {
            const cantoActivo = partida.cantos.cantoActivo;
            const esEnvido = ["ENVIDO", "REAL_ENVIDO", "FALTA_ENVIDO"].includes(cantoActivo);

            if (esEnvido) {
              // 1. Simular "NO QUIERO" del Envido (lee el historial para ver si venía escalado)
              const historialE = partida.cantos.envido.historial || [];
              let ptsEnvido = 1;

              if (historialE.length > 1) {
                let acumulados = 0;
                for (let i = 0; i < historialE.length - 1; i++) {
                  if (historialE[i].canto === "ENVIDO") acumulados += 2;
                  else if (historialE[i].canto === "REAL_ENVIDO") acumulados += 3;
                }
                ptsEnvido = acumulados > 0 ? acumulados : 1;
              }

              // 2. Le sumamos los pts del Envido rechazado + los pts del mazo por no jugar la mano
              puntosParaOponente = ptsEnvido + partida.cantos.truco.puntosEnJuego;
              accionAfk = "No quiso el envido y se fue al mazo";

            } else {
              // Simular "NO QUIERO" de Truco / Retruco / Vale Cuatro
              const ptsTrucoRechazado =
                partida.cantos.truco.nivel === 1 ? 1 :
                  partida.cantos.truco.nivel === 2 ? 2 : 3;

              puntosParaOponente = ptsTrucoRechazado;
              accionAfk = `No quiso el ${cantoActivo.replace(/_/g, " ")}`;
            }
          } else {
            // No tenía que responder nada, simplemente colgó en tirar una carta
            puntosParaOponente = partida.cantos.truco.puntosEnJuego;
            accionAfk = "Se fue al mazo por tiempo";
          }

          // Aplicar los puntos y resetear o finalizar
          const nuevosPtsAfk = puntosOponenteAfk + puntosParaOponente;
          updates[`jugadores.${oponente}.puntos`] = nuevosPtsAfk;

          const finalizoAfk = await verificarYFinalizar(partida, updates, oponente, nuevosPtsAfk);
          if (finalizoAfk) {
            mensaje = `⏰ Tiempo agotado. 🏆 ${partida.jugadores[oponente].nombre} gana la partida.`;
          } else {
            Object.assign(updates, generarResetRonda(partida));
            mensaje = `⏰ Tiempo agotado para ${partida.jugadores[jugadorId].nombre}. ${accionAfk}. +${puntosParaOponente} para ${partida.jugadores[oponente].nombre}.`;
          }
        }
        break;
      }

      default:
        throw new HttpsError(
          "invalid-argument",
          `Acción desconocida: ${accion}`
        );
    }

    if (mensaje) {
      updates["ultimoMensaje"] = {
        texto: mensaje,
        id: Date.now().toString()
      };
    }

    // Aplicar todo a Firestore
    await partidaRef.update(updates);

    return { ok: true, mensaje };
  }
);


// -------------------------------------------------------------------------------
// M�DULOS DEL CASINO 'VACAS LOCAS'
// Re-exportamos todas las Cloud Functions definidas en casino.js.
// initializeApp() ya fue llamado arriba ? casino.js reutiliza la instancia.
// -------------------------------------------------------------------------------
const casino = require('./casino');

// Billetera
exports.apiPagaDiaria = casino.apiPagaDiaria;
exports.crearBilletera = casino.crearBilletera;
exports.getSaldo = casino.getSaldo;// force deploy trigger 2
exports.reclamarMonedasDiarias = casino.reclamarMonedasDiarias;
// Ruleta
exports.apostarRuleta = casino.apostarRuleta;
exports.resolverRuleta = casino.resolverRuleta;
exports.iniciarRondaRuleta = casino.iniciarRondaRuleta;
exports.abrirApuestasRuleta = casino.abrirApuestasRuleta;

// Blackjack
exports.sentarseBj = casino.sentarseBj;
exports.apostarBj = casino.apostarBj;
exports.forzarRepartoBj = casino.forzarRepartoBj;
exports.pedirCartaBj = casino.pedirCartaBj;
exports.quedarseBj = casino.quedarseBj;
exports.reiniciarMesaBj = casino.reiniciarMesaBj;
exports.levantarseBj = casino.levantarseBj;

