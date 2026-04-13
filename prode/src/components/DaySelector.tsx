/**
 * DaySelector — Navegador de fechas premium con Design Tokens.
 * Botones de flecha accesibles (min 44x44), label de fecha y contador.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { BG, BORDER, TEXT } from '../theme/colors';
import { FONT_SIZE, FONT_WEIGHT, TYPE } from '../theme/typography';
import { SPACING, RADIUS, MIN_TOUCH } from '../theme/spacing';

interface DaySelectorProps {
  days: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

function getDayLabel(ds: string): string {
  if (!ds) return '';
  const [y, m, d] = ds.split('-');
  const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tmrw = new Date(today); tmrw.setDate(today.getDate() + 1);
  const tmrwStr = tmrw.toISOString().split('T')[0];

  if (ds === todayStr) return 'HOY';
  if (ds === tmrwStr)  return 'MAÑANA';
  return `${dt.getDate()} de ${dt.toLocaleDateString('es-AR', { month: 'long' })}`;
}

export default function DaySelector({ days, selectedIndex, onChange }: DaySelectorProps) {
  const canPrev = selectedIndex > 0;
  const canNext = selectedIndex < days.length - 1;
  const dayStr  = days[selectedIndex] ?? '';

  return (
    <View style={styles.container}>
      {/* ← Prev */}
      <TouchableOpacity
        style={[styles.arrow, !canPrev && styles.arrowDisabled]}
        onPress={() => canPrev && onChange(selectedIndex - 1)}
        disabled={!canPrev}
        accessibilityLabel="Día anterior"
        accessibilityRole="button"
      >
        <ChevronLeft size={22} color={canPrev ? TEXT.primary : BORDER.strong} />
      </TouchableOpacity>

      {/* Label */}
      <View style={styles.labelBlock}>
        <Text style={styles.dayLabel}>{getDayLabel(dayStr)}</Text>
        <Text style={styles.counter}>{selectedIndex + 1} / {days.length}</Text>
      </View>

      {/* → Next */}
      <TouchableOpacity
        style={[styles.arrow, !canNext && styles.arrowDisabled]}
        onPress={() => canNext && onChange(selectedIndex + 1)}
        disabled={!canNext}
        accessibilityLabel="Día siguiente"
        accessibilityRole="button"
      >
        <ChevronRight size={22} color={canNext ? TEXT.primary : BORDER.strong} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: BORDER.subtle,
    padding: SPACING['1'],
    marginBottom: SPACING['4'],
  },
  arrow: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: BG.elevated,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s ease' } as any : {}),
  },
  arrowDisabled: {
    backgroundColor: 'transparent',
  },
  labelBlock: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING['0.5'],
  },
  dayLabel: {
    ...TYPE.sectionTitle,
    fontSize: FONT_SIZE.lg,
    color: TEXT.primary,
    textTransform: 'capitalize',
  },
  counter: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: TEXT.muted,
    letterSpacing: 0.3,
  },
});
