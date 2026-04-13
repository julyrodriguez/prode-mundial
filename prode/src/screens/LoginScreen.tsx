import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ImageBackground,
  useWindowDimensions,
} from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { LogIn, UserPlus } from 'lucide-react-native';
import { BG, BORDER, TEXT, ACCENT } from '../theme/colors';
import { TYPE, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../theme/typography';
import { SPACING, RADIUS, MIN_TOUCH } from '../theme/spacing';

const EXPECTED_PIN = '87654321';
const EMAIL_DOMAIN = '@equipo.local';

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768 || Platform.OS !== 'web';

  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Por favor, completa todos los campos.');
      return;
    }

    if (!isLogin && pin !== EXPECTED_PIN) {
      Alert.alert('Error', 'El PIN de registro es incorrecto.');
      return;
    }

    if (!isLogin && !name) {
      Alert.alert('Error', 'Por favor, ingresa tu nombre o apodo.');
      return;
    }

    const email = username.trim().toLowerCase() + EMAIL_DOMAIN;

    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          email,
          name,
          points: 0,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error de Autenticación', error.message || 'Ocurrió un error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={isMobile ? require('../../assets/maradonaCelu.png') : require('../../assets/maradona.png')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>

          {/* Branding */}
          <View style={styles.brandRow}>
            <Text style={styles.brandTitle}>
              VACAS{' '}<Text style={{ color: 'rgba(255,255,255,0.45)' }}>LOCAS</Text>
            </Text>
            <Text style={styles.brandSub}>PRODE DE TORNEOS</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {!isLogin && (
              <TextInput
                style={styles.input}
                placeholder="Nombre / Apodo"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={name}
                onChangeText={setName}
                accessibilityLabel="Nombre o apodo"
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Usuario"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              accessibilityLabel="Usuario"
            />

            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="rgba(255,255,255,0.3)"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              accessibilityLabel="Contraseña"
            />

            {!isLogin && (
              <TextInput
                style={styles.input}
                placeholder="PIN Secreto de Registro"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="number-pad"
                secureTextEntry
                value={pin}
                onChangeText={setPin}
                accessibilityLabel="PIN de registro"
              />
            )}

            {/* Submit */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && { opacity: 0.85 },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleAuth}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={isLogin ? 'Ingresar al Torneo' : 'Unirse al Torneo'}
            >
              {loading ? (
                <ActivityIndicator color={BG.root} />
              ) : (
                <>
                  {isLogin
                    ? <LogIn  size={16} color={BG.root} />
                    : <UserPlus size={16} color={BG.root} />}
                  <Text style={styles.buttonText}>
                    {isLogin ? 'INGRESAR AL TORNEO' : 'UNIRSE AL TORNEO'}
                  </Text>
                </>
              )}
            </Pressable>

            {/* Switch mode */}
            <Pressable
              onPress={() => setIsLogin(!isLogin)}
              style={styles.switchButton}
              accessibilityRole="button"
              accessibilityLabel={isLogin ? 'Registrarse' : 'Iniciar sesión'}
            >
              <Text style={styles.switchText}>
                {isLogin ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? '}
                <Text style={styles.switchAction}>
                  {isLogin ? 'Registrate' : 'Iniciá sesión'}
                </Text>
              </Text>
            </Pressable>
          </View>

        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as any } : {}),
  },
  overlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(5, 5, 5, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as any } : {}),
  },
  content: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: SPACING['6'],
  },

  // Branding
  brandRow: {
    alignItems: 'center',
    marginBottom: SPACING['6'],
  },
  brandTitle: {
    fontSize: FONT_SIZE['2xl'] + 4,
    fontWeight: FONT_WEIGHT.black,
    color: TEXT.primary,
    letterSpacing: LETTER_SPACING.tight,
  },
  brandSub: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.extrabold,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: LETTER_SPACING.wider,
    marginTop: SPACING['1'],
  },

  // Card
  card: {
    backgroundColor: 'rgba(13,13,15,0.88)',
    borderRadius: RADIUS.xl,
    padding: SPACING['6'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: TEXT.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING['4'],
    paddingVertical: SPACING['4'],
    marginBottom: SPACING['3'],
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
    minHeight: MIN_TOUCH,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}),
  },
  button: {
    flexDirection: 'row',
    backgroundColor: TEXT.primary,
    paddingVertical: SPACING['4'],
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING['2'],
    gap: SPACING['2'],
    minHeight: MIN_TOUCH,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'opacity 0.15s ease' } as any : {}),
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: BG.root,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.black,
    letterSpacing: LETTER_SPACING.wide,
  },
  switchButton: {
    marginTop: SPACING['5'],
    alignItems: 'center',
    paddingVertical: SPACING['2'],
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  switchText: {
    color: TEXT.muted,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  switchAction: {
    color: TEXT.secondary,
    fontWeight: FONT_WEIGHT.bold,
    textDecorationLine: 'underline',
  },
});
