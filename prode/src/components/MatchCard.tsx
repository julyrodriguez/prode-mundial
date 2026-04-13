/**
 * MatchCard — Tarjeta de partido premium con Design Tokens.
 * Glassmorphism oscuro, escudo de equipos, badge de estado y animación sutil.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, Platform,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { BG, BORDER, TEXT, STATUS, ACCENT } from '../theme/colors';
import { TYPE, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS } from '../theme/spacing';

// ─── Types ─────────────────────────────────────────────────────────────────────
type MatchStatus = 'FINISHED' | 'IN_PLAY' | 'PAUSED' | 'HALFTIME' | 'EXTRA_TIME' | 'TIMED' | 'SCHEDULED';

interface Team {
  name?: string;
  shortName?: string;
  crest?: string;
}

interface Score {
  fullTime?: { home?: number | null; away?: number | null };
}

export interface MatchCardProps {
  id: string | number;
  homeTeam?: Team;
  awayTeam?: Team;
  score?: Score;
  status?: MatchStatus;
  argTime?: string;
  stage?: string;
  accentColor?: string;
  onPress?: () => void;
  /** Ocultar sección de detalles */
  hideDetailsBtn?: boolean;
  /** Si está bloqueado para pronóstico */
  locked?: boolean;
}

// ─── Status config ─────────────────────────────────────────────────────────────
function getStatusConfig(status: MatchStatus | undefined, locked?: boolean) {
  if (status === 'FINISHED')   return { label: 'FINALIZADO', ...STATUS.finished };
  if (status === 'IN_PLAY' || status === 'PAUSED' || status === 'HALFTIME' || status === 'EXTRA_TIME')
    return { label: 'EN VIVO', ...STATUS.live };
  if (locked) return { label: 'BLOQUEADO', ...STATUS.locked };
  return { label: 'PENDIENTE', ...STATUS.pending };
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function MatchCard({
  homeTeam,
  awayTeam,
  score,
  status,
  argTime,
  stage,
  accentColor,
  onPress,
  hideDetailsBtn = false,
  locked = false,
}: MatchCardProps) {
  const isLive = status === 'IN_PLAY' || status === 'PAUSED' || status === 'HALFTIME' || status === 'EXTRA_TIME';
  const isFinished = status === 'FINISHED';
  const showScore = isLive || isFinished || (score?.fullTime?.home !== null && score?.fullTime?.home !== undefined);

  const statusCfg = getStatusConfig(status, locked);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={!onPress}
    >
      {/* ── Card Header ── */}
      <View style={styles.cardHeader}>
        <Text style={styles.stageTxt} numberOfLines={1}>
          {stage?.replace(/_/g, ' ') || 'PARTIDO'}
        </Text>

        {isLive ? (
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, { backgroundColor: STATUS.live.color }]} />
            <Text style={[styles.liveTxt, { color: STATUS.live.color }]}>EN VIVO</Text>
          </View>
        ) : (
          <Text style={styles.timeTxt}>{argTime ? `${argTime} hs` : ''}</Text>
        )}
      </View>

      {/* ── Teams + Scores ── */}
      <View style={styles.teamsSection}>
        <TeamRow
          team={homeTeam}
          score={showScore ? score?.fullTime?.home : undefined}
          accentColor={accentColor}
        />
        <TeamRow
          team={awayTeam}
          score={showScore ? score?.fullTime?.away : undefined}
          accentColor={accentColor}
        />
      </View>

      {/* ── Footer ── */}
      <View style={styles.cardFooter}>
        {/* Status badge */}
        <View style={[styles.badge, { backgroundColor: statusCfg.bg, borderColor: statusCfg.border }]}>
          {isLive && <View style={[styles.liveDotSm, { backgroundColor: statusCfg.color }]} />}
          <Text style={[styles.badgeTxt, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>

        {/* Details btn */}
        {!hideDetailsBtn && onPress && (
          <TouchableOpacity style={styles.detailsBtn} onPress={onPress} activeOpacity={0.7}>
            <Text style={styles.detailsTxt}>VER DETALLES</Text>
            <ChevronRight size={13} color={TEXT.primary} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Sub-component: TeamRow ────────────────────────────────────────────────────
function TeamRow({ team, score, accentColor }: { team?: Team; score?: number | null; accentColor?: string }) {
  return (
    <View style={styles.teamRow}>
      <View style={styles.teamInfo}>
        {team?.crest ? (
          <Image source={{ uri: team.crest }} style={styles.crest} resizeMode="contain" />
        ) : (
          <View style={[styles.crest, styles.crestPlaceholder]} />
        )}
        <Text style={styles.teamName} numberOfLines={1}>
          {team?.shortName || team?.name || '—'}
        </Text>
      </View>

      <Text style={[styles.scoreTxt, score === undefined ? styles.scorePlaceholder : null]}>
        {score !== undefined && score !== null ? score : '·'}
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: BG.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: BORDER.subtle,
    overflow: 'hidden',
    marginBottom: SPACING['2.5'],
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'border-color 0.15s ease, background-color 0.15s ease' } as any : {}),
  },

  // Header
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['3.5'],
    paddingVertical: SPACING['2.5'],
    backgroundColor: BG.elevated,
    borderBottomWidth: 1,
    borderBottomColor: BORDER.subtle,
  },
  stageTxt: {
    ...TYPE.badge,
    color: TEXT.muted,
    flex: 1,
    marginRight: SPACING['2'],
  },
  timeTxt: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: TEXT.muted,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING['1'],
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
  },
  liveTxt: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.black,
    letterSpacing: LETTER_SPACING.wide,
  },

  // Teams
  teamsSection: {
    paddingHorizontal: SPACING['3.5'],
    paddingVertical: SPACING['3'],
    gap: SPACING['2.5'],
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING['2.5'],
  },
  crest: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
  },
  crestPlaceholder: {
    backgroundColor: BG.elevated,
  },
  teamName: {
    ...TYPE.teamName,
    color: TEXT.primary,
    flex: 1,
  },
  scoreTxt: {
    fontSize: FONT_SIZE['2xl'],
    fontWeight: FONT_WEIGHT.black,
    color: TEXT.primary,
    minWidth: 32,
    textAlign: 'center',
    letterSpacing: LETTER_SPACING.tight,
  },
  scorePlaceholder: {
    color: BORDER.strong,
  },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['3.5'],
    paddingVertical: SPACING['3'],
    borderTopWidth: 1,
    borderTopColor: BORDER.subtle,
    backgroundColor: BG.nav,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING['2.5'],
    paddingVertical: SPACING['1'],
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    gap: SPACING['1'],
  },
  liveDotSm: {
    width: 5,
    height: 5,
    borderRadius: RADIUS.full,
  },
  badgeTxt: {
    ...TYPE.badge,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG.hover,
    paddingHorizontal: SPACING['3'],
    paddingVertical: SPACING['1.5'],
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: BORDER.default,
    gap: SPACING['1'],
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  detailsTxt: {
    ...TYPE.badge,
    color: TEXT.primary,
  },
});
