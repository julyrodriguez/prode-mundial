import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  SafeAreaView, RefreshControl, Platform, useWindowDimensions,
} from 'react-native';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { Globe, Star, Leaf, Shield, Calendar, Trophy } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import MatchCard from '../components/MatchCard';
import DaySelector from '../components/DaySelector';
import { MatchListSkeleton } from '../components/SkeletonLoader';
import { BG, BORDER, TEXT, ACCENT } from '../theme/colors';
import { TYPE, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS } from '../theme/spacing';

// ─── Config por competición ────────────────────────────────────────────────────
const COMPETITION_CONFIG: Record<string, { Icon: any; color: string; accentColor: string }> = {
  'Copa del Mundo':   { Icon: Globe,   color: ACCENT.mundial.primary,      accentColor: ACCENT.mundial.primary },
  'Champions League': { Icon: Star,    color: ACCENT.champions.primary,     accentColor: ACCENT.champions.primary },
  'Brasileirão':      { Icon: Leaf,    color: ACCENT.brasileirao.primary,   accentColor: ACCENT.brasileirao.primary },
  'Liga Argentina':   { Icon: Shield,  color: ACCENT.argentina.primary,     accentColor: ACCENT.argentina.primary },
  'Libertadores':     { Icon: Trophy,  color: ACCENT.libertadores.primary,  accentColor: ACCENT.libertadores.primary },
};

// ─── Component ─────────────────────────────────────────────────────────────────
const AllMatchesScreen = () => {
  const [loading, setLoading]             = useState(true);
  const [allMatches, setAllMatches]       = useState<any[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [refreshing, setRefreshing]       = useState(false);
  const navigation = useNavigation<any>();
  const db  = getFirestore();
  const { width } = useWindowDimensions();
  const isMobile = width < 700;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'allMatches'), snap => {
      if (snap.exists()) {
        const data    = snap.data();
        const matches = data.matches      || [];
        const days    = data.availableDays || [];
        setAllMatches(matches);
        setAvailableDays(days);
        const todayStr = new Date(Date.now() - 3 * 3600000).toISOString().split('T')[0];
        const idx = days.findIndex((d: string) => d >= todayStr);
        setSelectedDayIndex(idx >= 0 ? idx : 0);
      }
      setLoading(false);
      setRefreshing(false);
    });
    return () => unsub();
  }, []);

  // Agrupar por competición para el día seleccionado
  const groupsForDay = useMemo(() => {
    if (!availableDays.length || !availableDays[selectedDayIndex]) return [];
    const day      = availableDays[selectedDayIndex];
    const filtered = allMatches.filter(m => m.argDay === day);
    const map      = new Map<string, any[]>();
    filtered.forEach(m => {
      const comp = m.competition || 'Otros';
      if (!map.has(comp)) map.set(comp, []);
      map.get(comp)!.push(m);
    });
    return Array.from(map.entries()).map(([competition, matches]) => ({ competition, matches }));
  }, [allMatches, availableDays, selectedDayIndex]);

  // ─── Render group header ────────────────────────────────────────────────────
  const renderGroup = ({ item }: { item: { competition: string; matches: any[] } }) => {
    const cfg = COMPETITION_CONFIG[item.competition] || { Icon: Calendar, color: TEXT.muted };
    return (
      <View style={styles.group}>
        <View style={styles.groupHeader}>
          <cfg.Icon size={15} color={cfg.color} />
          <Text style={[styles.groupTitle, { color: cfg.color }]}>
            {item.competition.toUpperCase()}
          </Text>
          <View style={[styles.groupCount, { backgroundColor: cfg.color + '15', borderColor: cfg.color + '30' }]}>
            <Text style={[styles.groupCountTxt, { color: cfg.color }]}>{item.matches.length}</Text>
          </View>
        </View>

        {item.matches.map(m => (
          <MatchCard
            key={m.id}
            id={m.id}
            homeTeam={m.homeTeam}
            awayTeam={m.awayTeam}
            score={m.score}
            status={m.status}
            argTime={m.argTime}
            stage={m.stage}
            accentColor={cfg.color}
            onPress={() => navigation.navigate('MatchDetail', { id: m.id })}
          />
        ))}
      </View>
    );
  };

  // ─── Header del FlatList ────────────────────────────────────────────────────
  const ListHeader = () => (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>CALENDARIO GLOBAL</Text>
      <Text style={styles.screenSub}>Todas tus competiciones unificadas</Text>

      {availableDays.length > 0 && (
        <DaySelector
          days={availableDays}
          selectedIndex={selectedDayIndex}
          onChange={setSelectedDayIndex}
        />
      )}
    </View>
  );

  // ─── Empty state ─────────────────────────────────────────────────────────────
  const ListEmpty = () => (
    <View style={styles.emptyState}>
      <Calendar size={48} color={BORDER.default} />
      <Text style={styles.emptyTitle}>Sin partidos</Text>
      <Text style={styles.emptyDesc}>No hay partidos programados para este día.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={{ paddingTop: SPACING['4'] }}>
          {/* Header skeleton */}
          <View style={styles.screenHeader}>
            <Text style={styles.screenTitle}>CALENDARIO GLOBAL</Text>
            <Text style={styles.screenSub}>Cargando partidos...</Text>
          </View>
          <MatchListSkeleton count={5} />
        </View>
      ) : (
        <FlatList
          data={groupsForDay}
          keyExtractor={item => item.competition}
          renderItem={renderGroup}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => setRefreshing(true)}
              tintColor={TEXT.muted}
              colors={[TEXT.muted]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG.root,
  },

  screenHeader: {
    paddingBottom: SPACING['4'],
  },
  screenTitle: {
    ...TYPE.screenTitle,
    color: TEXT.primary,
    textAlign: 'center',
    marginBottom: SPACING['1'],
  },
  screenSub: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.extrabold,
    color: TEXT.muted,
    textAlign: 'center',
    letterSpacing: LETTER_SPACING.wider,
    textTransform: 'uppercase',
    marginBottom: SPACING['4'],
  },

  listContent: {
    paddingBottom: SPACING['10'],
  },

  // Groups
  group: {
    marginBottom: SPACING['6'],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING['3'],
    gap: SPACING['2'],
  },
  groupTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.black,
    letterSpacing: LETTER_SPACING.wider,
    flex: 1,
  },
  groupCount: {
    paddingHorizontal: SPACING['2'],
    paddingVertical: SPACING['0.5'],
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  groupCountTxt: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.black,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingTop: SPACING['10'],
    paddingHorizontal: SPACING['8'],
    gap: SPACING['3'],
  },
  emptyTitle: {
    ...TYPE.sectionTitle,
    color: TEXT.disabled,
  },
  emptyDesc: {
    fontSize: FONT_SIZE.base,
    color: TEXT.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default AllMatchesScreen;
