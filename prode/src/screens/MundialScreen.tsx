import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import GroupsScreen from './GroupsScreen';
import MatchesScreen from './MatchesScreen';
import PredictionsScreen from './PredictionsScreen';
import LeaderboardScreen from './LeaderboardScreen';
import { BG, BORDER, TEXT, ACCENT } from '../theme/colors';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS } from '../theme/spacing';
import { Globe, Users, Crosshair, BarChart2 } from 'lucide-react-native';

type MundialTab = 'grupos' | 'partidos' | 'pronosticos' | 'tabla';

const TABS: { key: MundialTab; label: string; Icon: any }[] = [
  { key: 'grupos',      label: 'GRUPOS',      Icon: Globe     },
  { key: 'partidos',    label: 'PARTIDOS',    Icon: Users     },
  { key: 'pronosticos', label: 'PRONÓSTICOS', Icon: Crosshair },
  { key: 'tabla',       label: 'POSICIONES',  Icon: BarChart2 },
];

// Cada tab tiene su color tricolor
const MUNDIAL_COLORS = [
  ACCENT.mundial.primary,
  ACCENT.mundial.secondary,
  ACCENT.mundial.tertiary,
  ACCENT.mundial.primary,
];

export default function MundialScreen() {
  const [tab, setTab] = useState<MundialTab>('partidos');

  const activeIdx   = TABS.findIndex(t => t.key === tab);
  const activeColor = MUNDIAL_COLORS[activeIdx] ?? ACCENT.mundial.primary;

  return (
    <View style={s.container}>

      {/* ─── Tab Bar — centrado y responsive (sin ScrollView horizontal) ─── */}
      <View style={s.tabBarWrap}>
        <View style={s.tabBar}>
          {TABS.map((t, i) => {
            const isActive = tab === t.key;
            const color    = MUNDIAL_COLORS[i];
            return (
              <Pressable
                key={t.key}
                style={({ pressed }) => [
                  s.tab,
                  isActive && [s.tabActive, { backgroundColor: color + '18', borderColor: color + '40' }],
                  pressed && !isActive && s.tabHover,
                ]}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <t.Icon size={11} color={isActive ? color : TEXT.muted} />
                <Text style={[s.tabTxt, isActive && { color }]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── Content ─── */}
      <View style={{ flex: 1 }}>
        {tab === 'grupos'      && <GroupsScreen />}
        {tab === 'partidos'    && <MatchesScreen />}
        {tab === 'pronosticos' && <PredictionsScreen />}
        {tab === 'tabla'       && <LeaderboardScreen />}
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG.root },

  tabBarWrap: { marginBottom: SPACING['4'] },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: BG.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: BORDER.subtle,
    padding: SPACING['1'],
    gap: SPACING['1'],
  },

  tab: {
    // flex:1 → cada tab ocupa el mismo espacio, sin scroll horizontal
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING['1'],
    paddingVertical: SPACING['2'],
    borderRadius: RADIUS.md,
    gap: SPACING['1'],
    borderWidth: 1,
    borderColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.15s ease' } as any : {}),
  },

  tabActive: { borderWidth: 1 },

  tabHover: { backgroundColor: BG.hover },

  tabTxt: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.extrabold,
    color: TEXT.muted,
    letterSpacing: LETTER_SPACING.wide,
    flexShrink: 1,
  },
});
