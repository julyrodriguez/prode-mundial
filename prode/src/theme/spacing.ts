/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║  VACAS LOCAS MUNDIALISTAS — Design Token: Spacing     ║
 * ╚═══════════════════════════════════════════════════════╝
 */

// ─── Spatial Scale (4px base) ─────────────────────────────────────────────────
export const SPACING = {
  /** 2px  */ '0.5': 2,
  /** 4px  */ '1':   4,
  /** 6px  */ '1.5': 6,
  /** 8px  */ '2':   8,
  /** 10px */ '2.5': 10,
  /** 12px */ '3':   12,
  /** 14px */ '3.5': 14,
  /** 16px */ '4':   16,
  /** 20px */ '5':   20,
  /** 24px */ '6':   24,
  /** 32px */ '8':   32,
  /** 40px */ '10':  40,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────
export const RADIUS = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   18,
  full: 9999,
} as const;

// ─── Touch Target mínimo (WCAG / HIG) ────────────────────────────────────────
export const MIN_TOUCH = 44;

// ─── Z-index Scale ────────────────────────────────────────────────────────────
export const Z = {
  base:    0,
  card:    10,
  sticky:  20,
  overlay: 30,
  modal:   50,
  toast:   100,
} as const;
