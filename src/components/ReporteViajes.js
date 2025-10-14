import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function obtenerFechaActual() {
  const fecha = new Date();
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const año = fecha.getFullYear();
  return `${dia}-${mes}-${año}`;
}

function ReporteViajes() {
  const [viajes, setViajes] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedViaje, setSelectedViaje] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [resumen, setResumen] = useState({ aceptados: 0, manuales: 0 });

  useEffect(() => {
    cargarViajes();
  }, []);

  const cargarViajes = async () => {
    try {
      setCargando(true);
      setError(null);
      const fechaActual = obtenerFechaActual();
      
      // Cargar viajes de la colección todosLosViajes
      const viajesRef = collection(db, 'todosLosViajes', fechaActual, 'viajes');
      const viajesSnapshot = await getDocs(viajesRef);
      
      const viajesCargados = [];
      viajesSnapshot.forEach((doc) => {
        const viajeData = doc.data();
        viajesCargados.push({
          id: doc.id,
          ...viajeData
        });
      });

      // Actualizar resumen
      const aceptados = viajesCargados.filter(v => v.estado === 'Aceptado' || v.estado === 'Finalizado').length;
      const manuales = viajesCargados.filter(v => (v.tipoPedido || '').toLowerCase().includes('manual')).length;
      
      setViajes(viajesCargados);
      setResumen({ aceptados, manuales });
      
    } catch (error) {
      console.error('Error al cargar viajes:', error);
      setError('Error al cargar los viajes: ' + error.message);
    } finally {
      setCargando(false);
    }
  };
  
  const enviarMensaje = async (unidad, mensaje) => {
    try {
      await addDoc(collection(db, 'mensajesConductor'), {
        unidad,
        mensaje,
        fecha: serverTimestamp(),
        leido: false
      });
      
      alert('Mensaje enviado exitosamente');
      setMensaje('');
      setModalVisible(false);
      setSelectedViaje(null);
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      alert('Error al enviar el mensaje: ' + error.message);
    }
  };

  // Helpers: obtener calificación, comentario y operadora tolerando variantes
  const getRating = (v) => {
    const raw = v?.rating ?? v?.calificacion ?? v?.puntuacion ?? v?.valoracion ?? v?.evaluacion ?? (v?.feedback && (v.feedback.rating ?? v.feedback.calificacion ?? v.feedback.puntuacion));
    const n = Number(raw);
    if (!isNaN(n) && n > 0) {
      const clamped = Math.max(1, Math.min(5, Math.round(n)));
      return '★'.repeat(clamped);
    }
    // Si viene en texto
    return (typeof raw === 'string' ? raw : '') || '';
  };

  const getComment = (v) =>
    v?.comment ?? v?.comentario ?? v?.comentarios ?? v?.observacion ?? v?.observaciones ?? (v?.feedback && (v.feedback.comment ?? v.feedback.comentario ?? v.feedback.observacion)) ?? '';

  const getOperador = (v) =>
    (v?.operador && (v.operador.nombre || v.operador.name)) || v?.operadora || v?.operador || v?.operator || v?.atendidoPor || '';

  return (
    <div className="reporte-viajes">
      <h2>📋 Resumen de Viajes</h2>
      
      {error && (
        <div style={{ 
          background: '#fee2e2', 
          color: '#dc2626', 
          padding: '1rem', 
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          ❌ {error}
        </div>
      )}

      {cargando ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280'
        }}>
          Cargando viajes...
        </div>
      ) : (
        <>
          <div className="resumen-boxes" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ background: '#e3fcec', padding: '1rem', borderRadius: '8px' }}>
              <strong>Aceptados:</strong> {resumen.aceptados}
            </div>
            <div style={{ background: '#fff3cd', padding: '1rem', borderRadius: '8px' }}>
              <strong>Manual:</strong> {resumen.manuales}
            </div>
          </div>
          
          {viajes.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem',
              background: '#f9fafb',
              borderRadius: '8px',
              color: '#6b7280'
            }}>
              No hay viajes para mostrar
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Fecha</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Teléfono</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Dirección</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Sector</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Modo Selección</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Nombre</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Cliente</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Operador</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Tipo Pedido</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Unidad</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Valor</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Modo Asignación</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Calificación</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Comentario</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Estado</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {viajes.map((v, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px' }}>{v.fecha}</td>
                    <td style={{ padding: '12px' }}>{v.telefono}</td>
                    <td style={{ padding: '12px' }}>{v.direccion}</td>
                    <td style={{ padding: '12px' }}>{v.sector}</td>
                    <td style={{ padding: '12px' }}>{v.modoSeleccion}</td>
                    <td style={{ padding: '12px' }}>{v.nombre}</td>
                    <td style={{ padding: '12px' }}>{v.nombreCliente}</td>
                    <td style={{ padding: '12px' }}>{getOperador(v) || '—'}</td>
                    <td style={{ padding: '12px' }}>{v.tipoPedido}</td>
                    <td style={{ padding: '12px' }}>{v.unidad}</td>
                    <td style={{ padding: '12px' }}>{v.valor}</td>
                    <td style={{ padding: '12px' }}>{v.modoAsignacion}</td>
                    <td style={{ padding: '12px' }}>{getRating(v) || '—'}</td>
                    <td style={{ padding: '12px', maxWidth: 360, wordBreak: 'break-word' }}>{getComment(v) || '—'}</td>
                    <td style={{ padding: '12px' }}>{v.estado}</td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => {
                          setSelectedViaje(v);
                          setModalVisible(true);
                        }}
                        style={{
                          background: '#4CAF50',
                          color: 'white',
                          padding: '8px 12px',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        ✉️ Enviar Mensaje
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Modal para enviar mensaje */}
      {modalVisible && selectedViaje && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px'
          }}>
            <h3 style={{ marginTop: 0 }}>Enviar Mensaje al Conductor</h3>
            <p><strong>Unidad:</strong> {selectedViaje.unidad}</p>
            <p><strong>Conductor:</strong> {selectedViaje.nombre}</p>
            <p><strong>Tipo de Viaje:</strong> {selectedViaje.tipoPedido}</p>
            
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Escriba su mensaje aquí..."
              style={{
                width: '100%',
                minHeight: '100px',
                marginBottom: '15px',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setModalVisible(false);
                  setMensaje('');
                  setSelectedViaje(null);
                }}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => enviarMensaje(selectedViaje.unidad, mensaje)}
                style={{
                  padding: '8px 16px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                disabled={!mensaje.trim()}
              >
                Enviar Mensaje
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReporteViajes;
