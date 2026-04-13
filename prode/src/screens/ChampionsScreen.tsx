import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  Image, TextInput, TouchableOpacity, Pressable, Alert, Platform,
  useWindowDimensions, RefreshControl,
} from 'react-native';
import { Save, Trophy, Zap, Target, X, Plus, Minus, Users, Crosshair, BarChart2 } from 'lucide-react-native';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

import MatchCard from '../components/MatchCard';
import DaySelector from '../components/DaySelector';
import { MatchListSkeleton } from '../components/SkeletonLoader';
import { BG, BORDER, TEXT, ACCENT, STATUS, RANK } from '../theme/colors';
import { TYPE, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS, MIN_TOUCH } from '../theme/spacing';

// ─── Constants ─────────────────────────────────────────────────────────────────
const ACCENT_COLOR = ACCENT.champions.primary;
const HOURS_BEFORE_LOCK = 1;

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const isMatchLocked = (utcDate: string) => {
  if (!utcDate) return false;
  const matchTime = new Date(utcDate).getTime();
  return Date.now() >= matchTime - HOURS_BEFORE_LOCK * 60 * 60 * 1000;
};

const RULES = [
  { icon: Target, color: STATUS.live.color,    bg: STATUS.live.bg,    border: STATUS.live.border,    label: 'Marcador exacto',    points: '6 pts', description: 'Acertás el resultado exacto del partido' },
  { icon: Zap,    color: STATUS.pending.color,  bg: STATUS.pending.bg, border: STATUS.pending.border, label: 'Resultado acertado', points: '3 pts', description: 'Acertás quién gana (o empate) pero no el marcador exacto' },
  { icon: X,      color: STATUS.finished.color, bg: STATUS.finished.bg,border: STATUS.finished.border,label: 'No acertó',          points: '0 pts', description: 'No acertaste ni el resultado ni el marcador' },
];

// ─── Tab config ─────────────────────────────────────────────────────────────────
const SCREEN_TABS = [
  { key: 'partidos'   as const, label: 'PARTIDOS',    Icon: Users     },
  { key: 'prediccion' as const, label: 'PRONÓSTICOS', Icon: Crosshair },
  { key: 'posiciones' as const, label: 'POSICIONES',  Icon: BarChart2 },
];

// ─── ChampionsMatches ─────────────────────────────────────────────────────────
function ChampionsMatches() {
  const navigation = useNavigation<any>();
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [allMatches, setAllMatches]       = useState<any[]>([]);
  const [matches, setMatches]             = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'championsMatches'), snap => {
      if (snap.exists()) {
        const data = snap.data();
        const days: string[] = data.availableDays || [];
        setAvailableDays(days);
        setAllMatches(data.matches || []);
        const today = new Date(Date.now() - 3 * 3600000).toISOString().split('T')[0];
        const idx = days.findIndex(d => d >= today);
        setSelectedDayIndex(idx >= 0 ? idx : 0);
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
    <View style={{ flex: 1 }}>
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
        ListEmptyComponent={
          <Text style={s.empty}>No hay partidos para esta fecha.</Text>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── ChampionsPredictions ─────────────────────────────────────────────────────
function ChampionsPredictions() {
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [allMatches, setAllMatches]       = useState<any[]>([]);
  const [matches, setMatches]             = useState<any[]>([]);
  const [predictions, setPredictions]     = useState<Record<string, { home: string; away: string }>>({});
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'championsMatches'), snap => {
      if (snap.exists()) {
        const data = snap.data();
        const days: string[] = data.availableDays || [];
        setAvailableDays(days);
        setAllMatches(data.matches || []);
        const today = new Date(Date.now() - 3 * 3600000).toISOString().split('T')[0];
        const idx = days.findIndex(d => d >= today);
        setSelectedDayIndex(idx >= 0 ? idx : 0);
      }
      setLoading(false);
    });
    if (auth.currentUser) {
      getDoc(doc(db, 'testPredictions', auth.currentUser.uid)).then(snap => {
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

  const handleStepper = (matchId: string, type: 'home' | 'away', delta: number, utcDate: string, currentVal: string) => {
    if (isMatchLocked(utcDate)) return;
    let num = parseInt(currentVal || '0', 10);
    if (isNaN(num)) num = 0;
    num = Math.max(0, Math.min(99, num + delta));
    handleChange(matchId, type, num.toString(), utcDate);
  };

  const handleSave = async () => {
    if (!auth.currentUser) { showAlert('Error', 'No estás autenticado.'); return; }
    setSaving(true);
    try {
      const sanitized: Record<string, { home: string; away: string }> = {};
      for (const [key, pred] of Object.entries(predictions)) {
        let h = pred.home, a = pred.away;
        if (h !== '' && a === '') a = '0';
        if (a !== '' && h === '') h = '0';
        sanitized[key] = { home: h || '', away: a || '' };
      }
      setPredictions(sanitized);
      await setDoc(
        doc(db, 'testPredictions', auth.currentUser.uid),
        { userId: auth.currentUser.uid, updatedAt: new Date().toISOString(), matches: sanitized },
        { merge: true }
      );
      showAlert('Éxito', 'Pronósticos de prueba guardados.');
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const renderMatch = ({ item }: { item: any }) => {
    const id    = item.id.toString();
    const pred  = predictions[id] || { home: '', away: '' };
    const finished = item.status === 'FINISHED';
    const locked   = isMatchLocked(item.utcDate || '');

    return (
      <View style={[s.card, locked && { opacity: 0.6 }]}>
        <View style={s.cardHeader}>
          <Text style={s.stageText}>{item.stage?.replace(/_/g, ' ') || 'PARTIDO'}</Text>
          {finished
            ? <Text style={s.finalLabel}>Final: {item.score?.fullTime?.home} - {item.score?.fullTime?.away}</Text>
            : locked
            ? <Text style={{ color: STATUS.locked.color, fontSize: 11, fontWeight: '800' }}>🔒 BLOQUEADO</Text>
            : <Text style={s.dateText}>{item.argTime} hs</Text>}
        </View>
        <View style={s.teamsContainer}>
          {(['home', 'away'] as const).map(side => {
            const team = side === 'home' ? item.homeTeam : item.awayTeam;
            return (
              <View key={side} style={s.teamRow}>
                <View style={s.teamInfo}>
                  {team?.crest && <Image source={{ uri: team.crest }} style={s.crest} />}
                  <Text style={s.teamName} numberOfLines={1}>{team?.shortName || team?.name || '---'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {!locked && (
                    <TouchableOpacity style={s.stepperBtn} onPress={() => handleStepper(id, side, -1, item.utcDate, pred[side])}>
                      <Minus size={14} color={TEXT.primary} />
                    </TouchableOpacity>
                  )}
                  <TextInput
                    style={[s.input, locked && s.inputDisabled]}
                    keyboardType="number-pad" maxLength={2}
                    value={pred[side]}
                    onChangeText={v => handleChange(id, side, v, item.utcDate)}
                    editable={!locked}
                    placeholder="0"
                    placeholderTextColor={BORDER.strong}
                  />
                  {!locked && (
                    <TouchableOpacity style={s.stepperBtn} onPress={() => handleStepper(id, side, 1, item.utcDate, pred[side])}>
                      <Plus size={14} color={TEXT.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ⚡ FIX: if loading, return skeleton; otherwise pure FlatList with
  //    ListHeaderComponent (no local component-inside-render anti-pattern
  //    that caused blank screen on tab switch).
  if (loading) return <MatchListSkeleton count={4} />;

  return (
    <FlatList
      data={matches}
      keyExtractor={item => item.id.toString()}
      renderItem={renderMatch}
      ListHeaderComponent={
        <>
          <View style={{ alignItems: 'center', marginBottom: SPACING['5'] }}>
            <Pressable
              style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={BG.root} />
                : <><Save size={16} color={BG.root} /><Text style={s.saveTxt}>Guardar Pronósticos</Text></>}
            </Pressable>
            <Text style={s.lockInfoBanner}>
              🔒 Los pronósticos se bloquean 1 hora antes del inicio de cada partido.
            </Text>
          </View>
          {availableDays.length > 0 && (
            <DaySelector days={availableDays} selectedIndex={selectedDayIndex} onChange={setSelectedDayIndex} />
          )}
        </>
      }
      ListEmptyComponent={
        <Text style={s.empty}>No hay partidos para pronosticar en esta fecha.</Text>
      }
      contentContainerStyle={{ paddingBottom: 40, gap: 12 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── ChampionsLeaderboard ─────────────────────────────────────────────────────
function ChampionsLeaderboard() {
  const [users, setUsers]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const loadData = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'cache', 'leaderboard'));
      if (snap.exists()) {
        const sorted = [...(snap.data().users || [])].sort(
          (a, b) => (b.championsPoints || 0) - (a.championsPoints || 0)
        );
        setUsers(sorted);
      } else {
        setUsers([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={ACCENT_COLOR} /></View>;

  return (
    <FlatList
      data={users}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={ACCENT_COLOR} colors={[ACCENT_COLOR]} />}
      ListHeaderComponent={
        <View style={s.rulesSection}>
          <View style={s.rulesTitleRow}>
            <Text style={[s.rulesTitle, isMobile && s.rulesTitleMobile]}>Reglas de Puntuación</Text>
          </View>
          <View style={[s.rulesGrid, isMobile && s.rulesGridMobile]}>
            {RULES.map((rule, i) => {
              const Icon = rule.icon;
              return (
                <View key={i} style={[s.ruleCard, isMobile && s.ruleCardMobile, { backgroundColor: rule.bg, borderColor: rule.border }]}>
                  <View style={s.ruleIconRow}>
                    <Icon size={16} color={rule.color} />
                    <Text style={[s.rulePoints, { color: rule.color }]}>{rule.points}</Text>
                  </View>
                  <Text style={s.ruleLabel}>{rule.label}</Text>
                  <Text style={s.ruleDesc}>{rule.description}</Text>
                </View>
              );
            })}
          </View>
          <Text style={s.tableTitleText}>Tabla de Posiciones</Text>
          <Text style={s.playersCount}>{users.length} jugadores registrados</Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const isMe = auth.currentUser?.uid === item.id;
        return (
          <View style={[
            s.rankCard,
            index === 0 && s.rankGold,
            index === 1 && s.rankSilver,
            index === 2 && s.rankBronze,
            isMe && s.rankMe,
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
              <Text style={s.rankPts}>{item.championsPoints || 0}</Text>
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChampionsScreen() {
  const [tab, setTab] = useState<'partidos' | 'prediccion' | 'posiciones'>('partidos');

  return (
    <View style={s.container}>
      {/* ─── Tab Bar (centrado y responsive) ─── */}
      <View style={s.tabBarWrap}>
        <View style={s.tabBar}>
          {SCREEN_TABS.map(t => {
            const isActive = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={({ pressed }) => [
                  s.subMenuBtn,
                  isActive && s.subMenuActive,
                  pressed && !isActive && { backgroundColor: BG.hover },
                ]}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <t.Icon size={11} color={isActive ? ACCENT_COLOR : TEXT.muted} />
                <Text style={[s.subMenuTxt, isActive && s.subMenuTxtActive]} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {tab === 'partidos'   && <ChampionsMatches />}
      {tab === 'prediccion' && <ChampionsPredictions />}
      {tab === 'posiciones' && <ChampionsLeaderboard />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:      { flex: 1 },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  empty:          { textAlign: 'center', color: TEXT.muted, marginTop: 40, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },

  // Tab bar (responsive)
  tabBarWrap:       { marginBottom: SPACING['4'] },
  tabBar:           { flexDirection: 'row', backgroundColor: BG.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: BORDER.subtle, padding: SPACING['1'], gap: SPACING['1'] },
  subMenuBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING['1'], paddingVertical: SPACING['2'], borderRadius: RADIUS.md, gap: SPACING['1'], borderWidth: 1, borderColor: 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.15s ease' } as any : {}) },
  subMenuActive:    { backgroundColor: ACCENT.champions.glow, borderColor: ACCENT.champions.border },
  subMenuTxt:       { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.extrabold, color: TEXT.muted, letterSpacing: LETTER_SPACING.wide, flexShrink: 1 },
  subMenuTxtActive: { color: ACCENT_COLOR },

  // Cards
  card:           { backgroundColor: BG.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: BORDER.subtle, overflow: 'hidden', marginBottom: SPACING['2.5'] },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING['3.5'], paddingVertical: SPACING['2.5'], borderBottomWidth: 1, borderBottomColor: BORDER.subtle, backgroundColor: BG.elevated },
  stageText:      { ...TYPE.badge, color: TEXT.muted },
  dateText:       { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: TEXT.muted },
  finalLabel:     { color: TEXT.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.extrabold },
  teamsContainer: { padding: SPACING['3.5'] },
  teamRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING['2.5'] },
  teamInfo:       { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING['2.5'] },
  crest:          { width: 26, height: 26, borderRadius: RADIUS.sm, backgroundColor: BG.elevated },
  teamName:       { ...TYPE.teamName, color: TEXT.primary, flex: 1 },

  // Prediction inputs
  input:          { backgroundColor: BG.root, color: TEXT.primary, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, width: 48, height: 44, textAlign: 'center', borderRadius: RADIUS.sm, borderWidth: 1, borderColor: BORDER.default, ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}) },
  inputDisabled:  { borderColor: BORDER.subtle, color: TEXT.disabled, backgroundColor: BG.elevated },
  stepperBtn:     { backgroundColor: BG.elevated, padding: SPACING['2'], borderRadius: RADIUS.sm, marginHorizontal: SPACING['2'], minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  saveBtn:        { flexDirection: 'row', backgroundColor: TEXT.primary, paddingHorizontal: SPACING['5'], paddingVertical: SPACING['3'], borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: SPACING['1.5'], minHeight: MIN_TOUCH },
  saveTxt:        { color: BG.root, fontWeight: FONT_WEIGHT.extrabold, fontSize: FONT_SIZE.base },
  lockInfoBanner: { color: TEXT.muted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, marginTop: SPACING['2.5'], backgroundColor: BG.surface, paddingHorizontal: SPACING['2.5'], paddingVertical: SPACING['1.5'], borderRadius: RADIUS.full, borderWidth: 1, borderColor: BORDER.subtle, textAlign: 'center' },

  // Leaderboard
  rulesSection:    { marginBottom: SPACING['4'] },
  rulesTitleRow:   { alignItems: 'center', justifyContent: 'center', marginBottom: SPACING['4'] },
  rulesTitle:      { ...TYPE.screenTitle, color: TEXT.primary, textAlign: 'center' },
  rulesTitleMobile:{ fontSize: FONT_SIZE['2xl'] },
  rulesGrid:       { flexDirection: 'row', gap: SPACING['2'], marginBottom: SPACING['3'] },
  rulesGridMobile: { flexDirection: 'column' },
  ruleCard:        { flex: 1, backgroundColor: BG.surface, borderRadius: RADIUS.md, padding: SPACING['3.5'], borderWidth: 1, borderColor: BORDER.subtle },
  ruleCardMobile:  { padding: SPACING['3'] },
  ruleIconRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING['2'] },
  rulePoints:      { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.black },
  ruleLabel:       { color: TEXT.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING['1'] },
  ruleDesc:        { color: TEXT.muted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium, lineHeight: 16 },
  tableTitleText:  { ...TYPE.sectionTitle, color: TEXT.primary },
  playersCount:    { color: TEXT.muted, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING['1'], marginBottom: SPACING['3'] },

  rankCard:        { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING['3.5'], paddingHorizontal: SPACING['4'], borderRadius: RADIUS.md, marginBottom: SPACING['2'], backgroundColor: BG.surface, borderWidth: 1, borderColor: BORDER.subtle },
  rankIdxBox:      { width: 34, alignItems: 'center' },
  rankNum:         { color: TEXT.muted, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.black },
  rankName:        { color: TEXT.secondary, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  rankNameMe:      { color: TEXT.primary, fontWeight: FONT_WEIGHT.black },
  rankPts:         { color: TEXT.primary, fontSize: FONT_SIZE['3xl'], fontWeight: FONT_WEIGHT.black },
  rankPtsLabel:    { color: TEXT.muted, fontSize: 9, fontWeight: FONT_WEIGHT.extrabold },
  rankGold:        { borderColor: RANK.gold.border,   backgroundColor: RANK.gold.bg   },
  rankSilver:      { borderColor: RANK.silver.border, backgroundColor: RANK.silver.bg },
  rankBronze:      { borderColor: RANK.bronze.border, backgroundColor: RANK.bronze.bg },
  rankMe:          { borderColor: RANK.me.border,     backgroundColor: RANK.me.bg     },
});
