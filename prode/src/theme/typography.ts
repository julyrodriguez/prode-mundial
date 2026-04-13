/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║  VACAS LOCAS MUNDIALISTAS — Design Token: Typography  ║
 * ╚═══════════════════════════════════════════════════════╝
 *
 * Jerarquía tipográfica con pesos consistentes.
 * Sistema basado en escala modular (base 14px).
 */
import { Platform } from 'react-native';

// ─── Font Family ──────────────────────────────────────────────────────────────
// En web usamos Inter (Google Fonts), en nativo el sistema.
export const FONT_FAMILY = Platform.select({
  web:     "'Inter', 'system-ui', -apple-system, 'Segoe UI', sans-serif",
  default: undefined, // usa la fuente del sistema (San Francisco / Roboto)
});

// ─── Tamaños de fuente ────────────────────────────────────────────────────────
export const FONT_SIZE = {
  /** Etiquetas muy pequeñas, badges */  xs:   10,
  /** Textos auxiliares, counters */     sm:   12,
  /** Texto base de UI */                base: 14,
  /** Nombres de equipo, inputs */       md:   15,
  /** Subtítulos, días */                lg:   16,
  /** Títulos de sección */              xl:   18,
  /** Títulos de pantalla */             '2xl':22,
  /** Scores, rankings */                '3xl':28,
} as const;

// ─── Font Weights (como números para React Native) ───────────────────────────
export const FONT_WEIGHT = {
  regular:    '400' as const,
  medium:     '500' as const,
  semibold:   '600' as const,
  bold:       '700' as const,
  extrabold:  '800' as const,
  black:      '900' as const,
} as const;

// ─── Line Heights ─────────────────────────────────────────────────────────────
export const LINE_HEIGHT = {
  tight:   1.2,
  normal:  1.5,
  relaxed: 1.75,
} as const;

// ─── Letter Spacing ───────────────────────────────────────────────────────────
export const LETTER_SPACING = {
  /** Títulos condensados */   tight:   -0.5,
  normal:  0,
  /** Etiquetas uppercase */   wide:    0.5,
  /** Badges / caps pequeñas */wider:   1.5,
} as const;

// ─── Estilos tipográficos pre-armados ─────────────────────────────────────────
export const TYPE = {
  screenTitle: {
    fontSize:      FONT_SIZE['2xl'],
    fontWeight:    FONT_WEIGHT.black,
    letterSpacing: LETTER_SPACING.tight,
  },
  sectionTitle: {
    fontSize:      FONT_SIZE.xl,
    fontWeight:    FONT_WEIGHT.extrabold,
    letterSpacing: LETTER_SPACING.tight,
  },
  teamName: {
    fontSize:      FONT_SIZE.md,
    fontWeight:    FONT_WEIGHT.bold,
  },
  score: {
    fontSize:      FONT_SIZE['3xl'],
    fontWeight:    FONT_WEIGHT.black,
  },
  badge: {
    fontSize:      FONT_SIZE.xs,
    fontWeight:    FONT_WEIGHT.extrabold,
    letterSpacing: LETTER_SPACING.wide,
  },
  navLabel: {
    fontSize:      FONT_SIZE.xs,
    fontWeight:    FONT_WEIGHT.extrabold,
    letterSpacing: LETTER_SPACING.wide,
  },
  caption: {
    fontSize:      FONT_SIZE.sm,
    fontWeight:    FONT_WEIGHT.bold,
    letterSpacing: LETTER_SPACING.wide,
  },
} as const;
