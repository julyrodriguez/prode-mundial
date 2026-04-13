// src/components/TrucoHistorialTable.tsx — Tabla de historial y estadísticas del Truco
// Lee la colección truco_historial para el usuario logueado y renderiza stats + enfrentamientos

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface PartidaHistorial {
  partidaId: string;
  fecha: string;
  resultado: 'GANADA' | 'PERDIDA';
  puntosAFavor: number;
  puntosEnContra: number;
  rivalId: string;
  rivalNombre: string;
}

interface HistorialData {
  uid: string;
  nombre: string;
  ganadas: number;
  perdidas: number;
  ultimaPartida: string;
  partidas: PartidaHistorial[];
}

// ─── Componente Principal ────────────────────────────────────────────────────

export default function TrucoHistorialTable() {
  const [data, setData] = useState<HistorialData | null>(null);
  const [loading, setLoading] = useState(true);

  const miUid = auth.currentUser?.uid || '';

  useEffect(() => {
    if (!miUid) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'truco_historial', miUid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setData(snap.data() as HistorialData);
      } else {
        setData(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [miUid]);

  if (loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="small" color="#22c55e" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerEmoji}>📊</Text>
          <Text style={s.headerTitle}>HISTORIAL DE TRUCO</Text>
        </View>
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>🃏</Text>
          <Text style={s.emptyText}>Todavía no jugaste ninguna partida</Text>
          <Text style={s.emptySubtext}>¡Desafiá a alguien para empezar!</Text>
        </View>
      </View>
    );
  }

  const total = data.ganadas + data.perdidas;
  const winRate = total > 0 ? Math.round((data.ganadas / total) * 100) : 0;

  // Últimas 15 partidas, más recientes primero (excluyendo canceladas)
  const ultimasPartidas = [...(data.partidas || [])]
    .filter(p => (p as any).estado !== 'CANCELADA')
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 15);

  return (
    <View style={s.container}>
      {/* ─── Header ─── */}
      <View style={s.header}>
        <Text style={s.headerEmoji}>📊</Text>
        <Text style={s.headerTitle}>HISTORIAL DE TRUCO</Text>
      </View>

      {/* ─── Estadísticas ─── */}
      <View style={s.statsRow}>
        {/* Ganadas */}
        <View style={[s.statCard, s.statWin]}>
          <Text style={s.statEmoji}>🏆</Text>
          <Text style={[s.statNumber, { color: '#22c55e' }]}>{data.ganadas}</Text>
          <Text style={s.statLabel}>GANADAS</Text>
        </View>

        {/* Perdidas */}
        <View style={[s.statCard, s.statLoss]}>
          <Text style={s.statEmoji}>💀</Text>
          <Text style={[s.statNumber, { color: '#f87171' }]}>{data.perdidas}</Text>
          <Text style={s.statLabel}>PERDIDAS</Text>
        </View>

        {/* Win Rate */}
        <View style={[s.statCard, s.statRate]}>
          <Text style={s.statEmoji}>📈</Text>
          <Text style={[s.statNumber, { color: '#fbbf24' }]}>{winRate}%</Text>
          <Text style={s.statLabel}>WIN RATE</Text>
        </View>

        {/* Total */}
        <View style={[s.statCard]}>
          <Text style={s.statEmoji}>🎮</Text>
          <Text style={[s.statNumber, { color: '#60a5fa' }]}>{total}</Text>
          <Text style={s.statLabel}>TOTAL</Text>
        </View>
      </View>

      {/* ─── Racha visual ─── */}
      {ultimasPartidas.length > 0 && (
        <View style={s.rachaContainer}>
          <Text style={s.rachaTitle}>Últimas partidas</Text>
          <View style={s.rachaRow}>
            {ultimasPartidas.slice(0, 10).map((p, i) => (
              <View
                key={i}
                style={[
                  s.rachaChip,
                  p.resultado === 'GANADA' ? s.rachaWin : s.rachaLoss,
                ]}
              >
                <Text style={s.rachaChipTxt}>
                  {p.resultado === 'GANADA' ? 'W' : 'L'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ─── Tabla de enfrentamientos ─── */}
      {ultimasPartidas.length > 0 && (
        <View style={s.tableContainer}>
          {/* Table Header */}
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { flex: 2 }]}>FECHA</Text>
            <Text style={[s.tableHeaderCell, { flex: 2 }]}>RIVAL</Text>
            <Text style={[s.tableHeaderCell, { flex: 1.2 }]}>RESULTADO</Text>
            <Text style={[s.tableHeaderCell, { flex: 1.5, textAlign: 'center' }]}>SCORE</Text>
          </View>

          {/* Table Rows */}
          {ultimasPartidas.map((p, i) => {
            const fecha = new Date(p.fecha);
            const fechaStr = `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
            const isWin = p.resultado === 'GANADA';

            return (
              <View
                key={`${p.partidaId}-${i}`}
                style={[
                  s.tableRow,
                  i % 2 === 0 && s.tableRowAlt,
                  isWin ? s.tableRowWin : s.tableRowLoss,
                ]}
              >
                {/* Fecha */}
                <Text style={[s.tableCell, { flex: 2 }]}>{fechaStr}</Text>

                {/* Rival */}
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12 }}>⚔️</Text>
                  <Text style={[s.tableCell, { fontWeight: '700' }]}>{p.rivalNombre}</Text>
                </View>

                {/* Resultado */}
                <View style={{ flex: 1.2 }}>
                  <View style={[s.resultBadge, isWin ? s.resultWin : s.resultLoss]}>
                    <Text style={[s.resultTxt, { color: isWin ? '#22c55e' : '#f87171' }]}>
                      {isWin ? 'GANADA' : 'PERDIDA'}
                    </Text>
                  </View>
                </View>

                {/* Score */}
                <Text style={[s.tableCell, { flex: 1.5, textAlign: 'center', fontWeight: '800' }]}>
                  <Text style={{ color: isWin ? '#22c55e' : '#f87171' }}>{p.puntosAFavor}</Text>
                  <Text style={{ color: '#444' }}> - </Text>
                  <Text style={{ color: '#888' }}>{p.puntosEnContra}</Text>
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTILOS
// ═══════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ─── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#141414',
    marginBottom: 16,
  },
  headerEmoji: { fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },

  // ─── Empty State ─────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: '#666', fontSize: 15, fontWeight: '600' },
  emptySubtext: { color: '#444', fontSize: 13, fontWeight: '500' },

  // ─── Stats ───────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statCard: {
    backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 1, borderColor: '#1a1a1a',
    paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', minWidth: 90,
    flex: 1,
  },
  statWin: { borderColor: 'rgba(34,197,94,0.2)', backgroundColor: 'rgba(34,197,94,0.03)' },
  statLoss: { borderColor: 'rgba(248,113,113,0.2)', backgroundColor: 'rgba(248,113,113,0.03)' },
  statRate: { borderColor: 'rgba(251,191,36,0.2)', backgroundColor: 'rgba(251,191,36,0.03)' },
  statEmoji: { fontSize: 20, marginBottom: 4 },
  statNumber: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  statLabel: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },

  // ─── Racha ───────────────────────────────────────────────────────────────
  rachaContainer: {
    marginBottom: 16, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#141414',
  },
  rachaTitle: { color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 },
  rachaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  rachaChip: {
    width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center',
  },
  rachaWin: { backgroundColor: 'rgba(34,197,94,0.15)' },
  rachaLoss: { backgroundColor: 'rgba(248,113,113,0.15)' },
  rachaChipTxt: { fontWeight: '900', fontSize: 11 },

  // ─── Tabla ───────────────────────────────────────────────────────────────
  tableContainer: {
    backgroundColor: '#0a0a0a', borderRadius: 14, borderWidth: 1, borderColor: '#141414',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#080808', borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  tableHeaderCell: {
    color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#0f0f0f',
  },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.01)' },
  tableRowWin: { borderLeftWidth: 3, borderLeftColor: '#22c55e' },
  tableRowLoss: { borderLeftWidth: 3, borderLeftColor: '#f87171' },
  tableCell: { color: '#aaa', fontSize: 12, fontWeight: '500' },
  resultBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start',
  },
  resultWin: { backgroundColor: 'rgba(34,197,94,0.1)' },
  resultLoss: { backgroundColor: 'rgba(248,113,113,0.1)' },
  resultTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
});
