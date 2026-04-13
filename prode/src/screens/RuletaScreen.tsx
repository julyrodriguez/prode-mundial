// src/screens/RuletaScreen.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Alert, Animated, useWindowDimensions
} from "react-native";
import { auth, functions } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useMesaRuleta, apostarRuleta, ApuestaRuleta } from "../lib/casinoHooks";
import { BG } from "../theme/colors";

// ─── Constantes ─────────────────────────────────────────────────────────────
const ROJOS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const NEGROS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
const MONEDAS_RAPIDAS = [1, 2, 5, 10, 25, 50];

type MesaId = "ruleta_1" | "ruleta_2";

function getEstiloNumero(n: number) {
  if (n === 0) return { bg: "#166534", border: "#22c55e", text: "#fff" };
  if (ROJOS.includes(n)) return { bg: "#991b1b", border: "#ef4444", text: "#fff" };
  return { bg: "#171717", border: "#52525b", text: "#fff" };
}

// ─── Sub-componentes ────────────────────────────────────────────────────────
function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    APOSTANDO: { label: "🟢 APOSTANDO", color: "#4ade80", bg: "rgba(34,197,94,0.15)" },
    GIRANDO: { label: "🔄 GIRANDO...", color: "#fde047", bg: "rgba(250,204,21,0.15)" },
    PAGANDO: { label: "💰 PAGANDO", color: "#c084fc", bg: "rgba(168,85,247,0.15)" },
    ESPERANDO: { label: "⏳ ESPERANDO", color: "#93c5fd", bg: "rgba(147,197,253,0.15)" },
  };
  const info = map[estado ?? ""] ?? { label: "⚙️ SIN MESA", color: "#a1a1aa", bg: "rgba(161,161,170,0.15)" };
  return (
    <View style={[s.estadoBadge, { backgroundColor: info.bg, borderColor: info.color + "40" }]}>
      <Text style={[s.estadoTxt, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

function RuletaSpinner({ girando }: { girando: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (girando) {
      Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 600, useNativeDriver: true })
      ).start();
    } else {
      spin.stopAnimation();
      spin.setValue(0);
    }
  }, [girando]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={[s.ruletaContenedor, girando && { transform: [{ rotate }] }]}>
      <Text style={s.ruletaEmoji}>🎡</Text>
    </Animated.View>
  );
}

// ─── Selector de Mesa ───────────────────────────────────────────────────────
function SelectorMesas({ onSelect }: { onSelect: (id: MesaId) => void }) {
  return (
    <View style={[s.root, s.centerFull]}>
      <Text style={s.salaTitle}>🎡 Ruleta Vacas Locas</Text>
      <Text style={s.salaSub}>Elegí una mesa y hacé tu apuesta. ¡La fortuna te espera!</Text>
      <View style={s.mesaGrid}>
        {(["ruleta_1", "ruleta_2"] as MesaId[]).map((id) => (
          <TouchableOpacity
            key={id}
            style={s.mesaCard}
            onPress={() => onSelect(id)}
            activeOpacity={0.8}
          >
            <Text style={s.mesaCardEmoji}>🎡</Text>
            <Text style={s.mesaCardLabel}>{id === "ruleta_1" ? "Mesa 1" : "Mesa 2"}</Text>
            <Text style={s.mesaCardSub}>Apuesta mín: 🪙1</Text>
            <View style={s.mesaCardChip}>
              <Text style={s.mesaCardChipTxt}>ENTRAR</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Componente: Efecto Odómetro para Revelación ───────────────────────────
function OdometerReveal({ numeroGanador }: { numeroGanador: number }) {
  const [animando, setAnimando] = useState(true);
  const translateY = useRef(new Animated.Value(-40)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animId: any = null;
    let timeout: any = null;

    if (animando) {
      animId = Animated.loop(
        Animated.sequence([
          Animated.timing(translateY, { toValue: 40, duration: 120, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -40, duration: 0, useNativeDriver: true })
        ])
      );
      animId.start();

      timeout = setTimeout(() => {
        setAnimando(false);
      }, 3000);
    } else {
      animId?.stop();
      translateY.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1.2, friction: 3, tension: 40, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true })
      ]).start(() => {
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }).start();
      });
    }

    return () => {
      if (animId) animId.stop();
      if (timeout) clearTimeout(timeout);
    };
  }, [animando, numeroGanador]);

  const est = animando ? null : getEstiloNumero(numeroGanador);

  return (
    <View style={s.odometerContainer}>
      {animando ? (
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Text style={s.odometerBlurTxt}>?</Text>
        </Animated.View>
      ) : (
        <Animated.View style={[
          s.odometerFicha,
          { backgroundColor: est?.bg, borderColor: est?.border, transform: [{ scale: scaleAnim }], opacity: opacityAnim }
        ]}>
          <Text style={[s.odometerFichaNum, { color: est?.text }]}>{numeroGanador}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Componente: Ficha Visual ────────────────────────────────────────────────
function formatChipAmt(m: number) {
  if (m >= 1000) return (m / 1000).toFixed(1) + "k";
  return m.toString();
}

function ChipVisual({ m, bg = 0 }: { m: number; bg?: number }) {
  if (!m && !bg) return null;

  // Forzamos un tamaño de letra más chico si el número es grande 
  const getFontSize = (val: number) => {
    const text = formatChipAmt(val);
    if (text.length > 3) return 8;
    if (text.length === 3) return 10;
    return 12;
  };

  const chipBaseMap: any = { position: "absolute", left: "50%", top: "50%", marginLeft: -13, marginTop: -13 };

  return (
    <View style={s.chipFalsaPadre} pointerEvents="none">
      {bg > 0 && (
        <View style={[s.chipFalsa, s.chipBg, chipBaseMap, { zIndex: 1, transform: [{ translateX: m > 0 ? -4 : 0 }, { translateY: m > 0 ? -4 : 0 }] }]}>
          <Text style={[s.chipFalsaTxt, { fontSize: getFontSize(bg) }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatChipAmt(bg)}
          </Text>
        </View>
      )}
      {m > 0 && (
        <View style={[s.chipFalsa, s.chipMonto, chipBaseMap, { zIndex: 2, transform: [{ translateX: bg > 0 ? 4 : 0 }, { translateY: bg > 0 ? 4 : 0 }] }]}>
          <Text style={[s.chipFalsaTxtDark, { fontSize: getFontSize(m) }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatChipAmt(m)}
          </Text>
        </View>
      )}
    </View>
  );
}
// 12 filas x 3 columnas (Vertical Móvil)
const ROWS_VERT = [
  [{ n: 1 }, { n: 2 }, { n: 3 }],
  [{ n: 4 }, { n: 5 }, { n: 6 }],
  [{ n: 7 }, { n: 8 }, { n: 9 }],
  [{ n: 10 }, { n: 11 }, { n: 12 }],
  [{ n: 13 }, { n: 14 }, { n: 15 }],
  [{ n: 16 }, { n: 17 }, { n: 18 }],
  [{ n: 19 }, { n: 20 }, { n: 21 }],
  [{ n: 22 }, { n: 23 }, { n: 24 }],
  [{ n: 25 }, { n: 26 }, { n: 27 }],
  [{ n: 28 }, { n: 29 }, { n: 30 }],
  [{ n: 31 }, { n: 32 }, { n: 33 }],
  [{ n: 34 }, { n: 35 }, { n: 36 }],
];

// 3 filas x 12 columnas (Horizontal Desktop)
const ROWS_HORIZ = [
  [{ n: 3 }, { n: 6 }, { n: 9 }, { n: 12 }, { n: 15 }, { n: 18 }, { n: 21 }, { n: 24 }, { n: 27 }, { n: 30 }, { n: 33 }, { n: 36 }],
  [{ n: 2 }, { n: 5 }, { n: 8 }, { n: 11 }, { n: 14 }, { n: 17 }, { n: 20 }, { n: 23 }, { n: 26 }, { n: 29 }, { n: 32 }, { n: 35 }],
  [{ n: 1 }, { n: 4 }, { n: 7 }, { n: 10 }, { n: 13 }, { n: 16 }, { n: 19 }, { n: 22 }, { n: 25 }, { n: 28 }, { n: 31 }, { n: 34 }],
];

// ─── Pantalla de Juego de Ruleta ─────────────────────────────────────────────
function JuegoRuleta({ mesaId, onSalir }: { mesaId: MesaId; onSalir: () => void }) {
  const { width } = useWindowDimensions();
  const isWeb = width > 768; // Punto de quiebre para versión horizontal

  const uid = auth.currentUser?.uid ?? null;
  const { mesa, apuesta, loading } = useMesaRuleta(uid, mesaId);

  const FICHAS_VALORES = [1, 5, 10, 50, 100];
  const [fichaSelec, setFichaSelec] = useState<number>(5);
  const [fichasLocales, setFichasLocales] = useState<{ key: string, tipo: string, numeros: number[], monto: number }[]>([]);

  const [enviando, setEnviando] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const resolviendo = useRef(false);
  const miGananciaRondaAnterior = mesa?.ultimaRonda?.ganadores?.find((g: any) => g.uid === uid) || null;

  const estadoMesa = mesa?.estado;
  const estaApostando = estadoMesa === "APOSTANDO";
  const sePuedeApostar = estadoMesa === "APOSTANDO" || estadoMesa === "ESPERANDO" || !estadoMesa;

  useEffect(() => {
    if (estadoMesa && ["GIRANDO", "ESPERANDO", "PAGANDO"].includes(estadoMesa)) {
      setFichasLocales([]);
      resolviendo.current = false;
    }
  }, [estadoMesa]);

  const resolverMesa = useCallback(async () => {
    if (resolviendo.current) return;
    resolviendo.current = true;
    try {
      await httpsCallable(functions, "resolverRuleta")({ mesaId });
    } catch (e: any) {
      console.log("Resolución:", e.message);
      resolviendo.current = false;
    }
  }, [mesaId]);

  useEffect(() => {
    const timerFin = (mesa as any)?.timerFin;
    if (!timerFin || !estaApostando) {
      setTimeLeft(0);
      return;
    }

    let intervalId: any = undefined;

    const updateTimer = () => {
      const diff = Math.ceil((timerFin - Date.now()) / 1000);
      if (diff <= 0) {
        setTimeLeft(0);
        if (intervalId !== undefined) {
          clearInterval(intervalId);
        }
        if (!resolviendo.current) {
          setTimeout(() => resolverMesa(), 600);
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
  }, [(mesa as any)?.timerFin, estaApostando, resolverMesa]);

  const tapTablero = (key: string, tipo: string, numeros: number[]) => {
    if (!sePuedeApostar) return;
    const existe = fichasLocales.find((f) => f.key === key);
    if (existe) {
      setFichasLocales(fichasLocales.map((f) => f.key === key ? { ...f, monto: f.monto + fichaSelec } : f));
    } else {
      setFichasLocales([...fichasLocales, { key, tipo, numeros, monto: fichaSelec }]);
    }
  };

  const confirmarApuestas = async () => {
    if (enviando || fichasLocales.length === 0) return;
    setEnviando(true);
    try {
      await apostarRuleta({ fichas: fichasLocales, mesaId });
      setFichasLocales([]);
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e.message);
      else Alert.alert("Error", e.message);
    } finally {
      setEnviando(false);
    }
  };

  const apuestasTablero = fichasLocales.reduce((acc, f) => {
    acc[f.key] = f.monto;
    return acc;
  }, {} as Record<string, number>);

  const fichasGlobales = mesa?.fichasGlobales || {};
  if (loading) {
    return (
      <View style={s.centerFull}>
        <ActivityIndicator color="#22c55e" size="large" />
        <Text style={{ color: "#666", marginTop: 8 }}>Cargando mesa...</Text>
      </View>
    );
  }

  const estGanador = mesa?.numeroGanador !== null && mesa?.numeroGanador !== undefined
    ? getEstiloNumero(mesa.numeroGanador) : null;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🎡 Ruleta Vacas Locas</Text>
          <TouchableOpacity onPress={onSalir} style={s.backBtn}>
            <Text style={s.backBtnTxt}>← Salir al pasillo</Text>
          </TouchableOpacity>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={s.mesaBadge}>
            <Text style={s.mesaBadgeTxt}>{mesaId === "ruleta_1" ? "MESA 1" : "MESA 2"}</Text>
          </View>
          <EstadoBadge estado={estadoMesa} />
          {timeLeft > 0 && (
            <View style={[s.timerBadge, timeLeft <= 10 && s.timerBadgeUrgente]}>
              <Text style={[s.timerTxt, timeLeft <= 10 && s.timerTxtUrgente]}>⏱ {timeLeft}s</Text>
            </View>
          )}
        </View>
      </View>

      {/* Centro: spinner / resultado */}
      <View style={s.centerSection}>
        {estadoMesa === "GIRANDO" ? (
          <>
            <RuletaSpinner girando={true} />
            <Text style={s.girandoTxt}>¡NO VA MÁS!</Text>
          </>
        ) : estGanador && (estadoMesa === "ESPERANDO" || estadoMesa === "PAGANDO" || estadoMesa === null) ? (
          <View style={s.resultadoContainer}>
            <Text style={s.resultadoLabel}>ÚLTIMO NÚMERO</Text>
            <OdometerReveal key={`odo-${mesa?.numeroGanador}-${JSON.stringify((mesa as any)?.ultimaRonda)}`} numeroGanador={mesa!.numeroGanador!} />

            {/* Mensaje de Victoria/Derrota animado */}
            {miGananciaRondaAnterior ? (
              <View style={s.gananciaBadge}>
                <Text style={s.gananciaTxt}>¡GANASTE 🪙{miGananciaRondaAnterior.gananciaBruta}!</Text>
                <Text style={s.premioNetoTxt}>(Premio: +🪙{miGananciaRondaAnterior.premioNeto})</Text>
              </View>
            ) : (
              <Text style={s.derrotaTxt}>
                Mesa en espera...
              </Text>
            )}

          </View>
        ) : (
          <View style={s.esperandoContainer}>
            <Text style={s.ruletaEmojiEstatica}>🎡</Text>
            <Text style={{ color: "#444", fontSize: 12, marginTop: 8 }}>
              {estadoMesa === "ESPERANDO" ? "Esperando apuestas..." : "Mesa sin estado"}
            </Text>
          </View>
        )}
      </View>

      {/* Panel de apuesta */}
      {sePuedeApostar && (
        <View style={s.panelContainer}>
          <Text style={[s.panoTitle, { textAlign: 'center', marginBottom: 10 }]}>TOCA PARA PONER FICHAS</Text>

          {/* Selector de Valor de Ficha */}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 20 }}>
            {FICHAS_VALORES.map(v => (
              <TouchableOpacity key={v} onPress={() => setFichaSelec(v)} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: fichaSelec === v ? "#22c55e" : "#444", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: fichaSelec === v ? "white" : "#666" }}>
                <Text style={{ color: "white", fontWeight: "bold", fontSize: 13 }}>🪙{v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tablero de Ruleta Interactivo adaptativo */}
          {isWeb ? (
            /* --- LAYOUT HORIZONTAL WEB/DESKTOP --- */
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 664 }}>
                <View style={{ flexDirection: "row" }}>
                  {/* Cero Horizontal */}
                  <TouchableOpacity onPress={() => tapTablero(`num_0`, "interno", [0])} style={{ width: 40, height: 120, backgroundColor: "#166534", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>0</Text>
                    <ChipVisual m={apuestasTablero["num_0"]} bg={fichasGlobales["num_0"]} />
                  </TouchableOpacity>

                  {/* Grilla 1 a 36 Horizontal */}
                  <View style={{ flexDirection: "column" }}>
                    {ROWS_HORIZ.map((row, i) => (
                      <View key={i} style={{ flexDirection: "row" }}>
                        {row.map(cell => {
                          const est = getEstiloNumero(cell.n);
                          return (
                            <TouchableOpacity key={cell.n} onPress={() => tapTablero(`num_${cell.n}`, "interno", [cell.n])} style={{ width: 52, height: 40, backgroundColor: est.bg, borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ color: "white", fontWeight: "bold" }}>{cell.n}</Text>
                              <ChipVisual m={apuestasTablero[`num_${cell.n}`]} bg={fichasGlobales[`num_${cell.n}`]} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </View>

                {/* Docenas y Outside Bets (Web) */}
                <View style={{ marginTop: 4 }}>
                  {/* Docenas */}
                  <View style={{ flexDirection: "row", width: "100%" }}>
                    <TouchableOpacity onPress={() => tapTablero(`doz_1`, "docena", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} style={{ width: 248, height: 40, backgroundColor: "#333", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 12, fontWeight: 'bold' }}>1st 12</Text>
                      <ChipVisual m={apuestasTablero[`doz_1`]} bg={fichasGlobales[`doz_1`]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => tapTablero(`doz_2`, "docena", [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])} style={{ width: 208, height: 40, backgroundColor: "#333", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 12, fontWeight: 'bold' }}>2nd 12</Text>
                      <ChipVisual m={apuestasTablero[`doz_2`]} bg={fichasGlobales[`doz_2`]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => tapTablero(`doz_3`, "docena", [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36])} style={{ width: 208, height: 40, backgroundColor: "#333", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 12, fontWeight: 'bold' }}>3rd 12</Text>
                      <ChipVisual m={apuestasTablero[`doz_3`]} bg={fichasGlobales[`doz_3`]} />
                    </TouchableOpacity>
                  </View>

                  {/* Outside bets */}
                  <View style={{ flexDirection: "row", width: "100%", marginTop: 4 }}>
                    <TouchableOpacity onPress={() => tapTablero(`1_18`, "menor_mayor", Array.from({ length: 18 }, (_, i) => i + 1))} style={{ width: 144, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>1 to 18</Text>
                      <ChipVisual m={apuestasTablero[`1_18`]} bg={fichasGlobales[`1_18`]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => tapTablero(`even`, "par_impar", Array.from({ length: 18 }, (_, i) => (i + 1) * 2))} style={{ width: 104, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>EVEN</Text>
                      <ChipVisual m={apuestasTablero[`even`]} bg={fichasGlobales[`even`]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => tapTablero(`red`, "rojo_negro", ROJOS)} style={{ width: 104, height: 40, backgroundColor: "#dc2626", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>RED</Text>
                      <ChipVisual m={apuestasTablero[`red`]} bg={fichasGlobales[`red`]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => tapTablero(`black`, "rojo_negro", NEGROS)} style={{ width: 104, height: 40, backgroundColor: "#171717", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>BLACK</Text>
                      <ChipVisual m={apuestasTablero[`black`]} bg={fichasGlobales[`black`]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => tapTablero(`odd`, "par_impar", Array.from({ length: 18 }, (_, i) => (i * 2) + 1))} style={{ width: 104, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>ODD</Text>
                      <ChipVisual m={apuestasTablero[`odd`]} bg={fichasGlobales[`odd`]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => tapTablero(`19_36`, "menor_mayor", Array.from({ length: 18 }, (_, i) => i + 19))} style={{ width: 104, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>19 to 36</Text>
                      <ChipVisual m={apuestasTablero[`19_36`]} bg={fichasGlobales[`19_36`]} />
                    </TouchableOpacity>
                  </View>

                  {/* Jacobo Horizontal */}

                </View>
              </View>
            </View>
          ) : (
            /* --- LAYOUT VERTICAL MOBILE --- */
            <View style={{ alignItems: "center" }}>
              {/* Cero Vertical */}
              <TouchableOpacity onPress={() => tapTablero(`num_0`, "interno", [0])} style={{ width: 156, height: 40, backgroundColor: "#166534", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>0</Text>
                <ChipVisual m={apuestasTablero["num_0"]} bg={fichasGlobales["num_0"]} />
              </TouchableOpacity>

              {/* Grilla 1 a 36 Vertical */}
              {ROWS_VERT.map((row, i) => (
                <View key={i} style={{ flexDirection: "row" }}>
                  {row.map(cell => {
                    const est = getEstiloNumero(cell.n);
                    return (
                      <TouchableOpacity key={cell.n} onPress={() => tapTablero(`num_${cell.n}`, "interno", [cell.n])} style={{ width: 52, height: 40, backgroundColor: est.bg, borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "white", fontWeight: "bold" }}>{cell.n}</Text>
                        <ChipVisual m={apuestasTablero[`num_${cell.n}`]} bg={fichasGlobales[`num_${cell.n}`]} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              {/* Docenas Vertical */}
              <View style={{ flexDirection: "row", marginTop: 4 }}>
                <TouchableOpacity onPress={() => tapTablero(`doz_1`, "docena", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} style={{ width: 52, height: 40, backgroundColor: "#333", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>1st 12</Text>
                  <ChipVisual m={apuestasTablero[`doz_1`]} bg={fichasGlobales[`doz_1`]} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => tapTablero(`doz_2`, "docena", [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])} style={{ width: 52, height: 40, backgroundColor: "#333", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>2nd 12</Text>
                  <ChipVisual m={apuestasTablero[`doz_2`]} bg={fichasGlobales[`doz_2`]} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => tapTablero(`doz_3`, "docena", [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36])} style={{ width: 52, height: 40, backgroundColor: "#333", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontSize: 10, fontWeight: 'bold' }}>3rd 12</Text>
                  <ChipVisual m={apuestasTablero[`doz_3`]} bg={fichasGlobales[`doz_3`]} />
                </TouchableOpacity>
              </View>

              {/* Outside bets Vertical */}
              <View style={{ width: 156, marginTop: 4 }}>
                {/* Primera Fila */}
                <View style={{ flexDirection: "row", width: "100%" }}>
                  <TouchableOpacity onPress={() => tapTablero(`1_18`, "menor_mayor", Array.from({ length: 18 }, (_, i) => i + 1))} style={{ flex: 1, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 9, fontWeight: 'bold' }}>1 to 18</Text>
                    <ChipVisual m={apuestasTablero[`1_18`]} bg={fichasGlobales[`1_18`]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => tapTablero(`even`, "par_impar", Array.from({ length: 18 }, (_, i) => (i + 1) * 2))} style={{ flex: 1, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 9, fontWeight: 'bold' }}>EVEN</Text>
                    <ChipVisual m={apuestasTablero[`even`]} bg={fichasGlobales[`even`]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => tapTablero(`red`, "rojo_negro", ROJOS)} style={{ flex: 1, height: 40, backgroundColor: "#dc2626", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 9, fontWeight: 'bold' }}>RED</Text>
                    <ChipVisual m={apuestasTablero[`red`]} bg={fichasGlobales[`red`]} />
                  </TouchableOpacity>
                </View>

                {/* Segunda Fila */}
                <View style={{ flexDirection: "row", width: "100%" }}>
                  <TouchableOpacity onPress={() => tapTablero(`black`, "rojo_negro", NEGROS)} style={{ flex: 1, height: 40, backgroundColor: "#171717", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 9, fontWeight: 'bold' }}>BLACK</Text>
                    <ChipVisual m={apuestasTablero[`black`]} bg={fichasGlobales[`black`]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => tapTablero(`odd`, "par_impar", Array.from({ length: 18 }, (_, i) => (i * 2) + 1))} style={{ flex: 1, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 9, fontWeight: 'bold' }}>ODD</Text>
                    <ChipVisual m={apuestasTablero[`odd`]} bg={fichasGlobales[`odd`]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => tapTablero(`19_36`, "menor_mayor", Array.from({ length: 18 }, (_, i) => i + 19))} style={{ flex: 1, height: 40, backgroundColor: "#444", borderWidth: 1, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 9, fontWeight: 'bold' }}>19 to 36</Text>
                    <ChipVisual m={apuestasTablero[`19_36`]} bg={fichasGlobales[`19_36`]} />
                  </TouchableOpacity>
                </View>
              </View>
              {/* Jacobo Vertical Local */}

            </View>
          )}

          {/* Action Panel para confirmar */}
          {fichasLocales.length > 0 && (
            <View style={{ marginTop: 20, padding: 10, backgroundColor: "#1c1c1c", borderRadius: 8 }}>
              <Text style={{ color: "white", textAlign: "center" }}>Fichas No Enviadas: 🪙{fichasLocales.reduce((a, b) => a + b.monto, 0)}</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TouchableOpacity onPress={() => setFichasLocales([])} style={{ flex: 1, backgroundColor: "#ef4444", padding: 10, borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontWeight: "bold" }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmarApuestas} disabled={enviando} style={{ flex: 1, backgroundColor: "#22c55e", padding: 12, borderRadius: 8, alignItems: "center", justifyContent: "center", opacity: enviando ? 0.5 : 1 }}>
                  {enviando ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "bold", fontSize: 15 }}>CONFIRMAR APUESTA</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Información de apuesta acumulada */}
          {!fichasLocales.length && apuesta?.fichas && apuesta.fichas.length > 0 && (
            <View style={{ marginTop: 20, padding: 10, backgroundColor: "#064e3b", borderRadius: 8 }}>
              <Text style={{ color: "white", textAlign: "center", fontWeight: "bold" }}>APUESTA ENVIADA</Text>
              <Text style={{ color: "#a7f3d0", textAlign: "center", marginTop: 4 }}>Total: 🪙{apuesta.fichas.reduce((a, b) => a + b.monto, 0)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Ya apostaste, esperando resolución */}
      {estaApostando && apuesta && (
        <View style={[s.esperandoPanel, { borderColor: "#fbbf2444" }]}>
          <Text style={{ color: "#fbbf24", fontSize: 16, fontWeight: "900", textAlign: "center" }}>
            ✅ Apuesta confirmada
          </Text>
          {timeLeft > 0 && (
            <Text style={{ color: "#aaa", textAlign: "center", marginTop: 4 }}>
              La ruleta gira en {timeLeft}s
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Pantalla Principal (Selector de Mesa) ──────────────────────────────────
export default function RuletaScreen() {
  const [mesaId, setMesaId] = useState<MesaId | null>(null);

  if (!mesaId) {
    return <SelectorMesas onSelect={setMesaId} />;
  }

  return <JuegoRuleta mesaId={mesaId} onSalir={() => setMesaId(null)} />;
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG.root },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  centerFull: { flex: 1, backgroundColor: BG.root, justifyContent: "center", alignItems: "center", padding: 20, gap: 16 },

  // Selector de sala
  salaTitle: { fontSize: 28, fontWeight: "900", color: "#fff", textAlign: "center" },
  salaSub: { color: "#aaa", fontSize: 14, textAlign: "center", maxWidth: 300 },
  mesaGrid: { flexDirection: "row", gap: 16, width: "100%", maxWidth: 420, marginTop: 8 },
  mesaCard: {
    flex: 1, backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: "#27272a",
    borderRadius: 20, padding: 24, alignItems: "center", gap: 8,
    ...(Platform.OS === "web" ? { boxShadow: "0 4px 20px rgba(0,0,0,0.5)", cursor: "pointer" } as any : {}),
  },
  mesaCardEmoji: { fontSize: 48 },
  mesaCardLabel: { color: "#fff", fontSize: 18, fontWeight: "900" },
  mesaCardSub: { color: "#fbbf24", fontSize: 12 },
  mesaCardChip: { backgroundColor: "#16a34a", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginTop: 4 },
  mesaCardChipTxt: { color: "#fff", fontSize: 12, fontWeight: "900" },

  // Header in-game
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 20, fontWeight: "900", color: "#fff" },
  backBtn: { backgroundColor: "#1f2937", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, marginTop: 4, alignSelf: "flex-start" },
  backBtnTxt: { color: "#d1d5db", fontSize: 11, fontWeight: "700" },
  mesaBadge: { backgroundColor: "rgba(5,150,105,0.2)", borderWidth: 1, borderColor: "rgba(5,150,105,0.4)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  mesaBadgeTxt: { color: "#34d399", fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  estadoBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  estadoTxt: { fontSize: 10, fontWeight: "900" },
  timerBadge: { backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "#ef444440", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  timerBadgeUrgente: { backgroundColor: "rgba(239,68,68,0.25)", borderColor: "#ef4444" },
  timerTxt: { color: "#f87171", fontSize: 11, fontWeight: "900" },
  timerTxtUrgente: { color: "#ef4444" },

  // Centro
  centerSection: { backgroundColor: "#0a0a0a", borderRadius: 20, padding: 20, alignItems: "center", minHeight: 160, justifyContent: "center" },
  ruletaContenedor: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
  ruletaEmoji: { fontSize: 50 },
  girandoTxt: { color: "#fde047", fontWeight: "900", marginTop: 10, fontSize: 16 },
  resultadoContainer: { alignItems: "center", gap: 8 },
  resultadoLabel: { color: "#fbbf24", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  esperandoContainer: { alignItems: "center", opacity: 0.5 },
  ruletaEmojiEstatica: { fontSize: 50 },

  // Animación Odómetro
  odometerContainer: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: "#1c1c1c",
    borderWidth: 4, borderColor: "#fbbf24",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 15px rgba(251, 191, 36, 0.5)', background: 'radial-gradient(circle, #2a2a2a, #111)' } as any : {}),
  },
  odometerBlurTxt: { fontSize: 54, fontWeight: "bold", color: "rgba(255, 255, 255, 0.3)" },
  odometerFicha: { width: "100%", height: "100%", borderRadius: 50, alignItems: "center", justifyContent: "center" },
  odometerFichaNum: { fontSize: 40, fontWeight: "900" },

  // Ticket de apuesta
  ticketContainer: { backgroundColor: "#111", borderRadius: 12, flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: "#222" },
  ticketDecoracion: { width: 4, backgroundColor: "#22c55e" },
  ticketContenido: { flex: 1, padding: 10, flexDirection: "row", justifyContent: "space-between" },
  apuestaTipo: { color: "#fff", fontWeight: "900", fontSize: 12 },
  apuestaNums: { color: "#666", fontSize: 10 },
  ticketMontoWrap: { alignItems: "flex-end" },
  ticketMontoLbl: { color: "#444", fontSize: 8, fontWeight: "900" },
  ticketMontoVal: { color: "#fbbf24", fontWeight: "900", fontSize: 14 },

  // Panel de apuesta
  panelContainer: { gap: 12 },
  cajaFuerte: { backgroundColor: "#000", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#222", gap: 10 },
  cajaFuerteLbl: { color: "#666", fontSize: 10, fontWeight: "900", letterSpacing: 1 },

  // Chips rápidos
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipBtn: {
    backgroundColor: "#111", borderWidth: 1, borderColor: "#333",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  chipBtnSelected: { backgroundColor: "#1a3a2a", borderColor: "#22c55e" },
  chipBtnCustom: { paddingHorizontal: 14 },
  chipBtnTxt: { color: "#aaa", fontSize: 13, fontWeight: "800" },
  chipBtnTxtSelected: { color: "#4ade80" },
  montoCustomRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  montoInput: {
    flex: 1, backgroundColor: "#111", borderRadius: 10, borderWidth: 1, borderColor: "#333",
    color: "#fbbf24", fontSize: 18, fontWeight: "900", paddingHorizontal: 12, paddingVertical: 8,
  },
  montoDisplay: { flex: 1, alignItems: "center" },
  montoDisplayVal: { color: "#fbbf24", fontSize: 22, fontWeight: "900" },
  montoDisplayLbl: { color: "#444", fontSize: 10 },

  // Jacobo
  jacoboBtn: { backgroundColor: "#1a1600", padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#854d0e" },
  jacoboEmoji: { fontSize: 28 },
  jacoboTitle: { color: "#fde047", fontWeight: "900", fontSize: 14 },
  jacoboSub: { color: "#a16207", fontSize: 11 },
  jacoboMonto: { color: "#fbbf24", fontWeight: "900", fontSize: 16 },

  // Paño mesa
  panoMesa: { backgroundColor: "rgba(6,78,59,0.1)", borderRadius: 15, padding: 14, gap: 10, borderWidth: 1, borderColor: "rgba(5,150,105,0.2)" },
  panoTitle: { color: "rgba(52,211,153,0.7)", fontSize: 10, fontWeight: "900", letterSpacing: 1, textAlign: "center" },
  panoNumerosWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 },
  panoCell: { width: 38, height: 38, borderRadius: 4, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  panoCellZero: { width: "100%", height: 34, marginBottom: 2 },
  panoCellTxt: { fontSize: 11, fontWeight: "900", color: "#fff" },
  panoCellSelected: { borderColor: "#fbbf24", borderWidth: 2.5 },
  seleccionInfo: { backgroundColor: "#1a1a1a", padding: 8, borderRadius: 8, alignItems: "center" },
  seleccionTxt: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },
  plenoBtn: { backgroundColor: "#6366f1", padding: 12, borderRadius: 10, alignItems: "center" },
  plenoBtnDisabled: { opacity: 0.4 },
  plenoBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 12 },
  botonesGrid: { flexDirection: "row", gap: 8 },
  btnMesa: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center", gap: 2 },
  btnRojo: { backgroundColor: "#991b1b" },
  btnRojoTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },
  btnNegro: { backgroundColor: "#171717", borderWidth: 1, borderColor: "#333" },
  btnNegroTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },

  // Paneles de estado
  esperandoPanel: { backgroundColor: "#0a0a0a", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#222", alignItems: "center", gap: 4 },
  esperandoPanelTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  esperandoPanelSub: { color: "#666", fontSize: 12, textAlign: "center" },

  initBtn: { backgroundColor: "#16a34a", padding: 12, borderRadius: 10, alignItems: "center" },
  initBtnTxt: { color: "#fff", fontWeight: "900" },
  disabledBtn: { opacity: 0.4 },

  // --- ESTILOS MEJORADOS PARA LAS FICHAS (CHIPS) ---
  chipFalsaPadre: { ...StyleSheet.absoluteFillObject, zIndex: 10, opacity: 0.85 },
  chipFalsa: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center", borderStyle: "solid" },
  chipBg: { backgroundColor: "#52525b", borderColor: "#a1a1aa" },
  chipMonto: { backgroundColor: "#fde047", borderColor: "#ca8a04" },
  chipFalsaTxt: { color: "white", fontWeight: "900", textAlign: "center" },
  chipFalsaTxtDark: { color: "black", fontWeight: "900", textAlign: "center" },

  gananciaBadge: { backgroundColor: "rgba(34,197,94,0.2)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderColor: "#22c55e", borderWidth: 1, marginTop: 8 },
  gananciaTxt: { color: "#4ade80", fontWeight: "900", textAlign: "center", fontSize: 16 },
  premioNetoTxt: { color: "#bbf7d0", fontSize: 10, textAlign: "center" },
  derrotaTxt: { color: "#666", fontSize: 12, marginTop: 8 }
});