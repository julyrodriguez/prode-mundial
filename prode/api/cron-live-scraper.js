/**
 * api/cron-live-scraper.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cron dedicado exclusivamente a "inyectar adrenalina" (goles rápidos).
 * Mantiene una cola de trabajo en RAM para ahorrar lecturas a Firestore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// ── Firebase Client Setup ──────────────────────────────────────────────────────
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

// ── MEMORIA GLOBAL PARA COLA DE TRABAJO ──────────────────────────────────────
if (global.SCRAPER_MASTER_RAM === undefined) {
  global.SCRAPER_MASTER_RAM = {
    liveQueue: [],           // Lista de objetos {id, teams} a raspar
    lastQueueUpdate: 0,
    finishedInInstance: new Set(),  // IDs que ya terminaron (No raspar más)
    pausedInInstance: {},           // IDs en entretiempo (HT) -> timestamp
    cachedSemaforo: null,           // Caché del semáforo (Ahorro de BD)
    lastSemaforoUpdate: 0,          // Timestamp de última consulta real
  };
}
const MEM = global.SCRAPER_MASTER_RAM;

export default async function handler(req, res) {
  const secret = req.query?.secret || req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const now = Date.now();
  const QUEUE_TTL = 10 * 60 * 1000;      
  const HT_BREAK_MS = 12 * 60 * 1000;   
  const SEMAFORO_TTL = 15 * 60 * 1000;  // 🔗 15 min de memoria para el semáforo

  try {
    // 0. PORTERO INTELIGENTE CON CACHÉ RAM
    let isNeeded = MEM.cachedSemaforo;
    if (isNeeded === null || (now - MEM.lastSemaforoUpdate > SEMAFORO_TTL) || req.query?.force) {
      console.log(`[SCRAPER] 🚦 Leyendo semáforo real de Firestore...`);
      const shieldSnap = await getDoc(doc(db, 'cache', 'robotShield'));
      isNeeded = shieldSnap.exists() ? shieldSnap.data().isScraperNeeded : true;
      
      // Guardamos en RAM para las próximas 15 ejecuciones
      MEM.cachedSemaforo = isNeeded;
      MEM.lastSemaforoUpdate = now;
    }

    if (!isNeeded && !req.query?.force) {
      console.log(`[PORTERO 🔴] Semáforo en ROJO. Scraper durmiendo para ahorrar CPU.`);
      return res.status(200).json({ status: "REPOSO_INTELIGENTE", mensaje: "Dormido por Semáforo RAM (Refresco cada 15m)." });
    }

    console.log(`[PORTERO 🟢] Semáforo en VERDE. Iniciando guardia de goles...`);

    // 1. ¿Necesitamos recargar la cola de partidos de Firestore?
    if (MEM.liveQueue.length === 0 || (now - MEM.lastQueueUpdate > QUEUE_TTL)) {
      console.log(`[SCRAPER MASTER] ☁️ Cargando cache/allMatches para reconstruir la cola...`);
      const snap = await getDoc(doc(db, 'cache', 'allMatches'));

      if (snap.exists()) {
        const matches = snap.data().matches || [];

        // Buscamos partidos que estén en juego o por empezar inminentemente
        MEM.liveQueue = matches
          .filter(m => {
            const isSkip = String(m.id).startsWith('arg26-') || String(m.id).startsWith('lib26-');
            if (isSkip) return false;

            if (m.status === 'FINISHED') return false;
            if (MEM.finishedInInstance.has(String(m.id))) return false;

            const matchTime = new Date(m.utcDate).getTime();
            const diff = now - matchTime;

            // Fina: 15 min antes hasta 4hs después del inicio, o si el API dice que es LIVE
            const isInWindow = diff > -(15 * 60 * 1000) && diff < (4 * 60 * 60 * 1000);
            const isLive = m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED';

            return isLive || isInWindow;
          })
          .map(m => ({
            id: String(m.id),
            compId: m.compId || '',
            teams: `${m.homeTeam?.tla || m.homeTeam?.name} vs ${m.awayTeam?.tla || m.awayTeam?.name}`
          }));

        MEM.lastQueueUpdate = now;
        console.log(`[SCRAPER MASTER] 📜 Cola reconstruida: ${MEM.liveQueue.length} partidos activos.`);
      }
    }

    // 2. Procesar la cola actual paralelamente
    if (MEM.liveQueue.length === 0) {
      return res.status(200).json({ status: "REPOSO", mensaje: "No hay partidos en ventana de juego." });
    }

    const liveNames = MEM.liveQueue.map(q => q.teams).join(' | ');
    console.log(`[SCRAPER MASTER] 🚀 Iniciando raspado para: ${liveNames}`);

    const protocol = 'https';
    const host = req.headers?.host || 'prode.jariel.com.ar';
    const scraperSecret = process.env.CRON_SECRET;

    const results = await Promise.all(MEM.liveQueue.map(async (match) => {
      const { id, teams } = match;
      try {
        // ¿Está este partido en "Siesta" (Entretiempo)?
        if (MEM.pausedInInstance[id]) {
          const timePassed = now - MEM.pausedInInstance[id];
          if (timePassed < HT_BREAK_MS) {
            return { id, partido: teams, status: `SIESTA_HT (${Math.round((HT_BREAK_MS - timePassed) / 60000)} min restante)` };
          } else {
            delete MEM.pausedInInstance[id]; // Volver a despertar
          }
        }

        const scrapeUrl = `${protocol}://${host}/api/match-scrape?id=${id}&secret=${scraperSecret}&skip_if_same=true&compId=${match.compId || ''}`;
        const resp = await globalThis.fetch(scrapeUrl);
        const data = await resp.json();

        // 3. Evaluar estado para decidir futuro del raspado
        if (data.isFinished) {
          console.log(`[SCRAPER MASTER] 🏁 ${teams} (ID ${id}) TERMINADO. Quitando de la cola.`);
          MEM.finishedInInstance.add(String(id));
          MEM.liveQueue = MEM.liveQueue.filter(q => q.id !== id);
        } else if (data.currentMinute === 'ENTRETIEMPO' || data.statusText === 'HT') {
          console.log(`[SCRAPER MASTER] 💤 ${teams} (ID ${id}) en ENTRETIEMPO. Iniciando siesta.`);
          MEM.pausedInInstance[id] = now;
        }

        const scoreStr = data.score ? `${data.score.home}:${data.score.away}` : "N/A";
        const statusStr = data.statusText || "OK";

        // LOGS CLAROS PARA EL USUARIO
        if (data.injection === "FULL") {
           console.log(`[SCRAPER 🤖🚀] GOL en ${teams}: ${scoreStr}. ¡Base de Datos ACTUALIZADA!`);
        } else if (data.injection === "HEARTBEAT") {
           console.log(`[SCRAPER 🤖💓] Latido en ${teams}. Escudo de 5m renovado.`);
        }

        return {
          id,
          partido: teams,
          score: scoreStr,
          status: statusStr,
          injection: data.injection || "N/A"
        };
      } catch (err) {
        return { id, partido: teams, error: err.message };
      }
    }));

    return res.status(200).json({
      estado: "EJECUTADO",
      partidos_procesados: results.length,
      detalle: results,
      cola_restante: MEM.liveQueue.length
    });

  } catch (error) {
    console.error(`[SCRAPER MASTER ERROR]`, error.message);
    return res.status(500).json({ error: error.message });
  }
}
