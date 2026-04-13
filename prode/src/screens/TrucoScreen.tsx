// src/screens/TrucoScreen.tsx — Pantalla principal del Truco Argentino
// Contiene el tablero de juego, cartas, botones de canto y marcador

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, Alert, useWindowDimensions, ScrollView, Animated, TextInput,
} from 'react-native';
import { auth, db } from '../lib/firebase';
import { collection, doc, query, where, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { usePartidaTruco, iniciarPartidaTruco, responderDesafioTruco, CartaTruco, AccionTruco } from '../lib/truco';
import TrucoHistorialTable from '../components/TrucoHistorialTable';
import HistorialPublico from '../components/HistorialPublico';
import { useNavigation } from '@react-navigation/native';
import { Settings, Gamepad2, Trophy } from 'lucide-react-native';
import { BG, BORDER } from '../theme/colors';
import { ACCENT } from '../theme/colors';
import TournamentScreenShell, { TournamentTab } from '../components/TournamentScreenShell';

// ─── Tipos del sistema optimizado ──────────────────────────────────────────────
interface TrucoPlayer {
  uid: string;
  name: string;
  ganadas: number;
  perdidas: number;
  lastSeen?: any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE RENDERIZADO DE CARTAS
// ═══════════════════════════════════════════════════════════════════════════════

const PALO_EMOJI: Record<string, string> = {
  espada: '🗡️',
  basto: '🏏',
  copa: '🏆',
  oro: '🪙',
  dorso: '🂠',
};

const PALO_COLOR: Record<string, string> = {
  espada: '#60a5fa',
  basto: '#4ade80',
  copa: '#f87171',
  oro: '#fbbf24',
  dorso: '#555',
};

const NUMERO_LABEL: Record<number, string> = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  10: '10', 11: '11', 12: '12', 0: '?',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════════

/** Carta visual */
function CartaVisual({
  carta, onPress, disabled, bocaAbajo, enMesa, small,
}: {
  carta: CartaTruco;
  onPress?: () => void;
  disabled?: boolean;
  bocaAbajo?: boolean;
  enMesa?: boolean;
  small?: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isOculta = bocaAbajo || (carta.palo as string) === 'dorso';
  const w = small ? 48 : 72;
  const h = small ? 72 : 108;

  const handlePressIn = () => {
    if (!disabled && !isOculta) {
      Animated.spring(scaleAnim, { toValue: 1.08, useNativeDriver: true, speed: 30 }).start();
    }
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  if (isOculta) {
    return (
      <View style={[s.carta, s.cartaDorso, { width: w, height: h }, enMesa && s.cartaEnMesa]}>
        <Text style={{ fontSize: small ? 20 : 28 }}>🂠</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          s.carta, { width: w, height: h, transform: [{ scale: scaleAnim }] },
          enMesa && s.cartaEnMesa,
          disabled && { opacity: 0.5 },
        ]}
      >
        <Text style={[s.cartaNumero, { color: PALO_COLOR[carta.palo], fontSize: small ? 16 : 22 }]}>
          {NUMERO_LABEL[carta.numero] || carta.numero}
        </Text>
        <Text style={{ fontSize: small ? 18 : 28, marginTop: 2 }}>
          {PALO_EMOJI[carta.palo]}
        </Text>
        <Text style={[s.cartaPaloLabel, { color: PALO_COLOR[carta.palo], fontSize: small ? 8 : 10 }]}>
          {carta.palo.toUpperCase()}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

/** Marcador de puntos estilo fósforo */
function Marcador({ puntos, nombre, esYo, activo }: {
  puntos: number; nombre: string; esYo: boolean; activo: boolean;
}) {
  return (
    <View style={[s.marcador, activo && s.marcadorActivo, esYo && { borderColor: '#22c55e' }]}>
      <Text style={[s.marcadorNombre, esYo && { color: '#22c55e' }]}>
        {esYo ? '🧑 VOS' : `👤 ${nombre}`}
      </Text>
      <Text style={s.marcadorPuntos}>{puntos}</Text>
      <Text style={s.marcadorLabel}>/ 30</Text>
    </View>
  );
}

/** Botón de acción del juego */
function BotonAccion({ label, onPress, color, disabled, pulsing }: {
  label: string; onPress: () => void; color: string; disabled?: boolean; pulsing?: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pulsing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pulsing]);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        s.botonAccionOuter,
        { borderColor: color },
        disabled && { opacity: 0.3 },
      ]}
    >
      <Animated.View
        style={[
          s.botonAccionInner,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        <Text style={[s.botonAccionTxt, { color }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOBBY OPTIMIZADO: 1 LECTURA TOTAL (DOCUMENTO ÚNICO)
// ═══════════════════════════════════════════════════════════════════════════════

interface DesafioEntrante {
  partidaId: string;
  retadorUid: string;
  retadorNombre: string;
}

function TrucoLobby({
  players,
  onPartidaCreada,
  onOpenSettings,
}: {
  players: { [uid: string]: TrucoPlayer };
  onPartidaCreada: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const [creando, setCreando] = useState<string | null>(null);
  const [desafio, setDesafio] = useState<DesafioEntrante | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const miUid = auth.currentUser?.uid || '';
  const { width } = useWindowDimensions();

  // ─── Responsive Grid Calc ──────────────────────────────────────────────────
  // Container pad = 12 * 2 = 24. Gap = 12. Try to fit cards ~140px.
  const paddingH = 24;
  const gap = 12;
  const availableWidth = width - paddingH;
  const cols = Math.max(2, Math.floor((availableWidth + gap) / (140 + gap)));
  const cardWidth = (availableWidth - (cols - 1) * gap) / cols;

  // Lista de TODOS los jugadores, yo primero, luego ordenados por victorias desc
  const miCard = players[miUid];
  const otrosJugadores = Object.values(players)
    .filter(p => p.uid !== miUid)
    .sort((a, b) => b.ganadas - a.ganadas);
  const todosLoJugadores = miCard ? [miCard, ...otrosJugadores] : otrosJugadores;

  // Animación del modal de desafío
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (desafio) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ])).start();
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0);
    }
  }, [desafio]);

  // ─── Escuchar desafíos entrantes ─────────────────────────────────────────
  useEffect(() => {
    if (!miUid) return;
    const q = query(
      collection(db, 'truco_partidas'),
      where('jugadorB', '==', miUid),
      where('estado', '==', 'PENDIENTE_ACEPTACION')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) { setDesafio(null); return; }
      const docSnap = snapshot.docs[0];
      const data = docSnap.data();
      const retadorUid = data.jugadorA;
      const retadorNombre = data.jugadores?.[retadorUid]?.nombre || players[retadorUid]?.name || 'Alguien';
      setDesafio({ partidaId: docSnap.id, retadorUid, retadorNombre });
    }, (err) => console.error('[TrucoLobby] Error escuchando desafíos:', err));
    return () => unsub();
  }, [miUid]);

  // ─── Acciones ─────────────────────────────────────────────────────────────
  const handleCrear = async (rivalUid: string) => {
    setCreando(rivalUid);
    try {
      const { partidaId } = await iniciarPartidaTruco(rivalUid);
      onPartidaCreada(partidaId);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setCreando(null); }
  };

  const handleAceptar = async () => {
    if (!desafio) return;
    setAceptando(true);
    try {
      await responderDesafioTruco(desafio.partidaId, true);
      onPartidaCreada(desafio.partidaId);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Error al aceptar: ${err.message}`);
      else Alert.alert('Error', err.message);
    } finally { setAceptando(false); }
  };

  const handleRechazar = async () => {
    if (!desafio) return;
    setRechazando(true);
    try {
      await responderDesafioTruco(desafio.partidaId, false);
      setDesafio(null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setRechazando(false); }
  };

  const borderColorAnim = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#22c55e', '#4ade80'],
  });

  return (
    <View style={{ flex: 1, backgroundColor: BG.root }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: BG.root }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40, backgroundColor: BG.root }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header con engranaje */}
        <View style={s.lobbyHeader}>
          <TouchableOpacity style={s.settingsBtn} onPress={onOpenSettings}>
            <Settings size={18} color="#555" />
          </TouchableOpacity>
          <Text style={s.lobbyEmoji}>🃏</Text>
          <View style={s.instruccionBox}>
            <Text style={s.instruccionTxt}>
              Para jugar, vos y tu contrincante deben estar mirando esta pestaña.
            </Text>
          </View>
        </View>

        {/* Grid de jugadores (yo + rivales) */}
        <View style={s.lobbyGrid}>
          {otrosJugadores.length === 0 && !miCard ? (
            <View style={s.emptyRivales}>
              <Text style={s.emptyRivalesTxt}>Ningún jugador registrado todavía.</Text>
              <Text style={s.emptyRivalesSubtxt}>¡Sé el primero en elegir tu alias!</Text>
            </View>
          ) : (
            todosLoJugadores.map((u) => {
              const esSelf = u.uid === miUid;
              const total = u.ganadas + u.perdidas;
              const winRate = total > 0 ? Math.round((u.ganadas / total) * 100) : 0;
              return (
                <TouchableOpacity
                  key={u.uid}
                  style={[
                    s.lobbyCard,
                    esSelf && s.miCard,
                    { width: cardWidth }
                  ]}
                  onPress={() => !esSelf && handleCrear(u.uid)}
                  disabled={esSelf || !!creando}
                  activeOpacity={esSelf ? 1 : 0.7}
                >
                  {esSelf && (
                    <View style={s.selfBadge}>
                      <Text style={s.selfBadgeTxt}>VOS</Text>
                    </View>
                  )}
                  <Text style={s.lobbyCardAvatar}>{esSelf ? '🧑' : '🃏'}</Text>
                  <Text style={[s.lobbyCardName, esSelf && { color: '#22c55e' }]}>{u.name}</Text>

                  {/* Stats V/D y winrate */}
                  <View style={s.cardStatsRow}>
                    <Text style={s.cardStatsVD}>
                      <Text style={{ color: '#22c55e' }}>{u.ganadas}V</Text>
                      <Text style={{ color: '#555' }}> / </Text>
                      <Text style={{ color: '#f87171' }}>{u.perdidas}D</Text>
                    </Text>
                  </View>
                  <Text style={[
                    s.cardWinRate,
                    winRate >= 60 ? { color: '#22c55e' } :
                    winRate >= 40 ? { color: '#fbbf24' } :
                    { color: '#f87171' }
                  ]}>
                    {total > 0 ? `${winRate}% victorias` : 'Sin partidas'}
                  </Text>

                  {esSelf ? (
                    <Text style={s.selfLabel}>TU PERFIL ★</Text>
                  ) : creando === u.uid ? (
                    <ActivityIndicator size="small" color="#22c55e" style={{ marginTop: 4 }} />
                  ) : (
                    <Text style={s.lobbyCardAction}>DESAFIAR ⚔️</Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Historial personal debajo */}
        <View style={{ marginTop: 32 }}>
          <TrucoHistorialTable />
        </View>
      </ScrollView>

      {/* Modal de desafío entrante */}
      {desafio && (
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalCard, { borderColor: borderColorAnim }]}>
            <Animated.Text style={[s.modalEmoji, { transform: [{ scale: pulseAnim }] }]}>
              ⚔️
            </Animated.Text>
            <Text style={s.modalTitle}>¡TE HAN DESAFIADO!</Text>
            <View style={s.modalRetadorContainer}>
              <Text style={s.modalRetadorLabel}>Desafío de</Text>
              <Text style={s.modalRetadorNombre}>{desafio.retadorNombre}</Text>
            </View>
            <Text style={s.modalSubtitle}>¿Aceptás el duelo de Truco 1 vs 1?</Text>
            <View style={s.modalCartasRow}>
              <Text style={{ fontSize: 32 }}>🗡️</Text>
              <Text style={{ fontSize: 32 }}>🃏</Text>
              <Text style={{ fontSize: 32 }}>🏏</Text>
            </View>
            <View style={s.modalBotones}>
              <TouchableOpacity
                style={[s.modalBtnAceptar, aceptando && { opacity: 0.7 }]}
                onPress={handleAceptar}
                activeOpacity={0.8}
                disabled={aceptando || rechazando}
              >
                {aceptando ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={s.modalBtnAceptarTxt}>✅ ACEPTAR DESAFÍO</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalBtnRechazar}
                onPress={handleRechazar}
                disabled={rechazando}
                activeOpacity={0.8}
              >
                {rechazando ? (
                  <ActivityIndicator size="small" color="#f87171" />
                ) : (
                  <Text style={s.modalBtnRechazarTxt}>❌ RECHAZAR</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLERO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export function TableroTruco({ partidaId, onVolver }: { partidaId: string; onVolver: () => void }) {
  const {
    partida, loading, error, actionLoading,
    miUid, oponenteUid, esMiTurno, deboResponder, miMano,
    misPuntos, puntosOponente,
    puedeEnvido, puedeTruco, puedeReTruco, puedeValeCuatro,
    puedeReplicarEnvido, puedeReplicarRealEnvido, puedeReplicarFaltaEnvido,
    puedeReplicarReTruco, puedeReplicarValeCuatro,
    tirarCarta, cantarEnvido, cantarRealEnvido, cantarFaltaEnvido,
    cantarTruco, cantarReTruco, cantarValeCuatro,
    quiero, noQuiero, irseAlMazo, abandonarPartida, ejecutarAccion,
  } = usePartidaTruco(partidaId);

  const { width } = useWindowDimensions();
  const isMobile = width < 700;
  const [mensaje, setMensaje] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [bazaVisual, setBazaVisual] = useState<any>(null);
  useEffect(() => {
    // Creamos una variable "as any" para que TypeScript nos deje leer lo que queramos
    const partidaCualquiera = partida as any;

    // Si el backend escribió un nuevo mensaje, lo mostramos en el Toast
    if (partidaCualquiera?.ultimoMensaje?.id) {
      const msgTexto = partidaCualquiera.ultimoMensaje.texto;

      setMensaje(msgTexto);
      fadeAnim.setValue(1);
      Animated.sequence([
        Animated.delay(5000), // ⏳ Se queda fijo por 5 segundos (cambialo a tu gusto)
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 1000, // 💨 Tarda 1 segundo en desvanecerse
          useNativeDriver: true
        })
      ]).start();
    }
  }, [(partida as any)?.ultimoMensaje?.id]);

  useEffect(() => {
    // Si el backend nos manda una nueva "última baza", la mostramos 3 segundos
    if (partida?.ultimaBaza?.id) {
      setBazaVisual(partida.ultimaBaza);
      const timer = setTimeout(() => {
        setBazaVisual(null);
      }, 3000); // 3000ms = 3 segundos
      return () => clearTimeout(timer);
    }
  }, [partida?.ultimaBaza?.id]);
  // ─── Animación de pulso para indicador de turno ──────────────────────────
  const turnPulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (esMiTurno && partida?.estado === 'EN_CURSO') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(turnPulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(turnPulseAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
        ])
      ).start();
    } else {
      turnPulseAnim.setValue(0);
    }
  }, [esMiTurno, partida?.estado]);

  // ─── Temporizador AFK de 30 segundos ────────────────────────────────────
  const AFK_SECONDS = 30;
  const [countdown, setCountdown] = useState(AFK_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnoKey = partida ? `${partida.ronda.numero}-${partida.ronda.turno}-${partida.cantos.esperandoRespuesta}-${partida.cantos.respondePor}` : '';

  useEffect(() => {
    // Reset countdown when turn changes
    setCountdown(AFK_SECONDS);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (partida?.estado === 'EN_CURSO') {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [turnoKey, partida?.estado]);

  // Auto-disparar TIEMPO_AGOTADO cuando llega a 0 y es mi turno
  // ─── Auto-disparar TIEMPO_AGOTADO cuando llega a 0 ───
  const afkFired = useRef(false);

  useEffect(() => {
    // Reset flag on turn change
    afkFired.current = false;
  }, [turnoKey]);

  useEffect(() => {
    const esActivo = esMiTurno || deboResponder;

    if (countdown === 0 && esActivo && !afkFired.current && !actionLoading && partida?.estado === 'EN_CURSO') {

      // EL ARREGLO: Agregamos 500ms de gracia.
      // Si el reloj llegó a 0 justo cuando se apretaba un botón,
      // la limpieza del useEffect va a frenar este setTimeout antes de que actúe.
      const graceTimer = setTimeout(() => {
        afkFired.current = true;
        ejecutarAccion('TIEMPO_AGOTADO').catch(() => { });
      }, 500);

      // Si el estado cambia en esa fracción de segundo, el castigo se cancela
      return () => clearTimeout(graceTimer);
    }
  }, [countdown, esMiTurno, deboResponder, actionLoading, partida?.estado]);
  // ─── Cooldown de 2 segundos al cambiar de turno ──────────────────────────
  const [isCooldown, setIsCooldown] = useState(false);
  useEffect(() => {
    if (!turnoKey || partida?.estado !== 'EN_CURSO') return;
    setIsCooldown(true);
    const timer = setTimeout(() => setIsCooldown(false), 2000);
    return () => clearTimeout(timer);
  }, [turnoKey]);

  // Flag global de "botones deshabilitados"
  const botonesDeshabilitados = actionLoading || isCooldown || bazaVisual !== null;
  // Toast de mensajes
  // Toast de mensajes
  const showToast = (msg: string) => {
    setMensaje(msg);
    fadeAnim.setValue(1);

    // Se queda visible al 100% por 4 segundos, y luego tarda 1.5 segundos en desaparecer
    Animated.sequence([
      Animated.delay(4000),
      Animated.timing(fadeAnim, { toValue: 0, duration: 3500, useNativeDriver: true })
    ]).start();
  };

  const handleAccion = async (fn: () => Promise<any>) => {
    if (botonesDeshabilitados) return; // Guard extra contra doble-click
    try {
      const res = await fn();
      if (res?.mensaje) showToast(res.mensaje);
    } catch (err: any) {
      showToast(`❌ ${err.message}`);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={{ color: '#666', marginTop: 12 }}>Cargando partida...</Text>
      </View>
    );
  }

  if (error || !partida) {
    return (
      <View style={s.center}>
        <Text style={{ color: '#f87171', fontSize: 16 }}>❌ {error || 'Partida no encontrada'}</Text>
        <TouchableOpacity style={s.volverBtn} onPress={onVolver}>
          <Text style={s.volverBtnTxt}>← Volver al Lobby</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Esperando que el rival acepte ─────────────────────────────────────
  if (partida.estado === 'PENDIENTE_ACEPTACION') {
    const oponenteNombre = partida.jugadores[
      partida.jugadorA === miUid ? partida.jugadorB : partida.jugadorA
    ]?.nombre || 'tu rival';

    return (
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⏳</Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 8 }}>
          Esperando a {oponenteNombre}...
        </Text>
        <Text style={{ color: '#666', fontSize: 14, fontWeight: '500', textAlign: 'center', marginBottom: 24 }}>
          El desafío fue enviado. Cuando acepte, la partida arranca automáticamente.
        </Text>
        <ActivityIndicator size="large" color="#22c55e" />
        <TouchableOpacity style={[s.volverBtn, { marginTop: 32 }]} onPress={onVolver}>
          <Text style={s.volverBtnTxt}>← Cancelar y volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── El rival rechazó el desafío ───────────────────────────────────────
  if (partida.estado === 'RECHAZADA') {
    const oponenteNombre = partida.jugadores[
      partida.jugadorA === miUid ? partida.jugadorB : partida.jugadorA
    ]?.nombre || 'Tu rival';

    return (
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>😤</Text>
        <Text style={{ color: '#f87171', fontSize: 20, fontWeight: '900', marginBottom: 8 }}>
          ¡Desafío rechazado!
        </Text>
        <Text style={{ color: '#666', fontSize: 14, fontWeight: '500', textAlign: 'center', marginBottom: 24 }}>
          {oponenteNombre} no quiso jugar. Probá con otro rival.
        </Text>
        <TouchableOpacity style={s.volverBtn} onPress={onVolver}>
          <Text style={s.volverBtnTxt}>🃏 Volver al Lobby</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const miInfo = partida.jugadores[miUid];
  const oponenteInfo = partida.jugadores[oponenteUid];
  const esCancelada = partida.estado === 'CANCELADA';
  const esFinalizada = partida.estado === 'FINALIZADA' || partida.estado === 'ABANDONADA' || esCancelada;
  const gane = partida.ganador === miUid;

  const oponenteMano = oponenteInfo?.mano || [];
  // 2. MODIFICAR QUÉ CARTAS SE DIBUJAN EN LA MESA
  let cartasEnMesaMia = partida.ronda.cartasEnMesa[miUid];
  let cartasEnMesaOponente = partida.ronda.cartasEnMesa[oponenteUid];

  // Si estamos en la pausa de 3 segundos, forzamos a mostrar las cartas "fantasma"
  if (bazaVisual) {
    cartasEnMesaMia = miUid === partida.jugadorA ? bazaVisual.cartaA : bazaVisual.cartaB;
    cartasEnMesaOponente = miUid === partida.jugadorA ? bazaVisual.cartaB : bazaVisual.cartaA;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#000' }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 40, backgroundColor: '#000' }}
    >      {/* ─── Header ─── */}
      <View style={s.tableroHeader}>
        <TouchableOpacity onPress={() => {
          if (!esFinalizada && partida.estado === 'EN_CURSO') {
            const msg = '¿Estás seguro de que querés abandonar? No vas a poder volver a entrar.';
            if (Platform.OS === 'web') {
              if (window.confirm(msg)) {
                abandonarPartida().then(() => onVolver()).catch(() => onVolver());
              }
            } else {
              Alert.alert('Abandonar partida', msg, [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Sí, abandonar',
                  style: 'destructive',
                  onPress: () => {
                    abandonarPartida()
                      .then(() => onVolver())
                      .catch(() => onVolver());
                  },
                },
              ]);
            }
          } else {
            onVolver();
          }
        }}>
          <Text style={s.volverLink}>← Lobby</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.tableroRonda}>Ronda {partida.ronda.numero}</Text>
          <View style={[s.estadoBadge, esFinalizada ? s.estadoFin : s.estadoEnCurso]}>
            <Text style={s.estadoTxt}>{esFinalizada ? (esCancelada ? 'CANCELADA' : 'FINALIZADA') : 'EN CURSO'}</Text>
          </View>
        </View>
      </View>

      {/* ─── Marcadores ─── */}
      <View style={s.marcadores}>
        <Marcador
          puntos={misPuntos}
          nombre={miInfo?.nombre || ''}
          esYo={true}
          activo={esMiTurno}
        />
        <View style={s.vsContainer}>
          <Text style={s.vsText}>VS</Text>
          <Text style={s.puntosEnJuego}>
            {partida.cantos.truco.puntosEnJuego} pt{partida.cantos.truco.puntosEnJuego > 1 ? 's' : ''}
          </Text>
        </View>
        <Marcador
          puntos={puntosOponente}
          nombre={oponenteInfo?.nombre || ''}
          esYo={false}
          activo={!esMiTurno && !esFinalizada}
        />
      </View>

      {/* ─── Pantalla de fin ─── */}
      {esFinalizada && (
        <View style={[s.finContainer, esCancelada ? s.finCancelado : (gane ? s.finGane : s.finPerdi)]}>
          <Text style={s.finEmoji}>{esCancelada ? '🤷‍♂️' : (gane ? '🏆' : '😢')}</Text>
          <Text style={s.finTitle}>
            {esCancelada
              ? 'Partida Cancelada'
              : (gane ? '¡GANASTE!' : 'Perdiste...')}
          </Text>
          {esCancelada && (
            <Text style={{ textAlign: 'center', color: '#fff', marginBottom: 16 }}>
              Alguien abandonó o se desconectó antes de los 15 puntos.
            </Text>
          )}
          {!esCancelada && (
            <Text style={s.finScore}>{misPuntos} - {puntosOponente}</Text>
          )}
          <TouchableOpacity style={s.volverBtn} onPress={onVolver}>
            <Text style={s.volverBtnTxt}>🃏 Volver al Lobby</Text>
          </TouchableOpacity>
        </View>
      )}

      {!esFinalizada && (
        <>
          {/* ─── Zona Oponente (cartas boca abajo) ─── */}
          <View style={s.zonaOponente}>
            <Text style={s.zonaLabel}>👤 {oponenteInfo?.nombre || 'Oponente'}</Text>
            <View style={s.manoRow}>
              {oponenteMano.map((_: CartaTruco, i: number) => (
                <CartaVisual key={i} carta={_} bocaAbajo disabled />
              ))}
            </View>
          </View>

          {/* ─── Mesa (cartas jugadas) ─── */}
          <View style={s.mesa}>
            <Text style={s.mesaLabel}>🎯 MESA</Text>
            <View style={s.mesaRow}>
              {cartasEnMesaOponente ? (
                <CartaVisual carta={cartasEnMesaOponente} enMesa disabled />
              ) : (
                <View style={[s.cartaPlaceholder]} />
              )}
              <View style={{ width: 24 }} />
              {cartasEnMesaMia ? (
                <CartaVisual carta={cartasEnMesaMia} enMesa disabled />
              ) : (
                <View style={[s.cartaPlaceholder]} />
              )}
            </View>

            {/* Bazas historial */}
            {partida.ronda.bazas.length > 0 && (
              <View style={[s.bazasContainer, { marginTop: 16, width: '100%' }]}>
                <Text style={[s.mesaLabel, { marginBottom: 8, fontSize: 12 }]}>BAZAS ANTERIORES</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                  {partida.ronda.bazas.map((baza, i) => {
                    const cartaMia = miUid === partida.jugadorA ? baza.cartaA : baza.cartaB;
                    const cartaOp = miUid === partida.jugadorA ? baza.cartaB : baza.cartaA;
                    const esMiaGanador = baza.ganador === miUid;
                    return (
                      <View key={i} style={{ alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 12 }}>
                        <Text style={{ color: '#aaa', fontSize: 10, marginBottom: 4 }}>
                          BAZA {i + 1} {baza.ganador === 'PARDA' ? '🤝' : (esMiaGanador ? '👑' : '❌')}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <CartaVisual carta={cartaOp} small disabled />
                          <CartaVisual carta={cartaMia} small disabled />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* ─── Mi Mano (con indicador visual de turno) ─── */}
          <Animated.View style={[
            s.zonaMia,
            esMiTurno && {
              borderWidth: 2,
              borderRadius: 20,
              borderColor: turnPulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(34,197,94,0.3)', 'rgba(34,197,94,0.9)'],
              }),
              backgroundColor: turnPulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(34,197,94,0.02)', 'rgba(34,197,94,0.08)'],
              }),
            },
          ]}>
            {esMiTurno && (
              <View style={s.turnoGrandeContainer}>
                <Text style={s.turnoGrandeTxt}>🟢 ¡TIRÁ CARTA O CANTÁ!</Text>
                <Text style={[
                  s.turnoCountdown,
                  countdown <= 10 && { color: '#f87171' },
                  countdown <= 5 && { fontSize: 24 },
                ]}>
                  ⏱ {countdown}s
                </Text>
              </View>
            )}
            <Text style={s.zonaLabel}>🧑 Tu mano {esMiTurno ? '(TU TURNO)' : ''}</Text>
            <View style={s.manoRow}>
              {miMano.map((carta: CartaTruco) => (
                <CartaVisual
                  key={carta.id}
                  carta={carta}
                  onPress={() => handleAccion(() => tirarCarta(carta.id))}
                  disabled={!esMiTurno || partida.cantos.esperandoRespuesta || botonesDeshabilitados}
                />
              ))}
            </View>
          </Animated.View>

          {/* ─── Indicador de turno / canto pendiente ─── */}
          <View style={s.turnoIndicator}>
            {partida.cantos.esperandoRespuesta ? (
              <View style={s.cantoPendiente}>
                <Text style={s.cantoPendienteEmoji}>
                  {['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'].includes(partida.cantos.cantoActivo || '')
                    ? '🎯' : '⚡'}
                </Text>
                <Text style={s.cantoPendienteTxt}>
                  {partida.jugadores[partida.cantos.cantadoPor || '']?.nombre} cantó{' '}
                  <Text style={{ fontWeight: '900', color: '#fbbf24' }}>
                    {(partida.cantos.cantoActivo || '').replace(/_/g, ' ')}
                  </Text>
                </Text>
                {deboResponder && (
                  <Text style={[
                    s.turnoCountdown,
                    { marginLeft: 8 },
                    countdown <= 10 && { color: '#f87171' },
                  ]}>
                    ⏱ {countdown}s
                  </Text>
                )}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.turnoTxt, esMiTurno && { color: '#22c55e' }]}>
                  {esMiTurno ? '🟢 Es tu turno — Tirá una carta o cantá' : `⏳ Esperando a ${oponenteInfo?.nombre}...`}
                </Text>
                <Text style={[
                  s.turnoCountdown,
                  countdown <= 10 && { color: '#f87171' },
                ]}>
                  ⏱ {countdown}s
                </Text>
              </View>
            )}
          </View>

          {/* ─── Botones de Acción ─── */}
          <View style={s.accionesContainer}>
            {/* Responder cantos */}
            {deboResponder && (
              <>
                <View style={s.accionRow}>
                  <BotonAccion label="✅ QUIERO" onPress={() => handleAccion(quiero)} color="#22c55e" disabled={botonesDeshabilitados} pulsing />
                  <BotonAccion label="❌ NO QUIERO" onPress={() => handleAccion(noQuiero)} color="#f87171" disabled={botonesDeshabilitados} pulsing />
                </View>
                {/* Escalada de Envido (recantar como respuesta) */}
                {(puedeReplicarEnvido || puedeReplicarRealEnvido || puedeReplicarFaltaEnvido) && (
                  <View style={s.accionRow}>
                    {puedeReplicarEnvido && (
                      <BotonAccion
                        label="🎯 ENVIDO"
                        onPress={() => handleAccion(cantarEnvido)}
                        color="#3b82f6"
                        disabled={botonesDeshabilitados}
                        pulsing
                      />
                    )}
                    {puedeReplicarRealEnvido && (
                      <BotonAccion
                        label="🎯 REAL ENVIDO"
                        onPress={() => handleAccion(cantarRealEnvido)}
                        color="#6366f1"
                        disabled={botonesDeshabilitados}
                        pulsing
                      />
                    )}
                    {puedeReplicarFaltaEnvido && (
                      <BotonAccion
                        label="🎯 FALTA ENVIDO"
                        onPress={() => handleAccion(cantarFaltaEnvido)}
                        color="#8b5cf6"
                        disabled={botonesDeshabilitados}
                        pulsing
                      />
                    )}
                  </View>
                )}
                {/* Escalada de Truco (recantar como respuesta) */}
                {(puedeReplicarReTruco || puedeReplicarValeCuatro) && (
                  <View style={s.accionRow}>
                    {puedeReplicarReTruco && (
                      <BotonAccion
                        label="⚡ RE TRUCO"
                        onPress={() => handleAccion(cantarReTruco)}
                        color="#f97316"
                        disabled={botonesDeshabilitados}
                        pulsing
                      />
                    )}
                    {puedeReplicarValeCuatro && (
                      <BotonAccion
                        label="⚡ VALE 4"
                        onPress={() => handleAccion(cantarValeCuatro)}
                        color="#ef4444"
                        disabled={botonesDeshabilitados}
                        pulsing
                      />
                    )}
                  </View>
                )}
              </>
            )}

            {/* Cantos de Envido */}
            <View style={s.accionRow}>
              <BotonAccion
                label="🎯 ENVIDO"
                onPress={() => handleAccion(cantarEnvido)}
                color="#3b82f6"
                disabled={!puedeEnvido || botonesDeshabilitados}
              />
              <BotonAccion
                label="🎯 REAL ENVIDO"
                onPress={() => handleAccion(cantarRealEnvido)}
                color="#6366f1"
                disabled={!puedeEnvido || botonesDeshabilitados}
              />
              <BotonAccion
                label="🎯 FALTA ENVIDO"
                onPress={() => handleAccion(cantarFaltaEnvido)}
                color="#8b5cf6"
                disabled={!puedeEnvido || botonesDeshabilitados}
              />
            </View>

            {/* Cantos de Truco */}
            <View style={s.accionRow}>
              <BotonAccion
                label="⚡ TRUCO"
                onPress={() => handleAccion(cantarTruco)}
                color="#f59e0b"
                disabled={!puedeTruco || botonesDeshabilitados}
              />
              <BotonAccion
                label="⚡ RE TRUCO"
                onPress={() => handleAccion(cantarReTruco)}
                color="#f97316"
                disabled={!puedeReTruco || botonesDeshabilitados}
              />
              <BotonAccion
                label="⚡ VALE 4"
                onPress={() => handleAccion(cantarValeCuatro)}
                color="#ef4444"
                disabled={!puedeValeCuatro || botonesDeshabilitados}
              />
            </View>

            {/* Mazo */}
            <View style={s.accionRow}>
              <BotonAccion
                label="🏳️ MAZO"
                onPress={() => {
                  const msg = '¿Seguro que querés rendirte en esta ronda?';
                  if (Platform.OS === 'web') {
                    if (window.confirm(msg)) {
                      handleAccion(irseAlMazo);
                    }
                  } else {
                    Alert.alert('Irse al Mazo', msg, [
                      { text: 'No', style: 'cancel' },
                      { text: 'Sí, me rindo', onPress: () => handleAccion(irseAlMazo), style: 'destructive' },
                    ]);
                  }
                }}
                color="#6b7280"
                disabled={botonesDeshabilitados}
              />
            </View>
          </View>
        </>
      )}

      {/* ─── Toast ─── */}
      {mensaje ? (
        <Animated.View style={[s.toast, { opacity: fadeAnim }]} pointerEvents="none">
          <Text style={s.toastTxt}>{mensaje}</Text>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE RAÍZ: Onboarding + Lobby + Historial
// ═══════════════════════════════════════════════════════════════════════════════

export default function TrucoScreen() {
  const [partidaId, setPartidaId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'juego' | 'historial'>('juego');

  // ─── Estado del sistema de jugadores ───────────────────────────────────────
  const [players, setPlayers] = useState<{ [uid: string]: TrucoPlayer }>({});
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);

  // ─── Estado del onboarding / settings ──────────────────────────────────────
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);
  const [isEditingAlias, setIsEditingAlias] = useState(false); // false = onboarding, true = editar

  const miUid = auth.currentUser?.uid || '';
  const navigation = useNavigation<any>();

  // ─── 1 LECTURA: Documento único truco_system/players ───────────────────────
  useEffect(() => {
    if (!miUid) return;
    const ref = doc(db, 'truco_system', 'players');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { players: { [uid: string]: TrucoPlayer } };
        const allPlayers = data.players || {};
        setPlayers(allPlayers);
        if (allPlayers[miUid]) {
          setIsRegistered(true);
          setShowAliasModal(false);
        } else {
          setIsRegistered(false);
          setShowAliasModal(true);
          setIsEditingAlias(false);
        }
      } else {
        // Doc no existe aún, primer jugador en registrarse
        setPlayers({});
        setIsRegistered(false);
        setShowAliasModal(true);
        setIsEditingAlias(false);
      }
      setLoadingPlayers(false);
    }, (err) => {
      console.error('[TrucoScreen] Error cargando players:', err);
      setLoadingPlayers(false);
    });
    return () => unsub();
  }, [miUid]);

  // ─── Guardar alias (onboarding o edición) ──────────────────────────────────
  const handleGuardarAlias = async () => {
    const trimmed = aliasInput.trim();
    if (trimmed.length < 2) {
      Alert.alert('Alias inválido', 'El alias debe tener al menos 2 caracteres.');
      return;
    }
    if (trimmed.length > 16) {
      Alert.alert('Alias inválido', 'El alias no puede tener más de 16 caracteres.');
      return;
    }
    setSavingAlias(true);
    try {
      const existing = players[miUid];
      const playerData: TrucoPlayer = {
        uid: miUid,
        name: trimmed,
        ganadas: existing?.ganadas ?? 0,
        perdidas: existing?.perdidas ?? 0,
        lastSeen: serverTimestamp(),
      };
      await setDoc(
        doc(db, 'truco_system', 'players'),
        { players: { [miUid]: playerData } },
        { merge: true }
      );
      setShowAliasModal(false);
      setAliasInput('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingAlias(false);
    }
  };

  const handleOpenSettings = () => {
    setAliasInput(players[miUid]?.name || '');
    setIsEditingAlias(true);
    setShowAliasModal(true);
  };

  // ─── Si está en partida, mostrar tablero ───────────────────────────────────
  if (partidaId) {
    return <TableroTruco partidaId={partidaId} onVolver={() => setPartidaId(null)} />;
  }

  if (loadingPlayers) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={{ color: '#555', marginTop: 12, fontSize: 12 }}>Cargando jugadores...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG.root }}>

      {/* ═══ MODAL DE ALIAS (Onboarding o Edición) ════════════════════════════ */}
      {showAliasModal && (
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { borderColor: '#fbbf24', paddingHorizontal: 28, paddingVertical: 36 }]}>
            <Text style={{ fontSize: 56, marginBottom: 8 }}>
              {isEditingAlias ? '⚙️' : '🃏'}
            </Text>
            <Text style={s.modalTitle}>
              {isEditingAlias ? 'CAMBIAR ALIAS' : '¡BIENVENIDO AL TRUCO!'}
            </Text>
            <Text style={s.modalSubtitle}>
              {isEditingAlias
                ? 'Escribí tu nuevo nombre de batalla.'
                : 'Es tu primera vez. Elegí un alias para que tus rivales te reconozcan.'}
            </Text>

            <TextInput
              style={s.aliasInput}
              placeholder="Tu alias..."
              placeholderTextColor="#444"
              value={aliasInput}
              onChangeText={setAliasInput}
              maxLength={16}
              autoFocus
              autoCapitalize="words"
            />

            <TouchableOpacity
              style={[s.modalBtnAceptar, { marginTop: 16, width: '100%', backgroundColor: '#fbbf24' }]}
              onPress={handleGuardarAlias}
              disabled={savingAlias}
            >
              {savingAlias ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={s.modalBtnAceptarTxt}>✅ LISTO</Text>
              )}
            </TouchableOpacity>

            {isEditingAlias && (
              <TouchableOpacity
                style={{ marginTop: 16 }}
                onPress={() => setShowAliasModal(false)}
              >
                <Text style={{ color: '#555', fontSize: 13 }}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ═══ SHELL DE NAVEGACIÓN ═══════════════════════════════════════════════ */}
      <View style={{ padding: 16, flex: 1 }}>
        <TournamentScreenShell<'juego' | 'historial'>
          title="Truco"
          accentColor={ACCENT.truco.primary}
          HeaderIcon={Gamepad2}
          tabs={[
            { key: 'juego', label: 'Jugar', Icon: Gamepad2 },
            { key: 'historial', label: 'Historial', Icon: Trophy },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {/* ═══ CONTENIDO ════════════════════════════════════════════════════════ */}
          {activeTab === 'juego' ? (
            <TrucoLobby
              players={players}
              onPartidaCreada={(id) => navigation.navigate('Partida', { partidaId: id })}
              onOpenSettings={handleOpenSettings}
            />
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              <HistorialPublico />
            </ScrollView>
          )}
        </TournamentScreenShell>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTILOS
// ═══════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  // ─── Alias / Onboarding ─────────────────────────────────────────────────
  aliasInput: {
    width: '100%',
    backgroundColor: '#111',
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    textAlign: 'center',
    marginTop: 12,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },

  // ─── Settings btn ────────────────────────────────────────────────────────
  settingsBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    backgroundColor: '#111',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    zIndex: 10,
  },

  // ─── Cards V/D ───────────────────────────────────────────────────────────
  cardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  cardStatsVD: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  cardWinRate: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },

  // ─── Empty rivales ───────────────────────────────────────────────────────
  emptyRivales: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    width: '100%',
  },
  emptyRivalesTxt: {
    color: '#444',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyRivalesSubtxt: {
    color: '#333',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },

  // ─── Carta ────────────────────────────────────────────────────────────────
  carta: {
    backgroundColor: '#111',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    } as any : {}),
  },
  cartaDorso: {
    backgroundColor: '#1a0a2e',
    borderColor: '#3b1f6e',
  },
  cartaEnMesa: {
    borderColor: '#fbbf24',
    backgroundColor: '#1a1a0a',
  },
  cartaNumero: {
    fontWeight: '900',
    letterSpacing: -1,
  },
  cartaPaloLabel: {
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 1,
  },
  cartaPlaceholder: {
    width: 72, height: 108, borderRadius: 10,
    borderWidth: 1, borderColor: '#1a1a1a', borderStyle: 'dashed',
  },

  // ─── Lobby ────────────────────────────────────────────────────────────────
  lobbyHeader: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, gap: 16 },
  lobbyEmoji: { fontSize: 48, marginBottom: -8 },
  instruccionBox: {
    backgroundColor: 'rgba(34,197,94,0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    maxWidth: 400,
  },
  instruccionTxt: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  lobbyGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, paddingHorizontal: 12,
  },
  lobbyCard: {
    backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 1, borderColor: '#1a1a1a',
    padding: 16, alignItems: 'center', gap: 8,
    ...(Platform.OS === 'web' ? { transition: 'all 0.15s ease', cursor: 'pointer' } as any : {}),
  },
  lobbyCardAvatar: { fontSize: 32 },
  lobbyCardName: { color: '#ccc', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  lobbyCardAction: { color: '#22c55e', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // ─── Tablero ──────────────────────────────────────────────────────────────
  tableroHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
  },
  tableroRonda: { color: '#888', fontSize: 13, fontWeight: '700' },
  volverLink: { color: '#60a5fa', fontSize: 13, fontWeight: '700' },
  estadoBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  estadoEnCurso: { backgroundColor: 'rgba(34,197,94,0.15)' },
  estadoFin: { backgroundColor: 'rgba(248,113,113,0.15)' },
  estadoTxt: { color: '#888', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // ─── Marcadores ───────────────────────────────────────────────────────────
  marcadores: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  marcador: {
    backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 1.5, borderColor: '#1a1a1a',
    padding: 16, alignItems: 'center', minWidth: 100,
  },
  marcadorActivo: {
    borderColor: '#fbbf24',
    backgroundColor: '#1a1a0a',
  },
  marcadorNombre: { color: '#888', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  marcadorPuntos: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -2 },
  marcadorLabel: { color: '#444', fontSize: 11, fontWeight: '600' },
  vsContainer: { alignItems: 'center', gap: 2 },
  vsText: { color: '#333', fontSize: 18, fontWeight: '900' },
  puntosEnJuego: { color: '#fbbf24', fontSize: 11, fontWeight: '800' },

  // ─── Zonas de cartas ──────────────────────────────────────────────────────
  zonaOponente: { alignItems: 'center', paddingVertical: 12 },
  zonaMia: { alignItems: 'center', paddingVertical: 12 },
  zonaLabel: { color: '#666', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  manoRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },

  // ─── Mesa ─────────────────────────────────────────────────────────────────
  mesa: {
    alignItems: 'center', paddingVertical: 20, marginVertical: 8,
    backgroundColor: '#0a120a', borderRadius: 20,
    borderWidth: 1, borderColor: '#1a2a1a',
  },
  mesaLabel: { color: '#4ade80', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  mesaRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  bazasContainer: { marginTop: 12, gap: 4 },
  bazaItem: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bazaTxt: { color: '#666', fontSize: 11, fontWeight: '600' },

  // ─── Turno ────────────────────────────────────────────────────────────────
  turnoIndicator: { alignItems: 'center', paddingVertical: 12 },
  turnoTxt: { color: '#888', fontSize: 14, fontWeight: '700' },
  turnoGrandeContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 20,
    backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
  },
  turnoGrandeTxt: {
    color: '#22c55e', fontSize: 18, fontWeight: '900', letterSpacing: 0.5,
  },
  turnoCountdown: {
    color: '#fbbf24', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] as any,
  },
  cantoPendiente: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#3d3000',
  },
  cantoPendienteEmoji: { fontSize: 20 },
  cantoPendienteTxt: { color: '#ddd', fontSize: 13, fontWeight: '600' },

  // ─── Botones de Acción ────────────────────────────────────────────────────
  accionesContainer: { gap: 10, paddingVertical: 8 },
  accionRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap',
  },
  botonAccionOuter: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.15s ease' } as any : {}),
  },
  botonAccionInner: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  botonAccionTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  // ─── Pantalla de fin ──────────────────────────────────────────────────────
  finContainer: {
    alignItems: 'center', padding: 32, borderRadius: 20, marginVertical: 20,
    borderWidth: 1,
  },
  finGane: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  finPerdi: {
    backgroundColor: '#7f1d1d',
    borderColor: '#ef4444',
  },
  finCancelado: {
    backgroundColor: '#1f2937',
    borderColor: '#4b5563',
  },
  finEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  finTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 8 },
  finScore: { color: '#888', fontSize: 18, fontWeight: '700', marginTop: 4 },
  volverBtn: {
    marginTop: 20, backgroundColor: '#111', borderRadius: 10, borderWidth: 1,
    borderColor: '#2a2a2a', paddingHorizontal: 24, paddingVertical: 12,
  },
  volverBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ─── Toast ────────────────────────────────────────────────────────────────
  toast: {
    position: 'absolute', bottom: 80, left: 20, right: 20,
    backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  toastTxt: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // ─── Modal de Desafío Entrante ─────────────────────────────────────────
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)' } as any : {}),
  },
  modalCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#22c55e',
    paddingHorizontal: 36,
    paddingVertical: 40,
    alignItems: 'center',
    maxWidth: 380,
    width: '90%',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 0 60px rgba(34,197,94,0.25), 0 0 120px rgba(34,197,94,0.1)',
    } as any : {}),
  },
  modalEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalRetadorContainer: {
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.15)',
  },
  modalRetadorLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modalRetadorNombre: {
    color: '#22c55e',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalCartasRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  modalBotones: {
    width: '100%',
    gap: 12,
  },
  modalBtnAceptar: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    } as any : {}),
  },
  modalBtnAceptarTxt: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  modalBtnRechazar: {
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.25)',
    paddingVertical: 14,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    } as any : {}),
  },
  modalBtnRechazarTxt: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ─── Mi card (perfil propio) ──────────────────────────────────────────────
  miCard: {
    borderColor: 'rgba(34, 197, 94, 0.35)',
    backgroundColor: 'rgba(34, 197, 94, 0.04)',
  },
  selfBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  selfBadgeTxt: {
    color: '#22c55e',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  selfLabel: {
    color: '#22c55e',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.5,
    opacity: 0.7,
  },
});
