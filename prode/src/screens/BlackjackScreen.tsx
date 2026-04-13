// src/screens/BlackjackScreen.tsx
// Pantalla de Blackjack — Casino "Vacas Locas" Premium

import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Alert, Animated,
} from "react-native";
import { auth, functions } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";
import {
  useMesaBlackjack, apostarBj,
  pedirCartaBj, quedarseBj, levantarseBj, reiniciarMesaBj,
  CartaBJ, JugadorBJ,
} from "../lib/casinoHooks";
import BilleteraWidget from "../components/BilleteraWidget";
import { BG, BORDER, TEXT } from "../theme/colors";

type MesaId = "mesa_1" | "mesa_2";

// ─── Utilidad: calcular valor visual de una mano ─────────────────────────────
function valorManoCliente(mano: CartaBJ[]): number {
  let total = 0;
  let ases = 0;
  for (const c of mano) {
    if (["J", "Q", "K"].includes(c.valor)) total += 10;
    else if (c.valor === "A") { ases++; total += 11; }
    else total += parseInt(c.valor, 10);
  }
  while (total > 21 && ases > 0) { total -= 10; ases--; }
  return total;
}

// ─── Sub-componente: Carta visual BJ (Estilo Real) ───────────────────────────
const PALO_COLOR_BJ: Record<string, string> = {
  "♠": "#171717", // Negro asfalto
  "♣": "#171717", // Negro asfalto
  "♥": "#dc2626", // Rojo vivo
  "♦": "#dc2626", // Rojo vivo
};

function CartaBJCard({ carta, bocaAbajo }: { carta: CartaBJ; bocaAbajo?: boolean }) {
  if (bocaAbajo) {
    return (
      <View style={[c.carte, c.carteHidden]}>
        <View style={c.carteHiddenInner}>
          <Text style={c.carteBackEmoji}>🂠</Text>
        </View>
      </View>
    );
  }
  const color = PALO_COLOR_BJ[carta.palo] ?? "#171717";
  return (
    <View style={c.carte}>
      <Text style={[c.carteVal, { color }]}>{carta.valor}</Text>
      <Text style={[c.cartePal, { color }]}>{carta.palo}</Text>
    </View>
  );
}

// ─── Sub-componente: Mano de cartas ──────────────────────────────────────────
function ManoCartas({
  mano, titulo, ocultarSegunda = false, valor,
}: {
  mano: CartaBJ[];
  titulo: string;
  ocultarSegunda?: boolean;
  valor?: number;
}) {
  return (
    <View style={c.manoWrap}>
      <View style={c.manoHeader}>
        <Text style={c.manoTitulo}>{titulo}</Text>
        {valor !== undefined && (
          <View style={[c.manoValorBadge, valor > 21 ? { backgroundColor: "#7f1d1d" } : valor === 21 ? { backgroundColor: "#854d0e" } : {}]}>
            <Text style={[c.manoValor, valor > 21 ? { color: "#fca5a5" } : valor === 21 ? { color: "#fde047" } : {}]}>
              {valor > 21 ? "💥 PASADO" : valor === 21 ? "✨ 21!" : valor}
            </Text>
          </View>
        )}
      </View>
      <View style={c.cartasRow}>
        {mano.map((carta, i) => (
          <CartaBJCard
            key={i}
            carta={carta}
            bocaAbajo={ocultarSegunda && i === 1}
          />
        ))}
        {mano.length === 0 && (
          <View style={c.cartePlaceholder}>
            <Text style={c.cartePlaceholderTxt}>🃏</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Sub-componente: Badge de resultado ──────────────────────────────────────
function ResultadoBadge({ resultado, pago }: { resultado: string | null | undefined; pago?: number | null }) {
  if (!resultado) return null;
  const MAP: Record<string, { label: string; color: string; bg: string }> = {
    BLACKJACK: { label: "🃏 BLACKJACK!", color: "#fde047", bg: "rgba(250,204,21,0.15)" },
    GANA: { label: "✅ GANASTE", color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
    EMPATE: { label: "🤝 PUSH (EMPATE)", color: "#93c5fd", bg: "rgba(147,197,253,0.15)" },
    PIERDE: { label: "❌ PERDISTE", color: "#f87171", bg: "rgba(248,113,113,0.15)" },
  };
  const info = MAP[resultado] ?? { label: resultado, color: "#a1a1aa", bg: "rgba(161,161,170,0.15)" };

  return (
    <View style={[c.resBadge, { backgroundColor: info.bg, borderColor: info.color + "66" }]}>
      <Text style={[c.resTxt, { color: info.color }]}>{info.label}</Text>
      {pago != null && pago > 0 && (
        <Text style={c.resPago}>+🪙{pago}</Text>
      )}
    </View>
  );
}

// ─── Sub-componente: Card de un jugador en la mesa ───────────────────────────
function JugadorCard({ jugador, esYo }: { jugador: JugadorBJ; esYo: boolean }) {
  const valor = valorManoCliente(jugador.mano);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (esYo && jugador.estado === "JUGANDO") {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [esYo, jugador.estado]);

  return (
    <Animated.View
      style={[
        c.jugadorCard,
        esYo && c.jugadorCardMe,
        jugador.estado === "PASADO" && c.jugadorPasado,
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      <View style={c.jugadorHeader}>
        <View style={c.jugadorInfoWrap}>
          <Text style={c.jugadorAvatar}>{esYo ? "🧑" : "👤"}</Text>
          <Text style={[c.jugadorNom, esYo && { color: "#4ade80" }]}>
            {esYo ? "TÚ (VOS)" : (jugador.nombre || jugador.name || `${jugador.uid.slice(0, 6)}…`)}
          </Text>
        </View>
        <View style={c.fichasBadge}>
          <Text style={c.jugadorApuesta}>🪙 {jugador.apuesta}</Text>
        </View>
      </View>

      <ManoCartas
        mano={jugador.mano}
        titulo="CARTAS"
        valor={jugador.mano.length > 0 ? valor : undefined}
      />

      {jugador.resultado && (
        <View style={{ marginTop: 12 }}>
          <ResultadoBadge resultado={jugador.resultado} pago={jugador.pago} />
        </View>
      )}

      {!jugador.resultado && (
        <View style={[c.estadoChip,
        jugador.estado === "JUGANDO" ? { backgroundColor: "rgba(74,222,128,0.15)", borderColor: "#4ade80" } :
          jugador.estado === "PLANTADO" ? { backgroundColor: "rgba(147,197,253,0.1)", borderColor: "#93c5fd55" } :
            jugador.estado === "PASADO" ? { backgroundColor: "rgba(248,113,113,0.1)", borderColor: "#f8717155" } :
              {}
        ]}>
          <Text style={[c.estadoChipTxt,
          jugador.estado === "JUGANDO" ? { color: "#4ade80" } :
            jugador.estado === "PLANTADO" ? { color: "#93c5fd" } :
              jugador.estado === "PASADO" ? { color: "#f87171" } : {}
          ]}>
            {jugador.estado === "JUGANDO" ? "🟢 PENSANDO..." :
              jugador.estado === "PLANTADO" ? "✋ SE PLANTÓ" :
                jugador.estado === "PASADO" ? "💥 VOLÓ" :
                  jugador.estado === "SENTADO" ? "⚪ ESPERANDO" : ""}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANTALLA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function BlackjackScreen() {
  const uid = auth.currentUser?.uid ?? null;

  const [mesaId, setMesaId] = useState<MesaId | null>(null);
  const [monto, setMonto] = useState("50");
  const [loading2, setLoading2] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const resolviendo = useRef(false);

  const { mesa, miInfo, estoyEnMesa, loading } = useMesaBlackjack(mesaId, uid);

  // ── Timer para apuestas ───────────────────────────────────────────────────
  useEffect(() => {
    const timerApuestasFin = (mesa as any)?.timerApuestasFin;
    if (!timerApuestasFin || mesa?.estado !== "ESPERANDO") {
      setTimeLeft(0);
      return;
    }

    let intervalId: any = undefined;

    const updateTimer = () => {
      const diff = Math.ceil((timerApuestasFin - Date.now()) / 1000);
      if (diff <= 0) {
        setTimeLeft(0);
        if (intervalId !== undefined) {
          clearInterval(intervalId);
        }
        if (!resolviendo.current) {
          resolviendo.current = true;
          httpsCallable(functions, "forzarRepartoBj")({ mesaId })
            .catch(e => console.log(e))
            .finally(() => resolviendo.current = false);
        }
      } else {
        setTimeLeft(diff);
      }
    };

    updateTimer();
    intervalId = setInterval(updateTimer, 1000);
    return () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, [(mesa as any)?.timerApuestasFin, mesa?.estado, mesaId]);

  // ── Auto-Levantar (Reiniciar Mesa) ────────────────────────────────────────
  useEffect(() => {
    if (mesa?.estado === "FINALIZADO" && mesaId) {
      const t = setTimeout(() => {
        httpsCallable(functions, "reiniciarMesaBj")({ mesaId }).catch(e => console.log("Auto-reiniciar:", e));
      }, 8000); // 8 segundos para que vean el resultado antes de limpiar la mesa
      return () => clearTimeout(t);
    }
  }, [mesa?.estado, mesaId]);

  // ── Alerta helper ─────────────────────────────────────────────────────────
  const alerta = (titulo: string, msg: string) => {
    if (Platform.OS === "web") window.alert(`${titulo}\n${msg}`);
    else Alert.alert(titulo, msg);
  };

  // ── Acciones ──────────────────────────────────────────────────────────────
  const accion = async (fn: () => Promise<any>, errorMsg = "Error") => {
    if (!mesaId) return;
    setLoading2(true);
    try {
      await fn();
    } catch (e: any) {
      alerta("❌ " + errorMsg, e.message ?? "Ocurrió un error.");
    } finally {
      setLoading2(false);
    }
  };

  // ── Selector de mesa ──────────────────────────────────────────────────────
  if (!mesaId) {
    return (
      <View style={[c.root, c.center]}>
        <Text style={c.title}>Salón de Blackjack</Text>
        <Text style={c.subtitle}>Elegí una mesa para sentarte. El croupier te espera.</Text>
        <View style={c.mesaSelector}>
          {(["mesa_1", "mesa_2"] as MesaId[]).map((id) => (
            <TouchableOpacity
              key={id}
              style={c.mesaBtn}
              onPress={() => setMesaId(id)}
              activeOpacity={0.8}
            >
              <Text style={c.mesaBtnEmoji}>♠️</Text>
              <Text style={c.mesaBtnLabel}>Mesa Vip {id === "mesa_1" ? "1" : "2"}</Text>
              <Text style={c.mesaBtnSub}>Límite: 🪙10 - 🪙500</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[c.root, c.center]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ color: TEXT.muted, marginTop: 8, fontWeight: "600" }}>Acomodando las sillas en {mesaId}...</Text>
      </View>
    );
  }

  const estadoMesa = mesa?.estado ?? null;
  const jugadores = Object.values(mesa?.jugadores ?? {});
  const casaMano = mesa?.casa?.mano ?? [];
  const ocultarSegunda = estadoMesa !== "TURNO_CASA" && estadoMesa !== "FINALIZADO";
  const valorCasa = estadoMesa === "FINALIZADO" ? (mesa?.casa?.valor ?? valorManoCliente(casaMano)) : undefined;

  const puedoPedirCarta = estoyEnMesa
    && estadoMesa === "TURNO_JUGADORES"
    && miInfo?.estado === "JUGANDO"
    && mesa?.turnoActual === uid;

  const esMiTurno = mesa?.turnoActual === uid;

  return (
    <ScrollView style={c.root} contentContainerStyle={c.content} showsVerticalScrollIndicator={false}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={c.header}>
        <View style={{ gap: 4 }}>
          <Text style={c.title}>♠️ Blackjack</Text>
          <TouchableOpacity onPress={() => setMesaId(null)} style={c.cambiarMesaBtn}>
            <Text style={c.cambiarMesaTxt}>← Salir al pasillo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── PAÑO DE LA MESA (Contenedor Verde) ──────────────────────────── */}
      <View style={c.panoVerde}>

        {/* Estado Header */}
        <View style={c.estadoBadgeWrap}>
          <Text style={c.mesaLabelLbl}>{mesaId === "mesa_1" ? "MESA 1" : "MESA 2"}</Text>
          <View style={[c.estadoBadge, {
            backgroundColor:
              estadoMesa === "ESPERANDO" ? "rgba(34,197,94,0.15)" :
                estadoMesa === "TURNO_JUGADORES" ? "rgba(250,204,21,0.15)" :
                  estadoMesa === "TURNO_CASA" ? "rgba(168,85,247,0.15)" :
                    estadoMesa === "FINALIZADO" ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)",
            borderColor:
              estadoMesa === "ESPERANDO" ? "#4ade80" :
                estadoMesa === "TURNO_JUGADORES" ? "#fde047" :
                  estadoMesa === "TURNO_CASA" ? "#c084fc" :
                    estadoMesa === "FINALIZADO" ? "#f87171" : "#555",
          }]}>
            <Text style={[c.estadoEmoji, {
              color:
                estadoMesa === "ESPERANDO" ? "#4ade80" :
                  estadoMesa === "TURNO_JUGADORES" ? "#fde047" :
                    estadoMesa === "TURNO_CASA" ? "#c084fc" :
                      estadoMesa === "FINALIZADO" ? "#fca5a5" : "#aaa",
            }]}>
              {estadoMesa === "ESPERANDO" ? "⏳ ESPERANDO APUESTAS" :
                estadoMesa === "REPARTIENDO" ? "🃏 REPARTIENDO..." :
                  estadoMesa === "TURNO_JUGADORES" ? "🟢 TURNO DE LOS JUGADORES" :
                    estadoMesa === "TURNO_CASA" ? "🎴 LA CASA JUEGA" :
                      estadoMesa === "FINALIZADO" ? "🏁 RONDA TERMINADA" :
                        "⚙️ MESA CERRADA"}
            </Text>
          </View>
        </View>

        {/* ── Mano de la CASA ─────────────────────────────────────────────── */}
        <View style={c.casaSection}>
          <ManoCartas
            mano={casaMano}
            titulo="EL CROUPIER (La Casa debe pedir hasta 17)"
            ocultarSegunda={ocultarSegunda}
            valor={estadoMesa === "FINALIZADO" ? valorCasa : undefined}
          />
        </View>

        {/* ── Divider decorativo ───────────────────────────────────────────── */}
        <View style={c.panoDivider} />

        {/* ── Jugadores en la mesa ─────────────────────────────────────────── */}
        {jugadores.length === 0 ? (
          <View style={c.emptyBox}>
            <Text style={c.emptyTxt}>Sillas vacías. Sé el primero en sentarte.</Text>
          </View>
        ) : (
          <View style={c.jugadoresGrid}>
            {jugadores.map((j) => (
              <JugadorCard key={j.uid} jugador={j} esYo={j.uid === uid} />
            ))}
          </View>
        )}
      </View>
      {/* FIN DEL PAÑO VERDE */}

      {/* ════════════════════════════════════════════════════════════════════
          PANEL DE ACCIONES (LA CONSOLA DEL JUGADOR)
      ════════════════════════════════════════════════════════════════════ */}

      {/* ── B. No aposté aún + ESPERANDO → panel de apuesta (sirve para sentarse tmb) ─────────────── */}
      {(miInfo?.apuesta || 0) === 0 && (!estadoMesa || estadoMesa === "ESPERANDO") && (
        <View style={c.accionPanel}>
          <View style={c.cajaFuerte}>
            <Text style={c.cajaFuerteLbl}>PREPARAR FICHAS</Text>
            <View style={c.montoRow}>
              <Text style={{ fontSize: 24 }}>🪙</Text>
              <TextInput
                style={c.montoInput}
                value={monto}
                onChangeText={setMonto}
                keyboardType="number-pad"
                placeholder="50"
                placeholderTextColor="#666"
                maxLength={4}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <TouchableOpacity
              style={[c.accionBtnSecondary, loading2 && c.disabledBtn]}
              onPress={() => setMesaId(null)}
              disabled={loading2}
            >
              <Text style={c.accionBtnSecondaryTxt}>↩ Volver al lobby</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[c.accionBtn, c.accionBtnGold, loading2 && c.disabledBtn, { flex: 2 }]}
              onPress={() => {
                const m = parseInt(monto, 10);
                if (isNaN(m) || m < 1) { alerta("Monto inválido", "Ingresá un monto mayor a 0."); return; }
                accion(() => apostarBj(mesaId!, m).then(() => { }), "Error al apostar");
              }}
              disabled={loading2}
              activeOpacity={0.85}
            >
              {loading2 ? <ActivityIndicator color="#000" /> : (
                <Text style={c.accionBtnTxt}>🎯 APOSTAR 🪙{monto}</Text>
              )}
            </TouchableOpacity>
          </View>
          {timeLeft > 0 && typeof timeLeft === 'number' && (
            <Text style={{ color: "#f87171", textAlign: "center", fontWeight: "bold", marginTop: 12, fontSize: 16 }}>
              ⏱ Date prisa, la ronda arranca en {timeLeft}s!
            </Text>
          )}
        </View>
      )}

      {/* ── C. Esperando a otros jugadores para apostar ───────────────────── */}
      {estoyEnMesa && (miInfo?.apuesta ?? 0) > 0 && estadoMesa === "ESPERANDO" && (
        <View style={[c.accionPanel, { borderColor: "#4ade8055", backgroundColor: "rgba(34,197,94,0.05)" }]}>
          <Text style={{ color: "#4ade80", fontSize: 16, fontWeight: "900", textAlign: "center" }}>
            ✅ Apuesta de 🪙{miInfo!.apuesta} confirmada
          </Text>
          <Text style={{ color: "#aaa", textAlign: "center", marginTop: 4 }}>
            Esperando a que los demás jugadores apuesten...
          </Text>
          {timeLeft > 0 ? (
            <Text style={{ color: "#f87171", textAlign: "center", fontWeight: "bold", marginTop: 6, fontSize: 18 }}>
              ⏱ {timeLeft}s restantes
            </Text>
          ) : (
            <ActivityIndicator color="#4ade80" style={{ marginTop: 12 }} />
          )}
        </View>
      )}

      {/* ── D. TURNO_JUGADORES y es mi turno → HIT / STAND ────────────────── */}
      {estoyEnMesa && estadoMesa === "TURNO_JUGADORES" && miInfo?.estado === "JUGANDO" && (
        <View style={c.accionPanel}>
          <Text style={c.accionTitle}>
            {esMiTurno ? "¡Es tu turno! ¿Qué vas a hacer?" : "No es tu turno..."}
          </Text>
          <View style={c.hitStandRow}>
            <TouchableOpacity
              style={[c.standBtn, (!esMiTurno || loading2) && c.disabledBtn]}
              onPress={() => {
                if (!esMiTurno) { alerta("Paciencia", "Aún no es tu turno."); return; }
                accion(() => quedarseBj(mesaId!).then(() => { }), "Error al plantarse");
              }}
              disabled={!esMiTurno || loading2}
              activeOpacity={0.8}
            >
              {loading2 && esMiTurno ? <ActivityIndicator color="#f87171" /> : (
                <>
                  <Text style={c.standBtnIcon}>✋</Text>
                  <Text style={c.standBtnLabel}>STAND</Text>
                  <Text style={c.standBtnSub}>Plantarse</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[c.hitBtn, (!esMiTurno || loading2) && c.disabledBtn]}
              onPress={() => {
                if (!esMiTurno) { alerta("Paciencia", "Aún no es tu turno."); return; }
                accion(() => pedirCartaBj(mesaId!).then(() => { }), "Error al pedir carta");
              }}
              disabled={!esMiTurno || loading2}
              activeOpacity={0.8}
            >
              {loading2 && esMiTurno ? <ActivityIndicator color="#000" /> : (
                <>
                  <Text style={c.hitBtnIcon}>👆</Text>
                  <Text style={c.hitBtnLabel}>HIT</Text>
                  <Text style={c.hitBtnSub}>Pedir carta</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── E. TURNO_JUGADORES pero ya me planté/pasé ────────────────────── */}
      {estoyEnMesa && estadoMesa === "TURNO_JUGADORES" && miInfo?.estado !== "JUGANDO" && (
        <View style={c.accionPanel}>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center" }}>
            {miInfo?.estado === "PLANTADO" ? "✋ Te plantaste. Muy buena mano." :
              miInfo?.estado === "PASADO" ? "💥 Te pasaste de 21. Suerte para la próxima." :
                "⏳ Esperando tu turno..."}
          </Text>
          <Text style={{ color: "#888", textAlign: "center", marginTop: 6, fontSize: 12 }}>
            Esperando a que terminen los demás jugadores...
          </Text>
          <ActivityIndicator color="#555" style={{ marginTop: 12 }} />
        </View>
      )}

      {/* ── F. La casa juega ──────────────────────────────────────────────── */}
      {estadoMesa === "TURNO_CASA" && (
        <View style={[c.accionPanel, { borderColor: "#c084fc55", backgroundColor: "rgba(168,85,247,0.05)" }]}>
          <ActivityIndicator size="large" color="#c084fc" />
          <Text style={{ color: "#c084fc", fontSize: 16, textAlign: "center", marginTop: 12, fontWeight: "900" }}>
            🎴 Turno del Croupier
          </Text>
          <Text style={{ color: "#aaa", textAlign: "center", marginTop: 4 }}>
            La casa está levantando sus cartas...
          </Text>
        </View>
      )}

      {/* ── G. Partida finalizada ─────────────────────────────────────────── */}
      {estadoMesa === "FINALIZADO" && estoyEnMesa && (
        <View style={[c.accionPanel, { borderColor: "#3f3f46" }]}>
          <Text style={c.accionTitle}>🏁 Ronda Finalizada</Text>
          <View style={{ alignItems: "center", marginVertical: 12 }}>
            <ResultadoBadge resultado={miInfo?.resultado} pago={miInfo?.pago} />
          </View>
          <Text style={{ color: TEXT.muted, fontSize: 13, textAlign: "center", marginBottom: 16 }}>
            Recopilando resultados... En breve te levantarás de la mesa automáticamente.
          </Text>
          <ActivityIndicator color="#aaa" />
        </View>
      )}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTILOS PREMIUM
// ═══════════════════════════════════════════════════════════════════════════════
const c = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG.root },
  content: { padding: 16, paddingBottom: 60, gap: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, backgroundColor: BG.root },

  title: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: TEXT.secondary, fontSize: 14, textAlign: "center", marginTop: -8 },

  /* Header */
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  cambiarMesaBtn: { backgroundColor: "#1f2937", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start", marginTop: 4 },
  cambiarMesaTxt: { color: "#d1d5db", fontSize: 12, fontWeight: "700" },

  /* Selector de mesa */
  mesaSelector: { flexDirection: "row", gap: 16, marginTop: 12, width: "100%", maxWidth: 400 },
  mesaBtn: {
    flex: 1, backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: "#27272a",
    borderRadius: 20, padding: 24, alignItems: "center", gap: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 20px rgba(0,0,0,0.5)', transition: 'all 0.2s' } as any : {}),
  },
  mesaBtnEmoji: { fontSize: 48 },
  mesaBtnLabel: { color: "#fff", fontSize: 18, fontWeight: "900" },
  mesaBtnSub: { color: "#fbbf24", fontSize: 12, fontWeight: "700" },

  /* El Paño Verde */
  panoVerde: {
    backgroundColor: "rgba(6, 78, 59, 0.15)", // Verde casino
    borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: "rgba(5, 150, 105, 0.3)",
    ...(Platform.OS === 'web' ? { boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)' } as any : {}),
  },
  panoDivider: { height: 1, backgroundColor: "rgba(5, 150, 105, 0.2)", marginVertical: 20 },

  /* Estado badge */
  estadoBadgeWrap: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  mesaLabelLbl: { color: "rgba(52, 211, 153, 0.8)", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  estadoBadge: { borderWidth: 1, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  estadoEmoji: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },

  /* Casa */
  casaSection: { alignItems: "center" },

  /* Mano */
  manoWrap: { alignItems: "center", gap: 12 },
  manoHeader: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12 },
  manoTitulo: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" },
  manoValorBadge: { backgroundColor: "#3f3f46", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  manoValor: { color: "#fff", fontSize: 16, fontWeight: "900" },
  cartasRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },

  /* Carta Real */
  carte: {
    width: 64, height: 96, backgroundColor: "#fff", borderRadius: 8,
    alignItems: "center", justifyContent: "center", gap: 2,
    borderWidth: 1, borderColor: "#e5e7eb",
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.6)' } as any : {}),
  },
  carteHidden: { backgroundColor: "#fff", padding: 4 },
  carteHiddenInner: { flex: 1, width: "100%", backgroundColor: "#1e1b4b", borderRadius: 4, alignItems: "center", justifyContent: "center" },
  carteBackEmoji: { fontSize: 32 },
  carteVal: { fontSize: 26, fontWeight: "900", marginTop: 4 },
  cartePal: { fontSize: 24, marginTop: -4 },

  cartePlaceholder: {
    width: 64, height: 96, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.1)",
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)"
  },
  cartePlaceholderTxt: { fontSize: 24, opacity: 0.3 },

  /* Jugadores Grid */
  emptyBox: { padding: 32, alignItems: "center" },
  emptyTxt: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontStyle: "italic", fontWeight: "600" },
  jugadoresGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16 },

  jugadorCard: {
    backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    padding: 16, alignItems: "center", gap: 16, minWidth: 160,
  },
  jugadorCardMe: { borderColor: "rgba(74,222,128,0.5)", backgroundColor: "rgba(6,78,59,0.3)" },
  jugadorPasado: { opacity: 0.5 },

  jugadorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", paddingBottom: 10 },
  jugadorInfoWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  jugadorAvatar: { fontSize: 16 },
  jugadorNom: { color: "#fff", fontSize: 13, fontWeight: "900" },
  fichasBadge: { backgroundColor: "#1a1a1a", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#333" },
  jugadorApuesta: { color: "#fbbf24", fontSize: 12, fontWeight: "800" },

  estadoChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  estadoChipTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },

  /* Resultado badge */
  resBadge: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8,
  },
  resTxt: { fontSize: 14, fontWeight: "900", letterSpacing: 0.5 },
  resPago: { color: "#4ade80", fontSize: 16, fontWeight: "900" },

  /* ─── Panel Inferior (Consola del Jugador) ─── */
  accionPanel: {
    backgroundColor: "#0a0a0a", borderRadius: 20, borderWidth: 1, borderColor: "#27272a",
    padding: 24, gap: 16,
    ...(Platform.OS === 'web' ? { boxShadow: '0 -10px 40px rgba(0,0,0,0.5)' } as any : {}),
  },
  accionTitle: { color: "#fff", fontSize: 18, fontWeight: "900", textAlign: "center", letterSpacing: 0.5 },

  /* Input Apuesta (Caja Fuerte) */
  cajaFuerte: { backgroundColor: "#000", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#333" },
  cajaFuerteLbl: { color: "#71717a", fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  montoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  montoInput: {
    flex: 1, backgroundColor: "#111", borderRadius: 12, borderWidth: 1, borderColor: "#444",
    color: "#fbbf24", fontSize: 28, fontWeight: "900", paddingHorizontal: 16, paddingVertical: 10,
  },

  /* Botones Generales */
  accionBtn: { borderRadius: 16, padding: 18, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 },
  accionBtnGreen: { backgroundColor: "#16a34a" },
  accionBtnGold: { backgroundColor: "#ca8a04" },
  accionBtnIcon: { fontSize: 24 },
  accionBtnTxt: { color: "#000", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },

  accionBtnSecondary: { flex: 1, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#18181b", borderRadius: 16, padding: 16, alignItems: "center", justifyContent: "center" },
  accionBtnSecondaryTxt: { color: "#a1a1aa", fontSize: 14, fontWeight: "800" },

  /* Botones Arcade HIT / STAND */
  hitStandRow: { flexDirection: "row", gap: 16 },
  hitBtn: {
    flex: 1.2, backgroundColor: "#16a34a", borderRadius: 20, padding: 20, alignItems: "center", justifyContent: "center",
    borderBottomWidth: 6, borderBottomColor: "#14532d", // Efecto botón 3D
  },
  hitBtnIcon: { fontSize: 32, marginBottom: 4 },
  hitBtnLabel: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 1 },
  hitBtnSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },

  standBtn: {
    flex: 1, backgroundColor: "#991b1b", borderRadius: 20, padding: 20, alignItems: "center", justifyContent: "center",
    borderBottomWidth: 6, borderBottomColor: "#450a0a", // Efecto botón 3D
  },
  standBtnIcon: { fontSize: 32, marginBottom: 4 },
  standBtnLabel: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  standBtnSub: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },

  /* Misc */
  disabledBtn: { opacity: 0.5 },
});