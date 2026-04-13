/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║  VACAS LOCAS MUNDIALISTAS — Design Token: Colors      ║
 * ║  Sistema de paleta Dark Mode Premium               ║
 * ╚═══════════════════════════════════════════════════════╝
 */

// ─── Background Scale ─────────────────────────────────────────────────────────
export const BG = {
  /** Fondo raíz de la app */
  root:    '#09090b',
  /** Fondo de NavBar y BottomBar */
  nav:     '#0d0d0f',
  /** Superficie de cards / contenedores */
  surface: '#111114',
  /** Superficie elevada / headers de cards */
  elevated:'#161619',
  /** Superficie hover */
  hover:   '#1c1c20',
} as const;

// ─── Borders ──────────────────────────────────────────────────────────────────
export const BORDER = {
  subtle:  '#1a1a1e',
  default: '#222227',
  strong:  '#2e2e33',
} as const;

// ─── Text ─────────────────────────────────────────────────────────────────────
export const TEXT = {
  primary:   '#f4f4f5',
  secondary: '#a1a1aa',
  muted:     '#52525b',
  disabled:  '#3f3f46',
} as const;

// ─── Accent por Torneo ────────────────────────────────────────────────────────
export const ACCENT = {
  // Champions League — Oro UEFA
  champions: {
    primary: '#f59e0b',
    glow:    'rgba(245, 158, 11, 0.12)',
    border:  'rgba(245, 158, 11, 0.25)',
  },
  // Copa del Mundo — Tricolor USA/Canadá/México
  mundial: {
    primary: '#ef4444',
    secondary: '#3b82f6',
    tertiary: '#22c55e',
  },
  // Brasileirão — Verde Brazil
  brasileirao: {
    primary: '#22c55e',
    glow:    'rgba(34, 197, 94, 0.12)',
    border:  'rgba(34, 197, 94, 0.25)',
  },
  // Liga Argentina — Azul celeste
  argentina: {
    primary: '#60a5fa',
    glow:    'rgba(96, 165, 250, 0.12)',
    border:  'rgba(96, 165, 250, 0.25)',
  },
  // Libertadores — Dorado sudamericano
  libertadores: {
    primary: '#facc15',
    glow:    'rgba(250, 204, 21, 0.12)',
    border:  'rgba(250, 204, 21, 0.25)',
  },
  // Truco — Verde esmeralda
  truco: {
    primary: '#10b981',
    glow:    'rgba(16, 185, 129, 0.12)',
    border:  'rgba(16, 185, 129, 0.25)',
  },
} as const;

// ─── Status Colors ────────────────────────────────────────────────────────────
export const STATUS = {
  live:     { color: '#4ade80', bg: 'rgba(74, 222, 128, 0.1)',  border: 'rgba(74, 222, 128, 0.2)'  },
  finished: { color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.2)' },
  pending:  { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)',  border: 'rgba(251, 191, 36, 0.2)'  },
  locked:   { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)',  border: 'rgba(99, 102, 241, 0.2)'  },
} as const;

// ─── Rank Colors ──────────────────────────────────────────────────────────────
export const RANK = {
  gold:   { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.07)' },
  silver: { border: '#94a3b8', bg: 'rgba(148, 163, 184, 0.04)' },
  bronze: { border: '#b45309', bg: 'rgba(180, 83, 9, 0.04)'   },
  me:     { border: '#a78bfa', bg: 'rgba(167, 139, 250, 0.05)' },
} as const;
