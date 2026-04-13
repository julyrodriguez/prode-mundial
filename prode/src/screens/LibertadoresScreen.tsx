import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView,
  Image, TextInput, TouchableOpacity, Pressable, Alert, Platform,
  useWindowDimensions, RefreshControl, Modal, Linking,
} from 'react-native';
import { Save, Star, Trophy, Target, Zap, Plus, Minus, X, Users, Crosshair, BarChart2, Grid } from 'lucide-react-native';
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
const ACCENT_COLOR = ACCENT.libertadores.primary;
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
type LibTab = 'partidos' | 'pronosticos' | 'posiciones' | 'tabla';
const TABS: TournamentTab<LibTab>[] = [
  { key: 'partidos',    label: 'PARTIDOS',    Icon: Users     },
  { key: 'pronosticos', label: 'PRONÓSTICOS', Icon: Crosshair },
  { key: 'posiciones',  label: 'POSICIONES',  Icon: BarChart2 },
  { key: 'tabla',       label: 'GRUPOS',      Icon: Grid      },
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
  // Group table
  groupCard:       { backgroundColor: BG.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: BORDER.subtle, overflow: 'hidden', marginBottom: SPACING['4'] },
  groupHeader:     { backgroundColor: BG.elevated, paddingVertical: SPACING['2.5'], paddingHorizontal: SPACING['3.5'], borderBottomWidth: 1, borderBottomColor: BORDER.subtle, flexDirection: 'row', alignItems: 'center', gap: SPACING['2'] },
  groupTitle:      { color: TEXT.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.black, letterSpacing: LETTER_SPACING.wide },
  tableHead:       { flexDirection: 'row', paddingHorizontal: SPACING['3'], paddingVertical: SPACING['2'], backgroundColor: BG.nav },
  th:              { flex: 1, color: TEXT.muted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.extrabold, textAlign: 'center' },
  tableRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING['3'], paddingVertical: SPACING['2'], borderTopWidth: 1, borderTopColor: BORDER.subtle },
  td:              { flex: 1, color: TEXT.muted, fontSize: FONT_SIZE.sm, textAlign: 'center' },
  tdTeam:          { color: TEXT.secondary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, flexShrink: 1 },
});

// ─── LibertadoresMatches ──────────────────────────────────────────────────────
function LibertadoresMatches() {
  const navigation = useNavigation<any>();
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [allMatches, setAllMatches]       = useState<any[]>([]);
  const [matches, setMatches]             = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'libertadoresMatches'), snap => {
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
            onPress={() => navigation.navigate('MatchDetail', { id: item.id, predictionCollection: 'libertadoresPredictions' })}
          />
        )}
        ListEmptyComponent={<Text style={s.empty}>No hay partidos para esta fecha.</Text>}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── LibertadoresPredictions ──────────────────────────────────────────────────
function LibertadoresPredictions() {
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [allMatches, setAllMatches]       = useState<any[]>([]);
  const [matches, setMatches]             = useState<any[]>([]);
  const [predictions, setPredictions]     = useState<Record<string, { home: string; away: string }>>({});
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'libertadoresMatches'), snap => {
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
      getDoc(doc(db, 'libertadoresPredictions', auth.currentUser.uid)).then(snap => {
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
      await setDoc(doc(db, 'libertadoresPredictions', auth.currentUser.uid),
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
          <Text style={s.stage}>{item.stage?.replace(/_/g, ' ') || 'FASE'}</Text>
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

// ─── LibertadoresLeaderboard ──────────────────────────────────────────────────
function LibertadoresLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'cache', 'leaderboard'));
      if (snap.exists()) {
        const sorted = [...(snap.data().users || [])].sort((a, b) => (b.libertadoresPoints || 0) - (a.libertadoresPoints || 0));
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
              <Text style={[s.rankName, isMe && s.rankNameMe]} numberOfLines={1}>{item.name || 'Jugador'}{isMe ? ' ✦' : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.rankPts, { color: ACCENT_COLOR }]}>{item.libertadoresPoints || 0}</Text>
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

// ─── LibertadoresTable ────────────────────────────────────────────────────────
function LibertadoresTable() {
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminJson, setAdminJson]   = useState('');
  const isAdmin = auth.currentUser?.uid === 'vNEg4qrr9vQFDYeLt7tFJQ2GXl13';
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'standingsCache', 'libertadores'));
      if (snap.exists()) setStandings(snap.data().standings || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAdminSync = async () => {
    if (!adminJson) { showAlert('Error', 'Por favor, pega el JSON primero.'); return; }
    try {
      const parsed = JSON.parse(adminJson);
      setSyncLoading(true);
      const resp = await fetch(`/api/cron-all?libTableUpdate=true&serverSecret=${process.env.EXPO_PUBLIC_CRON_SECRET}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.currentUser?.uid, sofaJson: parsed, serverSecret: process.env.EXPO_PUBLIC_CRON_SECRET })
      });
      const resData = await resp.json();
      if (resData.status === 'OK') {
        showAlert('✓', 'Tabla actualizada con éxito.');
        setAdminJson(''); setShowAdminModal(false); load();
      } else { showAlert('Error', resData.error || 'Falló la actualización.'); }
    } catch { showAlert('Error JSON', 'El formato del JSON es inválido o hubo un error de red.'); }
    finally { setSyncLoading(false); }
  };

  useEffect(() => { load(); }, []);
  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={ACCENT_COLOR} /></View>;

  const renderGroupCard = (groupData: any, gIdx: number) => (
    <View key={gIdx} style={[s.groupCard, { width: isMobile ? '100%' : '48%' as any }]}>
      <View style={s.groupHeader}>
        <Star size={12} color={ACCENT_COLOR} />
        <Text style={s.groupTitle}>{groupData.group?.replace('Group ', 'GRUPO ') || `GRUPO ${gIdx + 1}`}</Text>
      </View>

      <View style={s.tableHead}>
        <Text style={[s.th, { flex: 2, textAlign: 'left' }]}>Equipo</Text>
        <Text style={[s.th, { color: ACCENT_COLOR, fontWeight: FONT_WEIGHT.black }]}>Pts</Text>
        <Text style={s.th}>PJ</Text><Text style={s.th}>DG</Text>
      </View>

      {groupData.table?.map((row: any, index: number) => {
        const rowStyle = index < 2
          ? { borderLeftWidth: 3, borderLeftColor: ACCENT.brasileirao.primary, backgroundColor: ACCENT.brasileirao.glow }
          : index === 2
          ? { borderLeftWidth: 3, borderLeftColor: ACCENT_COLOR, backgroundColor: ACCENT.libertadores.glow }
          : {};

        return (
          <View key={index} style={[s.tableRow, rowStyle]}>
            <View style={[s.td, { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' } as any]}>
              <Text style={{ color: TEXT.muted, fontSize: FONT_SIZE.xs, width: 16, fontWeight: FONT_WEIGHT.bold }}>{row.position}</Text>
              {row.team?.crest && <Image source={{ uri: row.team.crest }} style={{ width: 18, height: 14, marginRight: SPACING['1.5'], borderRadius: 2 }} />}
              <Text style={s.tdTeam} numberOfLines={1}>{row.team?.shortName || row.team?.name}</Text>
            </View>
            <Text style={[s.td, { color: index < 2 ? ACCENT.brasileirao.primary : TEXT.primary, fontWeight: FONT_WEIGHT.black }]}>{row.points}</Text>
            <Text style={s.td}>{row.playedGames}</Text>
            <Text style={s.td}>{row.goalDifference ?? (row.goalsFor - row.goalsAgainst)}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Admin btn */}
      {isAdmin && (
        <>
          <Pressable
            style={({ pressed }) => [{ backgroundColor: ACCENT_COLOR, padding: SPACING['2.5'], borderRadius: RADIUS.md, marginBottom: SPACING['3'], alignItems: 'center' as const, flexDirection: 'row' as const, justifyContent: 'center' as const }, pressed && { opacity: 0.8 }]}
            onPress={() => setShowAdminModal(true)}
          >
            <Text style={{ color: '#000', fontWeight: FONT_WEIGHT.black, fontSize: FONT_SIZE.sm }}>⚙️  SINCRO ADMIN</Text>
          </Pressable>

          <Modal visible={showAdminModal} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', padding: SPACING['5'] }}>
              <View style={{ backgroundColor: BG.elevated, borderRadius: RADIUS.xl, padding: SPACING['5'], borderWidth: 1, borderColor: BORDER.default }}>
                <Text style={{ color: TEXT.primary, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.black, marginBottom: SPACING['1.5'] }}>Panel de Sincronización Libertadores</Text>
                <Pressable
                  style={{ backgroundColor: BG.surface, padding: SPACING['3'], borderRadius: RADIUS.md, marginBottom: SPACING['4'], borderStyle: 'dashed', borderWidth: 1, borderColor: BORDER.strong, alignItems: 'center' }}
                  onPress={() => Linking.openURL('https://api.sofascore.com/api/v1/unique-tournament/384/season/87760/standings/total')}
                >
                  <Text style={{ color: ACCENT_COLOR, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.black }}>🔗 ABRIR FUENTE JSON (SOFASCORE API)</Text>
                </Pressable>
                <Text style={{ color: TEXT.muted, fontSize: FONT_SIZE.sm, marginBottom: SPACING['4'] }}>Copiá todo el JSON de esa página y pegalo debajo:</Text>
                <TextInput
                  style={{ backgroundColor: BG.root, color: ACCENT.brasileirao.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: FONT_SIZE.xs, height: 260, padding: SPACING['2.5'], borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER.default, textAlignVertical: 'top' }}
                  multiline placeholder="Pega el JSON aquí..." placeholderTextColor={BORDER.strong}
                  value={adminJson} onChangeText={setAdminJson}
                />
                <View style={{ flexDirection: 'row', gap: SPACING['2.5'], marginTop: SPACING['5'] }}>
                  <Pressable style={{ flex: 1, backgroundColor: BG.surface, padding: SPACING['3'], borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: BORDER.default }} onPress={() => { setShowAdminModal(false); setAdminJson(''); }}>
                    <Text style={{ color: TEXT.primary, fontWeight: FONT_WEIGHT.bold }}>CERRAR</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [{ flex: 2, backgroundColor: ACCENT_COLOR, padding: SPACING['3'], borderRadius: RADIUS.md, alignItems: 'center' }, pressed && { opacity: 0.8 }]} onPress={handleAdminSync} disabled={syncLoading}>
                    {syncLoading ? <ActivityIndicator size="small" color="#000" /> : <Text style={{ color: '#000', fontWeight: FONT_WEIGHT.black }}>PROCESAR TABLA 🚀</Text>}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}

      {!standings.length ? (
        <View style={s.centered}><Text style={s.empty}>No hay datos disponibles.</Text></View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING['3'], justifyContent: 'space-between' }}>
          {standings.map((g: any, i: number) => renderGroupCard(g, i))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LibertadoresScreen() {
  const [tab, setTab] = useState<LibTab>('partidos');

  return (
    <TournamentScreenShell
      title="LIBERTADORES"
      accentColor={ACCENT_COLOR}
      HeaderIcon={Star}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'partidos'    && <LibertadoresMatches />}
      {tab === 'pronosticos' && <LibertadoresPredictions />}
      {tab === 'posiciones'  && <LibertadoresLeaderboard />}
      {tab === 'tabla'       && <LibertadoresTable />}
    </TournamentScreenShell>
  );
}
