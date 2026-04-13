import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

export default function MatchesScreen() {
  const navigation = useNavigation<any>();
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // 1. Cache listener (1 lect.)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cache', 'worldCupMatches'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAvailableDays(data.availableDays || []);
        setAllMatches(data.matches || []);
        const todayStr = new Date(Date.now() - 3 * 3600000).toISOString().split('T')[0];
        const days = data.availableDays || [];
        const idx = days.findIndex((d: string) => d >= todayStr);
        setSelectedDayIndex(idx >= 0 ? idx : 0);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Filtrar por día (client-side)
  useEffect(() => {
    if (!availableDays.length) return;
    const day = availableDays[selectedDayIndex];
    if (!day) return;
    const f = allMatches.filter(m => m.argDay === day);
    f.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    setMatches(f);
  }, [selectedDayIndex, availableDays, allMatches]);

  const getDayLabel = (ds: string) => {
    if (!ds) return '';
    const [y, m, d] = ds.split('-');
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return `${dt.getDate()} de ${dt.toLocaleDateString('es-AR', { month: 'long' })}`;
  };

  const renderMatch = ({ item }: { item: any }) => {
    const isFinished = item.status === 'FINISHED';
    const isLive = item.status === 'IN_PLAY' || item.status === 'PAUSED';
    const time = item.argTime || '?';

    let statusLabel = 'PENDIENTE';
    let statusColor = '#fbbf24';
    if (isFinished) { statusLabel = 'FINALIZADO'; statusColor = '#ef4444'; }
    else if (isLive) { statusLabel = 'EN VIVO'; statusColor = '#22c55e'; }

    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('MatchDetail', { id: item.id })} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <Text style={styles.stage}>{item.stage?.replace(/_/g, ' ') || 'FECHA'}</Text>
          {isLive ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginRight: 5 }} />
              <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '900' }}>EN VIVO</Text>
            </View>
          ) : (
            <Text style={styles.time}>{time} hs</Text>
          )}
        </View>
        <View style={styles.teams}>
          <View style={styles.teamRow}>
            <View style={styles.teamInfo}>
              {item.homeTeam?.crest && <Image source={{ uri: item.homeTeam.crest }} style={styles.crest} />}
              <Text style={styles.teamName} numberOfLines={1}>{item.homeTeam?.shortName || item.homeTeam?.name || '---'}</Text>
            </View>
            <Text style={[styles.score, isFinished || isLive ? styles.scoreVisible : styles.scoreHidden]}>
              {isFinished || isLive ? (item.score?.fullTime?.home ?? '-') : '-'}
            </Text>
          </View>
          <View style={styles.teamRow}>
            <View style={styles.teamInfo}>
              {item.awayTeam?.crest && <Image source={{ uri: item.awayTeam.crest }} style={styles.crest} />}
              <Text style={styles.teamName} numberOfLines={1}>{item.awayTeam?.shortName || item.awayTeam?.name || '---'}</Text>
            </View>
            <Text style={[styles.score, isFinished || isLive ? styles.scoreVisible : styles.scoreHidden]}>
              {isFinished || isLive ? (item.score?.fullTime?.away ?? '-') : '-'}
            </Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={[styles.badge, { color: statusColor, backgroundColor: statusColor + '15' }]}>
            {statusLabel}
          </Text>
          <View style={styles.detailsBtn}>
            <Text style={styles.detailsBtnTxt}>VER DETALLES</Text>
            <ChevronRight size={14} color="#ffffff" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !allMatches.length) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  const canPrev = selectedDayIndex > 0;
  const canNext = selectedDayIndex < availableDays.length - 1;

  return (
    <View style={styles.container}>
      {/* Day selector */}
      {availableDays.length > 0 && (
        <View style={styles.daySelector}>
          <TouchableOpacity
            style={[styles.arrow, !canPrev && styles.arrowDisabled]}
            onPress={() => canPrev && setSelectedDayIndex(selectedDayIndex - 1)}
            disabled={!canPrev}
          >
            <ChevronLeft size={22} color={canPrev ? '#fff' : '#2a2a2a'} />
          </TouchableOpacity>
          <View style={styles.dayCenter}>
            <Text style={styles.dayLabel}>{getDayLabel(availableDays[selectedDayIndex])}</Text>
            <Text style={styles.dayCounter}>{selectedDayIndex + 1} / {availableDays.length}</Text>
          </View>
          <TouchableOpacity
            style={[styles.arrow, !canNext && styles.arrowDisabled]}
            onPress={() => canNext && setSelectedDayIndex(selectedDayIndex + 1)}
            disabled={!canNext}
          >
            <ChevronRight size={22} color={canNext ? '#fff' : '#2a2a2a'} />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={matches}
        keyExtractor={item => item.id.toString()}
        renderItem={renderMatch}
        contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No hay partidos para este día.</Text> : null
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  daySelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a',
    padding: 3, marginBottom: 14,
  },
  arrow: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#111' },
  arrowDisabled: { backgroundColor: 'transparent' },
  dayCenter: { flex: 1, alignItems: 'center' },
  dayLabel: { color: '#fff', fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  dayCounter: { color: '#444', fontSize: 11, fontWeight: '700', marginTop: 2 },
  card: { backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#161616', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', backgroundColor: '#0f0f0f' },
  stage: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  time: { color: '#555', fontSize: 12, fontWeight: '700' },
  teams: { padding: 14 },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  teamInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  crest: { width: 24, height: 24, marginRight: 10, borderRadius: 12, backgroundColor: '#111' },
  teamName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  score: { fontSize: 20, fontWeight: '900', minWidth: 26, textAlign: 'center' },
  scoreVisible: { color: '#fff' },
  scoreHidden: { color: '#1e1e1e' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  badge: { fontSize: 10, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, letterSpacing: 0.5 },
  detailsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  detailsBtnTxt: { color: '#ffffff', fontSize: 11, fontWeight: '900', marginRight: 4, letterSpacing: 0.5 },
  empty: { textAlign: 'center', color: '#666', marginTop: 40, fontSize: 15, fontWeight: '500' },
});
