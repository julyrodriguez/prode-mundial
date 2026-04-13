/**
 * TournamentScreenShell — Shell reutilizable para pantallas de torneo.
 * - Tab bar centrado y responsive (sin ScrollView horizontal, flex distribuido)
 * - Sin sectionHeader duplicado (el título ya aparece en el nav superior de la app)
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { BG, BORDER, TEXT } from '../theme/colors';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS } from '../theme/spacing';

export interface TournamentTab<T extends string> {
  key: T;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
}

interface TournamentScreenShellProps<T extends string> {
  title: string;
  subtitle?: string;
  accentColor: string;
  HeaderIcon: React.ComponentType<{ size: number; color: string }>;
  tabs: TournamentTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  children: React.ReactNode;
}

export default function TournamentScreenShell<T extends string>({
  accentColor,
  tabs,
  activeTab,
  onTabChange,
  children,
}: TournamentScreenShellProps<T>) {
  return (
    <View style={styles.container}>

      {/* ─── Tab Bar (centrado, responsive, sin scroll horizontal) ─── */}
      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          {tabs.map(t => {
            const isActive = activeTab === t.key;
            return (
              <Pressable
                key={t.key}
                style={({ pressed }) => [
                  styles.tab,
                  isActive && [
                    styles.tabActive,
                    { backgroundColor: accentColor + '18', borderColor: accentColor + '40' },
                  ],
                  pressed && !isActive && styles.tabHover,
                ]}
                onPress={() => onTabChange(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <t.Icon size={11} color={isActive ? accentColor : TEXT.muted} />
                <Text
                  style={[styles.tabTxt, isActive && { color: accentColor }]}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── Content ─── */}
      <View style={styles.content}>
        {children}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
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
    // Sin minWidth ni ScrollView → los tabs se estiran para llenar el ancho
  },

  tab: {
    // flex: 1 → cada tab ocupa el mismo espacio disponible
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
    // Evita overflow en pantallas muy pequeñas
    flexShrink: 1,
  },

  content: { flex: 1 },
});
