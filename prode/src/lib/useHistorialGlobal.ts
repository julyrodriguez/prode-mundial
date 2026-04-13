import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase'; 

export function useHistorialGlobal() {
  const [partidas, setPartidas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Escuchamos EL ÚNICO documento de historial de partidas. ¡1 sola lectura en vez de N!
    const ref = doc(db, 'truco_system', 'global_history');

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const hist = data.partidas || [];
          
          // 2. Ordenamos manualmente en el cliente por 'actualizadaEn' DESC
          hist.sort((a: any, b: any) => {
            const tA = (a.actualizadaEn?.seconds * 1000) || new Date(a.actualizadaEn).getTime() || 0;
            const tB = (b.actualizadaEn?.seconds * 1000) || new Date(b.actualizadaEn).getTime() || 0;
            return tB - tA;
          });

          setPartidas(hist);
        } else {
          // Aún no existe el doc, está vacío
          setPartidas([]);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error obteniendo historial general único:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { partidas, loading, error };
}

