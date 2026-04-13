# Hoja de Ruta Técnica: Rediseño UX/UI Prode Mundial

## 1. Visión y Estándar de Calidad (Estándar de Diamante)

El objetivo es elevar la aplicación "Vacas Locas Mundialistas" (Prode Mundial) desde un MVP funcional a una experiencia móvil/web **Premium e Inmersiva**. Al tratarse de una aplicación de seguimiento deportivo y apuestas entre amigos (Prode/Truco), el diseño debe evocar la emoción del deporte, la claridad de las estadísticas y la modernidad de las plataformas *Fintech* o de *e-sports*.

### Principios de Diseño
- **Mobile-First & Touch-First:** Targets de toque de al menos 44x44px. Bottom Tabs accesibles con el pulgar.
- **Dark Mode Premium:** Uso de paletas de oscuros escalados (ej. fondos `#09090b` hasta cartas `#18181b`), con acentos de color vibrantes según la liga (Champions en dorado, Brasileirao en verde neón, etc.).
- **Micro-interacciones:** Feedback inmediato al interactuar (escalados suaves en los tabs de navegación).
- **Legibilidad Crítica:** Fuentes tipográficas modernas (ej. Inter, Outfit o Roboto) con jerarquías claras para diferenciar equipos, puntajes y horarios.

---

## 2. Squad de Especialistas Asignado

Para ejecutar esta metamorfosis con la mayor precisión, he activado la aportación de los siguientes perfiles de nuestra forja:

1. **@00-andruia-consultant (Arquitecto de Soluciones):** Liderazgo, supervisión del roadmap y blindaje del código.
2. **@ui-ux-pro-max (Estratega de UX):** Análisis de accesibilidad, contrastes, touch-targets y jerarquías de navegación.
3. **@mobile-design (Experto Mobile-First):** Implementación de patrones respetuosos con las plataformas (Safe Areas, Bottom Sheets, navegación nativa).
4. **@frontend-design (Diseñador Frontend / Animations):** Creación del sistema de diseño (Design Tokens), hover states y micro-motion.

---

## 3. Diagnóstico Arquitectónico del UI Actual

Tras analizar `App.tsx`:
- **Acoplamiento de Estilos:** Se están usando colores y medidas *hardcodeadas* (ej. `#080808`, `14px`) en línea y en StyleSheet. Falta una fuente de verdad (Theme).
- **Navegación Móvil (Bottom Tabs):** La barra inferior (`mobileBar`) es un View absoluto, lo cual da problemas con los "Safe Areas" (notches y barras de navegación de iOS/Android). Debería usarse `createBottomTabNavigator`.
- **Iconografía Compleja:** El logo "MundialLabel" dibuja letra por letra con colores diferentes. Es creativo pero costoso de mantener visualmente en diferentes tamaños.
- **Transiciones y Feedback:** Botones usan `TouchableOpacity`, que es básico. Se recomienda la API `Pressable` con transformaciones de estilo (opacidad y pequeña escala).

---

## 4. Fases de Implementación Técnica

### FASE 1: Fundación del Sistema de Diseño (Design Tokens)
- Centralizar todos los colores, espaciados y tipografías en un archivo `theme.ts`.
- Definir paleta semántica: `background`, `surface`, `border`, `textPrimary`, `textSecondary`.
- Definir la paleta de acentos de cada torneo (Champions: Amber-500, Libertadores: Yellow-400, etc.).

### FASE 2: Refactorización Estructural (Navegación)
- Reemplazar el layout custom `WebMainLayout` por el ecosistema de tabuladores de React Navigation (`createBottomTabNavigator` para mobile; layout adaptable para web).
- Asegurar uso de `SafeAreaView` e `useSafeAreaInsets` de `react-native-safe-area-context` para evitar superposiciones con bordes de pantalla.

### FASE 3: Renovación de Componentes Clave
- **Cards de Partidos:** Rediseñar la tarjeta donde se muestran los escudos y los equipos. Integrar 'Glassmorphism' ligero (fondos semitransparentes con bordes tenues sobre el fondo negro).
- **Inputs de Predicción:** Interfaz clara y táctil para ingresar los goles del Prode, sin depender del teclado numérico invasivo si es posible (ej, botones `-` y `+` con tamaño considerable).

### FASE 4: Pulido y Micro-Animaciones
- Incorporar la librería `react-native-reanimated` o animaciones nativas de React Native.
- Animación de cambio de vistas en el navegador.
- Efectos al presionar los tabs o enviar predicción.
