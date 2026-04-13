/**
 * api/match-scrape.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scraper de native-stats.org para obtener datos de partidos en tiempo real.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as cheerio from 'cheerio';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';

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

const NATIVE_STATS_BASE = 'https://native-stats.org/match';

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

function parseLineup($container) {
  const players = [];
  $container.find('div.space-y-1 > div[class*="text-sm"]').each((i, el) => {
    const text = cheerio.load(el).text().trim();
    const m = text.match(/^(.+?)\s*\((\d+)\)$/);
    if (m) players.push({ name: m[1].trim(), number: parseInt(m[2]) });
  });
  return players;
}

function parseMatchPage(html, matchId) {
  const $ = cheerio.load(html);

  // 1. Score
  const scoreRaw = $('#score').text().trim();
  const scoreMatch = scoreRaw.match(/^(\d+):(\d+)(?:\s*\((\d+):(\d+)\))?/);
  const homeScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;
  const awayScore = scoreMatch ? parseInt(scoreMatch[2]) : 0;

  // 2. Equipos
  const teamsRaw = [];
  $('span[phx-click*="/team/"]').each((i, el) => {
    const phxClick = $(el).attr('phx-click') || '';
    const teamId = phxClick.match(/\/team\/(\d+)/)?.[1];
    const name = $(el).find('span.hidden.md\\:inline-block, span[class*="md:inline-block"]').text().trim() || $(el).text().trim();
    if (teamId) teamsRaw.push({ id: teamId, name: name.replace(/\s*\(\d+\)$/, '').trim() });
  });

  // 3. Goles
  const goalsArr = [];
  let goalsTable = null;
  $('h2').each((i, el) => { if ($(el).text().trim() === 'Goals') goalsTable = $(el).next('table'); });
  if (goalsTable) {
    goalsTable.find('tbody tr').each((i, row) => {
      const tds = $(row).find('td');
      const minute = parseInt($(tds[0]).text().trim()) || null;
      const team = $(tds[1]).text().trim();
      const scorer = $(tds[2]).find('span').first().text().trim();
      if (minute !== null) goalsArr.push({ minute, team, scorer });
    });
  }

  // 4. Tarjetas y Alineaciones (EXTRAS para el Usuario)
  const bookingsArr = [];
  let bookingsTable = null;
  $('h2').each((i, el) => { if ($(el).text().trim() === 'Bookings') bookingsTable = $(el).next('table'); });
  if (bookingsTable) {
    bookingsTable.find('tbody tr').each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 3) {
        const minute = parseInt($(tds[0]).text().trim());
        const team = $(tds[1]).text().trim();
        const player = $(tds[2]).find('span').first().text().trim() || $(tds[2]).text().trim();
        const cardType = $(tds[3])?.text().trim() || 'YELLOW_CARD';
        bookingsArr.push({ minute, team, player, cardType });
      }
    });
  }

  const teamSections = $('div.md\\:w-1\\/2');
  let hL = [], hB = [], aL = [], aB = [];
  if (teamSections.length >= 2) {
    const hSub = teamSections.eq(0).find('div.flex.space-x-4 > div.w-1\\/2');
    const aSub = teamSections.eq(1).find('div.flex.space-x-4 > div.w-1\\/2');
    if (hSub.length >= 2) { hL = parseLineup(hSub.eq(0)); hB = parseLineup(hSub.eq(1)); }
    if (aSub.length >= 2) { aL = parseLineup(aSub.eq(0)); aB = parseLineup(aSub.eq(1)); }
  }

  const baseResult = {
    id: matchId,
    scrapedAt: new Date().toISOString(),
    score: { home: homeScore, away: awayScore },
    homeTeam: { ...teamsRaw[0], lineup: hL, bench: hB },
    awayTeam: { ...teamsRaw[1], lineup: aL, bench: aB },
    goals: goalsArr,
    bookings: bookingsArr,
    substitutions: [],
    scoreFound: !!scoreMatch, // Marcamos si realmente pudimos leer un marcador
    sourceUrl: `${NATIVE_STATS_BASE}/${matchId}`,
  };

  // 5. Estado
  const statusTextText = $('div.status').first().text().trim();

  // --- SEGÚRO ANTI-DELAY (Detección por hora de inicio) ---
  let isPast = false;
  const dM = statusTextText.match(/(\d{4})\/(\d{2})\/(\d{2}),\s*(\d{2})h(\d{2})/);
  if (dM) {
    const start = new Date(parseInt(dM[1]), parseInt(dM[2]) - 1, parseInt(dM[3]), parseInt(dM[4]), parseInt(dM[5]));
    isPast = new Date() > start;
  }

  const hasGoles = (homeScore > 0 || awayScore > 0 || goalsArr.length > 0);
  const isMatchLive = /^\d+['′+]|^HT$|^MT$|^ET$|^PP$/i.test(statusTextText) || hasGoles || isPast;
  const isMatchFinished = /^FT$|^AET$|^PEN$/i.test(statusTextText) || statusTextText === 'FINALIZADO';

  let minuteString = isMatchLive ? statusTextText : null;
  if (minuteString && minuteString.includes('/')) minuteString = 'EN VIVO';
  if (minuteString === 'HT' || minuteString === 'MT') minuteString = 'ENTRETIEMPO';
  else if (minuteString === 'FT') minuteString = 'FINALIZADO';

  return { ...baseResult, statusText: statusTextText, isLive: isMatchLive, isFinished: isMatchFinished, currentMinute: minuteString };
}

let CACHED_HASHES = {};
function checkCachePurge() {
  const now = new Date();
  const min = now.getMinutes();
  if (min % 5 === 0 && Object.keys(CACHED_HASHES).length > 0) {
    console.log(`[SCRAPE 🧹 ${now.toLocaleTimeString()}] VÁLVULA ABIERTA: Purgado de hashes para lectura fresca.`);
    CACHED_HASHES = {};
  }
}

export default async function handler(req, res) {
  checkCachePurge();
  const { id, secret, compId } = req.query;
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  const shieldMap = {
    '2000': 'worldCupActiveAt',
    '2001': 'championsActiveAt',
    '2013': 'brazilActiveAt'
  };

  try {
    const url = `${NATIVE_STATS_BASE}/${id}`;
    const response = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!response.ok) return res.status(response.status).json({ error: `Fuente error ${response.status}` });

    const htmlBody = await response.text();
    if (req.query.skip_if_same === 'true') {
      const hashFp = htmlBody.length + "_" + htmlBody.substring(0, 50);
      if (CACHED_HASHES[id] === hashFp) {
        console.log(`[SCRAPE 🤖💤] Match ${id} idéntico. Renovando escudo y saltando.`);

        const shieldRef = doc(db, 'cache', 'robotShield');
        const finalField = shieldMap[compId];
        if (finalField && secret === process.env.CRON_SECRET) {
          await updateDoc(shieldRef, { [finalField]: new Date().toISOString(), serverSecret: process.env.CRON_SECRET }).catch(() => { });
        }

        return res.status(200).json({ estado: "SIN_CAMBIOS", id, injection: "SKIPPED_ZZZ" });
      }
      CACHED_HASHES[id] = hashFp;
    }

    const mData = parseMatchPage(htmlBody, id);
    console.log(`[SCRAPE 🤖] Match ${id} interpretado. Status: ${mData.isLive ? 'EN VIVO' : mData.isFinished ? 'FINALIZADO' : 'PENDIENTE'} - Score: ${mData.score.home}:${mData.score.away}`);

    let finalInjection = "NONE";

    const isInternal = !String(id).startsWith('arg26-');
    if (isInternal && secret === process.env.CRON_SECRET && (mData.isLive || mData.isFinished)) {
      try {
        const COMPS = [{ id: 2000, cacheKey: 'worldCupMatches' }, { id: 2001, cacheKey: 'championsMatches' }, { id: 2013, cacheKey: 'brazilMatches' }];
        for (const c of COMPS) {
          const dRef = doc(db, 'cache', c.cacheKey);
          const snapDoc = await getDoc(dRef);
          if (snapDoc.exists()) {
            const docData = snapDoc.data();
            const matchItems = docData.matches || [];
            const idxMatch = matchItems.findIndex(m => String(m.id) === String(id));
            if (idxMatch !== -1) {
              const cachedM = matchItems[idxMatch];
              const scoreChanged = (mData.score.home !== (cachedM.score?.fullTime?.home ?? 0)) || (mData.score.away !== (cachedM.score?.fullTime?.away ?? 0));
              let upFields = { robotActiveAt: new Date().toISOString() };
              let doWrite = false;

              // REGLA DE ORO: Solo actualizamos si mData.scoreFound es true (evitamos resets a 0-0 por error de red)
              if (mData.scoreFound && (scoreChanged || (mData.isFinished && cachedM.status !== 'FINISHED'))) {
                console.log(`[INJECT 🚀] Cambio en ${id}. Marcador: ${mData.score.home}:${mData.score.away} (Antes ${cachedM.score?.fullTime?.home}:${cachedM.score?.fullTime?.away})`);
                matchItems[idxMatch] = {
                  ...cachedM,
                  score: { fullTime: { home: mData.score.home, away: mData.score.away } },
                  goals: mData.goals.map(g => ({ minute: g.minute, team: { name: g.team }, scorer: { name: g.scorer } })),
                  bookings: mData.bookings,
                  source: 'SCRAPER',
                  scrapedAt: new Date().toISOString()
                };
                upFields.matches = matchItems;
                finalInjection = "FULL";
              } else {
                console.log(`[LATIDO 💓] Match ${id}. Renovando escudo protector.`);
                doWrite = true;
                finalInjection = "HEARTBEAT";
              }
              if (doWrite || finalInjection === "FULL") {
                // 1. Escribir datos en el doc de la liga (Marcador o Solo Latido)
                await updateDoc(dRef, { ...upFields, serverSecret: process.env.CRON_SECRET });

                // 2. Latido en el ESCUDO CENTRAL (Para que cron-all lo lea sin RAM)
                const shieldRef = doc(db, 'cache', 'robotShield');
                const fieldMap = {
                  'championsMatches': 'championsActiveAt',
                  'worldCupMatches': 'worldCupActiveAt',
                  'brazilMatches': 'brazilActiveAt'
                };
                const shieldValue = new Date().toISOString();
                const shieldField = fieldMap[c.cacheKey];
                if (shieldField) {
                  await updateDoc(shieldRef, { [shieldField]: shieldValue, serverSecret: process.env.CRON_SECRET }).catch(async () => {
                    // Si el documento Shield aún no existe, lo creamos de cero
                    await setDoc(shieldRef, { [shieldField]: shieldValue, serverSecret: process.env.CRON_SECRET });
                  });
                }

                if (finalInjection === "FULL") {
                  const currentHost = req.headers?.host || 'prode.jariel.com.ar';
                  globalThis.fetch(`https://${currentHost}/api/cron-all?secret=${process.env.CRON_SECRET}&action=invalidate_ram&collection=${c.cacheKey}`).catch(() => { });
                }
              }
              break;
            }
          }
        }
      } catch (e) { finalInjection = "ERROR"; }
    }

    return res.status(200).json({ ...mData, injection: finalInjection });
  } catch (errGlobal) { return res.status(500).json({ error: errGlobal.message }); }
}
