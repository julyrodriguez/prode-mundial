import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator, TouchableOpacity,
  StyleSheet, Platform, useWindowDimensions, Image, Pressable, ScrollView
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import PartidaScreen from './src/screens/partidaScreen';
import { auth, db } from './src/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import LoginScreen from './src/screens/LoginScreen';
import MundialScreen from './src/screens/MundialScreen';
import ChampionsScreen from './src/screens/ChampionsScreen';
import BrazilScreen from './src/screens/BrazilScreen';
import ArgentinaScreen from './src/screens/ArgentinaScreen';
import LibertadoresScreen from './src/screens/LibertadoresScreen';
import AllMatchesScreen from './src/screens/AllMatchesScreen';
import TrucoScreen from './src/screens/TrucoScreen';
import MatchDetailScreen from './src/screens/MatchDetailScreen';
import RuletaScreen from './src/screens/RuletaScreen';
import BlackjackScreen from './src/screens/BlackjackScreen';
import BilleteraWidget from './src/components/BilleteraWidget';
import { Globe, Star, Leaf, Shield, LogOut, Calendar, Trophy, Layers } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { BG, BORDER, TEXT, ACCENT } from './src/theme/colors';
import { TYPE, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from './src/theme/typography';
import { SPACING, RADIUS, MIN_TOUCH, Z } from './src/theme/spacing';

const Stack = createNativeStackNavigator();

// ─── Tab Config ────────────────────────────────────────────────────────────────
// ACÁ CORREGIMOS 'Truco' por 'Juegos'
type TabKey = 'Partidos' | 'Mundial' | 'Champions' | 'Brasileirao' | 'Argentina' | 'Libertadores' | 'Juegos';

interface TabItem {
  key: TabKey;
  label: string;
  shortLabel: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
}

const TABS: TabItem[] = [
  { key: 'Partidos', label: 'PARTIDOS', shortLabel: 'TODOS', Icon: Calendar, color: TEXT.secondary },
  { key: 'Mundial', label: 'MUNDIAL', shortLabel: 'MUN', Icon: Globe, color: ACCENT.mundial.primary },
  { key: 'Champions', label: 'CHAMPIONS', shortLabel: 'UCL', Icon: Star, color: ACCENT.champions.primary },
  { key: 'Brasileirao', label: 'BRASILEIRÃO', shortLabel: 'BR', Icon: Leaf, color: ACCENT.brasileirao.primary },
  { key: 'Argentina', label: 'ARGENTINA', shortLabel: 'ARG', Icon: Shield, color: ACCENT.argentina.primary },
  { key: 'Libertadores', label: 'LIBERTADORES', shortLabel: 'LIB', Icon: Trophy, color: ACCENT.libertadores.primary },
  { key: 'Juegos', label: 'JUEGOS', shortLabel: 'JUEGOS', Icon: Layers, color: '#22c55e' },
];

// ─── MundialLabel (texto con gradiente tricolor) ───────────────────────────────
function MundialLabel({ active, size = 13 }: { active: boolean; size?: number }) {
  const dim = active ? TEXT.secondary : TEXT.disabled;
  const chars = [
    { ch: 'M', c: active ? ACCENT.mundial.primary : dim },
    { ch: 'U', c: active ? ACCENT.mundial.primary : dim },
    { ch: 'N', c: active ? ACCENT.mundial.secondary : dim },
    { ch: 'D', c: active ? ACCENT.mundial.secondary : dim },
    { ch: 'I', c: active ? ACCENT.mundial.tertiary : dim },
    { ch: 'A', c: active ? ACCENT.mundial.tertiary : dim },
    { ch: 'L', c: active ? ACCENT.mundial.tertiary : dim },
  ];
  return (
    <Text style={{ fontWeight: '900', fontSize: size, letterSpacing: -0.3 }}>
      {chars.map((l, i) => <Text key={i} style={{ color: l.c }}>{l.ch}</Text>)}
    </Text>
  );
}

// ─── HUB DE JUEGOS (Casino & Truco) ─────────────────────────────────────────
function JuegosHub() {
  const [juegoActivo, setJuegoActivo] = useState<'Truco' | 'Ruleta' | 'Blackjack'>('Truco');
  const { width } = useWindowDimensions();
  const isMobile = width < 600; // Punto de quiebre para el menú de juegos

  const JUEGOS = [
    { id: 'Truco',     label: 'TRUCO',     emoji: '🃏', color: '#22c55e' },
    { id: 'Ruleta',    label: 'RULETA',    emoji: '🎡', color: '#ef4444' },
    { id: 'Blackjack', label: 'BLACKJACK', emoji: '♠️', color: '#3b82f6' },
  ] as const;

  return (
    <View style={{ flex: 1 }}>
      {/* Cabecera del Casino: Centrada y Premium */}
      <View style={{
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BG.nav,
        padding: SPACING['2'],
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: BORDER.default,
        marginBottom: SPACING['4'],
        gap: isMobile ? SPACING['3'] : 0,
        position: 'relative',
        ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.4)' } as any : {}),
      }}>
        {/* Navegación interna centrada */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: 'rgba(0,0,0,0.2)',
          borderRadius: RADIUS.lg,
          padding: 4,
          gap: 4,
        }}>
          {JUEGOS.map((j) => {
            const isActive = juegoActivo === j.id;
            return (
              <Pressable
                key={j.id}
                onPress={() => setJuegoActivo(j.id)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: isMobile ? 12 : 16,
                    paddingVertical: 10,
                    borderRadius: RADIUS.md,
                    gap: 8,
                    backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                    borderWidth: 1,
                    borderColor: isActive ? j.color + '40' : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.2s ease' } as any : {}),
                  },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }
                ]}
              >
                <Text style={{ fontSize: isMobile ? 16 : 18 }}>{j.emoji}</Text>
                <Text style={{
                  color: isActive ? j.color : TEXT.muted,
                  fontSize: 11,
                  fontWeight: '900',
                  letterSpacing: 1.2,
                }}>
                  {j.label}
                </Text>
                {isActive && (
                  <View style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '20%',
                    right: '20%',
                    height: 2,
                    backgroundColor: j.color,
                    borderRadius: 2,
                    shadowColor: j.color,
                    shadowOpacity: 1,
                    shadowRadius: 4,
                    elevation: 4,
                  }} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* El widget con las monedas (Flotante a la derecha en desktop) */}
        <View style={!isMobile ? { position: 'absolute', right: 12 } : { width: '100%', alignItems: 'center' }}>
          <BilleteraWidget />
        </View>
      </View>

      {/* Renderizado dinámico del juego elegido */}
      <View style={{ flex: 1 }}>
        {juegoActivo === 'Truco' && <TrucoScreen />}
        {juegoActivo === 'Ruleta' && <RuletaScreen />}
        {juegoActivo === 'Blackjack' && <BlackjackScreen />}
      </View>
    </View>
  );
}

// ─── Main Layout ───────────────────────────────────────────────────────────────
function WebMainLayout() {
  const [activeTab, setActiveTab] = useState<TabKey>('Partidos');
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 700;
  const navigation = useNavigation<any>();

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.title = 'Vacas Locas Mundialistas';
  }

  // 🕒 Traffic logging
  useEffect(() => {
    if (!auth.currentUser) return;
    const logAccess = async () => {
      try {
        const uId = auth.currentUser!.uid;
        const metaRef = doc(db, 'metadata', 'traffic');
        const [uSnap, tSnap] = await Promise.all([
          getDoc(doc(db, 'users', uId)),
          getDoc(metaRef),
        ]);
        const username = uSnap.exists() ? uSnap.data().name : (auth.currentUser!.displayName || auth.currentUser!.email);
        const entry = { name: username, time: new Date().toISOString(), uId };
        let history = tSnap.exists() ? (tSnap.data().history || []) : [];
        history = [entry, ...history].slice(0, 10);
        await setDoc(metaRef, { lastPerson: username, lastAccess: entry.time, lastUserId: uId, history }, { merge: true });
      } catch (e) { console.warn('[traffic]', e); }
    };
    logAccess();
  }, []);

  const handleLogout = async () => { await signOut(auth); };

  const activeTabCfg = TABS.find(t => t.key === activeTab)!;

  return (
    <View style={[styles.root, { paddingBottom: isMobile ? insets.bottom : 0 }]}>
      {/* ─── Top NavBar ───────────────────────────────────────────────────── */}
      <View style={[styles.navBar, { paddingTop: insets.top }]}>
        <View style={[styles.navContent, isMobile && { paddingHorizontal: SPACING['3'] }]}>

          {/* Logo */}
          <View style={styles.logoRow}>
            <Image
              source={require('./assets/favicon.png')}
              style={{ width: isMobile ? 22 : 26, height: isMobile ? 22 : 26 }}
              resizeMode="contain"
            />
            {!isMobile && (
              <Text style={styles.logoTxt}>
                VACAS <Text style={{ color: TEXT.muted }}>LOCAS</Text>
              </Text>
            )}
          </View>

          {/* Desktop tabs */}
          {!isMobile && (
            <View style={styles.tabStrip}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={({ pressed }) => [
                      styles.desktopTab,
                      isActive && styles.desktopTabActive,
                      pressed && !isActive && styles.desktopTabHover,
                    ]}
                    onPress={() => setActiveTab(tab.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                  >
                    {tab.key === 'Mundial' ? (
                      <>
                        <Globe size={13} color={isActive ? ACCENT.mundial.primary : TEXT.muted} />
                        <MundialLabel active={isActive} size={12} />
                      </>
                    ) : (
                      <>
                        <tab.Icon size={13} color={isActive ? tab.color : TEXT.muted} />
                        <Text style={[styles.desktopTabTxt, isActive && { color: tab.color }]}>
                          {tab.label}
                        </Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Logout */}
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
            onPress={handleLogout}
            accessibilityLabel="Cerrar sesión"
            accessibilityRole="button"
          >
            <LogOut size={14} color={TEXT.muted} />
            {!isMobile && <Text style={styles.logoutTxt}>Salir</Text>}
          </Pressable>
        </View>

        {/* Mobile: active tab indicator strip */}
        {isMobile && (
          <View style={styles.mobileTabIndicator}>
            <activeTabCfg.Icon size={12} color={activeTabCfg.color} />
            {activeTab === 'Mundial' ? (
              <MundialLabel active={true} size={12} />
            ) : (
              <Text style={[styles.mobileActiveLabel, { color: activeTabCfg.color }]}>
                {activeTabCfg.label}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ─── Content Area ─────────────────────────────────────────────────── */}
      <View style={[styles.content, isMobile && styles.contentMobile]}>
        {activeTab === 'Partidos' && <AllMatchesScreen />}
        {activeTab === 'Mundial' && <MundialScreen />}
        {activeTab === 'Champions' && <ChampionsScreen />}
        {activeTab === 'Brasileirao' && <BrazilScreen />}
        {activeTab === 'Argentina' && <ArgentinaScreen />}
        {activeTab === 'Libertadores' && <LibertadoresScreen />}
        {activeTab === 'Juegos' && <JuegosHub />}
      </View>

      {/* ─── Mobile Bottom Bar ────────────────────────────────────────────── */}
      {isMobile && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, SPACING['2']) }]}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={({ pressed }) => [
                  styles.bottomTab,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
              >
                {tab.key === 'Mundial' ? (
                  <Globe size={20} color={isActive ? ACCENT.mundial.primary : TEXT.disabled} />
                ) : (
                  <tab.Icon size={20} color={isActive ? tab.color : TEXT.disabled} />
                )}

                {tab.key === 'Mundial' ? (
                  <MundialLabel active={isActive} size={8} />
                ) : (
                  <Text style={[styles.bottomTabTxt, isActive && { color: tab.color }]}>
                    {tab.shortLabel}
                  </Text>
                )}

                {/* Active indicator dot */}
                {isActive && (
                  <View style={[styles.activeDot, { backgroundColor: tab.color }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
    return unsub;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG.root }}>
        <ActivityIndicator size="large" color={TEXT.secondary} />
      </View>
    );
  }

  const linking = {
    prefixes: [],
    config: {
      screens: {
        'Vacas Locas Mundialistas': '',
        'Partida': { path: 'partida/:partidaId' },
        'MatchDetail': { path: 'partido/:id', parse: { id: (id: string) => id } },
      },
    },
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={BG.nav} />
      <NavigationContainer linking={linking}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {user ? (
            <>
              <Stack.Screen
                name="Vacas Locas Mundialistas"
                component={WebMainLayout}
                options={{ title: 'Vacas Locas Mundialistas' }}
              />
              <Stack.Screen name="Partida" component={PartidaScreen} />
              <Stack.Screen
                name="MatchDetail"
                component={MatchDetailScreen}
                options={{ title: 'Detalle del Partido', animation: 'slide_from_right' }}
              />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG.root,
  },

  // ── NavBar ──
  navBar: {
    backgroundColor: BG.nav,
    borderBottomWidth: 1,
    borderBottomColor: BORDER.subtle,
    zIndex: Z.sticky,
    ...(Platform.OS === 'web' ? {
      position: 'sticky' as any,
      top: 0,
    } : {}),
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING['5'],
    paddingVertical: SPACING['2.5'],
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING['2'],
  },
  logoTxt: {
    color: TEXT.primary,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.black,
    letterSpacing: LETTER_SPACING.tight,
  },

  // Desktop Tab Strip
  tabStrip: {
    flexDirection: 'row',
    backgroundColor: BG.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: BORDER.subtle,
    padding: SPACING['1'],
    gap: SPACING['0.5'],
  },
  desktopTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING['3'],
    paddingVertical: SPACING['2'],
    borderRadius: RADIUS.md,
    gap: SPACING['1.5'],
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.15s ease' } as any : {}),
  },
  desktopTabActive: {
    backgroundColor: BG.elevated,
  },
  desktopTabHover: {
    backgroundColor: BG.hover,
  },
  desktopTabTxt: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.extrabold,
    color: TEXT.muted,
    letterSpacing: LETTER_SPACING.wide,
  },

  // Mobile tab indicator
  mobileTabIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING['1'],
    paddingVertical: SPACING['1'],
    borderTopWidth: 1,
    borderTopColor: BORDER.subtle,
  },
  mobileActiveLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.black,
    letterSpacing: LETTER_SPACING.wider,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG.surface,
    paddingHorizontal: SPACING['3'],
    paddingVertical: SPACING['2'],
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: BORDER.subtle,
    gap: SPACING['1.5'],
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  logoutTxt: {
    color: TEXT.muted,
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: LETTER_SPACING.wide,
  },

  // ── Content ──
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: SPACING['5'],
    paddingTop: SPACING['5'],
  },
  contentMobile: {
    paddingHorizontal: SPACING['3'],
    paddingTop: SPACING['3'],
    paddingBottom: 70, // espacio para bottom bar
  },

  // ── Bottom Bar ──
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: BG.nav,
    borderTopWidth: 1,
    borderTopColor: BORDER.subtle,
    paddingTop: SPACING['1.5'],
    zIndex: Z.overlay,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING['1'],
    paddingVertical: SPACING['1.5'],
    minHeight: MIN_TOUCH,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  bottomTabTxt: {
    fontSize: 8,
    fontWeight: FONT_WEIGHT.black,
    color: TEXT.disabled,
    letterSpacing: LETTER_SPACING.wide,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: RADIUS.full,
    position: 'absolute',
    bottom: 2,
  },
});