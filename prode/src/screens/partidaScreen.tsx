import React, { useState, useEffect } from 'react';
import { Platform, View, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { TableroTruco } from '../../src/screens/TrucoScreen';

export default function PartidaScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const [isInitializing, setIsInitializing] = useState(true);

    // 1. Intentamos obtener el ID de los parámetros o de la URL si es Web
    let partidaId = route.params?.partidaId;

    if (!partidaId && Platform.OS === 'web') {
        const path = window.location.pathname;
        const segments = path.split('/');
        if (segments[1] === 'partida' && segments[2]) {
            partidaId = segments[2];
        }
    }

    // 2. Control de inicialización: Esperamos un momento a que el router se asiente
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!partidaId) {
                // Si después de 800ms sigue sin haber ID, recién ahí volvemos al Lobby
                navigation.navigate('Lobby');
            } else {
                setIsInitializing(false);
            }
        }, 800); // Este delay evita que el F5 te eche de la partida

        return () => clearTimeout(timer);
    }, [partidaId, navigation]);

    // 3. Mientras inicializa o si no hay ID, mostramos un fondo negro con carga
    if (isInitializing || !partidaId) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#22c55e" />
                <Text style={{ color: '#666', marginTop: 10 }}>Recuperando partida...</Text>
            </View>
        );
    }

    // 4. Si todo está ok, cargamos el tablero
    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <TableroTruco
                partidaId={partidaId}
                onVolver={() => navigation.navigate('Lobby')}
            />
        </View>
    );
}