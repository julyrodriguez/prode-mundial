import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Image, useWindowDimensions } from 'react-native';
import { Trophy, Zap, Target, X } from 'lucide-react-native';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { BG, BORDER, TEXT, ACCENT, STATUS } from '../theme/colors';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS } from '../theme/spacing';

const RULES = [
  { icon: Target, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', label: 'Marcador exacto', points: '6 pts', description: 'Acertás el resultado exacto del partido' },
  { icon: Zap, color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.4)', label: 'Resultado acertado', points: '3 pts', description: 'Acertás quién gana (o empate) pero no el marcador exacto' },
  { icon: X, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', label: 'No acertó', points: '0 pts', description: 'No acertaste ni el resultado ni el marcador' },
];

export default function LeaderboardScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const loadData = async () => {
    setLoading(true);
    try {
      // Intentamos primero el cache para velocidad y ahorro de cuota Firestore
      const cacheSnap = await getDoc(doc(db, 'cache', 'leaderboard'));
      if (cacheSnap.exists()) {
        const cachedUsers: any[] = cacheSnap.data().users || [];
        // Ordenamos por puntos (globales por defecto)
        const sorted = [...cachedUsers].sort((a, b) => (b.points || 0) - (a.points || 0));
        setUsers(sorted);
      } else {
        // Fallback: Si no hay cache, mostrar vacío o podrías intentar traer algunos
        setUsers([]);
      }
    } catch (error) {
      console.error('Error cargando leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isCurrentUser = auth.currentUser?.uid === item.id;

    return (
      <View style={[styles.card, isCurrentUser && styles.currentUserCard, index === 0 && { borderColor: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.05)' }, index === 1 && { borderColor: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.05)' }, index === 2 && { borderColor: '#b45309', backgroundColor: 'rgba(180, 83, 9, 0.05)' }]}>
        <View style={styles.rankContainer}>
          {index === 0 ? (
             <Text style={{fontSize: 22}}>🏆</Text>
          ) : index === 1 ? (
             <Trophy size={20} color="#94a3b8" strokeWidth={3} />
          ) : index === 2 ? (
             <Trophy size={20} color="#b45309" strokeWidth={3} />
          ) : (
            <Text style={[styles.rankText, isCurrentUser && styles.rankTextCurrent]}>
              {index + 1}
            </Text>
          )}
        </View>

        <View style={styles.playerInfo}>
          <Text style={[styles.playerName, isCurrentUser && styles.currentUserName]} numberOfLines={1}>
            {item.name || item.email?.split('@')[0] || 'Jugador'}
          </Text>
          {isCurrentUser && <Text style={styles.youBadge}>TÚ</Text>}
        </View>

        <View style={styles.pointsContainer}>
          <Text style={[styles.pointsText, isCurrentUser && styles.currentPointsText]}>
            {item.points || 0}
          </Text>
          <Text style={styles.ptsLabel}>PTS</Text>
        </View>
      </View>
    );
  };

  const ListHeader = () => (
    <View style={styles.rulesSection}>
      <View style={styles.rulesTitleRow}>
        <Text style={[styles.rulesTitle, isMobile && styles.rulesTitleMobile]}>Reglas de Puntuación</Text>
      </View>
      <View style={[styles.rulesGrid, isMobile && styles.rulesGridMobile]}>
        {RULES.map((rule, i) => {
          const Icon = rule.icon;
          return (
            <View key={i} style={[styles.ruleCard, isMobile && styles.ruleCardMobile, { backgroundColor: rule.bg, borderColor: rule.border }]}>
              <View style={styles.ruleIconRow}>
                <Icon size={16} color={rule.color} />
                <Text style={[styles.rulePoints, { color: rule.color }]}>{rule.points}</Text>
              </View>
              <Text style={styles.ruleLabel}>{rule.label}</Text>
              <Text style={styles.ruleDesc}>{rule.description}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.bonusCard}>
        <Text style={styles.bonusIcon}>⚡ 2x</Text>
        <View style={styles.bonusTextContainer}>
          <Text style={styles.bonusTitle}>A partir de 8vos de final</Text>
          <Text style={styles.bonusDesc}>Todos los puntos se duplican (12 pts exacto / 6 pts resultado)</Text>
        </View>
      </View>

      <Text style={[styles.tableTitleText, isMobile && styles.tableTitleMobile]}>Tabla de Posiciones</Text>
      <Text style={styles.playersCount}>{users.length} jugadores registrados</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading && users.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No hay usuarios registrados aún.</Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#ffffff" />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG.root,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG.root,
    paddingTop: 40,
  },
  listContent: {
    paddingBottom: 40,
    gap: 8,
  },
  // Rules section
  rulesSection: {
    marginBottom: 16,
  },
  rulesTitleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  rulesTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
  },
  rulesTitleMobile: {
    fontSize: 24,
  },
  rulesGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  rulesGridMobile: {
    flexDirection: 'column',
  },
  ruleCard: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  ruleCardMobile: {
    padding: 12,
  },
  ruleIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rulePoints: {
    fontSize: 14,
    fontWeight: '900',
  },
  ruleLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  ruleDesc: {
    color: '#666',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  bonusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.2)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 28,
  },
  bonusIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f97316',
    marginRight: 14,
  },
  bonusTextContainer: {
    flex: 1,
  },
  bonusTitle: {
    color: '#f97316',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  bonusDesc: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  tableTitleText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  tableTitleMobile: {
    fontSize: 18,
  },
  playersCount: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 12,
  },
  // Leaderboard cards
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  currentUserCard: {
    borderColor: '#444',
    backgroundColor: '#111',
  },
  rankContainer: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rankText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '800',
  },
  rankTextCurrent: {
    color: '#ffffff',
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  currentUserName: {
    color: '#ffffff',
  },
  youBadge: {
    backgroundColor: '#333333',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 12,
  },
  pointsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  pointsText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -1,
  },
  currentPointsText: {
    color: '#ffffff',
  },
  ptsLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
});
