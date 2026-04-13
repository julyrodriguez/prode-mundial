// Incluye: Sync Mundial, Champions, Brasil, Argentina y Cálculo de Puntos.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, writeBatch } from 'firebase/firestore';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔍 Atajo para lectura pura (Para saltarse la RAM y leer directo de la nube)
const originalGetDoc = getDoc;

const API_KEY = process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_SECRET;

// ─── MEMORIA GLOBAL ÚNICA (NO TOCAR) ─────────────────────────────────────────
if (global.GLOBAL_PRODE_RAM === undefined) {
  global.GLOBAL_PRODE_RAM = {
    _lastFullRun: 0,
    _matchesLoaded: false
  };
}
const GLOBAL_PRODE_RAM = global.GLOBAL_PRODE_RAM;
// ──────────────────────────────────────────────────────────────────────────────

async function getDocOptimized(docRef) {
  let cacheKey = docRef.path;
  if (cacheKey.startsWith('/')) cacheKey = cacheKey.substring(1);

  const now = Date.now();
  const TTL = 10 * 60 * 1000;

  if (GLOBAL_PRODE_RAM[cacheKey] && (now - (GLOBAL_PRODE_RAM[cacheKey]._loadedAt || 0) < TTL)) {
    console.log(`[RAM CACHE] ⚡ ÉXITO: Sirviendo "${cacheKey}"`);
    return {
      exists: () => true,
      data: () => GLOBAL_PRODE_RAM[cacheKey].data
    };
  }

  console.log(`[FIREBASE] ☁️  DESCARGANDO: "${cacheKey}"...`);
  const snap = await originalGetDoc(docRef);

  if (snap.exists()) {
    GLOBAL_PRODE_RAM[cacheKey] = {
      data: snap.data(),
      _loadedAt: now
    };
  }
  return snap;
}

function invalidateRamCache(path) {
  let cacheKey = path;
  if (cacheKey.startsWith('/')) cacheKey = cacheKey.substring(1);
  if (GLOBAL_PRODE_RAM[cacheKey]) {
    delete GLOBAL_PRODE_RAM[cacheKey];
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// Variables Globales
const COMPETITIONS = [
  { id: 2000, cacheKey: 'worldCupMatches' },
  { id: 2001, cacheKey: 'championsMatches' },
  { id: 2013, cacheKey: 'brazilMatches' }
];
const KNOCKOUT_STAGES = ['LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'];

// ----------------------------------------------------------------------------
// 1. HELPERS Y LOGICA DE SYNC.JS
// ----------------------------------------------------------------------------
// Vercel Serverless Function — Sincroniza Mundial y Champions desde football-data.org a Firestore
// Se llama mediante un Cron-Job
// URL: /api/sync?token=TU_CRON_SECRET





// Evaluador Inteligente: Solo escribimos si hay partidos cercanos o si toca horario fijo cada 4hrs.
function shouldSyncMatches(matches, forceSync) {
  if (forceSync === 'true') {
    console.log('[FORCE SYNC] Saltando evaluación inteligente. Forzando escritura.');
    return true;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Guardado general obligatorio cada 4 horas exactas (ej: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
  if (currentHour % 4 === 0 && currentMinute <= 15) {
    return true;
  }

  const nowMs = Date.now();
  const windowBefore = 2 * 60 * 60 * 1000; // 2 hs antes del arranque
  const windowAfter = 4 * 60 * 60 * 1000;  // 4 hs después del arranque (equivale a 2hs terminados aprox)

  for (const match of matches) {
    if (match.status === 'IN_PLAY' || match.status === 'PAUSED') return true;

    if (match.utcDate) {
      const matchTimeMs = new Date(match.utcDate).getTime();
      const diffMs = matchTimeMs - nowMs;
      // Partido jugando dentro de este rango temporal (-4hs a +2hs en la linea de tiempo)
      if (diffMs >= -windowAfter && diffMs <= windowBefore) {
        return true;
      }
    }
  }
  return false;
}

// Helper para sincronizar tabla de partidos
async function syncMatches(competitionId, collectionName, metadataDocName, forceSync, rebuild, robotShields = {}) {
  // ── REGLA DE ESCUDO GLOBAL: Si el robot está activo, la API oficial NO TOCA NADA ──
  const shieldMap = {
    'worldCupMatches': 'worldCupActiveAt',
    'championsMatches': 'championsActiveAt',
    'brazilMatches': 'brazilActiveAt'
  };
  const robotActiveAt = robotShields[shieldMap[collectionName]];
  const isProtectedGlobal = robotActiveAt && (Date.now() - new Date(robotActiveAt).getTime() < 5 * 60 * 1000);

  // VÁLVULA DE ESCAPE: Cada 20 min (:00, :20, :40) ignoramos el escudo para oficializar finales.
  const timeNow = new Date();
  const currentMin = timeNow.getMinutes();
  const isVentilationTime = currentMin % 20 === 0;

  if (isProtectedGlobal && forceSync !== 'true' && !isVentilationTime) {
    console.log(`[SYNC 🛡️] ${collectionName} PROTEGIDA por Robot. Sin cambios de API oficial.`);
    return { count: 0, skipped: true, status: "Protección Global Activa" };
  } else if (isProtectedGlobal && isVentilationTime) {
    console.log(`[SYNC 💨 ${timeNow.toLocaleTimeString()}] VENTILACIÓN ACTIVA: Forzando sincronización oficial para refrescar "${collectionName}".`);
  }

  const res = await fetch(`https://api.football-data.org/v4/competitions/${competitionId}/matches`, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  if (!res.ok) throw new Error(`Error fetching matches for ${competitionId}: ${res.status}`);
  const data = await res.json();
  const matches = data.matches || [];

  // ─── OPTIMIZACIÓN: Cargar caché actual para comparar (Diffing) y para la RAM ───
  let existingCache = [];
  let existingLastFinished = '';
  try {
    const cacheSnap = await getDocOptimized(doc(db, 'cache', collectionName));
    if (cacheSnap.exists()) {
      existingCache = cacheSnap.data().matches || [];
      existingLastFinished = cacheSnap.data().lastFinishedMatchUpdateAt || '';
    }
  } catch (e) {
    console.warn(`[SYNC] No se pudo leer caché previo de ${collectionName}`);
  }

  if (!shouldSyncMatches(matches, forceSync)) {
    console.log(`[SYNC 🛡️] ${collectionName} saltada: Inteligencia detectó 0 partidos cercanos a jugarse.`);
    return { count: 0, skipped: true, matches: existingCache, status: "Ahorro activado" };
  }

  // Mapa para búsqueda rápida por ID
  const cacheMap = new Map(existingCache?.map(m => [m.id, m]));

  let anyMatchChanged = false;
  const daysSet = new Set();

  let anyMatchFinished = false;
  for (const match of matches) {
    if (match.utcDate) {
      const matchDate = new Date(match.utcDate);
      const argDate = new Date(matchDate.getTime() - (3 * 60 * 60 * 1000));
      match.argDay = argDate.toISOString().split('T')[0];
      match.argTime = argDate.toISOString().split('T')[1].substring(0, 5);
      match.argentinaFullString = `${match.argDay} ${match.argTime} hs`;
      daysSet.add(match.argDay);
    }

    // DIF COMPARISON: ¿Ha cambiado algo relevante?
    const cached = cacheMap.get(match.id);

    // REGLA DE ESCUDO: No sincronizamos si un Raspador inyectó un gol recientemente
    // y la API oficial todavía no se enteró (rollback avoidance).
    const isProtected = cached?.source === 'SCRAPER' && (Date.now() - new Date(cached.scrapedAt).getTime() < 10 * 60 * 1000);

    let hasChanged = !cached || cached.status !== match.status || cached.lastUpdated !== match.lastUpdated;

    if (!hasChanged) {
      const freshSum = (match.score?.fullTime?.home || 0) + (match.score?.fullTime?.away || 0);
      const cachedSum = (cached.score?.fullTime?.home || 0) + (cached.score?.fullTime?.away || 0);

      if (isProtected) {
        // Bajo escudo, solo aceptamos cambios si hay MÁS goles o cambio a FINISHED
        if (freshSum > cachedSum || match.status === 'FINISHED') {
          hasChanged = true;
        }
      } else {
        // Sin escudo, cualquier cambio en marcadores dispara la actualización
        if (cached.score?.fullTime?.home !== match.score?.fullTime?.home ||
          cached.score?.fullTime?.away !== match.score?.fullTime?.away) {
          hasChanged = true;
        }
      }
    }

    if (hasChanged) {
      anyMatchChanged = true;
    }

    // Detección de fin de partido para gatillar puntos
    if (match.status === 'FINISHED' && (!cached || cached.lastUpdated !== match.lastUpdated || cached.status !== 'FINISHED')) {
      anyMatchFinished = true;
    }
  }

  const daysArr = daysSet.size > 0 ? Array.from(daysSet).sort() : [];

  // Metadata: Guardamos los días disponibles para filtros
  if (daysArr.length > 0 && metadataDocName) {
    const metaRef = doc(db, 'metadata', metadataDocName);
    await setDoc(metaRef, { availableDays: daysArr, serverSecret: process.env.CRON_SECRET }, { merge: true });
    invalidateRamCache(`metadata/${metadataDocName}`);
  }

  // Si no hubo cambios y no es un rebuild/forceSync, ahorramos la escritura pesada del caché
  if (!anyMatchChanged && rebuild !== 'true' && forceSync !== 'true') {
    console.log(`[SYNC 🛡️] ${collectionName} saltada: 0 cambios detectados respecto al caché.`);
    return { count: 0, skipped: false, matches: existingCache, status: "Sin cambios", anyFinished: false };
  }

  // === CACHE: Empaquetamos TODOS los partidos en 1 solo documento ===
  let maxLastUpdatedFinished = null;

  const lightMatches = matches.map(m => {
    if (m.status === 'FINISHED' && m.lastUpdated) {
      if (!maxLastUpdatedFinished || m.lastUpdated > maxLastUpdatedFinished) {
        maxLastUpdatedFinished = m.lastUpdated;
      }
    }

    return {
      id: m.id, compId: competitionId, stage: m.stage, status: m.status, utcDate: m.utcDate,
      lastUpdated: m.lastUpdated || null,
      argDay: m.argDay, argTime: m.argTime,
      venue: m.venue || null,
      homeTeam: m.homeTeam ? {
        id: m.homeTeam.id, name: m.homeTeam.name, shortName: m.homeTeam.shortName,
        tla: m.homeTeam.tla, crest: m.homeTeam.crest,
        formation: m.homeTeam.formation || null,
        lineup: m.homeTeam.lineup || [],
      } : null,
      awayTeam: m.awayTeam ? {
        id: m.awayTeam.id, name: m.awayTeam.name, shortName: m.awayTeam.shortName,
        tla: m.awayTeam.tla, crest: m.awayTeam.crest,
        formation: m.awayTeam.formation || null,
        lineup: m.awayTeam.lineup || [],
      } : null,
      score: m.score || null,
      group: m.group || null,
      goals: (m.goals || []).map(g => ({
        minute: g.minute, type: g.type,
        team: g.team ? { id: g.team.id, name: g.team.name } : null,
        scorer: g.scorer ? { id: g.scorer.id, name: g.scorer.name } : null,
      })),
      bookings: (m.bookings || []).map(b => ({
        minute: b.minute, card: b.card,
        player: b.player ? { id: b.player.id, name: b.player.name } : null,
        team: b.team ? { id: b.team.id, name: b.team.name, shortName: b.team.shortName } : null,
      })),
    };
  });

  await setDoc(doc(db, 'cache', collectionName), {
    matches: lightMatches,
    availableDays: daysArr,
    updatedAt: new Date().toISOString(),
    lastFinishedMatchUpdateAt: anyMatchFinished ? new Date().toISOString() : (existingLastFinished || maxLastUpdatedFinished || ''),
    serverSecret: process.env.CRON_SECRET
  });

  invalidateRamCache(`cache/${collectionName}`);

  console.log(`[SYNC ✅] Empaquetados y guardados ${lightMatches.length} partidos en cache/${collectionName}`);
  return { count: anyMatchChanged ? 1 : 0, skipped: false, matches: lightMatches, status: "Actualizado exitosamente en Firestore.", anyFinished: anyMatchFinished };
}


// Helper para sincronizar tabla de posiciones
async function syncStandings(competitionId, docName, isSkipped, anyFinished) {
  if (isSkipped) return { count: 0, skipped: true };

  const now = new Date();
  const every30Min = now.getMinutes() % 30 === 0;

  // DIETA STANDINGS: Solo descargar si alguien terminó en este ciclo o cada 30 min.
  // Esto evita el Error 429 cuando hay muchos partidos en vivo.
  if (!anyFinished && !every30Min) {
    return { count: 0, skipped: true, motivo: "Ahorro Standing activo" };
  }

  const res = await fetch(`https://api.football-data.org/v4/competitions/${competitionId}/standings`, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  if (!res.ok) {
    console.warn(`[SYNC STANDINGS ⚠️] Error ${res.status} para ${competitionId}. Continuando...`);
    return { count: 0, skipped: true, error: res.status };
  }
  const data = await res.json();
  const standings = data.standings || [];

  await setDoc(doc(db, 'standingsCache', docName), {
    competitionParams: competitionId,
    updatedAt: new Date().toISOString(),
    standings: standings,
    serverSecret: process.env.CRON_SECRET
  });
  return { count: standings.length, skipped: false };
}

async function executeSync(request, response) {
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  try {
    let result = {};
    const forceSync = request.query?.force || 'false';
    const rebuild = request.query?.rebuild || 'false';

    // ── Paso 0: Leer escudos de robot (Bypass RAM) ──
    const shSnap = await originalGetDoc(doc(db, 'cache', 'robotShield'));
    const robotShields = shSnap.exists() ? shSnap.data() : {};

    // Lanzamos las 3 competiciones EN PARALELO para ahorrar latencia (Speed Hack)
    const [wcRes, clRes, braRes] = await Promise.all([
      syncMatches(2000, 'worldCupMatches', 'worldCup', forceSync, rebuild, robotShields),
      syncMatches(2001, 'championsMatches', 'champions', forceSync, rebuild, robotShields),
      syncMatches(2013, 'brazilMatches', 'brazil', forceSync, rebuild, robotShields)
    ]);

    // Standings en paralelo también (con Dieta inteligente)
    const [wcStand, clStand, braStand] = await Promise.all([
      syncStandings(2000, 'worldCup', wcRes.skipped, wcRes.anyFinished),
      syncStandings(2001, 'champions', clRes.skipped, clRes.anyFinished),
      syncStandings(2013, 'brazil', braRes.skipped, braRes.anyFinished)
    ]);

    result.wcMatches = { count: wcRes.count, skipped: wcRes.skipped, status: wcRes.status, finished: wcRes.anyFinished };
    result.wcStandings = wcStand;
    result.championsMatches = { count: clRes.count, skipped: clRes.skipped, status: clRes.status, finished: clRes.anyFinished };
    result.championsStandings = clStand;
    result.brazilMatches = { count: braRes.count, skipped: braRes.skipped, status: braRes.status, finished: braRes.anyFinished };

    response.status(200).json({
      estado: "COMPLETADO",
      ejecucion_forzada: forceSync === 'true',
      escrituras_firestore: {
        mundial: { actualizado: !wcRes.skipped && wcRes.count > 0, terminado: wcRes.anyFinished },
        champions: { actualizado: !clRes.skipped && clRes.count > 0, terminado: clRes.anyFinished },
        brasileirao: { actualizado: !braRes.skipped && braRes.count > 0, terminado: braRes.anyFinished }
      }
    });

    return {
      mundial: wcRes.matches || [],
      champions: clRes.matches || [],
      brasil: braRes.matches || []
    };
  } catch (error) {
    console.error('[SYNC ERROR] Fallo crítico:', error);
    return response.status(500).json({ error: error.message });
  }
}


// ----------------------------------------------------------------------------
// 2. HELPERS Y LOGICA DE LIVE.JS
// ----------------------------------------------------------------------------
/**
 * api/live.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint de livescore optimizado.
 *
 * Lógica:
 *  1) Lee los 3 caches de Firestore (3 lecturas baratas).
 *  2) Revisa si alguna competición tiene partidos EN VIVO.
 *  3) Si NO hay: devuelve 200 sin llamar a la API externa.
 *  4) Si SÍ hay: llama a football-data.org por competición, actualiza el cache.
 *
 * Usa Firebase Client SDK (igual que sync.js y calculate-scores.js) para
 * evitar el crash de require() en el entorno ESM de Vercel.
 */






// ─── Helpers ──────────────────────────────────────────────────────────────────
const isLiveStatus = (m) =>
  m.status === 'IN_PLAY' || m.status === 'PAUSED' ||
  m.status === 'HALFTIME' || m.status === 'EXTRA_TIME';

const fetchLiveFromAPI = async (competitionId) => {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${competitionId}/matches?status=LIVE`,
    { headers: { 'X-Auth-Token': API_KEY } }
  );
  if (!res.ok) {
    console.warn(`[live] API error ${res.status} para competición ${competitionId}`);
    return [];
  }
  const data = await res.json();
  return data.matches || [];
};

// Merge: aplica datos frescos de la API al match que teníamos en cache
const mergeMatch = (cached, fresh) => {
  // LÓGICA DE ESCUDO: Protegemos los goles del Raspador (native-stats)
  // Si tenemos un marcador de Raspador (source: 'SCRAPER') y es muy reciente (< 10 min),
  // solo aceptamos que la API oficial lo cambie si la API también tiene un gol o el partido terminó.
  const isProtected = cached?.source === 'SCRAPER' && (Date.now() - new Date(cached.scrapedAt).getTime() < 10 * 60 * 1000);

  let finalScore = fresh.score || cached.score;

  if (isProtected && fresh.status !== 'FINISHED') {
    const freshSum = (fresh.score?.fullTime?.home || 0) + (fresh.score?.fullTime?.away || 0);
    const cachedSum = (cached.score?.fullTime?.home || 0) + (cached.score?.fullTime?.away || 0);

    // Si la API oficial "dice menos" que el Raspador, nos quedamos con el Raspador por ahora.
    if (freshSum < cachedSum) {
      finalScore = cached.score;
    }
  }

  return {
    ...cached,
    status: fresh.status,
    score: finalScore,
    lastUpdated: fresh.lastUpdated || cached?.lastUpdated || null,
    source: isProtected ? 'SCRAPER' : 'API', // Marcamos si aún estamos bajo escudo
    scrapedAt: cached?.scrapedAt || null,
    goals: (fresh.goals || []).map(g => ({
      minute: g.minute, type: g.type,
      team: g.team ? { id: g.team.id, name: g.team.name } : null,
      scorer: g.scorer ? { id: g.scorer.id, name: g.scorer.name } : null,
    })),
    bookings: (fresh.bookings || []).map(b => ({
      minute: b.minute, card: b.card,
      player: b.player ? { id: b.player.id, name: b.player.name } : null,
      team: b.team ? { id: b.team.id, name: b.team.name, shortName: b.team.shortName } : null,
    })),
    homeTeam: {
      ...cached.homeTeam,
      formation: fresh.homeTeam?.formation || cached.homeTeam?.formation || null,
      lineup: fresh.homeTeam?.lineup || cached.homeTeam?.lineup || [],
    },
    awayTeam: {
      ...cached.awayTeam,
      formation: fresh.awayTeam?.formation || cached.awayTeam?.formation || null,
      lineup: fresh.awayTeam?.lineup || cached.awayTeam?.lineup || [],
    },
  };
};

// ─── Handler principal ────────────────────────────────────────────────────────
async function executeLive(request, response) {

  try {
    const isForce = request.query?.force === 'true';
    const now = new Date().toISOString();
    console.log(`[live] Verificando partidos en vivo: ${now}`);

    // ── Paso 1: leer escudos del Robot (Bypass de RAM obligatorio) ────────────
    const shieldSnap = await originalGetDoc(doc(db, 'cache', 'robotShield')); // Lectura directa
    const shields = shieldSnap.exists() ? shieldSnap.data() : {};

    // ── Paso 2: leer los caches en paralelo (SOLO si no están en escudo activo) ──
    const snapshots = await Promise.all(
      COMPETITIONS.map(async (c) => {
        const shieldMap = {
          'worldCupMatches': 'worldCupActiveAt',
          'championsMatches': 'championsActiveAt',
          'brazilMatches': 'brazilActiveAt'
        };
        const robotActiveAt = shields[shieldMap[c.cacheKey]];
        const isShielded = robotActiveAt && (Date.now() - new Date(robotActiveAt).getTime() < 5 * 60 * 1000);

        if (isShielded) return { id: c.cacheKey, skippedByShield: true };

        const snap = await getDocOptimized(doc(db, 'cache', c.cacheKey));
        return { id: c.cacheKey, snap };
      })
    );

    // ── Paso 3: detectar competiciones con partidos en vivo ───────────────────
    const liveComps = [];
    snapshots.forEach((item, i) => {
      const comp = COMPETITIONS[i];
      if (item.skippedByShield) return; // Si hay escudo, lo manejamos después

      const snap = item.snap;
      if (!snap || !snap.exists()) return;
      const matches = snap.data().matches || [];
      const liveMatches = matches.filter(isLiveStatus);
      if (liveMatches.length > 0) {
        liveComps.push({
          ...COMPETITIONS[i],
          cachedMatches: matches,
          liveCount: liveMatches.length,
        });
      }
    });

    // ── Paso 4: calcular escudos para decidir salida ────────────────────────
    const shieldedCount = snapshots.filter(s => s.skippedByShield).length;

    if (liveComps.length === 0 && shieldedCount === 0) {
      console.log('[LIVE 💤] MODO REPOSO: La inteligencia no detectó partidos EN VIVO. Firebase intacto.');
      return response.status(200).json({
        estado: "MODO REPOSO",
        mensaje: "No hay partidos en juego en este momento. 0 llamadas a la API externa.",
        revisado_a_las: now,
        torneos_actualizados: []
      });
    }

    if (liveComps.length === 0 && shieldedCount > 0) {
      console.log(`[LIVE 🛡️] Robot vigilando ${shieldedCount} liga(s). Forzando MODO ACTIVO para unificar goles.`);
    }

    console.log(`[LIVE 🚀] MODO ACTIVO: Competiciones con goles en vivo: ${liveComps.map(c => c.id).join(', ')}`);

    // ── Paso 4: actualizar solo los partidos en vivo de cada competición ──────
    const updateResults = [];
    await Promise.all(liveComps.map(async (comp) => {
      try {
        // --- RADAR DE ESCUDO CENTRALIZADO ---
        const item = snapshots.find(s => s.id === comp.cacheKey);
        if (item?.skippedByShield) {
          console.log(`[LIVE 🛡️] Liga ${comp.id} bajo protección de Robot Shield (Step 1 Skip). OK.`);
          updateResults.push({ torneo: comp.id, actualizado: false, motivo: "Protección por Latido de Robot" });
          return;
        }

        const freshMatches = await fetchLiveFromAPI(comp.id);

        if (!freshMatches.length) {
          updateResults.push({ competition: comp.id, updated: 0, note: 'API no devolvió partidos en vivo' });
          return;
        }

        // Mapa id → match fresco
        const freshMap = {};
        freshMatches.forEach(m => { freshMap[m.id] = m; });

        // Merge: actualizar solo los partidos que coinciden
        const oldFp = buildMatchFingerprint(comp.cachedMatches, []);
        let updatedCount = 0;
        let changeDetected = false;

        const newMatches = comp.cachedMatches.map(cached => {
          const fresh = freshMap[cached.id];
          if (fresh) {
            // DETECCIÓN DE CAMBIO REAL CON ESCUDO
            const isProtected = cached?.source === 'SCRAPER' && (Date.now() - new Date(cached.scrapedAt).getTime() < 10 * 60 * 1000);
            const freshSum = (fresh.score?.fullTime?.home || 0) + (fresh.score?.fullTime?.away || 0);
            const cachedSum = (cached.score?.fullTime?.home || 0) + (cached.score?.fullTime?.away || 0);

            let isDifferent = cached.status !== fresh.status;
            if (isProtected) {
              // Solo diferente si hay MÁS goles en la API oficial o terminó
              if (freshSum > cachedSum || (fresh.status === 'FINISHED' && cached.status !== 'FINISHED')) isDifferent = true;
            } else {
              // Sin protección, cualquier marcador distinto es válido
              if (cached.score?.fullTime?.home !== fresh.score?.fullTime?.home ||
                cached.score?.fullTime?.away !== fresh.score?.fullTime?.away) isDifferent = true;
            }

            if (isDifferent) {
              changeDetected = true;
              updatedCount++;
              return mergeMatch(cached, fresh);
            }
          }
          return cached;
        });

        // 1 escritura por competición SOLO si hubo cambios reales
        if (changeDetected || isForce) {
          await updateDoc(doc(db, 'cache', comp.cacheKey), {
            matches: newMatches,
            liveLastUpdatedAt: now,
            serverSecret: process.env.CRON_SECRET
          });
          invalidateRamCache(`cache/${comp.cacheKey}`);
          updateResults.push({ torneo: comp.id, actualizado: true, cambios: updatedCount });
          console.log(`[LIVE 🚀] Cambios detectados en ${comp.id}. Marcadores actualizados en Firestore.`);
        } else {
          updateResults.push({ torneo: comp.id, actualizado: false, motivo: "Marcadores idénticos" });
          console.log(`[LIVE 💤] Sin cambios en ${comp.id}. Ahorrando escritura en Firestore.`);
        }

        // --- GATILLO ARGENTINA (Solo para Liga Local) ---
        // Los internacionales van por el cron-live-scraper, pero Argentina sigue aquí.
        const argLiveIds = freshMatches.filter(m => m.id.toString().startsWith('arg26-') && (m.status === 'IN_PLAY' || m.status === 'LIVE')).map(m => m.id);

        if (argLiveIds.length > 0) {
          const protocol = 'https';
          const host = request.headers?.host || 'prode.jariel.com.ar';
          const secret = process.env.CRON_SECRET;

          console.log(`[ARG 🇦🇷] Sincronizando ${argLiveIds.length} partido(s) de Argentina en vivo...`);

          // Para Argentina usamos el executeArgentina que ya está en el flujo principal,
          // pero esto asegura que si se disparan crones paralelos, se procesen.
          // No necesitamos fetch externo aquí porque executeArgentina se llama al final del handler.
        }

      } catch (err) {
        console.error(`[LIVE ERROR] Error en competición ${comp.id}:`, err.message);
        updateResults.push({ torneo: comp.id, error: err.message });
      }
    }));

    return response.status(200).json({
      estado: "MODO ACTIVO",
      mensaje: "Live scores actualizados en la base de datos.",
      revisado_a_las: now,
      torneos_actualizados: updateResults,
    });
  } catch (err) {
    console.error('[LIVE CRITICAL] Fallo fatal:', err.message);
    return response.status(500).json({ error: err.message });
  }
}


// ----------------------------------------------------------------------------
// 3. HELPERS Y LOGICA DE ARGENTINA-SYNC.JS
// ----------------------------------------------------------------------------
/**
 * api/argentina-sync.js (VERCEL STABLE - NO PLAYWRIGHT)
 * ─────────────────────────────────────────────────────────────────────────────
 * Solución para Vercel: 100% fetch() + Regex.
 * Elimina la dependencia de Chromium para evitar crashes 500 en Serverless.
 * ─────────────────────────────────────────────────────────────────────────────
 */



// Genera un fingerprint liviano de los partidos para detectar cambios
function buildMatchFingerprint(matches, availableDays) {
  if (!matches.length) return 'empty';

  // Generamos un string robusto que contiene estados y marcadores de TODOS los partidos
  // Esto detecta: goles locales, visitantes, cambios TIMED -> IN_PLAY -> FINISHED.
  const statusScoreChain = matches.map(m =>
    (m.status || '') + (m.score?.fullTime?.home ?? '-') + ':' + (m.score?.fullTime?.away ?? '-')
  ).join('|');

  const first = matches[0];
  const last = matches[matches.length - 1];

  return [
    matches.length,
    first.argDay,
    last.argDay,
    availableDays.length,
    statusScoreChain
  ].join('|');
}

// Genera fingerprint de la tabla de posiciones
function buildTableFingerprint(table) {
  if (!table.length) return 'empty';
  return [
    table.length,
    table[0]?.team?.name,
    table[0]?.points,
    table[table.length - 1]?.team?.name,
    table.map(r => r.points).join(','),
  ].join('|');
}


const TEAM_MAP = {
  "Aldosivi": { id: "2055", name: "Aldosivi" },
  "Defensa y Justicia": { id: "2626", name: "Def y Justicia" },
  "Banfield": { id: "2648", name: "Banfield" },
  "Huracan": { id: "2627", name: "Huracan" },
  "Huracán": { id: "2627", name: "Huracan" },
  "Union": { id: "2630", name: "Union" },
  "Unión": { id: "2630", name: "Union" },
  "Platense": { id: "2628", name: "Platense" },
  "Central Cordoba de Santiago del Estero": { id: "137603", name: "C. Cordoba (SdE)" },
  "Central Córdoba de Santiago del Estero": { id: "137603", name: "C. Cordoba (SdE)" },
  "Gimnasia y Esgrima de La Plata": { id: "2650", name: "Gimnasia (LP)" },
  "Gimnasia y Esgrima de Mendoza": { id: "9966", name: "Gimnasia (M)" },
  "Instituto": { id: "137786", name: "Instituto" },
  "Velez Sarsfield": { id: "2621", name: "Velez Sarsfield" },
  "Vélez Sarsfield": { id: "2621", name: "Velez Sarsfield" },
  "Boca Juniors": { id: "2643", name: "Boca Juniors" },
  "River Plate": { id: "2620", name: "River Plate" },
  "Estudiantes de La Plata": { id: "2051", name: "Estudiantes" },
  "Independiente": { id: "2644", name: "Independiente" },
  "Racing Club": { id: "2622", name: "Racing Club" },
  "San Lorenzo": { id: "2645", name: "San Lorenzo" },
  "San Lorenzo de Almagro": { id: "2645", name: "San Lorenzo" },
  "Rosario Central": { id: "2623", name: "Rosario Central" },
  "Newells Old Boys": { id: "2646", name: "Newells" },
  "Newell's Old Boys": { id: "2646", name: "Newells" },
  "Talleres de Cordoba": { id: "136674", name: "Talleres (C)" },
  "Talleres de Córdoba": { id: "136674", name: "Talleres (C)" },
  "Belgrano": { id: "2647", name: "Belgrano" },
  "Lanus": { id: "2625", name: "Lanus" },
  "Lanús": { id: "2625", name: "Lanus" },
  "Argentinos Juniors": { id: "2649", name: "Argentinos" },
  "Tigre": { id: "2651", name: "Tigre" },
  "Sarmiento": { id: "2629", name: "Sarmiento" },
  "Independiente Rivadavia": { id: "2652", name: "Ind Rivadavia" },
  "Atletico Tucuman": { id: "2653", name: "Atl Tucuman" },
  "Atlético Tucumán": { id: "2653", name: "Atl Tucuman" },
  "Barracas Central": { id: "137771", name: "Barracas C." },
  "Deportivo Riestra": { id: "137782", name: "Riestra" },
};

const MONTHS = {
  Jan: 0, Ene: 0, Feb: 1, Mar: 2, Apr: 3, Abr: 3,
  May: 4, Jun: 5, Jul: 6, Aug: 7, Ago: 7,
  Sep: 8, Set: 8, Oct: 9, Nov: 10, Dec: 11, Dic: 11
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function parseTeamsFromHref(href) {
  const slugMatch = href.match(/\/event\/\d+-(.+)$/);
  if (!slugMatch) return [null, null];
  const slug = slugMatch[1];
  const vsParts = slug.split('-vs-');
  if (vsParts.length !== 2) return [null, null];
  const toName = (s) => s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return [toName(vsParts[0]), toName(vsParts[1])];
}

function mapTeam(nameFromHTML, nameFromSlug) {
  if (nameFromHTML && TEAM_MAP[nameFromHTML]) return TEAM_MAP[nameFromHTML];
  if (nameFromSlug && TEAM_MAP[nameFromSlug]) return TEAM_MAP[nameFromSlug];
  return { name: nameFromHTML || nameFromSlug || 'Desconocido' };
}

async function executeArgentina(req, res) {
  const { token, force, rebuild } = req.query;
  const forceSync = force === 'true';
  const isAuthorized = process.env.IS_LOCAL_DEV || token === process.env.CRON_SECRET;
  if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const nowDt = new Date();
    const currentMin = nowDt.getMinutes();
    const currentHour = nowDt.getHours();

    // ESTRATEGIA "DIETA": Solo descargamos lo pesado cuando toca.
    const mustFetchTable = (currentMin % 15 === 0) || forceSync || rebuild;
    const mustFetchSchedules = (currentHour % 4 === 0 && currentMin < 5) || forceSync || rebuild;

    console.log(`[ARG ⚡] Iniciando scrapers condicionales (Table:${!!mustFetchTable}, Sched:${!!mustFetchSchedules})...`);

    // ══════════════════════════════════════════════════════════════════════
    // PARALELISMO TOTAL (ELIMINA LATENCIA DE 200MS)
    // ══════════════════════════════════════════════════════════════════════
    const ts = Date.now();
    const [resp0, html3, tableHtml] = await Promise.all([
      // 1. Marcadores con Bypass de Caché (Bypass: ?all=1&view=0&t=...)
      globalThis.fetch(`https://www.thesportsdb.com/season/4406-argentinian-primera-division/2026?all=1&view=0&t=${ts}`, {
        headers: {
          'User-Agent': UA,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }).then(r => r.text()),

      // 2. Condicionales de view=3 (Horarios)
      mustFetchSchedules
        ? globalThis.fetch(`https://www.thesportsdb.com/season/4406-argentinian-primera-division/2026?all=1&view=3&t=${ts}`, {
          headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        }).then(r => r.text())
        : Promise.resolve(null),

      // 3. Condicionales de Tabla
      mustFetchTable
        ? globalThis.fetch(`https://www.thesportsdb.com/table.php?l=4406&s=2026&all=1&t=${ts}`, {
          headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        }).then(r => r.text())
        : Promise.resolve(null)
    ]);

    const html0 = resp0;

    // Cargar cache para Merge de tiempos y detección de "Finalizados"
    const cachedSnap = await getDocOptimized(doc(db, 'cache', 'argentinaMatches'));
    const cachedMatches = cachedSnap.exists() ? (cachedSnap.data().matches || []) : [];
    const cachedMap = new Map(cachedMatches.map(m => [m.id.replace('arg26-', ''), m]));

    // --- HASH CHECK (Filtrado de Ruido y Sensibilidad Pro) ---
    const combinedInput = (html0 || '') + (html3 || '') + (tableHtml || '');
    const firstTr = combinedInput.indexOf('<tr');
    const lastTr = combinedInput.lastIndexOf('</tr');
    const soccerOnly = (firstTr !== -1 && lastTr !== -1) ? combinedInput.substring(firstTr, lastTr + 5) : combinedInput;
    const cleanContent = soccerOnly.replace(/<[^>]*>?/gm, '').replace(/\s+/g, '');
    const rawHtmlHash = createHash('md5').update(cleanContent).digest('hex');
    const lastHashRAM = GLOBAL_PRODE_RAM._lastArgHtmlHash;
    const lastHashDB = cachedSnap.exists() ? cachedSnap.data().htmlHash : '';

    // Detección de envejecimiento: si hay partidos IN_PLAY con score cuyo tiempo superó 135 mins, forzamos recarga
    let pendingFinishArg = false;
    const nowMsArg = Date.now();
    for (const m of cachedMatches) {
      if (m.status !== 'FINISHED' && m.utcDate && m.score && m.score.fullTime) {
        const diffMins = (nowMsArg - new Date(m.utcDate).getTime()) / 60000;
        if (diffMins >= 135) {
          pendingFinishArg = true;
          break;
        }
      }
    }

    // Reporte de Vigilancia (Filtro de Ruido Activo)
    const rH = rawHtmlHash.substring(0, 8);
    const rM = lastHashRAM?.substring(0, 8) || 'VACÍA';
    const rD = lastHashDB?.substring(0, 8) || 'VACÍA';
    console.log(`[ARG 🔍] MD5 Selectivo: Red:${rH} | RAM:${rM} | BD:${rD} | Pend:${pendingFinishArg}`);

    if (!forceSync && !rebuild && !pendingFinishArg && (lastHashRAM === rawHtmlHash || lastHashDB === rawHtmlHash)) {
      const gType = (lastHashRAM === rawHtmlHash) ? 'RAM' : 'FIRESTORE';
      console.log(`[ARG 💤] BLOQUEO POR ${gType}: Fútbol IDÉNTICO (Ahorro CPU 100%).`);

      // Sincronizamos la RAM para el próximo ciclo
      GLOBAL_PRODE_RAM._lastArgHtmlHash = rawHtmlHash;

      // Enviamos respuesta legal antes de salir
      res.status(200).json({
        estado: "SCRAPING SALTADO (Dieta)",
        partidos_parseados: cachedMatches.length,
        operaciones_bd: {
          partidos_escritos: false,
          alguno_termino: false,
          motivo: "HTML idéntico al minuto anterior"
        }
      });
      return cachedMatches;
    }
    GLOBAL_PRODE_RAM._lastArgHtmlHash = rawHtmlHash;

    // Función de normalización (Definir AQUÍ antes de usarla)
    const normalizeTeamName = (name) => {
      return (name || '').toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, ' ').trim();
    };

    const rows0 = html0.split('<tr>').slice(1);
    const matchList = [];

    let currentRound = "FECHA 1";
    let seenPairsInRound = new Set();

    for (const row of rows0) {
      // Detectar cabecera de Ronda
      const roundMatch = row.match(/<td[^>]+colspan=['"]\d+['"][^>]*><b>([^<]+)<\/b><\/td>/i);
      if (roundMatch) {
        currentRound = roundMatch[1].trim();
        seenPairsInRound = new Set(); // Reset al cambiar de Round
        continue;
      }

      const dateM = row.match(/<td[^>]+>(\d{1,2} [A-Z][a-z]{2})<\/td>/);
      if (!dateM) continue;

      const eventMatch = row.match(/<a[^>]*href='\/event\/(\d+)-([^']*)'[^>]*>([^<]+)<\/a>/);
      if (!eventMatch) continue;

      const eventId = eventMatch[1];
      const decodedSlug = decodeURIComponent(eventMatch[2]); // <--- TRADUCTOR DE ACENTOS
      const eventSlugTeams = decodedSlug.split('-vs-');
      const hName = eventSlugTeams[0].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const aName = eventSlugTeams[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      // Detectar fase (Apertura vs Clausura) dentro de la misma sección
      const pairKey = [normalizeTeamName(hName), normalizeTeamName(aName)].sort().join('|');
      let phase = "Apertura";
      if (seenPairsInRound.has(pairKey)) {
        phase = "Clausura";
      } else {
        seenPairsInRound.add(pairKey);
      }

      const scoreM = row.match(/<td style='text-align:center[^>]*>([^<]*)<\/td>/);
      const scoreRaw = scoreM ? scoreM[1].trim() : '-';

      matchList.push({
        eventId: eventId, // ID real de TheSportsDB
        date: dateM[1].trim(),
        stage: `${currentRound} - ${phase}`,
        home: hName,
        away: aName,
        scoreRaw
      });
    }
    console.log(`[1/3] Partidos extraídos (Apertura/Clausura): ${matchList.length}`);

    // ══════════════════════════════════════════════════════════════════════
    // PASO 2: HORARIOS (view=3)
    // ══════════════════════════════════════════════════════════════════════
    console.log('[2/3] Procesando horarios...');

    const timeMap = new Map();
    const regex3 = /<a[^>]*href='\/event\/(\d+)[^']*'[^>]*>[^<]+<\/a>\s*[-–]\s*(\d{2}:\d{2}:\d{2})/g;
    let m3;
    while ((m3 = regex3.exec(html3)) !== null) {
      timeMap.set(m3[1], m3[2]);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 3: MERGE POR ID Y DEDUPLICACIÓN POR JORNADA (ROUND)
    // ══════════════════════════════════════════════════════════════════════
    const processedPairsInRound = new Set();
    const finalMatches = [];
    let anyArgMatchFinished = false;

    for (const m of matchList) {
      const hNorm = normalizeTeamName(m.home);
      const aNorm = normalizeTeamName(m.away);
      // Clave por Jornada para permitir Apertura/Clausura pero no clones fantasmas
      const pairKeyInRound = `${m.stage}|${[hNorm, aNorm].sort().join('|')}`;

      // REGLA SUPREMA: Ignorar duplicados que ocurran DENTRO DE LA MISMA FECHA
      if (processedPairsInRound.has(pairKeyInRound)) continue;
      processedPairsInRound.add(pairKeyInRound);

      const cached = cachedMap.get(m.eventId);

      // Si no bajamos /view=3, usamos el horario que ya teníamos en caché (preservación)
      let rawTime = '22:00:00';
      if (html3) {
        rawTime = timeMap.get(m.eventId) || '22:00:00';
      } else if (cached?.utcDate) {
        // Obtenemos HH:MM:SS del utcDate original
        rawTime = cached.utcDate.substring(11, 19);
      }

      // Soportamos varios tipos de guiones en el marcador
      const scoreM = m.scoreRaw.match(/^(\d+)\s*[-–—]\s*(\d+)$/);

      const [dayStr, monStr] = m.date.split(' ');
      const day = parseInt(dayStr, 10);
      const month = MONTHS[monStr] ?? 0;
      const [hh, mm, ss] = rawTime.split(':').map(Number);
      const dt = new Date(Date.UTC(2026, month, day, hh, mm, ss));
      const finalUtcDate = dt.toISOString();

      // Cálculo del día argentino (UTC-3)
      const argDate = new Date(dt.getTime() - (3 * 60 * 60 * 1000));
      const argDay = argDate.toISOString().split('T')[0];

      const now = Date.now();
      const matchTime = dt.getTime();
      const diffMinutes = (now - matchTime) / (1000 * 60);

      let finalStatus = 'TIMED';
      if (scoreM) {
        if (diffMinutes >= 135) finalStatus = 'FINISHED';
        else if (diffMinutes >= -15) finalStatus = 'IN_PLAY';
        else finalStatus = 'TIMED';
      } else {
        // Si no hay score pero estamos en la ventana de tiempo (0 a 140 min despues del inicio)
        if (diffMinutes >= 0 && diffMinutes < 140) {
          finalStatus = 'IN_PLAY';
        }
      }

      // Deteción de fin de partido para gatillar tabla y puntos
      if (cached && cached.status !== 'FINISHED' && finalStatus === 'FINISHED') {
        anyArgMatchFinished = true;
      }

      finalMatches.push({
        id: `arg26-${m.eventId}`,
        utcDate: finalUtcDate,
        argDay: argDay,
        argTime: argDate.toISOString().substring(11, 16),
        stage: m.stage,
        homeTeam: mapTeam(m.home),
        awayTeam: mapTeam(m.away),
        score: scoreM ? { fullTime: { home: parseInt(scoreM[1]), away: parseInt(scoreM[2]) } } : null,
        status: finalStatus,
      });
    }

    // SI ALGUIEN TERMINÓ Y NO HABÍAMOS BAJADO LA TABLA, LA BAJAMOS AHORA
    let finalStandingsHtml = tableHtml;
    if (anyArgMatchFinished && !finalStandingsHtml) {
      console.log("[ARG 🚀] ¡Partido finalizado detectado! Forzando descarga de tabla...");
      const respTab = await globalThis.fetch('https://www.thesportsdb.com/table.php?l=4406&s=2026&all=1', { headers: { 'User-Agent': UA } });
      finalStandingsHtml = await respTab.text();
    }

    const availableDays = [...new Set(finalMatches.map(m => m.argDay))].sort();
    const newMatchFp = buildMatchFingerprint(finalMatches, availableDays);
    let matchesWritten = false;
    let matchMotivo = "El Hash es idéntico a la BD. Escritura abortada por ahorro.";

    const oldFp = cachedSnap.exists() ? cachedSnap.data().fingerprint : '';
    const hasChanged = newMatchFp !== oldFp;

    // --- CORRECCIÓN DE GATILLO FORCE (SOPORTA BOOLEANO) ---
    if (hasChanged || forceSync || rebuild === 'true') {
      await setDoc(doc(db, 'cache', 'argentinaMatches'), {
        matches: finalMatches,
        availableDays,
        fingerprint: newMatchFp,
        htmlHash: rawHtmlHash, // Firma digital del HTML crudo
        updatedAt: new Date().toISOString(),
        // GATILLO DE PUNTOS: Clave para que se sumen solos (Protección contra undefined)
        lastFinishedMatchUpdateAt: anyArgMatchFinished ? new Date().toISOString() : (cachedSnap.data()?.lastFinishedMatchUpdateAt || ''),
        source: 'TheSportsDB fetch-only (-4h)',
        serverSecret: process.env.CRON_SECRET,
      });
      invalidateRamCache('cache/argentinaMatches');
      matchesWritten = true;
      matchMotivo = forceSync ? "FORZADO: Sobreescribiendo base de datos." : "Hash nuevo generado. Base de datos actualizada.";
      console.log(`[ARG 🚀] ${matchMotivo}`);
    } else {
      console.log(`[ARG 💤] Partidos sin cambios (Hash idéntico). Ignorando escritura.`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 4: TABLA DE POSICIONES (table.php) — Ya descargada
    // ══════════════════════════════════════════════════════════════════════
    let tableWritten = false;
    let tableMotivo = "La tabla no se procesó en este ciclo (Ahorro Dieta).";

    if (finalStandingsHtml) {
      console.log('[4/4] Procesando tabla de posiciones con Cheerio...');
      const $ = cheerio.load(finalStandingsHtml);
      const allRows = [];

      $('table tr').each((i, el) => {
        const tds = $(el).find('td');
        if (tds.length < 8) return;

        const posText = $(tds[0]).text().trim();
        const pos = parseInt(posText, 10);
        if (isNaN(pos)) return;

        const anchor = $(tds[2]).find('a');
        const teamName = anchor.text().trim();
        const teamHref = anchor.attr('href') || '';
        if (!teamName) return;

        const teamIdM = teamHref.match(/\/team\/(\d+)/);
        const teamId = teamIdM ? teamIdM[1] : '';

        const gp = parseInt($(tds[4]).text().trim()) || 0;
        const w = parseInt($(tds[5]).text().trim()) || 0;
        const d = parseInt($(tds[6]).text().trim()) || 0;
        const l = parseInt($(tds[7]).text().trim()) || 0;
        const gf = parseInt($(tds[8]).text().trim()) || 0;
        const ga = parseInt($(tds[9]).text().trim()) || 0;
        const gd = parseInt($(tds[10]).text().trim()) || 0;
        const pts = parseInt($(tds[11]).text().trim()) || 0;

        const mapped = TEAM_MAP[teamName] || { id: teamId, name: teamName };
        allRows.push({
          position: pos,
          team: { id: mapped.id || teamId, name: mapped.name || teamName },
          points: pts,
          playedGames: gp,
          won: w,
          draw: d,
          lost: l,
          goalsFor: gf,
          goalsAgainst: ga,
          goalDifference: gd,
        });
      });

      console.log(`[TABLA] Equipos finales extraídos: ${allRows.length}`);

      const zonaA = [], zonaB = [];
      allRows.forEach((row, i) => {
        const entry = { ...row, position: Math.floor(i / 2) + 1 };
        if (i % 2 === 0) zonaA.push(entry); else zonaB.push(entry);
      });

      const anual = [...allRows]
        .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference)
        .map((r, i) => ({ ...r, position: i + 1 }));

      const standings = [
        { type: 'ZONA', group: 'ZONA A', table: zonaA },
        { type: 'ZONA', group: 'ZONA B', table: zonaB },
        { type: 'TOTAL', group: 'ANUAL', table: anual },
      ];

      const newTableFp = buildTableFingerprint(anual);
      const standSnap = await getDocOptimized(doc(db, 'standingsCache', 'argentina'));

      if (newTableFp !== (standSnap.exists() ? standSnap.data().fingerprint : '')) {
        await setDoc(doc(db, 'standingsCache', 'argentina'), {
          standings,
          fingerprint: newTableFp,
          updatedAt: new Date().toISOString(),
          serverSecret: process.env.CRON_SECRET,
        });
        invalidateRamCache('standingsCache/argentina');
        tableWritten = true;
        tableMotivo = "Hubo cambios en las posiciones (Nuevo Hash).";
        console.log(`[ARG 🚀] Cambios en tabla detectados. Guardando en BD.`);
      } else {
        tableMotivo = "La tabla está igual. Ignorando escritura.";
        console.log(`[ARG 💤] Tabla de posiciones sin cambios. Ignorando escritura.`);
      }
    }

    res.status(200).json({
      estado: "SCRAPING EXITOSO",
      partidos_parseados: finalMatches.length,
      operaciones_bd: {
        partidos_escritos: matchesWritten,
        alguno_termino: anyArgMatchFinished,
        tabla_escrita: tableWritten,
        motivacion_tabla: tableMotivo
      }
    });

    return finalMatches; // <--- DATOS PARA LA RAM

  } catch (err) {
    console.error('[ARG CRITICAL]', err.message);
    res.status(500).json({ error: err.message });
    return [];
  }
}

// ----------------------------------------------------------------------------
// 3.5 HELPERS Y LOGICA DE LIBERTADORES (IDENTICO A ARGENTINA)
// ----------------------------------------------------------------------------
async function executeLibertadores(req, res) {
  const { token, force, rebuild } = req.query;
  const forceSync = force === 'true';
  const isAuthorized = process.env.IS_LOCAL_DEV || token === process.env.CRON_SECRET;
  if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const nowDt = new Date();
    const currentMin = nowDt.getMinutes();
    const currentHour = nowDt.getHours();

    // Libertadores: partidos cada hora, tabla cada 4 horas
    const mustFetchSchedules = (currentHour % 4 === 0 && currentMin < 5) || forceSync || rebuild;
    const mustFetchStandings = (currentHour % 4 === 0 && currentMin < 10) || forceSync || rebuild;

    console.log(`[LIB 🌎] Iniciando scrapers Libertadores (Sched:${!!mustFetchSchedules}, Table:${!!mustFetchStandings})...`);

    const ts = Date.now();
    const [resp0, html3, respTable] = await Promise.all([
      globalThis.fetch(`https://www.thesportsdb.com/season/4501-copa-libertadores/2026?all=1&view=0&t=${ts}`, {
        headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      }).then(r => r.text()),
      mustFetchSchedules
        ? globalThis.fetch(`https://www.thesportsdb.com/season/4501-copa-libertadores/2026?all=1&view=3&t=${ts}`, {
          headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        }).then(r => r.text())
        : Promise.resolve(null),
      mustFetchStandings
        ? globalThis.fetch(`https://api.sofascore.com/api/v1/unique-tournament/384/season/87760/standings/total`, {
          headers: { 'User-Agent': UA }
        }).then(r => r.json()).catch(e => { console.error("[LIB TABLE ERR]", e); return null; })
        : Promise.resolve(null)
    ]);

    let finalStandingsData = respTable;

    const html0 = resp0;
    const cachedSnap = await getDocOptimized(doc(db, 'cache', 'libertadoresMatches'));
    const cachedMatches = cachedSnap.exists() ? (cachedSnap.data().matches || []) : [];
    const cachedMap = new Map(cachedMatches.map(m => [m.id.replace('lib26-', ''), m]));

    const combinedInput = (html0 || '') + (html3 || '');
    const firstTr = combinedInput.indexOf('<tr');
    const lastTr = combinedInput.lastIndexOf('</tr');
    const soccerOnly = (firstTr !== -1 && lastTr !== -1) ? combinedInput.substring(firstTr, lastTr + 5) : combinedInput;
    const cleanContent = soccerOnly.replace(/<[^>]*>?/gm, '').replace(/\s+/g, '');
    const rawHtmlHash = createHash('md5').update(cleanContent).digest('hex');
    const lastHashRAM = GLOBAL_PRODE_RAM._lastLibHtmlHash;
    const lastHashDB = cachedSnap.exists() ? cachedSnap.data().htmlHash : '';

    // Detección de envejecimiento (evitar que partidos terminen atrapados en IN_PLAY por falta de update en DB externa)
    let pendingFinishLib = false;
    const nowMsLib = Date.now();
    for (const m of cachedMatches) {
      if (m.status !== 'FINISHED' && m.utcDate && m.score && m.score.fullTime) {
        const diffMins = (nowMsLib - new Date(m.utcDate).getTime()) / 60000;
        if (diffMins >= 135) {
          pendingFinishLib = true;
          break;
        }
      }
    }

    // Reporte de Vigilancia (Filtro de Ruido Activo)
    const rH = rawHtmlHash.substring(0, 8);
    const rM = lastHashRAM?.substring(0, 8) || 'VACÍA';
    const rD = lastHashDB?.substring(0, 8) || 'VACÍA';
    console.log(`[LIB 🔍] MD5 Selectivo: Red:${rH} | RAM:${rM} | BD:${rD} | Pend:${pendingFinishLib}`);

    if (!forceSync && !rebuild && !pendingFinishLib && (lastHashRAM === rawHtmlHash || lastHashDB === rawHtmlHash)) {
      console.log(`[LIB 💤] BLOQUEO POR HASH: Sin cambios detectados.`);
      GLOBAL_PRODE_RAM._lastLibHtmlHash = rawHtmlHash;
      res.status(200).json({ estado: "SALTADO", partidos_parseados: cachedMatches.length });
      return cachedMatches;
    }
    GLOBAL_PRODE_RAM._lastLibHtmlHash = rawHtmlHash;

    const normalizeTeamName = (name) => (name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
    const rows0 = html0.split('<tr>').slice(1);
    const matchList = [];
    let currentRound = "FECHA 1";

    for (const row of rows0) {
      const roundMatch = row.match(/<td[^>]+colspan=['"]\d+['"][^>]*><b>([^<]+)<\/b><\/td>/i);
      if (roundMatch) { currentRound = roundMatch[1].trim(); continue; }

      const dateM = row.match(/<td[^>]+>(\d{1,2} [A-Z][a-z]{2})<\/td>/);
      if (!dateM) continue;

      const eventMatch = row.match(/<a[^>]*href='\/event\/(\d+)-([^']*)'[^>]*>([^<]+)<\/a>/);
      if (!eventMatch) continue;

      const eventId = eventMatch[1];
      const decodedSlug = decodeURIComponent(eventMatch[2]);
      const slugParts = decodedSlug.split('-vs-');
      const hName = slugParts[0].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const aName = slugParts[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const scoreM = row.match(/<td style='text-align:center[^>]*>([^<]*)<\/td>/);
      const scoreRaw = scoreM ? scoreM[1].trim() : '-';

      matchList.push({ eventId, date: dateM[1].trim(), stage: currentRound, home: hName, away: aName, scoreRaw });
    }

    const timeMap = new Map();
    const regex3 = /<a[^>]+href=['"]\/event\/(\d+)[^'"]+['"][^>]*>.*?<\/a>\s*[-–]\s*(\d{2}:\d{2}:\d{2})/g;
    let m3;
    if (html3) while ((m3 = regex3.exec(html3)) !== null) timeMap.set(m3[1], m3[2]);

    const finalMatches = [];
    let anyLibMatchFinished = false;

    for (const m of matchList) {
      const cached = cachedMap.get(m.eventId);
      let rawTime = html3 ? (timeMap.get(m.eventId) || '22:00:00') : (cached?.utcDate ? cached.utcDate.substring(11, 19) : '22:00:00');
      const scoreM = m.scoreRaw.match(/^(\d+)\s*[-–—]\s*(\d+)$/);

      const [dayStr, monStr] = m.date.split(' ');
      const [hh, mm, ss] = rawTime.split(':').map(Number);
      const dt = new Date(Date.UTC(2026, MONTHS[monStr] ?? 0, parseInt(dayStr, 10), hh, mm, ss));
      const argDate = new Date(dt.getTime() - (3 * 60 * 60 * 1000));

      const diffMinutes = (Date.now() - dt.getTime()) / 60000;
      let status = 'TIMED';
      if (scoreM) status = diffMinutes >= 135 ? 'FINISHED' : (diffMinutes >= -15 ? 'IN_PLAY' : 'TIMED');
      else if (diffMinutes >= 0 && diffMinutes < 140) status = 'IN_PLAY';

      if (cached && cached.status !== 'FINISHED' && status === 'FINISHED') anyLibMatchFinished = true;

      finalMatches.push({
        id: `lib26-${m.eventId}`,
        utcDate: dt.toISOString(),
        argDay: argDate.toISOString().split('T')[0],
        argTime: argDate.toISOString().substring(11, 16),
        stage: m.stage,
        homeTeam: { name: m.home },
        awayTeam: { name: m.away },
        score: scoreM ? { fullTime: { home: parseInt(scoreM[1]), away: parseInt(scoreM[2]) } } : null,
        status,
      });
    }

    const availableDays = [...new Set(finalMatches.map(m => m.argDay))].sort();
    const newFp = buildMatchFingerprint(finalMatches, availableDays);

    if (newFp !== (cachedSnap.exists() ? cachedSnap.data().fingerprint : '') || forceSync) {
      await setDoc(doc(db, 'cache', 'libertadoresMatches'), {
        matches: finalMatches,
        availableDays,
        fingerprint: newFp,
        htmlHash: rawHtmlHash,
        updatedAt: new Date().toISOString(),
        lastFinishedMatchUpdateAt: anyLibMatchFinished ? new Date().toISOString() : (cachedSnap.data()?.lastFinishedMatchUpdateAt || ''),
        serverSecret: process.env.CRON_SECRET,
      });
      invalidateRamCache('cache/libertadoresMatches');
      console.log(`[LIB ✅] Firestore actualizado.`);
    }

    // SI ALGUIEN TERMINÓ Y NO HABÍAMOS BAJADO LA TABLA, LA BAJAMOS AHORA (Gatillo post-partido)
    if (anyLibMatchFinished && !finalStandingsData) {
      console.log("[LIB 🚀] ¡Partido finalizado detectado! Forzando descarga de tabla SofaScore...");
      try {
        const respSec = await globalThis.fetch(`https://api.sofascore.com/api/v1/unique-tournament/384/season/87760/standings/total`, {
          headers: { 'User-Agent': UA }
        });
        if (respSec.ok) finalStandingsData = await respSec.json();
      } catch (e) { console.error("[LIB SEC TABLE ERR]", e); }
    }

    // --- PROCESAR TABLA SOFASCORE ---
    if (finalStandingsData && finalStandingsData.standings) {
      const groups = finalStandingsData.standings.map((g) => {
        return {
          group: g.tournament?.groupName || 'GRUPO',
          table: g.rows.map((r) => ({
            position: r.position,
            team: {
              name: r.team.name,
              crest: `https://api.sofascore.app/api/v1/team/${r.team.id}/image`
            },
            playedGames: r.matches,
            won: r.wins,
            draw: r.draws,
            lost: r.losses,
            goalsFor: r.scoresFor,
            goalsAgainst: r.scoresAgainst,
            goalDifference: r.scoresFor - r.scoresAgainst,
            points: r.points
          }))
        };
      });

      await setDoc(doc(db, 'standingsCache', 'libertadores'), {
        standings: groups,
        updatedAt: new Date().toISOString(),
        serverSecret: process.env.CRON_SECRET,
      });
      invalidateRamCache('standingsCache/libertadores');
      console.log(`[LIB TABLE ✅] Tabla actualizada (SofaScore).`);
    }

    res.status(200).json({ estado: "OK", partidos_parseados: finalMatches.length, alguno_termino: anyLibMatchFinished });
    return finalMatches;
  } catch (err) {
    console.error('[LIB CRITICAL]', err.message);
    res.status(500).json({ error: err.message });
    return [];
  }
}



// ----------------------------------------------------------------------------
// 4. HELPERS Y LOGICA DE CALCULATE-SCORES.JS
// ----------------------------------------------------------------------------
// Vercel Serverless Function — Calcula puntos de todos los usuarios
// Invocado por cron-job.org cada 30 minutos.
// URL: /api/calculate-scores?token=TU_CRON_SECRET
//
// Reglas:
// - Marcador exacto: 6 pts (12 pts desde 8vos)
// - Resultado acertado (ganador/empate correcto): 3 pts (6 pts desde 8vos)
// - No acertó: 0 pts
// - Fases con puntaje doble: LAST_16, QUARTER_FINALS, SEMI_FINALS, THIRD_PLACE, FINAL





function calculateMatchPoints(prediction, actualHome, actualAway, stage, forceNoMultiplier = false) {
  let pHome = prediction.home;
  let pAway = prediction.away;

  // Si uno de los dos tiene un valor numérico/cadena digitada, rellenamos el otro vacío como '0'
  const hasHome = pHome !== '' && pHome !== undefined && pHome !== null;
  const hasAway = pAway !== '' && pAway !== undefined && pAway !== null;

  if (hasHome && !hasAway) pAway = '0';
  if (hasAway && !hasHome) pHome = '0';

  // Si ambos siguieron vacíos, entonces no sumamos nada porque no hizo pronóstico
  if (!hasHome && !hasAway) {
    return 0;
  }

  const predHome = parseInt(pHome, 10);
  const predAway = parseInt(pAway, 10);

  if (isNaN(predHome) || isNaN(predAway)) return 0;

  const isKnockout = KNOCKOUT_STAGES.includes(stage);
  const multiplier = (isKnockout && !forceNoMultiplier) ? 2 : 1;

  // Marcador exacto
  if (predHome === actualHome && predAway === actualAway) {
    return 6 * multiplier;
  }

  // Resultado acertado (mismo ganador o empate)
  const actualResult = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
  const predResult = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';

  if (actualResult === predResult) {
    return 3 * multiplier;
  }

  return 0;
}

async function executeCalculate(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', '*');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  try {
    // 1. EVALUADOR INTELIGENTE
    const now = new Date();
    const currentMinute = now.getMinutes();
    const forceSync = request.query?.force === 'true';

    // Obtenemos los caches
    const wcCacheSnap = await getDocOptimized(doc(db, 'cache', 'worldCupMatches'));
    const clCacheSnap = await getDocOptimized(doc(db, 'cache', 'championsMatches'));
    const braMatchesSnap = await getDocOptimized(doc(db, 'cache', 'brazilMatches'));
    const argMatchesSnap = await getDocOptimized(doc(db, 'cache', 'argentinaMatches'));
    const libMatchesSnap = await getDocOptimized(doc(db, 'cache', 'libertadoresMatches'));
    const metaSnap = await getDocOptimized(doc(db, 'metadata', 'scoreUpdates'));

    const wcCache = wcCacheSnap.exists() ? wcCacheSnap.data() : { matches: [] };
    const clCache = clCacheSnap.exists() ? clCacheSnap.data() : { matches: [] };
    const braCache = braMatchesSnap.exists() ? braMatchesSnap.data() : { matches: [] };
    const argCache = argMatchesSnap.exists() ? argMatchesSnap.data() : { matches: [] };
    const libCache = libMatchesSnap.exists() ? libMatchesSnap.data() : { matches: [] };
    const meta = metaSnap.exists() ? metaSnap.data() : { lastScoresUpdateAt: null };

    const wcLastFinished = wcCache.lastFinishedMatchUpdateAt || '';
    const clLastFinished = clCache.lastFinishedMatchUpdateAt || '';
    const braLastFinished = braCache.lastFinishedMatchUpdateAt || '';
    const argLastFinished = argCache.lastFinishedMatchUpdateAt || '';
    const libLastFinished = libCache.lastFinishedMatchUpdateAt || '';
    const lastSummaryCalculated = meta.lastScoresUpdateAt || '';

    // Si NO hay partidos terminados más nuevos que nuestro último proceso, corta y ahorra lecturas
    const hasNewFinished = (wcLastFinished > lastSummaryCalculated) || (clLastFinished > lastSummaryCalculated) || (braLastFinished > lastSummaryCalculated) || (argLastFinished > lastSummaryCalculated) || (libLastFinished > lastSummaryCalculated);

    if (!hasNewFinished && !forceSync) {
      console.log(`[PUNTOS 💤] MODO AHORRO - SALTADO. Nadie sumó puntos. No hay partidos terminados desde ${lastSummaryCalculated || 'nunca'}.`);
      return response.status(200).json({
        estado: "MODO AHORRO - SALTADO",
        razon: "Nadie sumó puntos. Ningún partido nuevo finalizó recientemente.",
        lecturas_ahorradas: "+400 consultas a la base de datos"
      });
    }

    console.log(`[PUNTOS 🚀] EJECUTANDO. Razón: ${forceSync ? 'Forzado Manualmente' : 'Nuevos resultados finales detectados'}`);

    const wcMatches = wcCache.matches || [];
    const clMatches = clCache.matches || [];
    const braMatches = braCache.matches || [];
    const argMatches = argCache.matches || [];
    const libMatches = libCache.matches || [];


    // 2. Fetch all collections in bulk (Efficient: just 6 requests instead of N per user)
    const [usersSnapshot, wcPredsSnap, clPredsSnap, braPredsSnap, argPredsSnap, libPredsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'userPredictions')),
      getDocs(collection(db, 'testPredictions')),
      getDocs(collection(db, 'brazilPredictions')),
      getDocs(collection(db, 'argentinaPredictions')),
      getDocs(collection(db, 'libertadoresPredictions')),
    ]);

    const userIds = usersSnapshot.docs.map(doc => doc.id);

    // Maps for fast access
    const wcPredsMap = {}; wcPredsSnap.docs.forEach(d => { wcPredsMap[d.id] = d.data(); });
    const clPredsMap = {}; clPredsSnap.docs.forEach(d => { clPredsMap[d.id] = d.data(); });
    const braPredsMap = {}; braPredsSnap.docs.forEach(d => { braPredsMap[d.id] = d.data(); });
    const argPredsMap = {}; argPredsSnap.docs.forEach(d => { argPredsMap[d.id] = d.data(); });
    const libPredsMap = {}; libPredsSnap.docs.forEach(d => { libPredsMap[d.id] = d.data(); });


    // 3. For each user, calculate points using the maps
    let usersUpdated = 0;
    const results = [];

    // 🔥 OPTIMIZACIÓN: Firestore Batching (Hasta 100x más rápido)
    let batch = writeBatch(db);
    let opCount = 0;

    for (const userId of userIds) {
      // -- PUNTOS MUNDIAL --
      let wcTotal = 0;
      let wcDetails = [];
      const wcData = wcPredsMap[userId];
      if (wcData) {
        const wcPreds = wcData.matches || {};
        for (const [matchId, pred] of Object.entries(wcPreds)) {
          const actualMatch = wcMatches.find(m => m.id.toString() === matchId);
          if (actualMatch && actualMatch.status === 'FINISHED' && actualMatch.score?.fullTime) {
            const actualHome = actualMatch.score.fullTime.home;
            const actualAway = actualMatch.score.fullTime.away;
            const stage = actualMatch.stage || 'GROUP_PHASE';
            const pts = calculateMatchPoints(pred, actualHome, actualAway, stage);
            if (pts > 0) {
              wcTotal += pts;
              wcDetails.push({ matchId, points: pts, pred, actual: { home: actualHome, away: actualAway }, stage });
            }
          }
        }
      }

      // -- PUNTOS CHAMPIONS --
      let clTotal = 0;
      let clDetails = [];
      const clData = clPredsMap[userId];
      if (clData) {
        const clPreds = clData.matches || {};
        for (const [matchId, pred] of Object.entries(clPreds)) {
          const actualMatch = clMatches.find(m => m.id.toString() === matchId);
          if (actualMatch && actualMatch.status === 'FINISHED' && actualMatch.score?.fullTime) {
            const actualHome = actualMatch.score.fullTime.home;
            const actualAway = actualMatch.score.fullTime.away;
            const stage = actualMatch.stage || 'GROUP_PHASE';
            //Champions no suma x2 (pedido usuario)
            const pts = calculateMatchPoints(pred, actualHome, actualAway, stage, true);
            if (pts > 0) {
              clTotal += pts;
              clDetails.push({ matchId, points: pts, pred, actual: { home: actualHome, away: actualAway }, stage });
            }
          }
        }
      }

      // -- PUNTOS BRASILEIRAO --
      let braTotal = 0;
      let braDetails = [];
      const braData = braPredsMap[userId];
      if (braData) {
        const braPreds = braData.matches || {};
        for (const [matchId, pred] of Object.entries(braPreds)) {
          const actualMatch = braMatches.find(m => m.id.toString() === matchId);
          if (actualMatch && actualMatch.status === 'FINISHED' && actualMatch.score?.fullTime) {
            const actualHome = actualMatch.score.fullTime.home;
            const actualAway = actualMatch.score.fullTime.away;
            const stage = actualMatch.stage || 'REGULAR_SEASON';
            const pts = calculateMatchPoints(pred, actualHome, actualAway, stage);
            if (pts > 0) {
              braTotal += pts;
              braDetails.push({ matchId, points: pts, pred, actual: { home: actualHome, away: actualAway }, stage });
            }
          }
        }
      }

      // -- PUNTOS ARGENTINA --
      let argTotal = 0;
      let argDetails = [];
      const argData = argPredsMap[userId];
      if (argData) {
        const argPreds = argData.matches || {};
        for (const [matchId, pred] of Object.entries(argPreds)) {
          const actualMatch = argMatches.find(m => m.id.toString() === matchId);
          if (actualMatch && actualMatch.status === 'FINISHED' && actualMatch.score?.fullTime) {
            const actualHome = actualMatch.score.fullTime.home;
            const actualAway = actualMatch.score.fullTime.away;
            const stage = actualMatch.stage || 'REGULAR_SEASON';
            const pts = calculateMatchPoints(pred, actualHome, actualAway, stage);
            if (pts > 0) {
              argTotal += pts;
              argDetails.push({ matchId, points: pts, pred, actual: { home: actualHome, away: actualAway }, stage });
            }
          }
        }
      }

      // -- PUNTOS LIBERTADORES --
      let libTotal = 0;
      let libDetails = [];
      const libData = libPredsMap[userId];
      if (libData) {
        const libPreds = libData.matches || {};
        for (const [matchId, pred] of Object.entries(libPreds)) {
          const actualMatch = libMatches.find(m => m.id.toString() === matchId);
          if (actualMatch && actualMatch.status === 'FINISHED' && actualMatch.score?.fullTime) {
            const actualHome = actualMatch.score.fullTime.home;
            const actualAway = actualMatch.score.fullTime.away;
            const stage = actualMatch.stage || 'REGULAR_SEASON';
            const pts = calculateMatchPoints(pred, actualHome, actualAway, stage);
            if (pts > 0) {
              libTotal += pts;
              libDetails.push({ matchId, points: pts, pred, actual: { home: actualHome, away: actualAway }, stage });
            }
          }
        }
      }

      // Añadir actualización de usuario al Batch (instantáneo)
      batch.update(doc(db, 'users', userId), {
        points: wcTotal,
        championsPoints: clTotal,
        brazilPoints: braTotal,
        argentinaPoints: argTotal,
        libertadoresPoints: libTotal,
        lastScoreUpdate: new Date().toISOString(),
        serverSecret: process.env.CRON_SECRET
      });
      opCount++;

      // Añadir historial al Batch
      batch.set(doc(db, 'userScores', userId), {
        userId,
        totalPoints: wcTotal,
        championsPoints: clTotal,
        brazilPoints: braTotal,
        argentinaPoints: argTotal,
        matchDetails: wcDetails,
        championsDetails: clDetails,
        brazilDetails: braDetails,
        argentinaDetails: argDetails,
        libertadoresDetails: libDetails,
        calculatedAt: new Date().toISOString(),
        serverSecret: process.env.CRON_SECRET
      }, { merge: true });
      opCount++;

      results.push({ userId, points: wcTotal, championsPoints: clTotal, brazilPoints: braTotal, argentinaPoints: argTotal, libertadoresPoints: libTotal });
      usersUpdated++;

      // Firebase limita los batches a 500 operaciones. Si llegamos, commiteamos y creamos uno nuevo.
      if (opCount >= 490) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }

    // Commitear el resto de operaciones que quedaron en la cola
    if (opCount > 0) {
      await batch.commit();
    }

    // 4. Reconstruir caché de Leaderboard (Gratis: ya tenemos los datos en results)
    try {
      const leaderData = results.map(r => {
        const userDoc = usersSnapshot.docs.find(d => d.id === r.userId);
        const data = userDoc?.data() || {};
        return {
          id: r.userId,
          name: data.name || data.email?.split('@')[0] || 'Jugador',
          points: r.points,
          championsPoints: r.championsPoints,
          brazilPoints: r.brazilPoints || 0,
          argentinaPoints: r.argentinaPoints || 0,
          libertadoresPoints: r.libertadoresPoints || 0
        };
      });

      await setDoc(doc(db, 'cache', 'leaderboard'), {
        users: leaderData,
        updatedAt: new Date().toISOString(),
        serverSecret: process.env.CRON_SECRET
      });
      invalidateRamCache('cache/leaderboard');
      console.log(`[PUNTOS ✅] Leaderboard general actualizado en caché.`);
    } catch (e) {
      console.error('[PUNTOS ERROR] Fallo actualizando leaderboard:', e);
    }

    // 5. Actualizar metadata de proceso exitoso
    await setDoc(doc(db, 'metadata', 'scoreUpdates'), {
      lastScoresUpdateAt: new Date().toISOString(),
      lastRunReason: currentMinute === 0 ? 'FIXED_HOUR' : 'NEW_RESULTS',
      serverSecret: process.env.CRON_SECRET
    }, { merge: true });
    invalidateRamCache('metadata/scoreUpdates');

    return response.status(200).json({
      estado: "EJECUTADO",
      razon: "Se detectaron partidos finalizados.",
      usuarios_procesados: usersUpdated,
      torneos_escaneados: wcMatches.length + clMatches.length + braMatches.length + argMatches.length,
      operaciones_batch: opCount,
      mensaje: "Puntajes y Leaderboard recalculados con éxito."
    });

  } catch (error) {
    console.error('[PUNTOS CRITICAL] Error calculando:', error);
    return response.status(500).json({ error: error.message });
  }
}


// ----------------------------------------------------------------------------
// LÓGICA DE VENTANA DE TIEMPO (AHORRO CPU)
// ----------------------------------------------------------------------------
function isMatchWindowActive(includeArgentina = true) {
  const now = Date.now();
  let activeWindowFound = false;
  let nextMatchTime = Infinity;

  // REGLA DE ORO: Usamos el consolidado como única fuente para decidir si dormir o no.
  // Si no está en RAM (ej: primer arranque o invalidación), forzamos ACTIVACIÓN para cargarlo.
  const allSnap = GLOBAL_PRODE_RAM['cache/allMatches'];

  if (!allSnap || !allSnap.data) {
    console.log(`[PORTERO ⚠️] Calendario global ausente en RAM. Forzando guardia para cargarlo.`);
    return true;
  }

  const matches = allSnap.data.matches || [];
  matches.forEach(m => {
    if (!m.utcDate) return;

    // FILTRO DE ORIGEN: Si se pide ignorar Argentina, lo saltamos.
    // Esto es vital para no encender el Live-Scraper innecesariamente.
    const isArgOrLib = String(m.id).startsWith('arg26-') || String(m.id).startsWith('lib26-');
    if (!includeArgentina && isArgOrLib) return;

    const matchTime = new Date(m.utcDate).getTime();
    if (new Date(m.utcDate).getUTCFullYear() !== 2026) return;

    // VENTANA PERSONALIZADA: 45m antes hasta 2hs 55m después del inicio.
    const windowStart = matchTime - (45 * 60 * 1000);
    const windowEnd = matchTime + (2 * 60 * 60 * 1000) + (55 * 60 * 1000);

    if (now >= windowStart && now <= windowEnd) {
      activeWindowFound = true;
      console.log(`[PORTERO 🔥] VENTANA ACTIVA por: ${m.homeTeam?.name || 'Home'} vs ${m.awayTeam?.name || 'Away'} (${new Date(matchTime).toLocaleTimeString()})`);
    }

    if (matchTime > now && matchTime < nextMatchTime) {
      nextMatchTime = matchTime;
    }
  });

  if (!activeWindowFound) {
    const minsParaSiguiente = nextMatchTime !== Infinity ? Math.round((nextMatchTime - now) / 60000) : 'N/A';
    console.log(`[PORTERO ⏳] REPOSO (${includeArgentina ? 'Full' : 'Scraper Only'}). Próximo partido en ${minsParaSiguiente} min.`);
  }

  return activeWindowFound;
}

// ----------------------------------------------------------------------------
// EXPORT FINAL (ORQUESTADOR CON PORTERO)
// ----------------------------------------------------------------------------
export default async function handler(request, response) {
  const now = Date.now();
  const force = request.query?.force === 'true';

  // =========================================================================
  // 🔄 RUTINA DE SINCRONIZACIÓN DE TABLA LIBERTADORES (PUENTE DE ADMIN)
  // =========================================================================
  if (request.method === 'POST' && request.query.libTableUpdate === 'true') {
    try {
      const { userId, sofaJson, serverSecret } = request.body;

      if (serverSecret !== process.env.CRON_SECRET) {
        return response.status(401).json({ error: 'Secret mismatch.' });
      }
      if (userId !== 'vNEg4qrr9vQFDYeLt7tFJQ2GXl13') {
        return response.status(403).json({ error: 'Solo el admin dispone de esta facultad.' });
      }
      if (!sofaJson || !sofaJson.standings) {
        return response.status(400).json({ error: 'JSON de SofaScore inválido.' });
      }

      console.log('[LIB ADMIN] Procesando tabla manual...');
      const processedTables = sofaJson.standings.map(g => ({
        group: g.tournament?.groupName || "Group",
        table: g.rows.map(r => ({
          position: r.position,
          team: {
            name: r.team.name,
            shortName: r.team.shortName || r.team.name,
            crest: `https://api.sofascore.app/api/v1/team/${r.team.id}/image`
          },
          points: r.points,
          playedGames: r.matches,
          won: r.wins,
          draw: r.draws,
          lost: r.losses,
          goalsFor: r.scoresFor,
          goalsAgainst: r.scoresAgainst,
          goalDiff: r.scoreDiffFormatted || (r.scoresFor - r.scoresAgainst).toString()
        }))
      }));

      await setDoc(doc(db, 'standingsCache', 'libertadores'), {
        standings: processedTables,
        updatedAt: new Date().toISOString(),
        serverSecret: process.env.CRON_SECRET
      });

      invalidateRamCache('standingsCache/libertadores');
      return response.status(200).json({ status: "OK", groups: processedTables.length });
    } catch (e) {
      return response.status(500).json({ error: e.message });
    }
  }

  // 1. CARGA INICIAL DE SEGURIDAD (Si la RAM está vacía)
  // Esto asegura que el Portero tenga datos frescos para comparar,
  // evitando que el semáforo se quede Verde indefinidamente tras un deploy.
  await getDocOptimized(doc(db, 'cache', 'allMatches'));

  const lastFullRun = GLOBAL_PRODE_RAM._lastFullRun || 0;
  const timeSinceLastRun = now - lastFullRun;
  const HOUR_IN_MS = 60 * 60 * 1000;

  // EL PORTERO: ¿Debe el cron trabajar o volver a dormir?
  // Diferenciamos ventanas para no encender el Live-Scraper si solo juega Argentina.
  const inWindowGeneral = isMatchWindowActive(true);  // Para el Portero (incluye Argentina)
  const inWindowScraper = isMatchWindowActive(false); // Para el Semáforo (excluye Argentina)

  // SEMÁFORO PARA EL LIVE-SCRAPER CON MEMORIA (Ahorro de Escrituras)
  const currentSemaforo = inWindowScraper || force;

  // LOG SIEMPRE (Lectura de RAM)
  console.log(`[SEMAFORO 🚦] Estado actual: ${currentSemaforo ? 'VERDE 🟢 (Scraper Activo)' : 'ROJO 🔴 (Scraper Bloqueado)'}`);

  if (currentSemaforo !== GLOBAL_PRODE_RAM._lastSemaforoState) {
    try {
      const shieldRef = doc(db, 'cache', 'robotShield');
      updateDoc(shieldRef, {
        isScraperNeeded: currentSemaforo,
        serverSecret: process.env.CRON_SECRET
      })
        .then(() => {
          GLOBAL_PRODE_RAM._lastSemaforoState = currentSemaforo;
          console.log(`[SEMAFORO 📡] ¡ÉXITO! Firestore se actualizó a ${currentSemaforo ? 'VERDE' : 'ROJO'}.`);
        })
        .catch((err) => {
          console.error(`[SEMAFORO ❌] Fallo al actualizar Firestore:`, err.message);
          // NO actualizamos RAM para re-intentar el próximo minuto
        });
    } catch (e) {
      console.error(`[SEMAFORO ❌] Error crítico:`, e.message);
    }
  }

  if (!force) {
    const needsSecurityCheck = timeSinceLastRun > HOUR_IN_MS;

    if (!inWindowGeneral && !needsSecurityCheck) {
      return response.status(200).json({
        estado: "DORMIDO (MODO AHORRO)",
        motivo: "Fuera de horario de partidos y actualizado hace poco.",
        proximo_repaso_forzado_en: Math.round((HOUR_IN_MS - timeSinceLastRun) / 60000) + " min",
        cpu_ahorrada: "99%"
      });
    }
  }

  // Si llegamos aquí, se ejecuta el ciclo COMPLETO
  GLOBAL_PRODE_RAM._lastFullRun = now;

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  const token = request.query?.token || request.headers['x-cron-secret'] || request.query?.secret;
  if (token !== CRON_SECRET && token !== process.env.CRON_SECRET && !process.env.IS_LOCAL_DEV) {
    return response.status(401).json({ error: 'Token inválido.' });
  }

  // --- ACCIÓN: INVALIDAR RAM DESDE FUENTE EXTERNA (SCRAPER) ---
  const { action, collection } = request.query;
  if (action === 'invalidate_ram' && collection) {
    console.log(`[RAM REMOTE] 🔄 Invalidación remota: cache/${collection}`);
    invalidateRamCache(`cache/${collection}`);
    return response.status(200).json({ status: 'RAM invalidated', collection });
  }

  const createMockRes = () => {
    let payload = null;
    let statusCode = 200;
    return {
      setHeader: () => { },
      status: (code) => { statusCode = code; return { json: (d) => { payload = d; return d; }, end: () => { } }; },
      json: (data) => { payload = data; return data; },
      send: (data) => { payload = data; return data; },
      end: () => { },
      getPayload: () => payload
    };
  };

  try {
    console.log('[CRON-MASTER] 🚀 Iniciando Sincronizadores en PARALELO...');

    const [rSync, rLive, rArg, rLib] = [createMockRes(), createMockRes(), createMockRes(), createMockRes()];
    const requestWithToken = { ...request, query: { ...request.query, token: process.env.CRON_SECRET } };

    // Ejecutamos las 3 tareas pesadas a la vez
    const [dataSync, _, dataArg] = await Promise.all([
      executeSync(requestWithToken, rSync),
      executeLive({ ...requestWithToken, query: { ...requestWithToken.query, secret: process.env.CRON_SECRET } }, rLive),
      executeArgentina(requestWithToken, rArg),
      executeLibertadores(requestWithToken, rLib)
    ]);

    // --- DETECCIÓN DE CAMBIOS REALES (Ahorro de CPU) ---
    const payloadSync = rSync.getPayload() || {};
    const payloadLive = rLive.getPayload() || {};
    const payloadArg = rArg.getPayload() || {};
    const payloadLib = rLib.getPayload() || {};

    const huboCambios =
      (payloadSync.escrituras_firestore?.mundial?.actualizado) ||
      (payloadSync.escrituras_firestore?.champions?.actualizado) ||
      (payloadSync.escrituras_firestore?.brasileirao?.actualizado) ||
      (payloadLive.estado === "MODO ACTIVO") ||
      (payloadArg.operaciones_bd?.partidos_escritos) ||
      (payloadLib.estado === "OK" && payloadLib.partidos_parseados > 0);

    if (huboCambios || force) {
      console.log('[CRON-MASTER] 🚀 Cambios detectados. Consolidando...');
      await consolidateAllMatches();
    }

    // --- LÓGICA DE CÁLCULO DE PUNTOS (Ultra-Ahorro) ---
    // Solo calculamos si alguien TERMINÓ (status cambió a FINISHED) o si pasaron 2 horas.
    const hayPartidosTerminados =
      (payloadSync.wcMatches?.finished) ||
      (payloadSync.championsMatches?.finished) ||
      (payloadSync.brazilMatches?.finished) ||
      (payloadArg.operaciones_bd?.alguno_termino) ||
      (rLib.getPayload()?.alguno_termino); // Agregamos reporte de finalización logicamente

    const DOS_HORAS_MS = 2 * 60 * 60 * 1000;
    const tocaPorTiempo = (now % DOS_HORAS_MS) < 120000; // Ventana de 2 min cada 2 horas

    if (hayPartidosTerminados || tocaPorTiempo || force) {
      console.log(`[CRON-MASTER] 🔢 Gatillando cálculo de puntos. Razón: ${hayPartidosTerminados ? 'Partido Finalizado' : tocaPorTiempo ? 'Intervalo 2hs' : 'Forzado'}`);
      const rCalc = createMockRes();
      await executeCalculate(requestWithToken, rCalc);
    } else {
      console.log('[CRON-MASTER] 💤 SKIP PUNTOS: No hay partidos terminados nuevos ni toca repaso programado.');
    }

    console.log('[CRON-MASTER] ✅ Cron finalizado con éxito.');

    return response.status(200).json({
      estado: "CRON MASTER FINALIZADO",
      optimizacion: huboCambios ? "Ciclo Completo" : "Ahorro de Puntajes activado",
      resumen: {
        sync: payloadSync.estado || 'OK',
        live: payloadLive.estado || 'OK',
        arg: payloadArg.estado || 'OK',
        lib: payloadLib.estado || 'OK'
      }
    });
  } catch (err) {
    console.error('[CRON-MASTER ERROR]', err);
    return response.status(500).json({ error: err.message });
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * FUNCIÓN: CONSOLIDAR TODOS LOS PARTIDOS EN UN SOLO DOCUMENTO
 * ══════════════════════════════════════════════════════════════════════
 */
async function consolidateAllMatches() {
  try {
    // Leemos DIRECTO de Firestore para asegurar que vemos los goles inyectados por los robots
    // (Bypass de RAM para evitar el delay de 10 minutos)
    const [wcSnap, clSnap, braSnap, argSnap, libSnap] = await Promise.all([
      originalGetDoc(doc(db, 'cache', 'worldCupMatches')),
      originalGetDoc(doc(db, 'cache', 'championsMatches')),
      originalGetDoc(doc(db, 'cache', 'brazilMatches')),
      originalGetDoc(doc(db, 'cache', 'argentinaMatches')),
      originalGetDoc(doc(db, 'cache', 'libertadoresMatches'))
    ]);

    const dataMundial = (wcSnap.exists() ? wcSnap.data().matches || [] : []).map(m => ({ ...m, compId: 2000, competition: 'Copa del Mundo', predictionCollection: 'userPredictions' }));
    const dataChampions = (clSnap.exists() ? clSnap.data().matches || [] : []).map(m => ({ ...m, compId: 2001, competition: 'Champions League', predictionCollection: 'testPredictions' }));
    const dataBrasil = (braSnap.exists() ? braSnap.data().matches || [] : []).map(m => ({ ...m, compId: 2013, competition: 'Brasileirão', predictionCollection: 'brazilPredictions' }));
    const dataArgentina = (argSnap.exists() ? argSnap.data().matches || [] : []).map(m => {
      let finalTime = m.argTime;
      if (!finalTime && m.utcDate) {
        const dt = new Date(m.utcDate);
        const argDate = new Date(dt.getTime() - (3 * 60 * 60 * 1000));
        finalTime = argDate.toISOString().substring(11, 16);
      }
      return {
        ...m,
        argTime: finalTime || '??:??',
        competition: 'Liga Argentina',
        predictionCollection: 'argentinaPredictions'
      };
    });
    const dataLib = (libSnap.exists() ? libSnap.data().matches || [] : []).map(m => ({ ...m, competition: 'Libertadores', predictionCollection: 'libertadoresPredictions' }));

    const allMatches = [...dataMundial, ...dataChampions, ...dataBrasil, ...dataArgentina, ...dataLib];

    if (allMatches.length === 0) {
      console.warn('[CONSOLIDATE ⚠️] No hay ningún partido para consolidar. Abortando.');
      return;
    }

    // Ordenar por fecha
    allMatches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    const availableDays = [...new Set(allMatches.map(m => m.argDay))].filter(Boolean).sort();

    // 🧠 HUELLA DIGITAL: Incluimos el primer argTime para que, al añadirlo ahora,
    // la huella cambie y fuerce la escritura en Firestore.
    const firstTime = allMatches[0]?.argTime || '';
    const newFp = [
      allMatches.length,
      availableDays.join(','),
      firstTime,
      allMatches.map(m => (m.status || '') + (m.score?.fullTime?.home ?? '-') + ':' + (m.score?.fullTime?.away ?? '-')).join('|').substring(0, 10000)
    ].join('_');

    const oldSnap = await getDocOptimized(doc(db, 'cache', 'allMatches'));
    const oldFp = oldSnap.exists() ? oldSnap.data().fingerprint : '';

    if (newFp === oldFp) {
      console.log('[CONSOLIDATE 💤] Sin cambios en el calendario global. RAM y DB intactas.');
      return;
    }

    // Guardar con SECRET para evitar PERMISSION_DENIED
    await setDoc(doc(db, 'cache', 'allMatches'), {
      matches: allMatches,
      availableDays,
      updatedAt: new Date().toISOString(),
      count: allMatches.length,
      fingerprint: newFp,
      serverSecret: process.env.CRON_SECRET // ¡CRÍTICO PARA LAS REGLAS!
    });

    // Solo invalidamos la RAM si escribimos algo nuevo
    invalidateRamCache('cache/allMatches');

    console.log(`[CONSOLIDATE ✅] cache/allMatches actualizado (${allMatches.length} partidos).`);
  } catch (err) {
    console.error('[CONSOLIDATE ❌] Error fatal combinando partidos:', err);
  }
}
