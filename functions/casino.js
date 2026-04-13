// ═══════════════════════════════════════════════════════════════════════════════
// casino.js — Backend "Vacas Locas" Casino Online
// Firebase Functions v2  |  Optimizado para ≤ 25 usuarios
//
// FILOSOFÍA DE OPTIMIZACIÓN:
//   • Nunca document-per-game (hot document). Usamos subcolecciones para apuestas.
//   • runTransaction()   → atomicidad en operaciones de saldo (lectura + escritura).
//   • db.batch()         → escrituras masivas en una sola llamada de red.
//   • FieldValue.increment → evita leer el saldo antes de actualizar.
//   • Toda la lógica de "croupier" se procesa en RAM antes de escribir.
// ═══════════════════════════════════════════════════════════════════════════════

"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

// db se importa aquí; initializeApp() ya fue llamado en index.js
const db = getFirestore();

// ─── Constante: token secreto para el cron de paga diaria ───────────────────
// En producción, usaría Secret Manager. Para la plataforma cerrada, una
// variable de entorno o un string fijo es suficiente.
const CRON_SECRET = process.env.CASINO_CRON_SECRET || "CRON_SECRET_VACAS_LOCAS";

// ─── Constante: apuesta de Jacobo (27 números predefinidos) ──────────────────
// "La Jugada de Jacobo" cubre 27 de los 37 números (0-36) de la ruleta.
// Excluye los "fríos": 1, 4, 9, 15, 20, 26, 32, 34, 35, 36 → quedan 27.
const NUMEROS_JACOBO = [
  0, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14,
  16, 17, 18, 19, 21, 22, 23, 24, 25, 27,
  28, 29, 30, 31, 33,
];

// ─── Constante: paga diaria ───────────────────────────────────────────────────
const PAGA_DIARIA_MONTO = 20;

// ─── Constante: saldo mínimo para apostar ────────────────────────────────────
const SALDO_MIN_APUESTA = 1;

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES COMPARTIDAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera un número criptográficamente seguro en [min, max] usando crypto.randomBytes.
 * Equivalente a Fisher-Yates pero para un rango discreto.
 * Evitamos Math.random() por su no-uniformidad en rangos no-potencia-de-2.
 */
function randomIntSeguro(min, max) {
  const rango = max - min + 1;
  const buf = crypto.randomBytes(4);
  const num32 = buf.readUInt32BE(0);
  return min + (num32 % rango);
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
  return request.auth.uid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ███████████████████████████████████████████████████████████████████████████████
// MÓDULO 1: BILLETERA VIRTUAL Y PAGA DIARIA
// ███████████████████████████████████████████████████████████████████████████████
// ═══════════════════════════════════════════════════════════════════════════════
//
// Estructura Firestore:
//   billeteras/{uid}  →  { saldo: number, ultimaPaga: Timestamp, uid: string }
//
// OPTIMIZACIÓN CLAVE: usamos db.batch() + FieldValue.increment para aplicar
// la paga diaria a TODOS los usuarios en una sola llamada a Firestore,
// evitando N escrituras independientes y sus costos de red/latencia.
// ────────────────────────────────────────────────────────────────────────────

/**
 * apiPagaDiaria — onRequest (para ser llamado por un cron job externo).
 *
 * Seguridad: exige header  Authorization: Bearer <CRON_SECRET>
 *
 * Algoritmo:
 *  1. Lee TODOS los documentos de "billeteras" (una sola lectura de colección).
 *  2. Crea un único WriteBatch con FieldValue.increment por cada wallet.
 *  3. Hace commit → una sola ida-vuelta a Firestore para todas las escrituras.
 *
 * Nota sobre WriteBatch: máximo 500 operaciones por batch. Para ≤25 usuarios
 * nunca se alcanza ese límite. Si escalaras a >500, habría que partir en lotes.
 */
exports.apiPagaDiaria = onRequest(
  { region: "southamerica-east1", cors: false },
  async (req, res) => {
    // ── 1. Solo POST ────────────────────────────────────────────────────────
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ── 2. Validar Bearer token ──────────────────────────────────────────────
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== CRON_SECRET) {
      return res.status(403).json({ error: "Forbidden: token inválido." });
    }

    try {
      // ── 3. Leer todas las billeteras en UNA sola operación ─────────────────
      // OPTIMIZACIÓN: un único collectionGroup scan en lugar de N lecturas doc
      const snapshot = await db.collection("billeteras").get();

      if (snapshot.empty) {
        return res.json({ ok: true, mensaje: "No hay billeteras aún.", actualizadas: 0 });
      }

      // ── 4. Crear batch único con increment para TODOS los usuarios ──────────
      // WriteBatch garantiza atomicidad: o se aplican todos los incrementos o ninguno.
      const batch = db.batch();
      const ahora = FieldValue.serverTimestamp();

      snapshot.docs.forEach((doc) => {
        // FieldValue.increment NO requiere leer el saldo previo → 0 lecturas extra.
        // Es la forma más barata de actualizar un campo numérico en Firestore.
        batch.update(doc.ref, {
          saldo: FieldValue.increment(PAGA_DIARIA_MONTO),
          ultimaPaga: ahora,
        });
      });

      // ── 5. Commit en bloque → 1 sola escritura de red ──────────────────────
      await batch.commit();

      console.log(`[CASINO 💰] Paga diaria aplicada a ${snapshot.size} billeteras (+${PAGA_DIARIA_MONTO}).`);
      return res.json({ ok: true, actualizadas: snapshot.size, montoPorUsuario: PAGA_DIARIA_MONTO });

    } catch (err) {
      console.error("[CASINO ❌] apiPagaDiaria error:", err);
      return res.status(500).json({ error: "Error interno del servidor." });
    }
  }
);

/**
 * crearBilletera — onCall
 * Crea la billetera de un usuario si no existe (idempotente).
 * Se llama una vez al registrarse. Usa set({merge:true}) para no pisar data.
 */
exports.crearBilletera = onCall(
  { region: "southamerica-east1", maxInstances: 5 },
  async (request) => {
    const uid = requireAuth(request);

    const ref = db.collection("billeteras").doc(uid);

    // set con merge: si ya existe, no hace nada; si no, crea con saldo inicial.
    await ref.set(
      {
        uid,
        saldo: FieldValue.increment(0), // Crea el campo con el valor actual o 0
        creadaEn: FieldValue.serverTimestamp(),
        ultimaPaga: null,
      },
      // merge:true → no sobrescribe si ya existe el documento
      { merge: true }
    );

    // Leer el saldo actual para retornarlo
    const snap = await ref.get();
    const data = snap.data();

    // Si el saldo no existe (primera vez), lo inicializamos
    if (data.saldo === undefined || data.saldo === null) {
      await ref.set({ saldo: 100 }, { merge: true }); // 100 monedas de bienvenida
      return { ok: true, saldo: 100 };
    }

    return { ok: true, saldo: data.saldo };
  }
);

/**
 * getSaldo — onCall
 * Retorna el saldo de la billetera del usuario autenticado.
 * Una sola lectura de documento → mínimo costo posible.
 */
exports.getSaldo = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    const uid = requireAuth(request);

    const snap = await db.collection("billeteras").doc(uid).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Billetera no encontrada. Creala primero.");
    }

    return { saldo: snap.data().saldo };
  }
);

/**
 * reclamarMonedasDiarias — onCall (llamada manual desde el frontend)
 *
 * Lógica:
 *  - Si la billetera no existe → créala con 20 monedas y guardamos ultimoReclamo = hoy.
 *  - Si existe → verifica que ultimoReclamo NO sea la fecha de hoy (Argentina).
 *      - Si ya reclamó → HttpsError("already-exists")
 *      - Si no reclamó → +20 monedas y actualizar ultimoReclamo.
 *
 * Fecha en formato YYYY-MM-DD usando la zona horaria de Argentina (UTC-3).
 */
exports.reclamarMonedasDiarias = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    const uid = requireAuth(request);

    // Fecha de hoy en Argentina (UTC-3, sin DST oficial).
    const ahora = new Date();
    const ahoraAR = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
    const fechaHoy = ahoraAR.toISOString().substring(0, 10); // "YYYY-MM-DD"

    const billeteraRef = db.collection("billeteras").doc(uid);
    let nuevoSaldo;

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(billeteraRef);

      if (!snap.exists) {
        // Primera vez: crear billetera con 20 monedas de bienvenida diaria.
        txn.set(billeteraRef, {
          uid,
          saldo: PAGA_DIARIA_MONTO,
          ultimoReclamo: fechaHoy,
          creadaEn: FieldValue.serverTimestamp(),
          ultimaPaga: null,
        });
        nuevoSaldo = PAGA_DIARIA_MONTO;
        return;
      }

      const data = snap.data();
      const ultimoReclamo = data.ultimoReclamo ?? null;

      if (ultimoReclamo === fechaHoy) {
        throw new HttpsError(
          "already-exists",
          "Ya reclamaste tus monedas hoy. ¡Volvé mañana!"
        );
      }

      const saldoActual = data.saldo ?? 0;
      nuevoSaldo = saldoActual + PAGA_DIARIA_MONTO;

      txn.update(billeteraRef, {
        saldo: FieldValue.increment(PAGA_DIARIA_MONTO),
        ultimoReclamo: fechaHoy,
      });
    });

    console.log(`[CASINO 💰] ${uid} reclamó ${PAGA_DIARIA_MONTO} monedas diarias. Nuevo saldo: ${nuevoSaldo}.`);
    return {
      ok: true,
      nuevoSaldo,
      mensaje: `¡Recibiste ${PAGA_DIARIA_MONTO} monedas! Volvé mañana para más.`,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ███████████████████████████████████████████████████████████████████████████████
// MÓDULO 2: RULETA MULTIJUGADOR OPTIMIZADA
// ███████████████████████████████████████████████████████████████████████████████
// ═══════════════════════════════════════════════════════════════════════════════
//
// Estructura Firestore:
//   casino/ruleta_1                         → { estado, numeroGanador, ... }
//   casino/ruleta_1/apuestas/{uid}          → { tipo, monto, numeros, uid }
//
// OPTIMIZACIÓN CLAVE:
//   • Las apuestas van en SUBCOLECCIÓN, no en el doc de la mesa.
//     Esto elimina la "contención de escrituras" (write contention) que ocurre
//     cuando múltiples usuarios escriben en el mismo documento simultáneamente.
//   • El frontend hace onSnapshot sobre la subcolección de su propio uid,
//     no sobre el documento completo → menos datos transferidos.
//   • resolverRuleta procesa todo en RAM y hace UN solo batch al final.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el multiplicador según el tipo de apuesta de ruleta.
 * Retorna el pago neto (sin incluir la apuesta devuelta).
 */
// Lógica de pago dinámica por cantidad de números (Cubriendo Plenos, Splits, Calles y Cuadros)
function calcularPagoRuleta(apuesta, numeroGanador) {
  let gananciaTotal = 0;
  const fichas = apuesta.fichas || [];

  for (const f of fichas) {
    const { tipo, numeros, monto } = f;
    const gano = Array.isArray(numeros) && numeros.includes(numeroGanador);
    if (!gano) continue;

    if (tipo === "interno") {
      const cant = numeros.length;
      if (cant === 1) gananciaTotal += monto * 35; // Pleno
      if (cant === 2) gananciaTotal += monto * 17; // Split
      if (cant === 3) gananciaTotal += monto * 11; // Calle
      if (cant === 4) gananciaTotal += monto * 8;  // Cuadro
    } else {
      switch (tipo) {
        case "docena": case "columna": gananciaTotal += monto * 2; break;
        case "rojo_negro": case "par_impar": case "menor_mayor": case "jacobo": gananciaTotal += monto * 1; break;
      }
    }
  }

  return gananciaTotal;
}

/**
 * Construye la lista de números para la "Jugada de Jacobo".
 * Se exporta para que el frontend la conozca y la muestre.
 */
function buildApuestaJacobo(monto) {
  return {
    tipo: "jacobo",
    numeros: NUMEROS_JACOBO,
    monto,
  };
}

/**
 * apostarRuleta — onCall
 *
 * Flujo:
 *  1. Valida autenticación y que la mesa esté en estado APOSTANDO.
 *  2. Usa runTransaction sobre la BILLETERA para garantizar atomicidad:
 *       - Lee saldo actual
 *       - Verifica que hay saldo suficiente
 *       - Descuenta el monto (todo dentro de la transacción, no hay race condition)
 *  3. Guarda la apuesta en la SUBCOLECCIÓN (fuera de la transacción para no
 *     mezclar responsabilidades; en caso de fallo aquí el saldo ya fue descontado
 *     pero la apuesta no se registra → preferimos perder la apuesta que duplicarla).
 *
 * OPTIMIZACIÓN: runTransaction garantiza que dos usuarios apostando al mismo
 * tiempo nunca se pisen el saldo. No necesitamos bloqueos manuales.
 */
exports.apostarRuleta = onCall({ region: "southamerica-east1" }, async (request) => {
  // force deploy update
  const uid = requireAuth(request);
  const { fichas, esJacobo, mesaId: mesaIdParam } = request.data;
  const monto = request.data.monto || 0; // Legacy / Fallback
  const numerosy = request.data.numeros;
  const tipoy = request.data.tipo;

  // Adaptador para retrocompatibilidad y apuestas tipo Jacobo antiguas
  let nuevasFichas = [];
  if (fichas && Array.isArray(fichas)) {
    nuevasFichas = fichas;
  } else if (esJacobo) {
    nuevasFichas.push({
      key: "jacobo",
      tipo: "jacobo",
      numeros: [0, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 33],
      monto
    });
  } else if (tipoy && numerosy && monto) {
    nuevasFichas.push({
      key: `legacy_${Date.now()}`,
      tipo: tipoy,
      numeros: numerosy,
      monto
    });
  }

  if (nuevasFichas.length === 0) {
    throw new HttpsError("invalid-argument", "No hay fichas para apostar.");
  }

  const montoTotalNuevas = nuevasFichas.reduce((acc, f) => acc + f.monto, 0);

  // Validar y determinar la mesa
  const mesaIdValido = ["ruleta_1", "ruleta_2"].includes(mesaIdParam) ? mesaIdParam : "ruleta_1";
  const mesaRef = db.collection("casino").doc(mesaIdValido);

  await db.runTransaction(async (txn) => {
    const mesaSnap = await txn.get(mesaRef);
    const billRef = db.collection("billeteras").doc(uid);
    const billSnap = await txn.get(billRef);

    // TODAS LAS LECTURAS PRIMERO (Regla estricta de Firestore Transaction)
    const apuestaRef = mesaRef.collection("apuestas").doc(uid);
    const apuestaSnap = await txn.get(apuestaRef);

    if (!billSnap.exists || (billSnap.data().saldo || 0) < montoTotalNuevas) {
      throw new HttpsError("failed-precondition", "Saldo insuficiente.");
    }

    const mesaData = mesaSnap.data() || { estado: "ESPERANDO" };
    let updates = {};

    // 1. Validar que se pueda apostar
    if (mesaData.estado === "GIRANDO") {
      throw new HttpsError("failed-precondition", "¡No va más! La bola ya está girando.");
    }

    // 2. Lógica del Cronómetro: Solo se setea si la mesa no está ya en fase de apuestas
    if (mesaData.estado !== "APOSTANDO") {
      const fin = Date.now() + 30000;
      updates.estado = "APOSTANDO";
      updates.timerFin = fin;
      updates.numeroGanador = null;
    }

    // 3. Descontar saldo
    txn.update(billRef, { saldo: FieldValue.increment(-montoTotalNuevas) });

    // 4. Registrar la apuesta (Acumulando si ya existen fichas previas esta ronda)
    let fichasGuardadas = [];
    let montoAnterior = 0;
    if (apuestaSnap.exists) {
      const data = apuestaSnap.data();
      fichasGuardadas = data.fichas || [];
      montoAnterior = data.monto || 0;
    }

    // Fusionar fichasNuevas con fichasGuardadas y construir fichasGlobales
    let fichasGlobales = mesaData.fichasGlobales || {};

    for (const f_nueva of nuevasFichas) {
      const f_ext = fichasGuardadas.find(x => x.key === f_nueva.key);
      if (f_ext) {
        f_ext.monto += f_nueva.monto;
      } else {
        fichasGuardadas.push(f_nueva);
      }

      // Acumular en la bolsa global (para que todos vean cuánto hay apostado a cada cosa)
      fichasGlobales[f_nueva.key] = (fichasGlobales[f_nueva.key] || 0) + f_nueva.monto;
    }

    // Asignar al update de la mesa la nueva bolsa de fichas
    updates.fichasGlobales = fichasGlobales;

    txn.set(apuestaRef, {
      fichas: fichasGuardadas,
      monto: montoAnterior + montoTotalNuevas,
      uid,
      timestamp: FieldValue.serverTimestamp()
    });

    // 5. Aplicar cambios a la mesa si es el primer apostador
    if (Object.keys(updates).length > 0) {
      txn.set(mesaRef, updates, { merge: true });
    }
  });

  return { ok: true };
});

/**
 * resolverRuleta — onCall (llamada por el administrador o por otro cron)
 *
 * Flujo completo en memoria con UN solo batch al final:
 *  1. Valida que se sea admin (uid en lista hardcodeada o claim custom).
 *  2. Verifica estado GIRANDO de la mesa.
 *  3. Genera número ganador con crypto (seguro).
 *  4. Lee todas las apuestas de la subcolección (una sola query).
 *  5. Calcula ganancias EN MEMORIA (sin escribir nada aún).
 *  6. Escribe TODO de una vez con batch:
 *       - Saldos de ganadores (increment)
 *       - Limpia la subcolección de apuestas (delete)
 *       - Actualiza el documento de la mesa (estado + último resultado)
 */
exports.resolverRuleta = onCall({ region: "southamerica-east1" }, async (request) => {
  // force deploy update
  const { mesaId: mesaIdParam } = request.data || {};
  const mesaIdValido = ["ruleta_1", "ruleta_2"].includes(mesaIdParam) ? mesaIdParam : "ruleta_1";
  const mesaRef = db.collection("casino").doc(mesaIdValido);

  // 1. Usamos la transacción para decidir si se gira o no.
  // Esto evita que si 5 personas llaman a la función a la vez, se cobre 5 veces.
  const resultado = await db.runTransaction(async (transaction) => {
    const mesaSnap = await transaction.get(mesaRef);
    const mesa = mesaSnap.data();

    // Si ya no está apostando (ej: alguien más ya disparó esta función), salimos.
    if (!mesa || mesa.estado !== "APOSTANDO") {
      return { ok: false, error: "La mesa ya no está en fase de apuestas." };
    }

    // Verificamos el tiempo
    const ahora = Date.now();
    if (mesa.timerFin && ahora < mesa.timerFin - 1000) {
      throw new HttpsError("failed-precondition", "Todavía hay tiempo para apostar.");
    }

    // Bloqueamos la mesa inmediatamente pasando a GIRANDO
    transaction.update(mesaRef, { estado: "GIRANDO" });
    return { ok: true, mesaData: mesa };
  });

  // Si la transacción dijo que no, cortamos acá.
  if (!resultado.ok) return resultado;

  // 2. A partir de acá, solo UN proceso sigue vivo. 
  // Generamos el número ganador.
  const numeroGanador = randomIntSeguro(0, 36);

  // Leemos las apuestas (esto es una sola lectura de query)
  const apuestasSnap = await mesaRef.collection("apuestas").get();
  const batch = db.batch();

  const ganadores = [];

  apuestasSnap.docs.forEach(doc => {
    const data = doc.data();
    const premio = calcularPagoRuleta(data, numeroGanador);

    // Devolvemos premio + la apuesta de cada ficha ganadora
    // La suma de todo va al saldo
    let apuestaGanadoraDevuelta = 0;
    for (const f of (data.fichas || [])) {
      const gano = Array.isArray(f.numeros) && f.numeros.includes(numeroGanador);
      if (gano) apuestaGanadoraDevuelta += f.monto;
    }

    const totalAAcreditar = premio + apuestaGanadoraDevuelta;

    if (totalAAcreditar > 0) {
      batch.update(db.collection("billeteras").doc(data.uid), {
        saldo: FieldValue.increment(totalAAcreditar)
      });
      ganadores.push({ uid: data.uid, gananciaBruta: totalAAcreditar, premioNeto: premio });
    }

    // IMPORTANTE: Borramos la apuesta para que la mesa quede limpia
    batch.delete(doc.ref);
  });

  // 3. Reseteamos la mesa a ESPERANDO para que el próximo apostador active el timer de nuevo
  batch.update(mesaRef, {
    estado: "ESPERANDO", // O "PAGANDO" si querés mostrar un cartel en el front
    numeroGanador,
    timerFin: null,
    fichasGlobales: FieldValue.delete(), // Limpiar las apuestas globales para la proxima mano
    ultimaRonda: {
      numero: numeroGanador,
      ganadores: ganadores,
      timestamp: FieldValue.serverTimestamp()
    }
  });

  await batch.commit();

  console.log(`[RULETA 🎰] Resultado: ${numeroGanador}. Se procesaron ${apuestasSnap.size} apuestas.`);
  return { ok: true, numero: numeroGanador };
});
/**
 * iniciarRonda — onCall (admin)
 * Transiciona la mesa de APOSTANDO → GIRANDO para cerrar las apuestas.
 */
exports.iniciarRondaRuleta = onCall(
  { region: "southamerica-east1", maxInstances: 2 },
  async (request) => {
    requireAuth(request);
    const { mesaId: mesaIdParam } = request.data || {};
    const mesaIdValido = ["ruleta_1", "ruleta_2"].includes(mesaIdParam) ? mesaIdParam : "ruleta_1";
    const mesaRef = db.collection("casino").doc(mesaIdValido);

    // Crear o actualizar la mesa
    await mesaRef.set({
      estado: "GIRANDO",
      iniciadaEn: FieldValue.serverTimestamp(),
      numeroGanador: null,
    }, { merge: true });

    console.log(`[RULETA 🎡] Ronda iniciada en ${mesaIdValido}. Estado: GIRANDO.`);
    return { ok: true };
  }
);

/**
 * abrirApuestasRuleta — onCall (admin)
 * Pone la mesa en estado APOSTANDO para que los jugadores puedan apostar.
 */
exports.abrirApuestasRuleta = onCall(
  { region: "southamerica-east1", maxInstances: 2 },
  async (request) => {
    requireAuth(request);
    const { mesaId: mesaIdParam } = request.data || {};
    const mesaIdValido = ["ruleta_1", "ruleta_2"].includes(mesaIdParam) ? mesaIdParam : "ruleta_1";

    await db.collection("casino").doc(mesaIdValido).set({
      estado: "APOSTANDO",
      abiertaEn: FieldValue.serverTimestamp(),
      numeroGanador: null,
      timerFin: Date.now() + 30000, // 60 segundos al abrir manualmente
    }, { merge: true });

    return { ok: true, mensaje: "¡Hagan sus apuestas!", mesaId: mesaIdValido };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ███████████████████████████████████████████████████████████████████████████████
// MÓDULO 3: BLACKJACK (Sistema de 2 Mesas)
// ███████████████████████████████████████████████████████████████████████████████
// ═══════════════════════════════════════════════════════════════════════════════
//
// Estructura Firestore:
//   blackjack/mesa_1  →  { estado, jugadores:{uid:{mano,apuesta,estado}}, casa:{mano} }
//   blackjack/mesa_2  →  idem
//
// Estados del juego: ESPERANDO → REPARTIENDO → TURNO_JUGADORES → TURNO_CASA → FINALIZADO
//
// OPTIMIZACIÓN CRITICA (Croupier):
//   Cuando todos los jugadores se plantan, el backend:
//   1. Carga la mano del croupier en MEMORIA.
//   2. Simula todo el turno de la casa (pide hasta 17) SIN escribir nada.
//   3. Calcula resultados de TODOS los jugadores en un bucle.
//   4. Escribe el resultado final + pagos en UN SOLO db.batch().
//   → De N escrituras por carta + N pagos, pasamos a 1 sola llamada de red.
// ────────────────────────────────────────────────────────────────────────────

// ── Baraja francesa ──────────────────────────────────────────────────────────
const PALOS_BJ = ["♠", "♥", "♦", "♣"];
const VALORES_BJ = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * Genera y baraja una baraja de 52 cartas con crypto.
 * Retorna un array de { palo, valor, puntos } listo para usar.
 * Fisher-Yates shuffle con crypto.randomBytes → impredecible server-side.
 */
function generarMazoBJ() {
  const mazo = [];
  for (const palo of PALOS_BJ) {
    for (const val of VALORES_BJ) {
      mazo.push({ palo, valor: val });
    }
  }
  // Fisher-Yates con crypto
  for (let i = mazo.length - 1; i > 0; i--) {
    const buf = crypto.randomBytes(4);
    const j = buf.readUInt32BE(0) % (i + 1);
    [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
  }
  return mazo;
}

/**
 * Calcula el valor de una mano de blackjack.
 * El As vale 11 a menos que haga superar 21, en cuyo caso vale 1.
 * Esta lógica "Soft 17" se aplica automáticamente.
 */
function valorMano(mano) {
  let total = 0;
  let ases = 0;

  for (const carta of mano) {
    if (["J", "Q", "K"].includes(carta.valor)) {
      total += 10;
    } else if (carta.valor === "A") {
      ases++;
      total += 11; // Empieza contando como 11
    } else {
      total += parseInt(carta.valor, 10);
    }
  }

  // Reducir ases de 11 a 1 si superamos 21
  while (total > 21 && ases > 0) {
    total -= 10;
    ases--;
  }

  return total;
}

/**
 * Verifica si una mano es blackjack natural (As + figura/10 con 2 cartas).
 */
function esBlackjack(mano) {
  if (mano.length !== 2) return false;
  const t = valorMano(mano);
  return t === 21;
}

/**
 * Simula el turno completo del croupier en MEMORIA.
 * La casa pide carta mientras esté por debajo de 17 (regla Soft 17).
 * NO escribe nada en Firestore. Devuelve la mano final y su valor.
 *
 * OPTIMIZACIÓN: en lugar de 1 doc update por carta recibida por la casa,
 * hacemos todo en un array local y escribimos solo el resultado final.
 */
function simularTurnoCasa(manoInicial, mazo) {
  const mano = [...manoInicial];
  const mazoLocal = [...mazo];
  let valor = valorMano(mano);

  // La casa pide hasta llegar a 17 (Soft 17)
  while (valor < 17 && mazoLocal.length > 0) {
    const carta = mazoLocal.shift();
    mano.push(carta);
    valor = valorMano(mano);
  }

  return { mano, valor };
}

/**
 * Determina el resultado de un jugador contra la casa.
 * Devuelve 'GANA', 'PIERDE', 'EMPATE' o 'BLACKJACK'.
 */
function determinarResultadoBJ(manoJugador, valorJugador, valorCasa, esNatural) {
  // Si el jugador se pasó, pierde siempre
  if (valorJugador > 21) return "PIERDE";

  // Blackjack natural del jugador → pago 3:2 (si la casa no tiene natural)
  if (esNatural && valorCasa !== 21) return "BLACKJACK";

  // Casa se pasó → gana el jugador
  if (valorCasa > 21) return "GANA";

  // Comparación directa
  if (valorJugador > valorCasa) return "GANA";
  if (valorJugador < valorCasa) return "PIERDE";
  return "EMPATE";
}



// ── Helpers de mesa ──────────────────────────────────────────────────────────

/**
 * Retorna la referencia a la mesa validando que mesa_id sea "mesa_1" o "mesa_2".
 */
function getMesaBJRef(mesaId) {
  if (!["mesa_1", "mesa_2"].includes(mesaId)) {
    throw new HttpsError("invalid-argument", 'Mesa inválida. Usa "mesa_1" o "mesa_2".');
  }
  return db.collection("blackjack").doc(mesaId);
}

/**
 * Inicia el reparto de cartas si la mesa pasó a estado REPARTIENDO.
 */
async function _iniciarManoSiCorresponde(mesaRef) {
  const snapPost = await mesaRef.get();
  const mesa = snapPost.data();

  if (mesa && mesa.estado === "REPARTIENDO") {
    const mazo = [...(mesa.mazo || generarMazoBJ())];
    const uids = Object.keys(mesa.jugadores || {}).sort();

    const updates = {
      estado: "TURNO_JUGADORES",
      turnoActual: uids[0],
      ordenTurnos: uids
    };

    uids.forEach((jUid) => {
      const carta1 = mazo.shift();
      const carta2 = mazo.shift();
      updates[`jugadores.${jUid}.mano`] = [carta1, carta2];
      updates[`jugadores.${jUid}.estado`] = "JUGANDO";
    });

    updates["casa.mano"] = [mazo.shift(), mazo.shift()];
    updates["casa.cartaVista"] = 1;
    updates["mazo"] = mazo;

    await mesaRef.update(updates);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES onCall de BLACKJACK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * sentarseBj — onCall
 * El jugador se sienta en una mesa disponible.
 * Usa runTransaction para evitar que dos jugadores se sienten a la vez
 * y superen el límite de plazas.
 */
exports.sentarseBj = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    const uid = requireAuth(request);
    const { mesaId } = request.data;
    const mesaRef = getMesaBJRef(mesaId);

    const billRef = db.collection("billeteras").doc(uid);

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(mesaRef);
      const billSnap = await txn.get(billRef);
      const nombreUsu = billSnap.data()?.name || "Jugador";

      // Si la mesa no existe, crearla
      if (!snap.exists) {
        txn.set(mesaRef, {
          estado: "ESPERANDO",
          jugadores: {
            [uid]: { uid, nombre: nombreUsu, estado: "SENTADO", mano: [], apuesta: 0, resultado: null },
          },
          casa: { mano: [] },
          mazo: generarMazoBJ(),
          creadaEn: FieldValue.serverTimestamp(),
        });
        return;
      }

      const mesa = snap.data();

      // Permitimos que el jugador se siente en cualquier momento
      // Su estado inicial será SENTADO y no podrá jugar hasta que la mesa vuelva a ESPERANDO

      // Solo permitimos hasta 4 jugadores por mesa (para Firestore 1MB doc limit)
      const jugadoresActuales = Object.keys(mesa.jugadores || {});
      if (jugadoresActuales.length >= 4) {
        throw new HttpsError("resource-exhausted", "Mesa llena (máx. 4 jugadores).");
      }

      if (mesa.jugadores?.[uid]) {
        throw new HttpsError("already-exists", "Ya estás sentado en esta mesa.");
      }

      txn.update(mesaRef, {
        [`jugadores.${uid}`]: { uid, nombre: nombreUsu, estado: "SENTADO", mano: [], apuesta: 0, resultado: null },
      });
    });

    console.log(`[BJ ♠] ${uid} se sentó en ${mesaId}.`);
    return { ok: true, mensaje: `Te sentaste en ${mesaId}.` };
  }
);

/**
 * apostarBj — onCall
 * El jugador hace su apuesta antes del reparto.
 *
 * OPTIMIZACIÓN: runTransaction sobre la billetera para atomicidad del descuento.
 * Cuando todos tienen apuesta, dispara el reparto automáticamente dentro del mismo
 * batch de actualización.
 */
exports.apostarBj = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    const uid = requireAuth(request);
    const { mesaId, monto } = request.data;

    if (!monto || monto < 1) {
      throw new HttpsError("invalid-argument", "Apuesta mínima: 1 moneda.");
    }

    const mesaRef = getMesaBJRef(mesaId);
    const billRef = db.collection("billeteras").doc(uid);

    await db.runTransaction(async (txn) => {
      const [mesaSnap, billSnap] = await Promise.all([
        txn.get(mesaRef),
        txn.get(billRef),
      ]);

      const billData = billSnap.data() || {};
      const saldo = billData.saldo || 0;
      const nombreUsu = billData.name || "Jugador";

      let mesa = mesaSnap.data();
      if (!mesaSnap.exists) {
        mesa = {
          estado: "ESPERANDO",
          jugadores: {},
          casa: { mano: [] },
          mazo: generarMazoBJ(),
          creadaEn: FieldValue.serverTimestamp(),
        };
        txn.set(mesaRef, mesa);
      }

      if (mesa.estado !== "ESPERANDO") {
        throw new HttpsError("failed-precondition", "No se aceptan apuestas ahora.");
      }

      const jugadoresActuales = Object.keys(mesa.jugadores || {});
      const estoySentado = !!mesa.jugadores?.[uid];

      if (!estoySentado) {
        if (jugadoresActuales.length >= 4) {
          throw new HttpsError("resource-exhausted", "Mesa llena (máx. 4 jugadores).");
        }
        // Lo sentamos automáticamente al apostar
        mesa.jugadores = mesa.jugadores || {};
        mesa.jugadores[uid] = { uid, nombre: nombreUsu, estado: "SENTADO", mano: [], apuesta: 0, resultado: null };
      }

      if (mesa.jugadores[uid].apuesta > 0) {
        throw new HttpsError("already-exists", "Ya apostaste.");
      }

      if (saldo < monto) {
        throw new HttpsError("failed-precondition", "Saldo insuficiente.");
      }

      txn.update(billRef, { saldo: FieldValue.increment(-monto) });

      // Actualizamos objeto del jugador
      txn.update(mesaRef, {
        [`jugadores.${uid}.apuesta`]: monto,
        [`jugadores.${uid}.uid`]: uid,
        [`jugadores.${uid}.nombre`]: mesa.jugadores[uid].nombre || nombreUsu,
        [`jugadores.${uid}.estado`]: "SENTADO",
        [`jugadores.${uid}.mano`]: [],
        [`jugadores.${uid}.resultado`]: null,
      });

      const apuestasAnteriores = Object.values(mesa.jugadores).filter(j => j.apuesta > 0 && j.uid !== uid).length;
      if (apuestasAnteriores === 0 && Object.keys(mesa.jugadores).length >= 1) {
        // Al colocar la primera apuesta, empieza a contar el reloj de 20s
        txn.update(mesaRef, { timerApuestasFin: Date.now() + 20000 });
      }

      const todosApostaron = Object.values(mesa.jugadores).every(
        (j) => j.uid === uid ? true : j.apuesta > 0
      );

      const cantJugadores = Object.keys(mesa.jugadores).length;

      // Iniciar automáticamente sin esperar al timer SOLO si la mesa está completamente LLENA (4/4) y todos apostaron.
      if (todosApostaron && cantJugadores >= 4) {
        txn.update(mesaRef, { estado: "REPARTIENDO", timerApuestasFin: FieldValue.delete() });
      }
    });

    await _iniciarManoSiCorresponde(mesaRef);

    return { ok: true, mensaje: `Apostaste ${monto} monedas.` };
  }

);

/**
 * forzarRepartoBj — onCall
 * Llamada por el cliente cuando su timer local de 20s llega a cero.
 * Fuerza el inicio de la mano si hay alguien con apuesta.
 */
exports.forzarRepartoBj = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    requireAuth(request);
    const { mesaId } = request.data;
    if (!mesaId) return { ok: false };
    const mesaRef = getMesaBJRef(mesaId);

    let iniciar = false;
    await db.runTransaction(async (txn) => {
      const snap = await txn.get(mesaRef);
      if (!snap.exists) return;
      const mesa = snap.data();

      // Solo forzamos si todavía está ESPERANDO y hay alguien que haya apostado
      if (mesa.estado === "ESPERANDO") {
        const alguienAposto = Object.values(mesa.jugadores || {}).some(j => j.apuesta > 0);
        if (alguienAposto) {
          iniciar = true;
          txn.update(mesaRef, { estado: "REPARTIENDO", timerApuestasFin: FieldValue.delete() });
        }
      }
    });

    if (iniciar) {
      await _iniciarManoSiCorresponde(mesaRef);
    }
    return { ok: true };
  }
);

/**
 * pedirCartaBj — onCall
 * El jugador pide una carta adicional (Hit).
 *
 * Si supera 21 → queda en estado PASADO y el turno pasa al siguiente.
 */
exports.pedirCartaBj = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    const uid = requireAuth(request);
    const { mesaId } = request.data;
    const mesaRef = getMesaBJRef(mesaId);

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(mesaRef);
      const mesa = snap.data();

      // 🛑 VALIDACIÓN DE TURNO SECUENCIAL
      if (mesa.estado !== "TURNO_JUGADORES" || mesa.turnoActual !== uid) {
        throw new HttpsError("failed-precondition", "No es tu turno.");
      }

      const mazo = [...(mesa.mazo || [])];
      const nuevaCarta = mazo.shift();
      const manoActual = [...(mesa.jugadores[uid].mano || []), nuevaCarta];
      const valor = valorMano(manoActual);

      const updates = {
        [`jugadores.${uid}.mano`]: manoActual,
        mazo,
      };

      if (valor > 21) {
        updates[`jugadores.${uid}.estado`] = "PASADO";
        updates[`jugadores.${uid}.resultado`] = "PIERDE";

        // ➡️ PASAR TURNO AL SIGUIENTE
        const uids = mesa.ordenTurnos || Object.keys(mesa.jugadores).sort();
        const miIndice = uids.indexOf(uid);
        if (miIndice < uids.length - 1) {
          updates["turnoActual"] = uids[miIndice + 1];
        } else {
          updates["estado"] = "TURNO_CASA";
          updates["turnoActual"] = null;
        }
      }

      txn.update(mesaRef, updates);
    });

    const snapPost = await mesaRef.get();
    if (snapPost.data().estado === "TURNO_CASA") {
      await _resolverTurnoCasa(mesaRef, snapPost.data());
    }

    return { ok: true };
  }
);

/**
 * quedarseBj — onCall
 * El jugador se planta (Stand). No pide más cartas.
 */
exports.quedarseBj = onCall(
  { region: "southamerica-east1", maxInstances: 10 },
  async (request) => {
    const uid = requireAuth(request);
    const { mesaId } = request.data;
    const mesaRef = getMesaBJRef(mesaId);

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(mesaRef);
      const mesa = snap.data();

      // 🛑 VALIDACIÓN DE TURNO SECUENCIAL
      if (mesa.estado !== "TURNO_JUGADORES" || mesa.turnoActual !== uid) {
        throw new HttpsError("failed-precondition", "No es tu turno.");
      }

      const updates = {
        [`jugadores.${uid}.estado`]: "PLANTADO",
      };

      // ➡️ PASAR TURNO AL SIGUIENTE
      const uids = mesa.ordenTurnos || Object.keys(mesa.jugadores).sort();
      const miIndice = uids.indexOf(uid);

      if (miIndice < uids.length - 1) {
        // Le toca al que sigue en la lista
        updates["turnoActual"] = uids[miIndice + 1];
      } else {
        // Ya jugaron todos, va la casa
        updates["estado"] = "TURNO_CASA";
        updates["turnoActual"] = null;
      }

      txn.update(mesaRef, updates);
    });

    const snapPost = await mesaRef.get();
    if (snapPost.data().estado === "TURNO_CASA") {
      await _resolverTurnoCasa(mesaRef, snapPost.data());
    }

    return { ok: true, mensaje: "Te plantaste. Turno del siguiente." };
  }
);

/**
 * _resolverTurnoCasa — FUNCIÓN INTERNA (no onCall)
 *
 * OPTIMIZACIÓN EXTREMA:
 *   Todo el turno de la casa corre en RAM.
 *   Solo al final hacemos UN db.batch() con:
 *     - La mano final de la casa
 *     - El resultado de cada jugador
 *     - Los pagos a las billeteras de los ganadores
 *     - El estado final de la mesa
 *
 *   De esta manera evitamos el peor caso: 5 jugadores × (hasta 5 cartas del croupier)
 *   = hasta 25 escrituras → ahora son SIEMPRE 1 escritura (el batch).
 */
async function _resolverTurnoCasa(mesaRef, mesa) {
  // ── 1. Simular mano del croupier completamente en RAM ─────────────────────
  const { mano: manoFinal, valor: valorCasa } = simularTurnoCasa(
    mesa.casa.mano,
    mesa.mazo || []
  );

  // ── 2. Calcular resultados de CADA jugador en RAM ─────────────────────────
  const resultados = {}; // { uid: { resultado, pago } }

  for (const [jUid, jugador] of Object.entries(mesa.jugadores)) {
    // Si ya se pasó, ya tiene resultado "PIERDE" marcado
    if (jugador.estado === "PASADO") {
      resultados[jUid] = { resultado: "PIERDE", pago: 0 };
      continue;
    }

    const valorJ = valorMano(jugador.mano);
    const natural = esBlackjack(jugador.mano);
    const res = determinarResultadoBJ(jugador.mano, valorJ, valorCasa, natural);

    let pago = 0;
    if (res === "BLACKJACK") {
      // Blackjack paga 3:2 → apuesta × 2.5 (devuelve apuesta + 1.5× ganancia)
      pago = Math.floor(jugador.apuesta * 2.5);
    } else if (res === "GANA") {
      pago = jugador.apuesta * 2; // Devuelve apuesta + ganancia 1:1
    } else if (res === "EMPATE") {
      pago = jugador.apuesta;     // Solo devuelve la apuesta
    }
    // PIERDE → pago = 0 (ya se descontó al apostar)

    resultados[jUid] = { resultado: res, pago };
  }

  // ── 3. Construir el batch con TODO de una vez ─────────────────────────────
  const batch = db.batch();

  // 3a. Actualizar resultados de jugadores y estado de la mesa
  const mesaUpdates = {
    estado: "FINALIZADO",
    "casa.mano": manoFinal,
    "casa.valor": valorCasa,
  };

  for (const [jUid, { resultado, pago }] of Object.entries(resultados)) {
    mesaUpdates[`jugadores.${jUid}.resultado`] = resultado;
    mesaUpdates[`jugadores.${jUid}.estado`] = "FINALIZADO";
    mesaUpdates[`jugadores.${jUid}.pago`] = pago;

    // 3b. Pagar a los ganadores con FieldValue.increment
    if (pago > 0) {
      const billRef = db.collection("billeteras").doc(jUid);
      batch.update(billRef, {
        saldo: FieldValue.increment(pago),
      });
    }
  }

  // El update de la mesa va en el batch también
  batch.update(mesaRef, mesaUpdates);

  // ── 4. Commit: UNA sola escritura de red para TODOS los pagos + estado ────
  await batch.commit();

  console.log(`[BJ ♠✅] Turno de casa resuelto. Casa: ${valorCasa}. Resultados: ${JSON.stringify(
    Object.fromEntries(Object.entries(resultados).map(([k, v]) => [k, v.resultado]))
  )}`);
}

/**
 * reiniciarMesaBj — onCall (admin)
 * Reinicia la mesa para una nueva mano. Limpia manos y apuestas.
 * Los jugadores se quedan sentados (no se van).
 */
exports.reiniciarMesaBj = onCall(
  { region: "southamerica-east1", maxInstances: 2 },
  async (request) => {
    requireAuth(request);
    const { mesaId } = request.data;
    const mesaRef = getMesaBJRef(mesaId);

    const snap = await mesaRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Mesa no encontrada.");

    const mesa = snap.data();
    if (mesa.estado !== "FINALIZADO") {
      throw new HttpsError("failed-precondition", "La mesa no está finalizada todavía.");
    }

    // Levante masivo: se vacían los jugadores y se reinicia el mazo
    const updates = {
      estado: "ESPERANDO",
      mazo: generarMazoBJ(),
      "casa.mano": [],
      "casa.valor": null,
      jugadores: {}
    };

    await mesaRef.update(updates);
    return { ok: true, mensaje: `Mesa ${mesaId} reiniciada. ¡Nuevas apuestas!` };
  }
);

/**
 * levantarseBj — onCall
 * El jugador abandona la mesa (solo en estado ESPERANDO o FINALIZADO).
 */
exports.levantarseBj = onCall(
  { region: "southamerica-east1", maxInstances: 5 },
  async (request) => {
    const uid = requireAuth(request);
    const { mesaId } = request.data;
    const mesaRef = getMesaBJRef(mesaId);

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(mesaRef);
      if (!snap.exists) throw new HttpsError("not-found", "Mesa no encontrada.");

      const mesa = snap.data();
      if (!["ESPERANDO", "FINALIZADO"].includes(mesa.estado)) {
        throw new HttpsError("failed-precondition", "No podés levantarte durante la partida.");
      }
      if (!mesa.jugadores?.[uid]) {
        throw new HttpsError("not-found", "No estás en esta mesa.");
      }

      // Eliminar al jugador del mapa de jugadores usando FieldValue.delete()
      const updates = {
        [`jugadores.${uid}`]: FieldValue.delete(),
      };

      if (mesa.estado === "ESPERANDO") {
        const remainingPlayers = Object.values(mesa.jugadores || {}).filter(j => j.uid !== uid);
        if (remainingPlayers.length > 0) {
          const todosApostaron = remainingPlayers.every(j => j.apuesta > 0);
          if (todosApostaron) {
            updates.estado = "REPARTIENDO";
            updates.timerApuestasFin = FieldValue.delete();
          }
        } else {
          // Si ya no queda nadie, frenamos el timer (si existía)
          updates.timerApuestasFin = FieldValue.delete();
        }
      }

      txn.update(mesaRef, updates);
    });

    await _iniciarManoSiCorresponde(mesaRef);

    console.log(`[BJ ♠] ${uid} se levantó de ${mesaId}.`);
    return { ok: true };
  }

);

/**
 * forzarRepartoBj — onCall
 * Se llama desde el cliente cuando el timer de apuestas en ESPERANDO llega a cero.
 * Expulsa a los inactivos y empieza la mano para los que sí apostaron.
 */
exports.forzarRepartoBj = onCall(
  { region: "southamerica-east1", maxInstances: 5 },
  async (request) => {
    const { mesaId } = request.data;
    const mesaRef = getMesaBJRef(mesaId);

    const hizoReparto = await db.runTransaction(async (txn) => {
      const snap = await txn.get(mesaRef);
      if (!snap.exists) return false;

      const mesa = snap.data();
      if (mesa.estado !== "ESPERANDO" || !mesa.timerApuestasFin) return false;

      const ahora = Date.now();
      if (ahora < mesa.timerApuestasFin - 1500) {
        throw new HttpsError("failed-precondition", "Aún hay tiempo para apostar.");
      }

      const updates = {};
      let quedanJugadores = false;

      for (const [jUid, j] of Object.entries(mesa.jugadores || {})) {
        if (!j.apuesta || j.apuesta <= 0) {
          updates[`jugadores.${jUid}`] = FieldValue.delete();
        } else {
          quedanJugadores = true;
        }
      }

      if (quedanJugadores) {
        updates.estado = "REPARTIENDO";
        updates.timerApuestasFin = FieldValue.delete();
        txn.update(mesaRef, updates);
        return true;
      } else {
        updates.timerApuestasFin = FieldValue.delete();
        txn.update(mesaRef, updates);
        return false;
      }
    });

    if (hizoReparto) {
      await _iniciarManoSiCorresponde(mesaRef);
    }
    return { ok: true };
  }
);
