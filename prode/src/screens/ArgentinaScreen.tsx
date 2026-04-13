import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  Image, TextInput, TouchableOpacity, Pressable, Alert, Platform,
  useWindowDimensions, RefreshControl,
} from 'react-native';
import { Save, Flag, Trophy, Target, Zap, Plus, Minus, X, Users, Crosshair, BarChart2, Table2 } from 'lucide-react-native';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

import MatchCard from '../components/MatchCard';
import DaySelector from '../components/DaySelector';
import { MatchListSkeleton } from '../components/SkeletonLoader';
import TournamentScreenShell, { TournamentTab } from '../components/TournamentScreenShell';
import { BG, BORDER, TEXT, ACCENT, RANK, STATUS } from '../theme/colors';
import { TYPE, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS, MIN_TOUCH } from '../theme/spacing';

// ─── Constants ─────────────────────────────────────────────────────────────────
const ACCENT_COLOR = ACCENT.argentina.primary;
const HOURS_BEFORE_LOCK = 1;

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n${msg}`);
  } else { Alert.alert(title, msg); }
};

const isMatchLocked = (utcDate: string) => {
  if (!utcDate) return false;
  return Date.now() >= new Date(utcDate).getTime() - HOURS_BEFORE_LOCK * 3600000;
};

const RULES = [
  { icon: Target, color: STATUS.live.color,    bg: STATUS.live.bg,    border: STATUS.live.border,    label: 'Marcador exacto',    points: '6 pts', description: 'Acertás el resultado exacto del partido' },
  { icon: Zap,    color: STATUS.pending.color,  bg: STATUS.pending.bg, border: STATUS.pending.border, label: 'Resultado acertado', points: '3 pts', description: 'Acertás quién gana (o empate) pero no el marcador exacto' },
  { icon: X,      color: STATUS.finished.color, bg: STATUS.finished.bg,border: STATUS.finished.border,label: 'No acertó',          points: '0 pts', description: 'No acertaste ni el resultado ni el marcador' },
];

// ─── Tabs ──────────────────────────────────────────────────────────────────────
type ArgTab = 'partidos' | 'pronosticos' | 'posiciones' | 'tabla';
const TABS: TournamentTab<ArgTab>[] = [
  { key: 'partidos',    label: 'PARTIDOS',    Icon: Users     },
  { key: 'pronosticos', label: 'PRONÓSTICOS', Icon: Crosshair },
  { key: 'posiciones',  label: 'POSICIONES',  Icon: BarChart2 },
  { key: 'tabla',       label: 'TABLA',       Icon: Table2    },
];

// ─── Shared Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex1:           { flex: 1 },
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  empty:           { textAlign: 'center', color: TEXT.muted, marginTop: 40, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  card:            { backgroundColor: BG.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: BORDER.subtle, overflow: 'hidden', marginBottom: SPACING['2.5'] },
  cardHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING['3.5'], paddingVertical: SPACING['2.5'], borderBottomWidth: 1, borderBottomColor: BORDER.subtle, backgroundColor: BG.elevated },
  stage:           { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.extrabold, letterSpacing: LETTER_SPACING.wide, color: TEXT.muted, flex: 1 },
  time:            { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: TEXT.muted },
  teams:           { padding: SPACING['3.5'] },
  teamRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING['2.5'] },
  teamInfo:        { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING['2.5'] },
  crest:           { width: 26, height: 26, borderRadius: RADIUS.sm, backgroundColor: BG.elevated },
  teamName:        { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: TEXT.primary, flex: 1 },
  score:           { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.black, minWidth: 32, textAlign: 'center' },
  scoreVisible:    { color: TEXT.primary },
  scoreHidden:     { color: BORDER.default },
  cardFooter:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING['3'], borderTopWidth: 1, borderTopColor: BORDER.subtle, backgroundColor: BG.nav },
  badge:           { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.black, paddingHorizontal: SPACING['2.5'], paddingVertical: SPACING['1'], borderRadius: RADIUS.sm, letterSpacing: LETTER_SPACING.wide },
  detailsBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: BG.hover, paddingHorizontal: SPACING['3'], paddingVertical: SPACING['1.5'], borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER.default, gap: SPACING['1'] },
  detailsBtnTxt:   { color: TEXT.primary, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.black, letterSpacing: LETTER_SPACING.wide },
  input:           { backgroundColor: BG.root, color: TEXT.primary, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, width: 48, height: 44, textAlign: 'center', borderRadius: RADIUS.sm, borderWidth: 1, borderColor: BORDER.default, ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}) },
  inputLocked:     { borderColor: BORDER.subtle, color: TEXT.disabled, backgroundColor: BG.elevated },
  stepBtn:         { backgroundColor: BG.elevated, padding: SPACING['2'], borderRadius: RADIUS.sm, marginHorizontal: SPACING['1.5'], minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  saveSection:     { alignItems: 'center', marginBottom: SPACING['5'] },
  saveBtn:         { flexDirection: 'row', backgroundColor: ACCENT_COLOR, paddingHorizontal: SPACING['5'], paddingVertical: SPACING['3'], borderRadius: RADIUS.md, alignItems: 'center', gap: SPACING['1.5'], minHeight: MIN_TOUCH },
  saveTxt:         { color: '#000', fontWeight: FONT_WEIGHT.black, fontSize: FONT_SIZE.base },
  lockBanner:      { color: TEXT.muted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, marginTop: SPACING['2.5'], backgroundColor: BG.surface, paddingHorizontal: SPACING['3'], paddingVertical: SPACING['1.5'], borderRadius: RADIUS.full, borderWidth: 1, borderColor: BORDER.subtle, textAlign: 'center' },
  rulesSection:    { marginBottom: SPACING['4'] },
  rulesTitleRow:   { alignItems: 'center', justifyContent: 'center', marginBottom: SPACING['4'] },
  rulesTitle:      { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.black, color: TEXT.primary, letterSpacing: LETTER_SPACING.tight, textAlign: 'center' },
  rulesGrid:       { flexDirection: 'row', gap: SPACING['2'], marginBottom: SPACING['3'] },
  rulesGridMobile: { flexDirection: 'column' },
  ruleCard:        { flex: 1, borderRadius: RADIUS.md, padding: SPACING['3.5'], borderWidth: 1 },
  ruleIconRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING['2'] },
  rulePoints:      { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.black },
  ruleLabel:       { color: TEXT.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING['1'] },
  ruleDesc:        { color: TEXT.muted, fontSize: FONT_SIZE.xs, lineHeight: 16 },
  tableTitle:      { ...TYPE.sectionTitle, color: TEXT.primary },
  playersCount:    { color: TEXT.muted, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING['1'], marginBottom: SPACING['3'] },
  rankCard:        { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING['3.5'], paddingHorizontal: SPACING['4'], borderRadius: RADIUS.md, marginBottom: SPACING['2'], backgroundColor: BG.surface, borderWidth: 1, borderColor: BORDER.subtle },
  rankIdxBox:      { width: 34, alignItems: 'center' },
  rankNum:         { color: TEXT.muted, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.black },
  rankName:        { color: TEXT.secondary, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  rankNameMe:      { color: TEXT.primary, fontWeight: FONT_WEIGHT.black },
  rankPts:         { fontSize: FONT_SIZE['3xl'], fontWeight: FONT_WEIGHT.black },
  rankPtsLabel:    { color: TEXT.muted, fontSize: 9, fontWeight: FONT_WEIGHT.extrabold },
  tableHead:       { flexDirection: 'row', paddingHorizontal: SPACING['3'], paddingVertical: SPACING['2.5'], backgroundColor: BG.surface, borderRadius: RADIUS.md, marginBottom: SPACING['1'], borderWidth: 1, borderColor: BORDER.subtle },
  th:              { flex: 1, color: TEXT.muted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.extrabold, textAlign: 'center' },
  tableRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING['3'], paddingVertical: SPACING['2.5'], borderBottomWidth: 1, borderBottomColor: BG.elevated, backgroundColor: BG.surface },
  td:              { flex: 1, color: TEXT.muted, fontSize: FONT_SIZE.sm, textAlign: 'center' },
  tdTeam:          { color: TEXT.secondary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, flexShrink: 1 },
  // Zona tabs
  zoneTabs:        { flexDirection: 'row', backgroundColor: BG.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER.subtle, padding: SPACING['1'], gap: SPACING['1'], marginBottom: SPACING['3'] },
  zoneTab:         { flex: 1, paddingVertical: SPACING['2'], borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  zoneTabActive:   { backgroundColor: ACCENT.argentina.glow, borderColor: ACCENT.argentina.border },
  zoneTabTxt:      { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.extrabold, color: TEXT.muted, letterSpacing: LETTER_SPACING.wide, textAlign: 'center' },
  zoneTabTxtActive:{ color: ACCENT_COLOR },
});

// ─── ArgentinaMatches ─────────────────────────────────────────────────────────
function ArgentinaMatches() {
  const navigation = useNavigation<any>();
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [allMatches, setAllMatches]       = useState<any[]>([]);
  const [matches, setMatches]             = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'argentinaMatches'), snap => {
      if (snap.exists()) {
        const data = snap.data();
        const days: string[] = data.availableDays || [];
        setAvailableDays(days);
        setAllMatches(data.matches || []);
        const today = new Date(Date.now() - 3 * 3600000).toISOString().split('T')[0];
        const idx = days.findIndex(d => d >= today);
        setSelectedDayIndex(idx >= 0 ? idx : Math.max(0, days.length - 1));
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!availableDays.length) return;
    const day = availableDays[selectedDayIndex];
    if (!day) return;
    const f = [...allMatches.filter(m => m.argDay === day)];
    f.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    setMatches(f);
  }, [selectedDayIndex, availableDays, allMatches]);

  if (loading) return <MatchListSkeleton count={5} />;

  return (
    <View style={s.flex1}>
      {availableDays.length > 0 && (
        <DaySelector days={availableDays} selectedIndex={selectedDayIndex} onChange={setSelectedDayIndex} />
      )}
      <FlatList
        data={matches}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <MatchCard
            id={item.id}
            homeTeam={item.homeTeam}
            awayTeam={item.awayTeam}
            score={item.score}
            status={item.status}
            argTime={item.argTime}
            stage={item.stage}
            accentColor={ACCENT_COLOR}
            onPress={() => navigation.navigate('MatchDetail', { id: item.id })}
          />
        )}
        ListEmptyComponent={<Text style={s.empty}>No hay partidos para esta fecha.</Text>}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── ArgentinaPredictions ─────────────────────────────────────────────────────
function ArgentinaPredictions() {
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [allMatches, setAllMatches]       = useState<any[]>([]);
  const [matches, setMatches]             = useState<any[]>([]);
  const [predictions, setPredictions]     = useState<Record<string, { home: string; away: string }>>({});
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'argentinaMatches'), snap => {
      if (snap.exists()) {
        const data = snap.data();
        const days: string[] = data.availableDays || [];
        setAvailableDays(days);
        setAllMatches(data.matches || []);
        const today = new Date(Date.now() - 3 * 3600000).toISOString().split('T')[0];
        const idx = days.findIndex(d => d >= today);
        setSelectedDayIndex(idx >= 0 ? idx : Math.max(0, days.length - 1));
      }
      setLoading(false);
    });
    if (auth.currentUser) {
      getDoc(doc(db, 'argentinaPredictions', auth.currentUser.uid)).then(snap => {
        if (snap.exists()) setPredictions(snap.data().matches || {});
      });
    }
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!availableDays.length) return;
    const day = availableDays[selectedDayIndex];
    if (!day) return;
    const f = [...allMatches.filter(m => m.argDay === day)];
    f.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    setMatches(f);
  }, [selectedDayIndex, availableDays, allMatches]);

  const handleChange = (id: string, type: 'home' | 'away', val: string, date: string) => {
    if (isMatchLocked(date)) return;
    setPredictions(prev => ({ ...prev, [id]: { ...prev[id], [type]: val.replace(/[^0-9]/g, '') } }));
  };

  const handleStepper = (id: string, type: 'home' | 'away', delta: number, utcDate: string, cur: string) => {
    if (isMatchLocked(utcDate)) return;
    let n = parseInt(cur || '0'); if (isNaN(n)) n = 0;
    handleChange(id, type, Math.max(0, Math.min(99, n + delta)).toString(), utcDate);
  };

  const handleSave = async () => {
    if (!auth.currentUser) { showAlert('Error', 'No estás autenticado.'); return; }
    setSaving(true);
    try {
      const san: Record<string, { home: string; away: string }> = {};
      for (const [k, p] of Object.entries(predictions)) {
        let h = p.home, a = p.away;
        if (h !== '' && a === '') a = '0';
        if (a !== '' && h === '') h = '0';
        san[k] = { home: h || '', away: a || '' };
      }
      setPredictions(san);
      await setDoc(doc(db, 'argentinaPredictions', auth.currentUser.uid),
        { userId: auth.currentUser.uid, updatedAt: new Date().toISOString(), matches: san }, { merge: true });
      showAlert('✓', 'Pronósticos guardados.');
    } catch (e: any) { showAlert('Error', e.message); }
    finally { setSaving(false); }
  };

  const renderItem = ({ item }: { item: any }) => {
    const id = item.id.toString();
    const pred = predictions[id] || { home: '', away: '' };
    const finished = item.status === 'FINISHED';
    const locked = isMatchLocked(item.utcDate || '');

    return (
      <View style={[s.card, locked && { opacity: 0.7 }]}>
        <View style={s.cardHeader}>
          <Text style={s.stage}>{item.stage?.replace(/_/g, ' ') || 'FECHA'}</Text>
          {finished
            ? <Text style={{ color: TEXT.secondary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.extrabold }}>
                Final: {item.score?.fullTime?.home} - {item.score?.fullTime?.away}
              </Text>
            : locked
            ? <Text style={{ color: STATUS.locked.color, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.black }}>🔒 BLOQUEADO</Text>
            : <Text style={s.time}>{item.argTime} hs</Text>}
        </View>
        <View style={s.teams}>
          {(['home', 'away'] as const).map(side => {
            const team = side === 'home' ? item.homeTeam : item.awayTeam;
            return (
              <View key={side} style={s.teamRow}>
                <View style={s.teamInfo}>
                  {team?.crest && <Image source={{ uri: team.crest }} style={s.crest} />}
                  <Text style={s.teamName} numberOfLines={1}>{team?.shortName || team?.name || '---'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {!locked && <TouchableOpacity style={s.stepBtn} onPress={() => handleStepper(id, side, -1, item.utcDate, pred[side])}><Minus size={12} color={TEXT.primary} /></TouchableOpacity>}
                  <TextInput style={[s.input, locked && s.inputLocked]} keyboardType="number-pad" maxLength={2}
                    value={pred[side]} onChangeText={v => handleChange(id, side, v, item.utcDate)}
                    editable={!locked} placeholder="0" placeholderTextColor={BORDER.strong} />
                  {!locked && <TouchableOpacity style={s.stepBtn} onPress={() => handleStepper(id, side, 1, item.utcDate, pred[side])}><Plus size={12} color={TEXT.primary} /></TouchableOpacity>}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  if (loading) return <MatchListSkeleton count={4} />;

  return (
    <FlatList
      data={matches}
      keyExtractor={i => i.id.toString()}
      renderItem={renderItem}
      ListHeaderComponent={
        <>
          <View style={s.saveSection}>
            <Pressable style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#000" /> : <><Save size={16} color="#000" /><Text style={s.saveTxt}>Guardar Pronósticos</Text></>}
            </Pressable>
            <Text style={s.lockBanner}>🔒 Los pronósticos se bloquean 1 hora antes de cada partido.</Text>
          </View>
          {availableDays.length > 0 && <DaySelector days={availableDays} selectedIndex={selectedDayIndex} onChange={setSelectedDayIndex} />}
        </>
      }
      ListEmptyComponent={<Text style={s.empty}>No hay partidos para esta fecha.</Text>}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── ArgentinaLeaderboard ─────────────────────────────────────────────────────
function ArgentinaLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'cache', 'leaderboard'));
      if (snap.exists()) {
        const sorted = [...(snap.data().users || [])].sort((a, b) => (b.argentinaPoints || 0) - (a.argentinaPoints || 0));
        setLeaderboard(sorted);
      } else { setLeaderboard([]); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={ACCENT_COLOR} /></View>;

  return (
    <FlatList
      data={leaderboard}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={ACCENT_COLOR} colors={[ACCENT_COLOR]} />}
      ListHeaderComponent={
        <View style={s.rulesSection}>
          <View style={s.rulesTitleRow}><Text style={s.rulesTitle}>Reglas de Puntuación</Text></View>
          <View style={[s.rulesGrid, isMobile && s.rulesGridMobile]}>
            {RULES.map((rule, i) => {
              const Icon = rule.icon;
              return (
                <View key={i} style={[s.ruleCard, { backgroundColor: rule.bg, borderColor: rule.border }]}>
                  <View style={s.ruleIconRow}><Icon size={16} color={rule.color} /><Text style={[s.rulePoints, { color: rule.color }]}>{rule.points}</Text></View>
                  <Text style={s.ruleLabel}>{rule.label}</Text>
                  <Text style={s.ruleDesc}>{rule.description}</Text>
                </View>
              );
            })}
          </View>
          <Text style={s.tableTitle}>Tabla de Posiciones</Text>
          <Text style={s.playersCount}>{leaderboard.length} jugadores registrados</Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const isMe = auth.currentUser?.uid === item.id;
        return (
          <View style={[
            s.rankCard,
            index === 0 && { borderColor: RANK.gold.border, backgroundColor: RANK.gold.bg },
            index === 1 && { borderColor: RANK.silver.border, backgroundColor: RANK.silver.bg },
            index === 2 && { borderColor: RANK.bronze.border, backgroundColor: RANK.bronze.bg },
            isMe && { borderColor: RANK.me.border, backgroundColor: RANK.me.bg },
          ]}>
            <View style={s.rankIdxBox}>
              {index === 0 ? <Text style={{ fontSize: 22 }}>🏆</Text>
                : index === 1 ? <Trophy size={18} color={RANK.silver.border} />
                  : index === 2 ? <Trophy size={18} color={RANK.bronze.border} />
                    : <Text style={s.rankNum}>{index + 1}</Text>}
            </View>
            <View style={{ flex: 1, marginHorizontal: SPACING['4'] }}>
              <Text style={[s.rankName, isMe && s.rankNameMe]} numberOfLines={1}>
                {item.name || 'Jugador'}{isMe ? ' ✦' : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.rankPts, { color: ACCENT_COLOR }]}>{item.argentinaPoints || 0}</Text>
              <Text style={s.rankPtsLabel}>PUNTOS</Text>
            </View>
          </View>
        );
      }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── ArgentinaTable ───────────────────────────────────────────────────────────
function ArgentinaTable() {
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeZone, setActiveZone] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'standingsCache', 'argentina'));
      if (snap.exists()) setStandings(snap.data().standings || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={ACCENT_COLOR} /></View>;
  if (!standings.length) return <View style={s.centered}><Text style={s.empty}>No hay datos disponibles.</Text></View>;

  const currentZone = standings[activeZone] || standings[0];
  const tableData   = currentZone?.table || [];
  const isZona      = currentZone?.type === 'ZONA';

  const getRowStyle = (index: number, total: number) => {
    if (isZona) {
      if (index < 8) return { borderLeftWidth: 3, borderLeftColor: ACCENT.brasileirao.primary, backgroundColor: ACCENT.brasileirao.glow };
    } else {
      if (index === 0)                       return { borderLeftWidth: 3, borderLeftColor: ACCENT.brasileirao.primary, backgroundColor: ACCENT.brasileirao.glow };
      if (index === 1 || index === 2)        return { borderLeftWidth: 3, borderLeftColor: STATUS.pending.color, backgroundColor: STATUS.pending.bg };
      if (index >= 3 && index <= 8)          return { borderLeftWidth: 3, borderLeftColor: ACCENT_COLOR, backgroundColor: ACCENT.argentina.glow };
      if (index === total - 1)               return { borderLeftWidth: 3, borderLeftColor: STATUS.finished.color, backgroundColor: STATUS.finished.bg };
    }
    return {};
  };

  return (
    <View style={s.flex1}>
      {/* Zona selector */}
      <View style={s.zoneTabs}>
        {standings.map((z, i) => (
          <Pressable
            key={i}
            style={({ pressed }) => [s.zoneTab, activeZone === i && s.zoneTabActive, pressed && { opacity: 0.8 }]}
            onPress={() => setActiveZone(i)}
          >
            <Text style={[s.zoneTabTxt, activeZone === i && s.zoneTabTxtActive]}>
              {z.group || `ZONA ${i === 0 ? 'A' : i === 1 ? 'B' : 'ANUAL'}`}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={tableData}
        keyExtractor={(item, i) => item.team?.id?.toString() || i.toString()}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={ACCENT_COLOR} colors={[ACCENT_COLOR]} />}
        ListHeaderComponent={
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 3, textAlign: 'left' }]}>Equipo</Text>
            <Text style={[s.th, { color: TEXT.primary, fontWeight: FONT_WEIGHT.black }]}>Pts</Text>
            <Text style={s.th}>PJ</Text><Text style={s.th}>PG</Text><Text style={s.th}>PE</Text><Text style={s.th}>PP</Text>
            <Text style={s.th}>GF</Text><Text style={s.th}>GC</Text>
            <Text style={[s.th, { color: ACCENT_COLOR }]}>DG</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={[s.tableRow, getRowStyle(index, tableData.length)]}>
            <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: TEXT.muted, fontSize: FONT_SIZE.xs, width: 20, fontWeight: FONT_WEIGHT.bold }}>{item.position}</Text>
              {item.team?.crest && <Image source={{ uri: item.team.crest }} style={{ width: 18, height: 18, marginRight: SPACING['1.5'], borderRadius: 2 }} />}
              <Text style={s.tdTeam} numberOfLines={1}>{item.team?.name || '---'}</Text>
            </View>
            <Text style={[s.td, { color: TEXT.primary, fontWeight: FONT_WEIGHT.black, fontSize: FONT_SIZE.sm }]}>{item.points}</Text>
            <Text style={s.td}>{item.playedGames}</Text><Text style={s.td}>{item.won}</Text>
            <Text style={s.td}>{item.draw}</Text><Text style={s.td}>{item.lost}</Text>
            <Text style={s.td}>{item.goalsFor ?? '-'}</Text><Text style={s.td}>{item.goalsAgainst ?? '-'}</Text>
            <Text style={[s.td, { color: (item.goalDifference ?? 0) > 0 ? ACCENT.brasileirao.primary : (item.goalDifference ?? 0) < 0 ? STATUS.finished.color : TEXT.muted }]}>
              {(item.goalDifference ?? 0) > 0 ? '+' : ''}{item.goalDifference ?? 0}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ArgentinaScreen() {
  const [tab, setTab] = useState<ArgTab>('partidos');

  return (
    <TournamentScreenShell
      title="LIGA ARGENTINA"
      accentColor={ACCENT_COLOR}
      HeaderIcon={Flag}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'partidos'    && <ArgentinaMatches />}
      {tab === 'pronosticos' && <ArgentinaPredictions />}
      {tab === 'posiciones'  && <ArgentinaLeaderboard />}
      {tab === 'tabla'       && <ArgentinaTable />}
    </TournamentScreenShell>
  );
}
