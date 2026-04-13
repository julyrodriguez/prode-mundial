import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Image, TextInput, TouchableOpacity, Alert, Platform, useWindowDimensions } from 'react-native';
import { ChevronLeft, ChevronRight, Save, Plus, Minus } from 'lucide-react-native';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

import { BG, BORDER, TEXT, ACCENT, STATUS } from '../theme/colors';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS } from '../theme/spacing';

const HOURS_BEFORE_LOCK = 1;

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const isMatchLocked = (utcDate: string) => {
  const matchTime = new Date(utcDate).getTime();
  const now = Date.now();
  return now >= matchTime - (HOURS_BEFORE_LOCK * 60 * 60 * 1000);
};

export default function PredictionsScreen() {
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<Record<string, { home: string, away: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [allMatches, setAllMatches] = useState<any[]>([]);

  // 1. Escuchar el documento cache + cargar predicciones
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
    }, (err) => {
      console.error('Error fetching cache:', err);
      setLoading(false);
    });

    // Cargar predicciones del usuario
    if (auth.currentUser) {
      getDoc(doc(db, 'userPredictions', auth.currentUser!.uid)).then(docSnap => {
        if (docSnap.exists()) {
          setPredictions(docSnap.data().matches || {});
        }
      });
    }

    return () => unsub();
  }, []);

  // 2. Filtrar partidos del día seleccionado en el cliente
  useEffect(() => {
    if (availableDays.length === 0) return;
    const currentDay = availableDays[selectedDayIndex];
    if (!currentDay) return;
    const filtered = allMatches.filter(m => m.argDay === currentDay);
    filtered.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    setMatches(filtered);
  }, [selectedDayIndex, availableDays, allMatches]);

  const getDayLabel = (ds: string) => {
    if (!ds) return '';
    const [y, m, d] = ds.split('-');
    const dummy = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return `${dummy.getDate()} de ${dummy.toLocaleDateString('es-AR', { month: 'long' })}`;
  };

  const handlePredictionChange = (matchId: string, type: 'home' | 'away', value: string, utcDate: string) => {
    if (isMatchLocked(utcDate)) return;
    const numericValue = value.replace(/[^0-9]/g, '');

    setPredictions((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [type]: numericValue,
      },
    }));
  };

  const handleSave = async () => {

    if (!auth.currentUser) {
      showAlert('Error', 'No estás autenticado.');
      return;
    }

    setSaving(true);
    try {
      // Reemplazar campos vacíos por '0' si el usuario llenó el partido a medias
      const sanitizedPredictions: Record<string, { home: string, away: string }> = {};
      for (const [key, pred] of Object.entries(predictions)) {
        let h = pred.home;
        let a = pred.away;
        const hasH = h !== '' && h !== undefined;
        const hasA = a !== '' && a !== undefined;
        if (hasH && !hasA) a = '0';
        if (hasA && !hasH) h = '0';
        sanitizedPredictions[key] = { home: h || '', away: a || '' };
      }

      // Actualizamos el estado de manera local asi la UI se arregla también al guardar
      setPredictions(sanitizedPredictions);

      const predictionsRef = doc(db, 'userPredictions', auth.currentUser.uid);
      await setDoc(predictionsRef, {
        userId: auth.currentUser.uid,
        updatedAt: new Date().toISOString(),
        matches: sanitizedPredictions,
      }, { merge: true });
      showAlert('Éxito', 'Tus pronósticos han sido guardados correctamente.');
    } catch (error: any) {
      console.error('Error guardando pronósticos:', error);
      showAlert('Error', `No se pudieron guardar: ${error.message || 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStepper = (matchId: string, type: 'home' | 'away', delta: number, utcDate: string, currentVal: string) => {
    if (isMatchLocked(utcDate)) return;
    let num = parseInt(currentVal || '0', 10);
    if (isNaN(num)) num = 0;
    num += delta;
    if (num < 0) num = 0;
    if (num > 99) num = 99;
    handlePredictionChange(matchId, type, num.toString(), utcDate);
  };

  const renderMatch = ({ item }: { item: any }) => {
    const matchId = item.id.toString();
    const currentPred = predictions[matchId] || { home: '', away: '' };

    const isFinished = item.status === 'FINISHED';
    const locked = isMatchLocked(item.utcDate);
    const time = item.argTime || new Date(item.utcDate).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.matchCard, locked && { opacity: 0.6 }]}>
        <View style={styles.matchHeader}>
          <Text style={styles.stageText}>{item.stage?.replace('_', ' ') || 'PARTIDO'}</Text>
          {isFinished ? (
            <Text style={styles.finalScoreLabel}>
              Final: {item.score?.fullTime?.home} - {item.score?.fullTime?.away}
            </Text>
          ) : locked ? (
            <Text style={styles.lockedBadge}>🔒 BLOQUEADO</Text>
          ) : (
            <Text style={styles.dateText}>{time} hs</Text>
          )}
        </View>

        <View style={styles.teamsContainer}>
          <View style={styles.teamRow}>
            <View style={styles.teamInfo}>
              {item.homeTeam?.crest && <Image source={{ uri: item.homeTeam.crest }} style={styles.crest} />}
              <Text style={[styles.teamName, isMobile && styles.teamNameMobile]} numberOfLines={1}>
                {isMobile ? (item.homeTeam?.tla || item.homeTeam?.shortName || '---') : (item.homeTeam?.shortName || item.homeTeam?.name || '---')}
              </Text>
            </View>
            <View style={styles.scoreControl}>
              {!locked && (
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStepper(matchId, 'home', -1, item.utcDate, currentPred.home)}>
                  <Minus size={14} color="#fff" />
                </TouchableOpacity>
              )}
              <TextInput
                style={[styles.input, locked && styles.inputDisabled]}
                keyboardType="number-pad"
                maxLength={2}
                value={currentPred.home}
                onChangeText={(val) => handlePredictionChange(matchId, 'home', val, item.utcDate)}
                editable={!locked}
                placeholder="0"
                placeholderTextColor="#333"
              />
              {!locked && (
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStepper(matchId, 'home', 1, item.utcDate, currentPred.home)}>
                  <Plus size={14} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.teamRow}>
            <View style={styles.teamInfo}>
              {item.awayTeam?.crest && <Image source={{ uri: item.awayTeam.crest }} style={styles.crest} />}
              <Text style={[styles.teamName, isMobile && styles.teamNameMobile]} numberOfLines={1}>
                {isMobile ? (item.awayTeam?.tla || item.awayTeam?.shortName || '---') : (item.awayTeam?.shortName || item.awayTeam?.name || '---')}
              </Text>
            </View>
            <View style={styles.scoreControl}>
              {!locked && (
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStepper(matchId, 'away', -1, item.utcDate, currentPred.away)}>
                  <Minus size={14} color="#fff" />
                </TouchableOpacity>
              )}
              <TextInput
                style={[styles.input, locked && styles.inputDisabled]}
                keyboardType="number-pad"
                maxLength={2}
                value={currentPred.away}
                onChangeText={(val) => handlePredictionChange(matchId, 'away', val, item.utcDate)}
                editable={!locked}
                placeholder="0"
                placeholderTextColor="#333"
              />
              {!locked && (
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStepper(matchId, 'away', 1, item.utcDate, currentPred.away)}>
                  <Plus size={14} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading && availableDays.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  const canGoPrev = selectedDayIndex > 0;
  const canGoNext = selectedDayIndex < availableDays.length - 1;
  const currentDayLabel = getDayLabel(availableDays[selectedDayIndex]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>


        <TouchableOpacity style={[styles.saveButton, saving && styles.disabledButton]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#000" /> : (
            <>
              <Save size={18} color="#000" style={{ marginRight: 6 }} />
              <Text style={styles.saveText}>Guardar Pronósticos</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.lockInfoBanner}>
          🔒 Los pronósticos se bloquean 1 hora antes del inicio de cada partido.
        </Text>
      </View>

      {availableDays.length > 0 && (
        <View style={styles.daySelectorContainer}>
          <TouchableOpacity
            style={[styles.arrowBtn, !canGoPrev && styles.arrowBtnDisabled]}
            onPress={() => canGoPrev && setSelectedDayIndex(selectedDayIndex - 1)}
            disabled={!canGoPrev}
          >
            <ChevronLeft size={22} color={canGoPrev ? '#ffffff' : '#333'} />
          </TouchableOpacity>

          <View style={styles.dayLabelContainer}>
            <Text style={styles.dayLabelText}>{currentDayLabel}</Text>
            <Text style={styles.dayCounter}>{selectedDayIndex + 1} / {availableDays.length}</Text>
          </View>

          <TouchableOpacity
            style={[styles.arrowBtn, !canGoNext && styles.arrowBtnDisabled]}
            onPress={() => canGoNext && setSelectedDayIndex(selectedDayIndex + 1)}
            disabled={!canGoNext}
          >
            <ChevronRight size={22} color={canGoNext ? '#ffffff' : '#333'} />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={matches}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMatch}
        contentContainerStyle={styles.listContent}
      />
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
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  pageTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
  },
  pageTitleMobile: {
    fontSize: 24,
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveText: {
    color: '#000',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  daySelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 4,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#111',
  },
  arrowBtnDisabled: {
    backgroundColor: '#0a0a0a',
  },
  dayLabelContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabelText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
    textTransform: 'capitalize',
  },
  dayCounter: {
    color: '#555',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 80,
    gap: 16,
  },
  matchCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    backgroundColor: '#111',
  },
  stageText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  dateText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  finalScoreLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  teamsContainer: {
    padding: 16,
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  crest: {
    width: 24,
    height: 24,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: '#111',
  },
  teamName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  teamNameMobile: {
    fontSize: 14,
  },
  input: {
    backgroundColor: '#000',
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    width: 48,
    height: 40,
    textAlign: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  scoreControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperBtn: {
    backgroundColor: '#222',
    padding: 8,
    borderRadius: 6,
    marginHorizontal: 8,
  },
  inputDisabled: {
    borderColor: '#111',
    color: '#444',
    backgroundColor: '#0f0f0f',
  },
  matchCardLocked: {
    opacity: 0.6,
  },
  lockedBadge: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
  },
  lockWarning: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  lockInfoBanner: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
});
