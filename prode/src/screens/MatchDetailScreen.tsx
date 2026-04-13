import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Platform, useWindowDimensions, Animated
} from 'react-native';
import { ChevronLeft, Flag, Users, Info, TrendingUp, Star, ChevronRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { auth, db } from '../lib/firebase';
import { getDocs, collection, doc, getDoc } from 'firebase/firestore';

const PREDS_CACHE_TTL_MS = 5 * 60 * 1000;
let _usersCache: { map: Record<string, string>; loadedAt: number } | null = null;
const _predsCache: Record<string, { data: Record<string, any>; loadedAt: number }> = {};

const getApiUrl = (endpoint: string, id: number | string) => {
  const isProdWeb = Platform.OS === 'web' && !__DEV__;
  const base = (isProdWeb || Platform.OS !== 'web')
    ? 'https://prode.jariel.com.ar'
    : 'http://localhost:3001';
  return `${base}/api/${endpoint}?id=${id}`;
};

function StatBar({ label, home, away }: { label: string; home: number; away: number }) {
  const total = (home || 0) + (away || 0);
  const homeW = total > 0 ? Math.round(((home || 0) / total) * 100) : 50;
  const awayW = 100 - homeW;
  return (
    <View style={s.statRow}>
      <View style={s.statInfo}>
        <Text style={s.statValL}>{home ?? '0'}</Text>
        <Text style={s.statLabel}>{label}</Text>
        <Text style={s.statValR}>{away ?? '0'}</Text>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barHome, { flex: homeW }]} />
        <View style={[s.barAway, { flex: awayW }]} />
      </View>
    </View>
  );
}

function PredsCard({ loadingPreds, participantPreds, isRevealed, auth, s, homeScore, awayScore, isLive, isFinished }: any) {
  const getPredColor = (p: any) => {
    // Si no se han revelado, mantenemos el color neón original
    if (!isRevealed) return '#adff00';

    // Si no hay un marcador válido para comparar aún, mantenemos neón
    if (homeScore === undefined || homeScore === null || awayScore === undefined || awayScore === null) {
      return '#adff00';
    }

    const pHome = parseInt(p.home, 10) || 0;
    const pAway = parseInt(p.away, 10) || 0;
    const aHome = parseInt(homeScore, 10);
    const aAway = parseInt(awayScore, 10);

    // Exact Match (Verde Neón)
    if (pHome === aHome && pAway === aAway) return '#adff00';

    // Winner/Draw Result Match (Amarillo/Dorado)
    const pRes = pHome > pAway ? 'h' : pHome < pAway ? 'a' : 'd';
    const aRes = aHome > aAway ? 'h' : aHome < aAway ? 'a' : 'd';
    if (pRes === aRes) return '#fbbf24';

    // Failed (Rojo vivo)
    return '#ef4444';
  };

  return (
    <View style={s.contentCard}>
      <View style={s.cardHead}>
        <Star size={16} color="#adff00" />
        <Text style={s.cardTitle}>Pronósticos</Text>
      </View>
      <View style={s.predsList}>
        {loadingPreds ? (
          <ActivityIndicator color="#444" style={{ margin: 20 }} />
        ) : participantPreds.map((p: any, i: number) => {
          const predColor = getPredColor(p);
          const isMyPred = p.userId === auth.currentUser?.uid;
          const showFullPred = isRevealed || isMyPred;

          return (
            <View key={i} style={[s.predRow, isMyPred && s.predRowMe]}>
              <Text style={s.predName}>{p.name}</Text>
              <Text style={[
                s.predScore,
                showFullPred ? { color: predColor } : s.maskedPred
              ]}>
                {showFullPred ? `${p.home} - ${p.away}` : '?.?'}
              </Text>
            </View>
          );
        })}
        {participantPreds.length === 0 && !loadingPreds && <Text style={s.noInfo}>Sin predicciones aún</Text>}
      </View>
    </View>
  );
}

export default function MatchDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { width } = useWindowDimensions();
  const isMobile = width < 850;

  const [fullMatch, setFullMatch] = useState<any>(route.params?.match || null);
  const [collId, setCollId] = useState<string>(route.params?.predictionCollection || 'userPredictions');
  const [isInitializing, setIsInitializing] = useState(!route.params?.match);

  const [participantPreds, setParticipantPreds] = useState<any[]>([]);
  const [loadingPreds, setLoadingPreds] = useState(true);
  const [loadingScrape, setLoadingScrape] = useState(false);
  const [scrapeData, setScrapeData] = useState<any>(null);

  // ── RECOVERY DEL PARTIDO SI SE RECARGA LA URL SIN MEMORIA (OPCIÓN B) ──
  useEffect(() => {
    if (fullMatch) return;
    const routeId = route.params?.id;
    if (!routeId) {
      setIsInitializing(false);
      return;
    }

    const findMatch = async () => {
      try {
        const caches = ['worldCupMatches', 'championsMatches', 'brazilMatches', 'argentinaMatches', 'libertadoresMatches'];
        let found = null;
        let cName = 'userPredictions';
        for (const c of caches) {
          const snap = await getDoc(doc(db, 'cache', c));
          if (snap.exists()) {
            const m = (snap.data().matches || []).find((x: any) => x.id?.toString() === routeId.toString());
            if (m) {
              found = m;
              if (c === 'championsMatches') cName = 'testPredictions';
              if (c === 'brazilMatches') cName = 'brazilPredictions';
              if (c === 'argentinaMatches') cName = 'argentinaPredictions';
              if (c === 'libertadoresMatches') cName = 'libertadoresPredictions';
              break;
            }
          }
        }
        if (found) {
          setFullMatch(found);
          if (!route.params?.predictionCollection) setCollId(cName);
        }
      } catch (e) {
        console.warn('[detail] Error recuperando url profunda:', e);
      } finally {
        setIsInitializing(false);
      }
    };
    findMatch();
  }, [route.params?.id, fullMatch]);

  const loadingOpacity = React.useRef(new Animated.Value(1)).current;
  const contentOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loadingScrape) {
      loadingOpacity.setValue(1);
      contentOpacity.setValue(0);
    } else {
      Animated.parallel([
        Animated.timing(loadingOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [loadingScrape]);

  useEffect(() => {
    if (!fullMatch) return;
    const fetchScrapeData = async (silent = false) => {
      const isSkip = fullMatch.id?.toString().startsWith('arg26-') || fullMatch.id?.toString().startsWith('lib26-');
      if (isSkip) return;

      // Quitamos la restricción de isPending para permitir que scrapeData traiga:
      // - Alineaciones confirmadas antes de que empiece
      // - Racha de partidos (W/D/L)
      // Como pidió el usuario, raspa "como si estuviera finalizado" aun siendo pendiente.

      if (!silent) setLoadingScrape(true);
      try {
        const res = await fetch(getApiUrl('match-scrape', fullMatch.id));
        if (res.ok) {
          const data = await res.json();
          setScrapeData(data);
        }
      } catch (e: any) {
        console.warn('[detail] match-scrape error:', e.message);
      } finally {
        if (!silent) setLoadingScrape(false);
      }
    };

    fetchScrapeData();
    const isLive = fullMatch.status === 'IN_PLAY' || fullMatch.status === 'PAUSED';
    let intervalId: any = null;
    if (isLive) {
      intervalId = setInterval(() => fetchScrapeData(true), 15000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [fullMatch?.id, fullMatch?.status]);

  useEffect(() => {
    if (!fullMatch) return;
    const loadPreds = async () => {
      setLoadingPreds(true);
      try {
        const matchId = fullMatch.id.toString();
        const coll = collId;
        const now = Date.now();

        let usersMap: Record<string, string>;
        if (_usersCache && now - _usersCache.loadedAt < PREDS_CACHE_TTL_MS) {
          usersMap = _usersCache.map;
        } else {
          // Optimizamos: leemos el cache del leaderboard en lugar de la colección completa 'users'
          const cacheSnap = await getDoc(doc(db, 'cache', 'leaderboard'));
          usersMap = {};
          if (cacheSnap.exists()) {
            const cachedUsers = cacheSnap.data().users || [];
            cachedUsers.forEach((u: any) => {
              usersMap[u.id] = u.name;
            });
          }
          _usersCache = { map: usersMap, loadedAt: now };
        }

        let allPredsData: Record<string, any>;
        if (_predsCache[coll] && now - _predsCache[coll].loadedAt < PREDS_CACHE_TTL_MS) {
          allPredsData = _predsCache[coll].data;
        } else {
          const predsSnap = await getDocs(collection(db, coll));
          allPredsData = {};
          predsSnap.docs.forEach(d => { allPredsData[d.id] = d.data(); });
          _predsCache[coll] = { data: allPredsData, loadedAt: now };
        }

        const preds: any[] = [];
        Object.entries(allPredsData).forEach(([userId, data]) => {
          const mp = data.matches?.[matchId];
          if (mp !== undefined && (mp.home !== '' || mp.away !== '')) {
            preds.push({
              userId,
              name: usersMap[userId] || 'Jugador',
              home: mp.home ?? '',
              away: mp.away ?? '',
            });
          }
        });
        preds.sort((a, b) => {
          if (a.userId === auth.currentUser?.uid) return -1;
          if (b.userId === auth.currentUser?.uid) return 1;
          return a.name.localeCompare(b.name);
        });
        setParticipantPreds(preds);
      } catch (e) {
        console.error('[detail] Error loading preds:', e);
      } finally {
        setLoadingPreds(false);
      }
    };
    loadPreds();
  }, [fullMatch?.id, collId]);

  if (isInitializing) return (
    <View style={s.centered}><ActivityIndicator color="#adff00" size="large" /></View>
  );

  if (!fullMatch) return (
    <View style={s.centered}><Text style={{ color: '#555' }}>Partido no encontrado</Text></View>
  );

  const mid = fullMatch.id?.toString();
  const isSkipScrape = mid?.startsWith('arg26-') || mid?.startsWith('lib26-');

  // Priorizamos el status original si es explícito. Si native-stats dice explicitly que terminó, pisamos.
  const isFinished = fullMatch.status === 'FINISHED' || (scrapeData?.isFinished === true && fullMatch.status !== 'IN_PLAY');
  const isLive = (!isFinished) && (
    fullMatch.status === 'IN_PLAY' ||
    fullMatch.status === 'PAUSED' ||
    fullMatch.status === 'HALFTIME' ||
    fullMatch.status === 'EXTRA_TIME' ||
    scrapeData?.isLive === true
  );

  const canSeePredictions = () => {
    if (isLive || isFinished) return true;
    if (!fullMatch.utcDate) return true;
    const kickoff = new Date(fullMatch.utcDate).getTime();
    const now = Date.now();
    const diffMs = kickoff - now;
    return diffMs <= 3600000;
  };
  const isRevealed = canSeePredictions();

  const homeScore = fullMatch.score?.fullTime?.home ?? scrapeData?.score?.home;
  const awayScore = fullMatch.score?.fullTime?.away ?? scrapeData?.score?.away;
  const liveMinute = scrapeData?.currentMinute || null;

  const goals = (scrapeData?.goals || []).map((g: any) => ({ ...g, type: 'GOAL' }));
  const bookings = (scrapeData?.bookings || []).map((b: any) => ({ ...b, type: 'BOOKING' }));
  const substitutions = (scrapeData?.substitutions || []).map((s: any) => ({ ...s, type: 'SUB' }));
  const allEvents = [...goals, ...bookings, ...substitutions].sort((a, b) => (parseInt(a.minute) || 0) - (parseInt(b.minute) || 0));

  const homeLineupRaw = scrapeData?.homeTeam?.lineup || fullMatch.homeTeam?.lineup || [];
  const awayLineupRaw = scrapeData?.awayTeam?.lineup || fullMatch.awayTeam?.lineup || [];

  const normalizePlayer = (p: any) => ({
    name: p.name ?? p.lastName ?? '---',
    number: p.number ?? p.shirtNumber ?? null,
  });
  const processedHomeLineup = (homeLineupRaw || []).map(normalizePlayer);
  const processedAwayLineup = (awayLineupRaw || []).map(normalizePlayer);

  const stats: any[] = fullMatch.homeTeam?.statistics ? [
    { type: 'SHOTS_ON_GOAL', home: fullMatch.homeTeam.statistics.shotsOnGoal, away: fullMatch.awayTeam.statistics.shotsOnGoal },
    { type: 'SHOTS_TOTAL', home: fullMatch.homeTeam.statistics.shotsTotal, away: fullMatch.awayTeam.statistics.shotsTotal },
    { type: 'BALL_POSSESSION', home: fullMatch.homeTeam.statistics.ballPossession, away: fullMatch.awayTeam.statistics.ballPossession },
    { type: 'CORNER_KICKS', home: fullMatch.homeTeam.statistics.cornerKicks, away: fullMatch.awayTeam.statistics.cornerKicks },
    { type: 'FREE_KICKS', home: fullMatch.homeTeam.statistics.freeKicks, away: fullMatch.awayTeam.statistics.freeKicks },
    { type: 'FOULS', home: fullMatch.homeTeam.statistics.fouls, away: fullMatch.awayTeam.statistics.fouls },
    { type: 'OFFSIDES', home: fullMatch.homeTeam.statistics.offsides, away: fullMatch.awayTeam.statistics.offsides },
    { type: 'YELLOW_CARDS', home: fullMatch.homeTeam.statistics.yellowCards, away: fullMatch.awayTeam.statistics.yellowCards },
  ].filter(s => s.home !== undefined && s.away !== undefined) : [];

  const statDefs = [
    { key: 'SHOTS_ON_GOAL', label: 'Tiros al arco' },
    { key: 'SHOTS_TOTAL', label: 'Total disparos' },
    { key: 'BALL_POSSESSION', label: 'Posesión %' },
    { key: 'CORNER_KICKS', label: 'Corners' },
    { key: 'FREE_KICKS', label: 'Tiros libres' },
    { key: 'FOULS', label: 'Faltas' },
    { key: 'OFFSIDES', label: 'Offsides' },
    { key: 'YELLOW_CARDS', label: 'Tarjetas amarillas' },
  ].filter((d: any) => {
    const stEntry = stats.find((x: any) => x.type === d.key);
    return stEntry && (stEntry.home !== null || stEntry.away !== null);
  });

  const hName = scrapeData?.homeTeam?.name || fullMatch.homeTeam?.name || '';
  const aName = scrapeData?.awayTeam?.name || fullMatch.awayTeam?.name || '';
  const maxW = 1200;

  return (
    <View style={s.root}>
      <View style={s.topBar}>
        <View style={[s.topBarContent, { maxWidth: maxW }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <ChevronLeft size={20} color="#fff" />
            <Text style={s.backTxt}>Volver</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>
            {hName} vs {aName}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={s.mainCardWrapper}>
          <View style={[s.mainCard, { maxWidth: maxW }]}>
            <View style={s.scoreboard}>
              <View style={s.teamCol}>
                <View style={s.crestWrapper}>
                  {fullMatch.homeTeam?.crest && (
                    <Image
                      source={{ uri: fullMatch.homeTeam.crest }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <Text style={s.mainTeamName}>{hName}</Text>
              </View>

              <View style={s.scoreBox}>
                <View style={s.scoreRow}>
                  <Text style={s.mainScore}>{homeScore ?? '-'}</Text>
                  <Text style={s.scoreDivider}>:</Text>
                  <Text style={s.mainScore}>{awayScore ?? '-'}</Text>
                </View>

                {isLive ? (
                  <View style={s.liveBadge}>
                    <View style={s.liveDot} />
                    <Text style={s.liveMinText}>EN VIVO</Text>
                  </View>
                ) : isFinished ? (
                  <Text style={s.statusBadgeFinished}>FINALIZADO</Text>
                ) : (
                  <Text style={s.statusBadgePending}>PROGRAMADO</Text>
                )}
                <Text style={s.matchDateUnder}>{fullMatch.argDate || ''} - {fullMatch.argTime || ''} HS</Text>
              </View>

              <View style={s.teamCol}>
                <View style={s.crestWrapper}>
                  {fullMatch.awayTeam?.crest && (
                    <Image
                      source={{ uri: fullMatch.awayTeam.crest }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <Text style={s.mainTeamName}>{aName}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[s.infoWrapper, { maxWidth: maxW, paddingHorizontal: isMobile ? 12 : 20 }]}>
          <View style={s.sectionHeader}>
            <TrendingUp size={18} color="#fff" />
            <Text style={s.sectionTitle}>INFORMACIÓN DEL PARTIDO</Text>
          </View>

          <View style={{ position: 'relative', minHeight: 400 }}>
            {loadingScrape && !isSkipScrape && (
              <Animated.View style={[s.loadingOverlay, { opacity: loadingOpacity }]}>
                <ActivityIndicator size="large" color="#adff00" />
                <Text style={s.loadingText}>SINCRONIZANDO PARTIDO...</Text>
              </Animated.View>
            )}

            {isSkipScrape ? (
              <View style={[s.contentGrid, isMobile && { flexDirection: 'column' }]}>
                <View style={[s.colMain, isMobile ? { width: '100%' } : { width: '65%' }]}>
                  <View style={s.noDetailCard}>
                    <Info size={40} color="#444" />
                    <Text style={s.noDetailTitle}>Detalles no disponibles</Text>
                    <Text style={s.noDetailSub}>La información en vivo no está habilitada para esta liga todavía.</Text>
                  </View>
                </View>
                <View style={[s.colSide, isMobile ? { width: '100%' } : { width: '35%' }]}>
                  <PredsCard
                    loadingPreds={loadingPreds}
                    participantPreds={participantPreds}
                    isRevealed={isRevealed}
                    auth={auth}
                    s={s}
                    homeScore={homeScore}
                    awayScore={awayScore}
                    isLive={isLive}
                    isFinished={isFinished}
                  />
                </View>
              </View>
            ) : (
              <Animated.View style={{ opacity: contentOpacity, flex: 1 }}>
                <View style={[s.contentGrid, isMobile && { flexDirection: 'column' }]}>
                  <View style={[s.colMain, isMobile ? { width: '100%' } : { width: '65%' }]}>
                    <View style={s.contentCard}>
                      <View style={s.cardHead}>
                        <Flag size={16} color="#adff00" />
                        <Text style={s.cardTitle}>Línea de Tiempo</Text>
                      </View>
                      <View style={s.timelineContainer}>
                        <View style={s.centerLine} />
                        {allEvents.map((evt: any, i: number) => {
                          const isAway = evt.team && (
                            evt.team.toLowerCase().includes(aName.toLowerCase()) ||
                            aName.toLowerCase().includes(evt.team.toLowerCase())
                          );
                          return (
                            <View key={i} style={[s.eventLineRow, isAway ? s.eventRowAway : s.eventRowHome]}>
                              <View style={[s.eventBubble, isAway ? s.bubbleRight : s.bubbleLeft, isMobile && { maxWidth: '85%' }]}>
                                <View style={[s.bubbleHeader, { flexDirection: isAway ? 'row-reverse' : 'row' }]}>
                                  <Text style={[s.eventMinuteText, { textAlign: isAway ? 'right' : 'left' }]}>{evt.minute}'</Text>
                                  <View style={[s.evtBody, { alignItems: isAway ? 'flex-end' : 'flex-start' }]}>
                                    {evt.type === 'GOAL' ? (
                                      <View style={[s.evtItem, { flexDirection: isAway ? 'row-reverse' : 'row' }]}>
                                        <Text style={s.goalIcon}>⚽</Text>
                                        <Text style={[s.evtPlayerName, isAway && { marginRight: 8, marginLeft: 0 }]}>{evt.scorer}</Text>
                                      </View>
                                    ) : evt.type === 'BOOKING' ? (
                                      <View style={[s.evtItem, { flexDirection: isAway ? 'row-reverse' : 'row' }]}>
                                        <View style={[s.cardIcon, { backgroundColor: evt.cardType === 'RED_CARD' ? '#ef4444' : '#fbbf24' }]} />
                                        <Text style={[s.evtPlayerName, isAway && { marginRight: 8, marginLeft: 0 }]}>{evt.player}</Text>
                                      </View>
                                    ) : evt.type === 'SUB' ? (
                                      <View style={{ width: '100%' }}>
                                        <View style={[s.evtItem, { flexDirection: isAway ? 'row-reverse' : 'row' }]}>
                                          <ArrowUpRight size={11} color="#22c55e" />
                                          <Text style={[s.subLabelIn, isAway && { marginRight: 4, marginLeft: 0 }]}>IN:</Text>
                                          <Text style={[s.subInText, isAway && { marginRight: 4, marginLeft: 0 }]}>{evt.playerIn}</Text>
                                        </View>
                                        <View style={[s.evtItem, { flexDirection: isAway ? 'row-reverse' : 'row' }]}>
                                          <ArrowDownLeft size={11} color="#ef4444" />
                                          <Text style={[s.subLabelOut, isAway && { marginRight: 4, marginLeft: 0 }]}>OUT:</Text>
                                          <Text style={[s.subOutText, isAway && { marginRight: 4, marginLeft: 0 }]}>{evt.playerOut}</Text>
                                        </View>
                                      </View>
                                    ) : null}
                                  </View>
                                </View>
                              </View>
                              <View style={s.lineDot} />
                            </View>
                          );
                        })}
                        {allEvents.length === 0 && <Text style={s.noInfo}>Esperando eventos...</Text>}
                      </View>

                      <View style={s.varNoteBox}>
                        <Info size={14} color="#adff00" />
                        <Text style={s.varNoteText}>
                          Si un gol aparece en la cronología pero no suma al marcador global, significa que el tanto fue <Text style={{ color: '#adff00', fontWeight: '900' }}>ANULADO</Text> por el VAR o decisión arbitral.
                        </Text>
                      </View>
                    </View>

                    <View style={s.contentCard}>
                      <View style={s.cardHead}>
                        <Users size={16} color="#adff00" />
                        <Text style={s.cardTitle}>Equipos Titulares</Text>
                      </View>
                      <View style={s.lineupContainer}>
                        <View style={s.lineupCol}>
                          {processedHomeLineup.map((homeP: any, hIdx: number) => (
                            <View key={`hp-${hIdx}`} style={s.playerRow}>
                              <Text style={s.playerNum}>{homeP.number || '-'}</Text>
                              <Text style={s.playerName} numberOfLines={1}>{homeP.name}</Text>
                            </View>
                          ))}
                        </View>
                        <View style={s.lineupDivider} />
                        <View style={s.lineupCol}>
                          {processedAwayLineup.map((awayP: any, aIdx: number) => (
                            <View key={`ap-${aIdx}`} style={[s.playerRow, { flexDirection: 'row-reverse' }]}>
                              <Text style={[s.playerNum, { marginLeft: 10, marginRight: 0 }]}>{awayP.number || '-'}</Text>
                              <Text style={[s.playerName, { textAlign: 'right' }]} numberOfLines={1}>{awayP.name}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={[s.colSide, isMobile ? { width: '100%' } : { width: '35%' }]}>
                    <PredsCard
                      loadingPreds={loadingPreds}
                      participantPreds={participantPreds}
                      isRevealed={isRevealed}
                      auth={auth}
                      s={s}
                      homeScore={homeScore}
                      awayScore={awayScore}
                      isLive={isLive}
                      isFinished={isFinished}
                    />

                    {statDefs.length > 0 && (
                      <View style={s.contentCard}>
                        <View style={s.cardHead}>
                          <Info size={16} color="#adff00" />
                          <Text style={s.cardTitle}>Estadísticas En Vivo</Text>
                        </View>
                        <View style={{ padding: 20 }}>
                          {statDefs.map((d: any) => {
                            const stEntry = stats.find((x: any) => x.type === d.key);
                            return <StatBar key={d.key} label={d.label} home={stEntry.home} away={stEntry.away} />
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              </Animated.View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020202' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  topBar: { height: 64, backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#161616', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  topBarContent: { width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#262626' },
  backTxt: { color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 6 },
  topBarTitle: { color: '#555', fontSize: 13, fontWeight: '800', marginLeft: 20, flex: 1, letterSpacing: 1, textTransform: 'uppercase' },

  scrollContainer: { paddingBottom: 80 },
  mainCardWrapper: { backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#161616', alignItems: 'center' },
  mainCard: { width: '100%', paddingVertical: 48, paddingHorizontal: 20 },
  scoreboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamCol: { flex: 1, alignItems: 'center' },
  crestWrapper: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#111', padding: 15, marginBottom: 16, borderWidth: 1, borderColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  mainCrest: { width: '100%', height: '100%', resizeMode: 'contain' },
  mainTeamName: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center', minHeight: 44 },

  scoreBox: { width: 180, alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  mainScore: { color: '#fff', fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  scoreDivider: { color: '#2a2a2a', fontSize: 40, marginHorizontal: 16, fontWeight: '200' },

  statusBadgeFinished: { color: '#ef4444', fontSize: 11, fontWeight: '900', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' },
  statusBadgePending: { color: '#fbbf24', fontSize: 11, fontWeight: '900', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(251, 191, 36, 0.1)', borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.2)' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(34, 197, 94, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 8 },
  liveMinText: { color: '#22c55e', fontSize: 14, fontWeight: '900' },
  matchDateUnder: { color: '#444', fontSize: 10, fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },

  infoWrapper: { alignSelf: 'center', width: '100%', marginTop: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginLeft: 12, letterSpacing: 1.5 },

  contentGrid: { flexDirection: 'row', gap: 20 },
  colMain: { gap: 20 },
  colSide: { gap: 20 },

  contentCard: { backgroundColor: '#0a0a0a', borderRadius: 20, borderWidth: 1, borderColor: '#181818', overflow: 'hidden', elevation: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#161616', backgroundColor: '#0d0d0d' },
  cardTitle: { color: '#eee', fontSize: 12, fontWeight: '900', marginLeft: 12, letterSpacing: 1, textTransform: 'uppercase' },

  timelineContainer: { paddingVertical: 30, position: 'relative', width: '100%', alignItems: 'center' },
  centerLine: { position: 'absolute', top: 30, bottom: 30, width: 2, backgroundColor: '#161616', left: '50%', marginLeft: -1 },
  eventLineRow: { flexDirection: 'row', width: '100%', paddingHorizontal: 20, marginVertical: 6, alignItems: 'center' },
  eventRowHome: { justifyContent: 'flex-start', paddingRight: '30%' },
  eventRowAway: { justifyContent: 'flex-end', paddingLeft: '30%' },
  lineDot: { position: 'absolute', left: '50%', marginLeft: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#222', borderWidth: 1, borderColor: '#050505', zIndex: 5 },
  eventBubble: { backgroundColor: '#0a0a0a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#161616', maxWidth: '95%' },
  bubbleLeft: { marginRight: 12 },
  bubbleRight: { marginLeft: 12 },
  bubbleHeader: { flexDirection: 'row', alignItems: 'center' },
  eventMinuteText: { color: '#adff00', fontSize: 11, fontWeight: '900', width: 28 },
  evtBody: { flex: 1 },
  evtItem: { flexDirection: 'row', alignItems: 'center' },
  evtPlayerName: { color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 8 },
  goalIcon: { fontSize: 14 },
  cardIcon: { width: 8, height: 12, borderRadius: 1, marginLeft: 4 },
  subLabelIn: { color: '#22c55e', fontSize: 10, fontWeight: '900', marginLeft: 4 },
  subLabelOut: { color: '#ef4444', fontSize: 10, fontWeight: '900', marginLeft: 4 },
  subInText: { color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  subOutText: { color: '#777', fontSize: 11, fontWeight: '600', marginLeft: 4 },

  lineupContainer: { flexDirection: 'row', padding: 10 },
  lineupCol: { flex: 1, padding: 15 },
  lineupDivider: { width: 1, backgroundColor: '#161616', height: '90%', alignSelf: 'center' },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  playerNum: { color: '#333', fontSize: 12, fontWeight: '900', width: 24, marginRight: 10 },
  playerName: { color: '#aaa', fontSize: 14, fontWeight: '600', flex: 1 },

  predsList: { padding: 15 },
  predRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: '#0c0c0c' },
  predRowMe: { backgroundColor: 'rgba(173, 255, 0, 0.05)', borderWidth: 1, borderColor: 'rgba(173, 255, 0, 0.15)' },
  predName: { color: '#999', fontSize: 14, fontWeight: '600' },
  predScore: { color: '#adff00', fontSize: 16, fontWeight: '900' },
  maskedPred: { color: '#333', backgroundColor: '#111', borderRadius: 4, overflow: 'hidden' },

  statRow: { marginBottom: 24 },
  statInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statLabel: { color: '#666', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  statValL: { color: '#fff', fontSize: 15, fontWeight: '900' },
  statValR: { color: '#fff', fontSize: 15, fontWeight: '900' },
  barTrack: { height: 6, backgroundColor: '#141414', borderRadius: 3, flexDirection: 'row', overflow: 'hidden' },
  barHome: { backgroundColor: '#fff', borderRadius: 3 },
  barAway: { backgroundColor: '#333', borderRadius: 3 },

  noInfo: { color: '#333', fontSize: 14, textAlign: 'center', padding: 40, fontWeight: '600', fontStyle: 'italic' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020202',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#adff00', marginTop: 24, fontSize: 13, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
  noDetailCard: { flex: 1, height: 400, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', borderRadius: 20, borderWidth: 1, borderColor: '#181818', padding: 40 },
  noDetailTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 20 },
  noDetailSub: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 10, maxWidth: 300 },

  varNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(173, 255, 0, 0.05)',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#161616',
    gap: 12
  },
  varNoteText: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16
  },
});
