import React from 'react';
import { useHistorialGlobal } from '../lib/useHistorialGlobal';

export default function HistorialPublico() {
  const { partidas, loading, error } = useHistorialGlobal();

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
        <p>📡 Cargando historial del grupo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, color: '#f87171', textAlign: 'center', backgroundColor: '#1a1a1a', borderRadius: '12px', margin: '20px' }}>
        <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Falta un índice en Firestore</p>
        <p style={{ fontSize: '13px', color: '#999' }}>
          Abre la consola del navegador (F12) y haz clic en el link de Firebase para crearlo automáticamente. 
          Tarda unos 2 min.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#fff', textAlign: 'center' }}>
        🏆 Historial Vacas Locas
      </h2>
      
      <div style={{ overflowX: 'auto', backgroundColor: '#0a0a0a', borderRadius: '12px', border: '1px solid #1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#111', borderBottom: '1px solid #222' }}>
              <th style={{ padding: '12px', color: '#666', fontSize: '12px' }}>FECHA</th>
              <th style={{ padding: '12px', color: '#666', fontSize: '12px' }}>PARTIDA</th>
              <th style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>RESULTADO</th>
              <th style={{ padding: '12px', color: '#666', fontSize: '12px' }}>TIPO</th>
            </tr>
          </thead>
          <tbody>
            {partidas.map((p) => {
              // Manejar tanto Timestamps como ISO Strings
              let fechaObj: Date | null = null;
              if (p.actualizadaEn?.toDate) {
                fechaObj = p.actualizadaEn.toDate();
              } else if (p.actualizadaEn) {
                fechaObj = new Date(p.actualizadaEn);
              }
              
              const fechaRender = (fechaObj && !isNaN(fechaObj.getTime()))
                ? `${fechaObj.getDate().toString().padStart(2, '0')}/${(fechaObj.getMonth() + 1).toString().padStart(2, '0')} ${fechaObj.getHours().toString().padStart(2, '0')}:${fechaObj.getMinutes().toString().padStart(2, '0')}`
                : 'Reciente';

              const j1 = p.jugadores ? p.jugadores[p.jugadorA] : null;
              const j2 = p.jugadores ? p.jugadores[p.jugadorB] : null;
              
              if (!j1 || !j2) return null;

              const isJ1Ganador = p.ganador === j1.uid;
              const isJ2Ganador = p.ganador === j2.uid;

              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '12px', color: '#555', fontSize: '12px' }}>
                    {fechaRender}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ color: isJ1Ganador ? '#22c55e' : '#fff', fontWeight: isJ1Ganador ? 'bold' : 'normal', fontSize: '14px' }}>
                        {j1?.nombre} {isJ1Ganador && '🏆'}
                    </div>
                    <div style={{ color: isJ2Ganador ? '#22c55e' : '#999', fontWeight: isJ2Ganador ? 'bold' : 'normal', fontSize: '14px', marginTop: '4px' }}>
                        {j2?.nombre} {isJ2Ganador && '🏆'}
                    </div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ backgroundColor: '#1a1a1a', padding: '6px', borderRadius: '6px', color: '#22c55e', fontWeight: 'bold' }}>
                        {j1.puntos} - {j2.puntos}
                    </div>
                  </td>
                  <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                    {p.estado === 'CANCELADA' ? (
                        <span style={{ color: '#ef4444', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Cancelada</span>
                    ) : (j1.puntos >= 30 || j2.puntos >= 30) ? (
                        <span style={{ color: '#22c55e', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Victoria</span>
                    ) : p.estado === 'ABANDONADA' ? (
                        <span style={{ color: '#f59e0b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Abandono</span>
                    ) : ( 
                        <span style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Finalizada</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {partidas.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#444' }}>
            No hay registros todavía.
          </div>
        )}
      </div>
    </div>
  );
}
