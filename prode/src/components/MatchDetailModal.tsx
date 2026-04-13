import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, useWindowDimensions, Platform, Animated
} from 'react-native';
import { X } from 'lucide-react-native';
import { auth, db } from '../lib/firebase';
import { getDocs, collection, doc, getDoc } from 'firebase/firestore';

const getApiUrl = (endpoint: string, id: number | string) => {
  const isProdWeb = Platform.OS === 'web' && !__DEV__;
  const base = (isProdWeb || Platform.OS !== 'web')
    ? 'https://prode.jariel.com.ar'
    : 'http://localhost:3001';
  return `${base}/api/${endpoint}?id=${id}`;
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface MatchDetailModalProps {
  match: any;
  onClose: () => void;
  predictionCollection: string; // e.g. 'userPredictions' | 'testPredictions' | 'brazilPredictions'
}

// ─── Stat Row ─────────────────────────────────────────────────────────────────
function StatBar({ label, home, away }: { label: string; home: number; away: number }) {
  const total = (home || 0) + (away || 0);
  const homeW = total > 0 ? Math.round(((home || 0) / total) * 100) : 50;
  const awayW = 100 - homeW;
  return (
    <View style={st.statRow}>
      <Text style={st.statValL}>{home ?? '—'}</Text>
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <Text style={st.statLabel}>{label}</Text>
        <View style={st.barTrack}>
          <View style={[st.barHome, { flex: homeW }]} />
          <View style={[st.barAway, { flex: awayW }]} />
        </View>
      </View>
      <Text style={st.statValR}>{away ?? '—'}</Text>
    </View>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function MatchDetailModal({ match, onClose, predictionCollection }: MatchDetailModalProps) {
  const [participantPreds, setParticipantPreds] = useState<any[]>([]);
  const [loadingPreds, setLoadingPreds] = useState(true);
  const [scrapeData, setScrapeData] = useState<any>(null);
  const [loadingScrape, setLoadingScrape] = useState(false);
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const isMobile = width < 700;

  // Animate loading overlay
  useEffect(() => {
    if (loadingScrape) {
      // Reset: show loading (text), hide content
      loadingOpacity.setValue(1);
      contentOpacity.setValue(0);
    } else {
      // Fade out loading, fade in content simultaneously
      Animated.parallel([
        Animated.timing(loadingOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [loadingScrape]);

  // Load scrape data on open + Silent Polling if LIVE
  useEffect(() => {
    if (!match) return;
    setScrapeData(null);
    loadingOpacity.setValue(1);
    contentOpacity.setValue(0);

    const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED' || match.status === 'HALFTIME' || match.status === 'EXTRA_TIME';
    let isFirstLoad = true;

    const fetchScrape = async (silent = false) => {
      if (!silent) setLoadingScrape(true);
      try {
        const res = await fetch(getApiUrl('match-scrape', match.id));
        if (res.ok) {
          const data = await res.json();
          setScrapeData(data);
        } else {
          console.warn('[modal] match-scrape HTTP:', res.status);
        }
      } catch (e: any) {
        console.warn('[modal] match-scrape error:', e.message);
      } finally {
        if (!silent) setLoadingScrape(false);
        isFirstLoad = false;
      }
    };

    fetchScrape(); // First load

    let intervalId: any = null;
    if (isLive) {
      intervalId = setInterval(() => {
        fetchScrape(true); // Silent background updates every 15s
      }, 15000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [match?.id, match?.status]);

  // Load participant predictions on open
  useEffect(() => {
    if (!match) return;
    const load = async () => {
      setLoadingPreds(true);
      try {
        const matchId = match.id.toString();
        // Traemos datos del cache del leaderboard para los nombres (evita leer toda la col 'users')
        // y traemos los pronósticos (todavía necesario leer la colección por nuestra estructura)
        const [predsSnap, cacheSnap] = await Promise.all([
          getDocs(collection(db, predictionCollection)),
          getDoc(doc(db, 'cache', 'leaderboard')),
        ]);

        const usersMap: Record<string, string> = {};
        if (cacheSnap.exists()) {
          const cachedUsers = cacheSnap.data().users || [];
          cachedUsers.forEach((u: any) => {
            usersMap[u.id] = u.name;
          });
        }

        const preds: any[] = [];
        predsSnap.docs.forEach((d: any) => {
          const data = d.data();
          const mp = data.matches?.[matchId];
          if (mp !== undefined && (mp.home !== '' || mp.away !== '')) {
            preds.push({
              userId: d.id,
              name: usersMap[d.id] || 'Jugador',
              home: mp.home ?? '',
              away: mp.away ?? '',
            });
          }
        });
        // Sort: current user first, then alphabetically
        preds.sort((a, b) => {
          if (a.userId === auth.currentUser?.uid) return -1;
          if (b.userId === auth.currentUser?.uid) return 1;
          return a.name.localeCompare(b.name);
        });
        setParticipantPreds(preds);
      } catch (e) {
        console.error('Error loading preds:', e);
      } finally {
        setLoadingPreds(false);
      }
    };
    load();
  }, [match?.id]);

  if (!match) return null;
  const fullMatch = match; // alias para compat con el parche

  // Merge seguro: Respetamos status original IN_PLAY para nunca perder estado vivo por el scraper
  const isFinished = fullMatch.status === 'FINISHED' || (scrapeData?.isFinished === true && fullMatch.status !== 'IN_PLAY');
  const isLive = (!isFinished) && (
    fullMatch.status === 'IN_PLAY' ||
    fullMatch.status === 'PAUSED' ||
    fullMatch.status === 'HALFTIME' ||
    fullMatch.status === 'EXTRA_TIME' ||
    scrapeData?.isLive === true
  );
  const isPending = !isFinished && !isLive;

  const homeScore = isPending ? null : (fullMatch.score?.fullTime?.home ?? scrapeData?.score?.home);
  const awayScore = isPending ? null : (fullMatch.score?.fullTime?.away ?? scrapeData?.score?.away);
  const htHome = isPending ? null : (fullMatch.score?.halfTime?.home ?? scrapeData?.score?.halfTime?.home);
  const htAway = isPending ? null : (fullMatch.score?.halfTime?.away ?? scrapeData?.score?.halfTime?.away);
  const liveMinute = scrapeData?.currentMinute || null;

  const goals = scrapeData?.goals?.length > 0 ? scrapeData.goals : (match.goals || []);
  const goalsFromScrape = scrapeData?.goals?.length > 0;
  const bookings = scrapeData?.bookings?.length > 0 ? scrapeData.bookings : (match.bookings || []);
  const bookingsFromScrape = scrapeData?.bookings?.length > 0;
  const substitutions: any[] = scrapeData?.substitutions || [];

  const homeLineupRaw = scrapeData?.homeTeam?.lineup || match.homeTeam?.lineup || [];
  const awayLineupRaw = scrapeData?.awayTeam?.lineup || match.awayTeam?.lineup || [];
  const homeBench = scrapeData?.homeTeam?.bench || [];
  const awayBench = scrapeData?.awayTeam?.bench || [];
  const homeFormation = match.homeTeam?.formation;
  const awayFormation = match.awayTeam?.formation;

  const homeTeamName = match.homeTeam?.name || '';
  const awayTeamName = match.awayTeam?.name || '';

  const getStat = (key: string, side: 'home' | 'away') => {
    if (!scrapeData?.statistics) return null;
    const stat = scrapeData.statistics.find((s: any) => s.type === key);
    return stat ? (side === 'home' ? stat.home : stat.away) : null;
  };
  const statItems = scrapeData?.statistics || [];

  return (
    <Modal visible={!!match} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={[st.sheet, isMobile && st.sheetMobile]}>

          {/* ─── Drag Handle ─── */}
          <View style={st.handle} />

          {/* ─── Header ─── */}
          <View style={st.header}>
            <TouchableOpacity onPress={onClose} style={st.closeBtn}>
              <X size={20} color="#888" />
            </TouchableOpacity>
            <View style={st.headerCenter}>
              <Text style={st.competitionLabel}>{match.stage?.replace(/_/g, ' ') || 'PARTIDO'}</Text>
              <Text style={st.dateLabel}>
                {match.argDay || ''}
                {match.utcDate ? ` · ${new Date(match.utcDate).getHours().toString().padStart(2, '0')}:${new Date(match.utcDate).getMinutes().toString().padStart(2, '0')} hs` : ''}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* ─── Content Area ─── */}
          <View style={st.contentArea}>
            <Animated.ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={st.scroll}
              style={{ opacity: contentOpacity }}
            >

              {/* ─── Score Banner ─── */}
              <View style={st.scoreBanner}>
                <View style={st.teamCol}>
                  {match.homeTeam?.crest ? <Image source={{ uri: match.homeTeam.crest }} style={st.crestLg} /> : <View style={st.crestLg} />}
                  <Text style={st.teamLgName} numberOfLines={2}>{match.homeTeam?.name || '---'}</Text>
                </View>

                <View style={st.scoreCenter}>
                  {isPending ? (
                    <>
                      <Text style={st.timeLabel}>{match.argTime || '--:--'}</Text>
                      <Text style={st.vsLabel}>vs</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[st.scoreBig, isLive && { color: '#22c55e' }]}>
                        {homeScore ?? '-'}  {awayScore ?? '-'}
                      </Text>
                      {(htHome !== null && htHome !== undefined) && (
                        <Text style={st.halfTimeLabel}>1T: {htHome} - {htAway}</Text>
                      )}
                      {isLive && (
                        <View style={st.livePill}>
                          <View style={st.liveDot} />
                          <Text style={st.liveText}>{liveMinute ? liveMinute : 'EN VIVO'}</Text>
                        </View>
                      )}
                      {isFinished && <Text style={st.finishedLabel}>FINALIZADO</Text>}
                    </>
                  )}
                </View>

                <View style={st.teamCol}>
                  {match.awayTeam?.crest ? <Image source={{ uri: match.awayTeam.crest }} style={st.crestLg} /> : <View style={st.crestLg} />}
                  <Text style={st.teamLgName} numberOfLines={2}>{match.awayTeam?.name || '---'}</Text>
                </View>
              </View>

              {match.venue ? <Text style={st.venue}>🏟 {match.venue}</Text> : null}

              {/* ─── Goles ─── */}
              {goals.length > 0 && (
                <View style={st.section}>
                  <Text style={st.sectionTitle}>Goles</Text>
                  <View style={st.goalsContainer}>
                    <View style={{ flex: 1 }}>
                      {goals
                        .filter((g: any) => goalsFromScrape ? g.team === homeTeamName : g.team?.id === match.homeTeam?.id)
                        .map((g: any, i: number) => (
                          <View key={i}>
                            <Text style={st.goalHome}>
                              ⚽ {goalsFromScrape ? g.scorer : g.scorer?.name?.split(' ').pop()}
                              {g.minute ? ` ${g.minute}'` : ''}
                              {!goalsFromScrape && (g.type === 'PENALTY' ? ' (P)' : g.type === 'OWN' ? ' (EC)' : '')}
                            </Text>
                            {goalsFromScrape && g.assist && (
                              <Text style={st.assistTxt}>↗ {g.assist}</Text>
                            )}
                          </View>
                        ))}
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {goals
                        .filter((g: any) => goalsFromScrape ? g.team === awayTeamName : g.team?.id === match.awayTeam?.id)
                        .map((g: any, i: number) => (
                          <View key={i} style={{ alignItems: 'flex-end' }}>
                            <Text style={st.goalAway}>
                              {goalsFromScrape ? g.scorer : g.scorer?.name?.split(' ').pop()}
                              {g.minute ? ` ${g.minute}'` : ''} ⚽
                              {!goalsFromScrape && (g.type === 'PENALTY' ? ' (P)' : g.type === 'OWN' ? ' (EC)' : '')}
                            </Text>
                            {goalsFromScrape && g.assist && (
                              <Text style={[st.assistTxt, { textAlign: 'right' }]}>↗ {g.assist}</Text>
                            )}
                          </View>
                        ))}
                    </View>
                  </View>
                </View>
              )}

              {/* ─── Tarjetas ─── */}
              {bookings.length > 0 && (
                <View style={st.section}>
                  <Text style={st.sectionTitle}>Tarjetas</Text>
                  <View style={st.goalsContainer}>
                    <View style={{ flex: 1 }}>
                      {bookings
                        .filter((b: any) => bookingsFromScrape ? b.team === homeTeamName : b.team?.id === match.homeTeam?.id)
                        .map((b: any, i: number) => (
                          <Text key={i} style={st.goalHome}>
                            {b.card === 'RED_CARD' || b.cardType === 'RED_CARD' ? '🟥' : '🟨'}{' '}
                            {bookingsFromScrape ? b.player : b.player?.name?.split(' ').pop()}
                            {b.minute ? ` ${b.minute}'` : ''}
                          </Text>
                        ))}
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {bookings
                        .filter((b: any) => bookingsFromScrape ? b.team === awayTeamName : b.team?.id === match.awayTeam?.id)
                        .map((b: any, i: number) => (
                          <Text key={i} style={st.goalAway}>
                            {b.minute ? `${b.minute}' ` : ''}
                            {bookingsFromScrape ? b.player : b.player?.name?.split(' ').pop()}{' '}
                            {b.card === 'RED_CARD' || b.cardType === 'RED_CARD' ? '🟥' : '🟨'}
                          </Text>
                        ))}
                    </View>
                  </View>
                </View>
              )}

              {/* ─── Sustituciones ─── */}
              {substitutions.length > 0 && (
                <View style={st.section}>
                  <Text style={st.sectionTitle}>Cambios</Text>
                  <View style={st.subSectionContainer}>
                    <View style={{ flex: 1 }}>
                      {substitutions
                        .filter((sub: any) => sub.team === homeTeamName)
                        .map((sub: any, i: number) => (
                          <View key={i} style={st.subItemHome}>
                            <View style={st.subRow}>
                              <Text style={st.subIconIn}>↑</Text>
                              <Text style={st.subPlayerIn} numberOfLines={1}>{sub.playerIn}</Text>
                            </View>
                            <View style={[st.subRow, { marginTop: 2 }]}>
                              <Text style={st.subIconOut}>↓</Text>
                              <Text style={st.subPlayerOut} numberOfLines={1}>{sub.playerOut}</Text>
                            </View>
                            <Text style={st.subTime}>{sub.minute}'</Text>
                          </View>
                        ))}
                    </View>
                    <View style={{ flex: 1 }}>
                      {substitutions
                        .filter((sub: any) => sub.team === awayTeamName)
                        .map((sub: any, i: number) => (
                          <View key={i} style={st.subItemAway}>
                            <View style={[st.subRow, { justifyContent: 'flex-end' }]}>
                              <Text style={st.subPlayerIn} numberOfLines={1}>{sub.playerIn}</Text>
                              <Text style={st.subIconIn}>↑</Text>
                            </View>
                            <View style={[st.subRow, { marginTop: 2, justifyContent: 'flex-end' }]}>
                              <Text style={st.subPlayerOut} numberOfLines={1}>{sub.playerOut}</Text>
                              <Text style={st.subIconOut}>↓</Text>
                            </View>
                            <Text style={[st.subTime, { textAlign: 'right' }]}>{sub.minute}'</Text>
                          </View>
                        ))}
                    </View>
                  </View>
                </View>
              )}

              {/* ─── Alineaciones ─── */}
              {homeLineupRaw.length > 0 && (
                <View style={st.section}>
                  <Text style={st.sectionTitle}>Alineaciones</Text>
                  <View style={st.formationsRow}>
                    {/* Local */}
                    <View style={st.formationSide}>
                      <Text style={st.formationTeamName}>{match.homeTeam?.shortName || match.homeTeam?.name}</Text>
                      {homeFormation && <Text style={st.formationNum}>{homeFormation}</Text>}
                      {homeLineupRaw.map((p: any, i: number) => (
                        <Text key={i} style={st.playerRow}>
                          <Text style={st.playerNum}>{p.number ?? p.shirtNumber ?? '·'} </Text>
                          {p.name || p.lastName || '---'}
                        </Text>
                      ))}
                      {homeBench.length > 0 && (
                        <>
                          <View style={st.benchDivider}>
                            <View style={st.benchLine} />
                            <Text style={st.benchLabel}>SUPLENTES</Text>
                            <View style={st.benchLine} />
                          </View>
                          {homeBench.map((p: any, i: number) => (
                            <Text key={i} style={st.benchPlayerRow}>
                              <Text style={st.benchNum}>{p.number ?? '·'} </Text>
                              {p.name || '---'}
                            </Text>
                          ))}
                        </>
                      )}
                    </View>

                    <View style={st.formationsDivider} />

                    {/* Visitante */}
                    <View style={[st.formationSide, { alignItems: 'flex-end' }]}>
                      <Text style={st.formationTeamName}>{match.awayTeam?.shortName || match.awayTeam?.name}</Text>
                      {awayFormation && <Text style={[st.formationNum, { textAlign: 'right' }]}>{awayFormation}</Text>}
                      {awayLineupRaw.map((p: any, i: number) => (
                        <Text key={i} style={[st.playerRow, { textAlign: 'right' }]}>
                          {p.name || p.lastName || '---'}
                          {' '}<Text style={st.playerNum}>{p.number ?? p.shirtNumber ?? '·'}</Text>
                        </Text>
                      ))}
                      {awayBench.length > 0 && (
                        <>
                          <View style={st.benchDivider}>
                            <View style={st.benchLine} />
                            <Text style={st.benchLabel}>SUPLENTES</Text>
                            <View style={st.benchLine} />
                          </View>
                          {awayBench.map((p: any, i: number) => (
                            <Text key={i} style={[st.benchPlayerRow, { textAlign: 'right' }]}>
                              {p.name || '---'}
                              {' '}<Text style={st.benchNum}>{p.number ?? '·'}</Text>
                            </Text>
                          ))}
                        </>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {/* ─── Pronósticos de Participantes ─── */}
              <View style={st.section}>
                <Text style={st.sectionTitle}>Pronósticos del Prode</Text>
                {loadingPreds ? (
                  <ActivityIndicator color="#444" style={{ marginTop: 12 }} />
                ) : participantPreds.length === 0 ? (
                  <Text style={st.noPreds}>Nadie pronósticó este partido aún</Text>
                ) : (
                  participantPreds.map((p, i) => {
                    const isMe = p.userId === auth.currentUser?.uid;
                    const ph = parseInt(p.home ?? '-1');
                    const pa = parseInt(p.away ?? '-1');
                    let pts = 0;
                    let resultStyle = st.predCard;

                    if (isFinished && homeScore !== undefined && awayScore !== undefined && ph >= 0 && pa >= 0) {
                      if (ph === homeScore && pa === awayScore) {
                        pts = 6;
                        resultStyle = { ...st.predCard, ...st.predExact };
                      } else {
                        const aR = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';
                        const pR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
                        if (aR === pR) { pts = 3; resultStyle = { ...st.predCard, ...st.predCorrect }; }
                        else resultStyle = { ...st.predCard, ...st.predWrong };
                      }
                    }

                    return (
                      <View key={i} style={resultStyle}>
                        <Text style={[st.predName, isMe && st.predNameMe]} numberOfLines={1}>
                          {isMe ? '● ' : ''}{p.name}
                        </Text>
                        <View style={st.predScoreRow}>
                          <Text style={st.predScore}>{p.home ?? '-'} - {p.away ?? '-'}</Text>
                          {isFinished && pts > 0 && (
                            <View style={[st.ptsBadge, pts === 6 ? st.ptsBadgeExact : st.ptsBadgeCorrect]}>
                              <Text style={st.ptsBadgeText}>+{pts}</Text>
                            </View>
                          )}
                          {isFinished && pts === 0 && ph >= 0 && (
                            <Text style={st.predMiss}>✗</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

            </Animated.ScrollView>

            {/* Loading overlay — cubriendo todo el contentArea */}
            <Animated.View
              style={[st.loadingOverlay, { opacity: loadingOpacity }]}
              pointerEvents={loadingScrape ? 'auto' : 'none'}
            >
              <View style={st.loadingBox}>
                <Text style={st.loadingText}>CARGANDO INFORMACIÓN</Text>
                <Text style={st.loadingSubText}>Por favor, aguarde un instante…</Text>
              </View>
            </Animated.View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0d0d0d', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: '#1e1e1e', maxHeight: '92%', paddingHorizontal: 20,
    overflow: 'hidden',
  },
  sheetMobile: { maxHeight: '96%' },
  handle: { width: 40, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  headerCenter: { flex: 1, alignItems: 'center' },
  competitionLabel: { color: '#666', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  dateLabel: { color: '#444', fontSize: 11, marginTop: 2 },
  contentArea: { flex: 1, minHeight: 450 }, // Forzar altura mínima para el loading
  scroll: { paddingBottom: 48 },

  // ─── Loading overlay ───
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0d0d0d',
    zIndex: 1000,
  },
  loadingBox: { alignItems: 'center', gap: 12 },
  loadingText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  loadingSubText: { color: '#444', fontSize: 11, fontWeight: '600' },

  // ─── Score ───
  scoreBanner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 28 },
  teamCol: { flex: 1, alignItems: 'center', gap: 10 },
  crestLg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#111' },
  teamLgName: { color: '#ddd', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 4 },
  scoreCenter: { flex: 1, alignItems: 'center', gap: 6 },
  scoreBig: { color: '#fff', fontSize: 42, fontWeight: '900', letterSpacing: -2 },
  halfTimeLabel: { color: '#444', fontSize: 12 },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginRight: 6 },
  liveText: { color: '#22c55e', fontSize: 11, fontWeight: '900' },
  finishedLabel: { color: '#3a3a3a', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  timeLabel: { color: '#666', fontSize: 18, fontWeight: '800' },
  vsLabel: { color: '#2a2a2a', fontSize: 28, fontWeight: '900' },
  venue: { color: '#3a3a3a', fontSize: 12, textAlign: 'center', marginBottom: 4 },

  // ─── Section ───
  section: { marginTop: 24, borderTopWidth: 1, borderTopColor: '#161616', paddingTop: 18 },
  sectionTitle: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5, marginBottom: 14, textTransform: 'uppercase' },

  // ─── Goals / Cards ───
  goalsContainer: { flexDirection: 'row', gap: 8 },
  goalHome: { color: '#ccc', fontSize: 12, lineHeight: 22 },
  goalAway: { color: '#ccc', fontSize: 12, lineHeight: 22, textAlign: 'right' },
  assistTxt: { color: '#3a3a3a', fontSize: 11, lineHeight: 16, marginBottom: 2 },

  // ─── Substitutions ───
  subSectionContainer: { flexDirection: 'row', gap: 16 },
  subItemHome: { marginBottom: 12, backgroundColor: '#111', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  subItemAway: { marginBottom: 12, backgroundColor: '#111', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subIconIn: { color: '#22c55e', fontSize: 14, fontWeight: '900' },
  subIconOut: { color: '#ef4444', fontSize: 14, fontWeight: '900' },
  subPlayerIn: { color: '#eee', fontSize: 11, fontWeight: '700', flex: 1 },
  subPlayerOut: { color: '#555', fontSize: 11, fontWeight: '500', flex: 1 },
  subTime: { color: '#333', fontSize: 9, fontWeight: '800', marginTop: 4 },

  // ─── Stats ───
  statsTeamHeaders: { flexDirection: 'row', marginBottom: 12 },
  statsTeamL: { color: '#fff', fontSize: 12, fontWeight: '800', flex: 1 },
  statsTeamR: { color: '#fff', fontSize: 12, fontWeight: '800', flex: 1, textAlign: 'right' },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statValL: { color: '#fff', fontSize: 13, fontWeight: '900', width: 30, textAlign: 'left' },
  statValR: { color: '#fff', fontSize: 13, fontWeight: '900', width: 30, textAlign: 'right' },
  statLabel: { color: '#555', fontSize: 10, fontWeight: '800', textAlign: 'center', marginBottom: 4, letterSpacing: 0.3 },
  barTrack: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  barHome: { backgroundColor: '#3b82f6', borderRadius: 2 },
  barAway: { backgroundColor: '#ef4444', borderRadius: 2 },

  // ─── Formations ───
  formationsRow: { flexDirection: 'row' },
  formationSide: { flex: 1, paddingHorizontal: 4 },
  formationsDivider: { width: 1, backgroundColor: '#1a1a1a', marginHorizontal: 10 },
  formationTeamName: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  formationNum: { color: '#22c55e', fontSize: 26, fontWeight: '900', letterSpacing: -1, marginBottom: 10 },
  formationPending: { color: '#2a2a2a', fontSize: 12, fontStyle: 'italic', marginBottom: 10 },
  playerRow: { color: '#888', fontSize: 12, lineHeight: 21 },
  playerNum: { color: '#444', fontWeight: '800', fontSize: 11 },

  // ─── Bench separator ───
  benchDivider: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6, gap: 6 },
  benchLine: { flex: 1, height: 1, backgroundColor: '#1e1e1e' },
  benchLabel: { color: '#2a2a2a', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#161616', borderRadius: 4, borderWidth: 1, borderColor: '#222' },
  benchPlayerRow: { color: '#3a3a3a', fontSize: 11.5, lineHeight: 20 },
  benchNum: { color: '#282828', fontWeight: '800', fontSize: 10 },

  // ─── Predictions ───
  noPreds: { color: '#333', fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
  predCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginBottom: 6, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a' },
  predExact: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
  predCorrect: { backgroundColor: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' },
  predWrong: { backgroundColor: '#0d0d0d', borderColor: '#141414' },
  predName: { color: '#777', fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  predNameMe: { color: '#fff', fontWeight: '800' },
  predScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  predScore: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: -0.5 },
  predMiss: { color: '#3a3a3a', fontSize: 14, fontWeight: '900' },
  ptsBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  ptsBadgeExact: { backgroundColor: 'rgba(34,197,94,0.2)' },
  ptsBadgeCorrect: { backgroundColor: 'rgba(251,191,36,0.15)' },
  ptsBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
});
