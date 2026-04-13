# Backlog de Refactorización UI/UX: Prode Mundial

## FASE 1: Fundación y Tokens
- [ ] **[Diseño] Tarea 1.1:** Crear `src/theme/colors.ts` conteniendo la nueva paleta Dark Mode y colores de acento por campeonato.
- [ ] **[Diseño] Tarea 1.2:** Crear `src/theme/typography.ts` para agrupar variables de fuentes, tamaños de letra y jerarquías (`h1`, `h2`, `body`, `caption`).
- [ ] **[Dependencias] Tarea 1.3:** Instalar e integrar `react-native-safe-area-context` para manejar adecuadamente el *notch* y *bottom bar* en dispositivos móviles.

## FASE 2: Estructura de Navegación 
- [ ] **[Estructura] Tarea 2.1:** Reemplazar el state manual `activeTab` en `App.tsx` por el `createBottomTabNavigator` de `@react-navigation/bottom-tabs` para usuarios móviles, o un SidebarNavigator robusto para escritorio.
- [ ] **[Estructura] Tarea 2.2:** Asegurarnos que la StatusBar use un estilo transparente acorde con el Dark Mode, utilizando `<StatusBar barStyle="light-content" />`.

## FASE 3: Renovación Visual de Pantallas
- [ ] **[Screens] Tarea 3.1:** **AllMatchesScreen:** Implementar sistema de Grid adaptativo/FlatLists con separación semántica por fechas de partidos.
- [ ] **[Componentes] Tarea 3.2:** Re-diseñar el componente `MatchCard` (Tarjeta de torneo). Implementar bordes sutiles, sombras oscuras, avatar de los equipos amplios y mejor contraste en resultados.
- [ ] **[UI] Tarea 3.3:** Añadir un sistema de "Skeletons" o animaciones de carga (loaders de alto nivel) en vez del clásico ActivityIndicator del SO. 

## FASE 4: Experiencia de Uso (Touch & Motion)
- [ ] **[Controles] Tarea 4.1:** Reemplazar de forma masiva `TouchableOpacity` por componentes que simulen un escalado usando hooks de reanimated o Pressable custom, aportando feeling App Nativa Moderna.
- [ ] **[Alertas] Tarea 4.2:** Reemplazar los componentes nativos genéricos `alert` por un sistema de *Toasts* o *Modals* renderizados a medida integrados con el Dark Theme para feedback ("Guardado correctamente", "Hubo un error", etc).
