/**
 * GroupsScreen — Copa del Mundo 2026
 * Vista de grupos y bracket eliminatorio premium.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, ActivityIndicator, Image,
  Platform, TouchableOpacity, Pressable, Modal, useWindowDimensions,
} from 'react-native';
import { db } from '../lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { X, ChevronRight, Trophy, Shield, Swords } from 'lucide-react-native';
import { BG, BORDER, TEXT, ACCENT, STATUS } from '../theme/colors';
import { TYPE, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS } from '../theme/spacing';

// ─── Constants ─────────────────────────────────────────────────────────────────
const RED   = ACCENT.mundial.primary;
const BLUE  = ACCENT.mundial.secondary;
const GREEN = ACCENT.mundial.tertiary;

const STAGES = [
  { id: 'LAST_32',        shortLabel: '32avos',   Icon: Shield  },
  { id: 'LAST_16',        shortLabel: 'Octavos',  Icon: Swords  },
  { id: 'QUARTER_FINALS', shortLabel: 'Cuartos',  Icon: Swords  },
  { id: 'SEMI_FINALS',    shortLabel: 'Semis',    Icon: Trophy  },
  { id: 'FINAL',          shortLabel: 'Final 🏆', Icon: Trophy  },
];

function fmtDate(utcStr: string, argTime?: string): string {
  if (!utcStr) return argTime ? `${argTime} hs` : 'A confirmar';
  const d = new Date(utcStr);
  return `${d.getDate()}/${d.getMonth() + 1}  ·  ${argTime || '--:--'} hs`;
}

// ─── MatchPill ─────────────────────────────────────────────────────────────────
function MatchPill({ match, accentColor }: { match: any; accentColor: string }) {
  const finished  = match.status === 'FINISHED';
  const live      = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const homeGoals = match.score?.fullTime?.home;
  const awayGoals = match.score?.fullTime?.away;
  const homeWon   = finished && homeGoals > awayGoals;
  const awayWon   = finished && awayGoals > homeGoals;

  return (
    <View style={pill.card}>
      <View style={pill.dateRow}>
        <Text style={pill.date}>{fmtDate(match.utcDate, match.argTime)}</Text>
        {live     && <View style={pill.liveBadge}><Text style={pill.liveTxt}>EN VIVO</Text></View>}
        {finished && <Text style={pill.finishedTxt}>FINAL</Text>}
      </View>
      {(['home', 'away'] as const).map(side => {
        const team    = side === 'home' ? match.homeTeam : match.awayTeam;
        const goals   = side === 'home' ? homeGoals : awayGoals;
        const isWon   = side === 'home' ? homeWon : awayWon;
        return (
          <View key={side} style={[pill.teamRow, side === 'away' && { marginBottom: 0 }]}>
            <View style={pill.teamLeft}>
              {team?.crest
                ? <Image source={{ uri: team.crest }} style={pill.crest} />
                : <View style={[pill.crest, { backgroundColor: BG.elevated }]} />}
              <Text style={[pill.teamName, isWon && { color: TEXT.primary, fontWeight: FONT_WEIGHT.black }]} numberOfLines={1}>
                {team?.shortName || team?.name || 'Por definir'}
              </Text>
            </View>
            <Text style={[pill.score, isWon && { color: accentColor }]}>
              {(finished || live) ? (goals ?? '-') : '–'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const pill = StyleSheet.create({
  card:        { backgroundColor: BG.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER.subtle, padding: SPACING['3'], marginBottom: SPACING['2.5'] },
  dateRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING['2'] },
  date:        { fontSize: FONT_SIZE.xs, color: TEXT.muted, fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.wide },
  finishedTxt: { fontSize: 9, color: STATUS.finished.color, fontWeight: FONT_WEIGHT.black, letterSpacing: 1 },
  liveBadge:   { backgroundColor: STATUS.live.bg, borderRadius: RADIUS.sm, paddingHorizontal: SPACING['1.5'], paddingVertical: 2 },
  liveTxt:     { fontSize: 9, color: STATUS.live.color, fontWeight: FONT_WEIGHT.black, letterSpacing: 1 },
  teamRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING['1.5'] },
  teamLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING['2'] },
  crest:       { width: 22, height: 16, borderRadius: 2 },
  teamName:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: TEXT.secondary, flex: 1 },
  score:       { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.black, color: BORDER.strong, minWidth: 18, textAlign: 'right' },
});

// ─── BracketView ──────────────────────────────────────────────────────────────
function BracketView() {
  const [bracketMatches, setBracketMatches] = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [activeStage, setActiveStage]       = useState<string>('');
  const { width } = useWindowDimensions();
  const isMobile  = width < 560;

  useEffect(() => {
    getDoc(doc(db, 'cache', 'worldCupMatches')).then(snap => {
      if (snap.exists()) {
        const all = snap.data().matches || [];
        const filtered = all
          .filter((m: any) => m.stage && m.stage !== 'GROUP_PHASE')
          .sort((a: any, b: any) =>
            (a.utcDate ? new Date(a.utcDate).getTime() : 1e15) -
            (b.utcDate ? new Date(b.utcDate).getTime() : 1e15)
          );
        setBracketMatches(filtered);
        const first = STAGES.find(s => filtered.some((m: any) => m.stage === s.id));
        if (first) setActiveStage(first.id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
      <ActivityIndicator size="large" color={RED} />
    </View>
  );

  const stagesWithMatches = STAGES.filter(s => bracketMatches.some(m => m.stage === s.id));

  if (stagesWithMatches.length === 0) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING['8'], gap: SPACING['3'] }}>
      <Trophy size={48} color={BORDER.strong} />
      <Text style={{ ...TYPE.screenTitle, color: TEXT.primary, textAlign: 'center' }}>Fase Eliminatoria</Text>
      <Text style={{ fontSize: FONT_SIZE.sm, color: TEXT.muted, textAlign: 'center', maxWidth: 300, lineHeight: 20 }}>
        El bracket oficial se habilitará cuando comience la fase de eliminación directa.
      </Text>
    </View>
  );

  const currentMatches = bracketMatches.filter(m => m.stage === activeStage);

  return (
    <FlatList
      data={currentMatches}
      keyExtractor={item => item.id.toString()}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 40, paddingTop: SPACING['1'] }}
      ListHeaderComponent={
        // ─── Stage pill bar — horizontal scroll, siempre visible ───
        <View style={{ marginBottom: SPACING['4'] }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              gap: SPACING['1.5'],
              paddingVertical: SPACING['1'],
            }}
          >
            {stagesWithMatches.map((stage, i) => {
              const isActive   = activeStage === stage.id;
              const color      = i === stagesWithMatches.length - 1 ? ACCENT.libertadores.primary : RED;
              return (
                <Pressable
                  key={stage.id}
                  onPress={() => setActiveStage(stage.id)}
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SPACING['1.5'],
                      paddingHorizontal: SPACING['3.5'],
                      paddingVertical: SPACING['2.5'],
                      borderRadius: RADIUS.lg,
                      borderWidth: 1.5,
                      borderColor: isActive ? color + '66' : BORDER.subtle,
                      backgroundColor: isActive ? color + '18' : BG.surface,
                    },
                    Platform.OS === 'web' ? { cursor: 'pointer' } as any : {},
                  ]}
                >
                  <stage.Icon size={13} color={isActive ? color : TEXT.muted} />
                  <Text style={{
                    fontSize: FONT_SIZE.sm,
                    fontWeight: FONT_WEIGHT.extrabold,
                    color: isActive ? color : TEXT.muted,
                    letterSpacing: LETTER_SPACING.wide,
                  }}>
                    {stage.shortLabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        <Text style={{ textAlign: 'center', color: TEXT.muted, marginTop: SPACING['8'], fontSize: FONT_SIZE.base }}>
          No hay partidos para esta ronda todavía.
        </Text>
      }
      renderItem={({ item }) => <MatchPill match={item} accentColor={RED} />}
    />
  );
}

// ─── GroupCard ────────────────────────────────────────────────────────────────
function GroupCard({ groupData, isMobile, onTeamPress }: {
  groupData: any; isMobile: boolean; onTeamPress: (team: any) => void;
}) {
  const table: any[] = groupData.table || [];

  return (
    <View style={gc.card}>
      <View style={gc.header}>
        <View style={gc.dot} />
        <Text style={gc.title}>
          {groupData.group?.replace('_', ' ').replace('Group ', 'GRUPO ') || 'GRUPO'}
        </Text>
        <Text style={gc.subtitle}>{table.length} equipos</Text>
      </View>

      <View style={gc.thead}>
        <Text style={[gc.th, { flex: 3, textAlign: 'left' }]}>Equipo</Text>
        <Text style={[gc.th, { color: TEXT.primary, fontWeight: FONT_WEIGHT.black }]}>Pts</Text>
        <Text style={gc.th}>PJ</Text>
        <Text style={gc.th}>PG</Text>
        <Text style={gc.th}>PE</Text>
        <Text style={gc.th}>PP</Text>
        <Text style={[gc.th, { color: RED }]}>DG</Text>
      </View>

      {table.map((row: any, index: number) => {
        const qualified = index < 2;
        const playOff   = index === 2;
        return (
          <TouchableOpacity
            key={row.team.id}
            style={[gc.row, { borderLeftColor: qualified ? GREEN : playOff ? BLUE : 'transparent', borderLeftWidth: 3 }]}
            onPress={() => onTeamPress(row.team)}
            activeOpacity={0.7}
          >
            <View style={[gc.cell, { flex: 3, flexDirection: 'row', alignItems: 'center', gap: SPACING['1.5'] }]}>
              <Text style={gc.pos}>{row.position}</Text>
              <Image source={{ uri: row.team.crest }} style={gc.crest} />
              <Text style={gc.teamName} numberOfLines={1}>
                {isMobile ? (row.team.shortName || row.team.name) : (row.team.name || row.team.shortName)}
              </Text>
              {qualified && <View style={gc.qualBadge}><Text style={gc.qualTxt}>Q</Text></View>}
            </View>
            <Text style={[gc.cell, { color: TEXT.primary, fontWeight: FONT_WEIGHT.black }]}>{row.points}</Text>
            <Text style={gc.cell}>{row.playedGames}</Text>
            <Text style={gc.cell}>{row.won}</Text>
            <Text style={gc.cell}>{row.draw}</Text>
            <Text style={gc.cell}>{row.lost}</Text>
            <Text style={[gc.cell, { color: row.goalDifference > 0 ? GREEN : row.goalDifference < 0 ? STATUS.finished.color : TEXT.muted }]}>
              {row.goalDifference > 0 ? '+' : ''}{row.goalDifference}
            </Text>
          </TouchableOpacity>
        );
      })}

      <View style={gc.legend}>
        <View style={gc.legendItem}><View style={[gc.legendDot, { backgroundColor: GREEN }]} /><Text style={gc.legendTxt}>Clasificado</Text></View>
        <View style={gc.legendItem}><View style={[gc.legendDot, { backgroundColor: BLUE }]} /><Text style={gc.legendTxt}>Play-off</Text></View>
      </View>
    </View>
  );
}

const gc = StyleSheet.create({
  card:        { backgroundColor: BG.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: BORDER.subtle, overflow: 'hidden', marginBottom: SPACING['3'] },
  header:      { backgroundColor: BG.elevated, paddingHorizontal: SPACING['3.5'], paddingVertical: SPACING['2.5'], flexDirection: 'row', alignItems: 'center', gap: SPACING['2'], borderBottomWidth: 1, borderBottomColor: BORDER.subtle },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  title:       { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.black, color: TEXT.primary, letterSpacing: LETTER_SPACING.wide, flex: 1 },
  subtitle:    { fontSize: FONT_SIZE.xs, color: TEXT.muted, fontWeight: FONT_WEIGHT.semibold },
  thead:       { flexDirection: 'row', paddingHorizontal: SPACING['3.5'], paddingVertical: SPACING['2'], backgroundColor: BG.nav },
  th:          { flex: 1, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.extrabold, color: TEXT.muted, textAlign: 'center', letterSpacing: LETTER_SPACING.wide },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING['3.5'], paddingVertical: SPACING['2.5'], borderTopWidth: 1, borderTopColor: BORDER.subtle },
  cell:        { flex: 1, fontSize: FONT_SIZE.sm, color: TEXT.muted, textAlign: 'center' },
  pos:         { fontSize: FONT_SIZE.xs, color: TEXT.muted, width: 14, fontWeight: FONT_WEIGHT.bold },
  crest:       { width: 22, height: 16, borderRadius: 2 },
  teamName:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: TEXT.secondary, flex: 1 },
  qualBadge:   { backgroundColor: GREEN + '22', borderRadius: RADIUS.sm, paddingHorizontal: 4, paddingVertical: 1 },
  qualTxt:     { fontSize: 8, fontWeight: FONT_WEIGHT.black, color: GREEN, letterSpacing: LETTER_SPACING.wide },
  legend:      { flexDirection: 'row', gap: SPACING['4'], paddingHorizontal: SPACING['3.5'], paddingVertical: SPACING['2'], borderTopWidth: 1, borderTopColor: BORDER.subtle, backgroundColor: BG.nav },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: SPACING['1.5'] },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendTxt:   { fontSize: FONT_SIZE.xs, color: TEXT.muted, fontWeight: FONT_WEIGHT.semibold },
});

// ─── TeamModal ─────────────────────────────────────────────────────────────────
function TeamModal({ team, matches, loading, onClose }: {
  team: any; matches: any[]; loading: boolean; onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 560;

  return (
    <Modal visible={!!team} animationType="fade" transparent onRequestClose={onClose}>
      <View style={tm.overlay}>
        <View style={[tm.sheet, isMobile && tm.sheetMobile]}>
          <View style={tm.header}>
            <View style={tm.titleRow}>
              {team?.crest && <Image source={{ uri: team.crest }} style={tm.flag} />}
              <Text style={tm.title} numberOfLines={1}>{team?.name}</Text>
            </View>
            <Pressable onPress={onClose} style={tm.closeBtn} hitSlop={8}>
              <X size={20} color={TEXT.primary} />
            </Pressable>
          </View>
          {loading ? (
            <View style={tm.centered}><ActivityIndicator size="large" color={RED} /></View>
          ) : (
            <ScrollView style={tm.scroll} showsVerticalScrollIndicator={false}>
              {matches.length === 0 ? (
                <Text style={tm.empty}>No hay partidos registrados.</Text>
              ) : matches.map(match => {
                const finished = match.status === 'FINISHED';
                const live     = match.status === 'IN_PLAY' || match.status === 'PAUSED';
                const hG = match.score?.fullTime?.home;
                const aG = match.score?.fullTime?.away;
                return (
                  <View key={match.id} style={tm.matchCard}>
                    <View style={tm.matchMeta}>
                      <Text style={tm.matchDate}>{fmtDate(match.utcDate, match.argTime)}</Text>
                      {finished && <Text style={tm.finLabel}>FINAL</Text>}
                      {live     && <Text style={tm.liveLabel}>EN VIVO</Text>}
                    </View>
                    {(['home', 'away'] as const).map(side => {
                      const t   = side === 'home' ? match.homeTeam : match.awayTeam;
                      const g   = side === 'home' ? hG : aG;
                      const won = finished && (side === 'home' ? hG > aG : aG > hG);
                      return (
                        <View key={side} style={tm.matchRow}>
                          {t?.crest && <Image source={{ uri: t.crest }} style={tm.mFlag} />}
                          <Text style={[tm.teamTxt, won && tm.winnerTxt]} numberOfLines={1}>
                            {t?.name || t?.shortName || '?'}
                          </Text>
                          <Text style={tm.scoreTxt}>{(finished || live) ? (g ?? '-') : '–'}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const tm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: SPACING['5'] },
  sheet:      { backgroundColor: BG.elevated, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: BORDER.default, width: '100%', maxWidth: 480, maxHeight: '82%' },
  sheetMobile:{ maxWidth: '100%', maxHeight: '90%' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING['4'], borderBottomWidth: 1, borderBottomColor: BORDER.subtle },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING['2.5'], flex: 1 },
  flag:       { width: 32, height: 22, borderRadius: 3 },
  title:      { ...TYPE.sectionTitle, color: TEXT.primary, flex: 1 },
  closeBtn:   { backgroundColor: BG.hover, borderRadius: RADIUS.md, padding: SPACING['1.5'] },
  centered:   { padding: SPACING['8'], justifyContent: 'center', alignItems: 'center' },
  scroll:     { maxHeight: 480, padding: SPACING['4'] },
  empty:      { textAlign: 'center', color: TEXT.muted, marginTop: SPACING['5'] },
  matchCard:  { backgroundColor: BG.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER.subtle, padding: SPACING['3'], marginBottom: SPACING['2.5'] },
  matchMeta:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING['2'] },
  matchDate:  { fontSize: FONT_SIZE.xs, color: TEXT.muted, fontWeight: FONT_WEIGHT.bold },
  finLabel:   { fontSize: 9, color: STATUS.finished.color, fontWeight: FONT_WEIGHT.black, letterSpacing: 1 },
  liveLabel:  { fontSize: 9, color: STATUS.live.color, fontWeight: FONT_WEIGHT.black, letterSpacing: 1 },
  matchRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING['2'], marginBottom: SPACING['1'] },
  mFlag:      { width: 20, height: 14, borderRadius: 2 },
  teamTxt:    { fontSize: FONT_SIZE.sm, color: TEXT.secondary, fontWeight: FONT_WEIGHT.semibold, flex: 1 },
  winnerTxt:  { color: TEXT.primary, fontWeight: FONT_WEIGHT.black },
  scoreTxt:   { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.black, color: TEXT.primary, minWidth: 20, textAlign: 'right' },
});

// ─── Main GroupsScreen ────────────────────────────────────────────────────────
export default function GroupsScreen() {
  const [standings, setStandings]           = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [activeTab, setActiveTab]           = useState<'grupos' | 'bracket'>('grupos');
  const [selectedTeam, setSelectedTeam]     = useState<any>(null);
  const [teamMatches, setTeamMatches]       = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile  = width < 560;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'standingsCache', 'worldCup'), snap => {
      if (snap.exists()) setStandings(snap.data().standings || []);
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const handleTeamPress = useCallback(async (team: any) => {
    setSelectedTeam(team);
    setLoadingMatches(true);
    try {
      const snap = await getDoc(doc(db, 'cache', 'worldCupMatches'));
      if (snap.exists()) {
        const all = snap.data().matches || [];
        setTeamMatches(all.filter((m: any) => m.homeTeam?.id === team.id || m.awayTeam?.id === team.id));
      }
    } catch (e) { console.error(e); }
    setLoadingMatches(false);
  }, []);

  return (
    <View style={gs.container}>

      {/* ─── Sub-tab bar ─── */}
      <View style={gs.tabBarWrap}>
        <View style={gs.tabBar}>
          {(['grupos', 'bracket'] as const).map(t => {
            const isActive = activeTab === t;
            const color    = t === 'bracket' ? ACCENT.libertadores.primary : GREEN;
            return (
              <Pressable
                key={t}
                style={[gs.tabBtn, isActive && { backgroundColor: color + '18', borderColor: color + '40' }]}
                onPress={() => setActiveTab(t)}
              >
                <Text style={[gs.tabTxt, isActive && { color }]}>
                  {t === 'grupos' ? 'GRUPOS' : 'BRACKET'}
                </Text>
                {isActive && <ChevronRight size={10} color={color} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── Content ─── */}
      {loading ? (
        <View style={gs.centered}>
          <ActivityIndicator size="large" color={RED} />
        </View>
      ) : activeTab === 'grupos' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[gs.groupsGrid, !isMobile && gs.groupsGrid2col]}
        >
          {standings.length > 0
            ? standings.map(g => (
              <View key={g.group} style={[gs.groupWrapper, !isMobile && { width: '48%' as any }]}>
                <GroupCard groupData={g} isMobile={isMobile} onTeamPress={handleTeamPress} />
              </View>
            ))
            : <Text style={gs.empty}>No hay información de grupos disponible.</Text>}
        </ScrollView>
      ) : (
        <BracketView />
      )}

      <TeamModal
        team={selectedTeam}
        matches={teamMatches}
        loading={loadingMatches}
        onClose={() => setSelectedTeam(null)}
      />
    </View>
  );
}

const gs = StyleSheet.create({
  container:     { flex: 1 },
  centered:      { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  empty:         { textAlign: 'center', color: TEXT.muted, marginTop: SPACING['8'], fontSize: FONT_SIZE.base },
  tabBarWrap:    { marginBottom: SPACING['4'] },
  tabBar:        { flexDirection: 'row', backgroundColor: BG.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: BORDER.subtle, padding: SPACING['1'], gap: SPACING['1'] },
  tabBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING['2'], paddingHorizontal: SPACING['2'], borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'transparent', gap: SPACING['1'], ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.15s ease' } as any : {}) },
  tabTxt:        { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.extrabold, color: TEXT.muted, letterSpacing: LETTER_SPACING.wide },
  groupsGrid:    { paddingBottom: 40, gap: SPACING['3'] },
  groupsGrid2col:{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  groupWrapper:  { width: '100%' },
});
