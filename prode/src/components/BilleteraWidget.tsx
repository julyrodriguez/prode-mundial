import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export default function BilleteraWidget() {
  const [saldo, setSaldo] = useState<number>(0);
  const [yaReclamoHoy, setYaReclamoHoy] = useState<boolean>(true);
  const [cargandoReclamo, setCargandoReclamo] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const billeteraRef = doc(db, 'billeteras', uid);

    // Escuchamos la billetera en tiempo real
    const unsub = onSnapshot(billeteraRef, (docSnap) => {
      if (docSnap.exists()) {
        const datos = docSnap.data();
        setSaldo(datos.saldo || 0);

        // Calculamos la fecha de hoy en el frontend para comparar
        const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        const [dia, mes, anio] = hoy.split('/');
        const fechaHoyFront = `${anio}-${mes}-${dia}`;

        // Si la fecha de la base de datos es distinta a hoy, habilitamos el botón
        setYaReclamoHoy(datos.ultimoReclamo === fechaHoyFront);
      } else {
        // Si no existe el documento, significa que es nuevo y puede reclamar
        setSaldo(0);
        setYaReclamoHoy(false);
      }
    });

    return () => unsub();
  }, []);

  const manejarReclamo = async () => {
    if (cargandoReclamo) return;
    setCargandoReclamo(true);

    try {
      const functions = getFunctions();
      // Llamamos a la función del backend que creaste antes
      const reclamarMonedas = httpsCallable(functions, 'reclamarMonedasDiarias');
      const resultado: any = await reclamarMonedas();

      // Mostrar mensajito de éxito
      if (Platform.OS === 'web') {
        window.alert(`¡Premio Diario!\n${resultado.data.mensaje}`);
      } else {
        Alert.alert("¡Premio Diario!", resultado.data.mensaje);
      }
    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert(`Aviso: ${error.message}`);
      } else {
        Alert.alert("Aviso", error.message);
      }
    } finally {
      setCargandoReclamo(false);
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, backgroundColor: '#0d0d0d', borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a' }}>
      {/* Mostrar Saldo */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }}>
        <Text style={{ fontSize: 18 }}>🪙</Text>
        <Text style={{ color: '#fbbf24', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{saldo}</Text>
      </View>


    </View>
  );
}