import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebaseConfig';

function Dashboard() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [operadorAutenticado, setOperadorAutenticado] = useState(null);
  const [reporteDiario, setReporteDiario] = useState({
    viajesRegistrados: 0,
    viajesAsignados: 0,
    viajesCancelados: 0,
    viajesCanceladosPorCliente: 0,
    viajesCanceladosPorConductor: 0,
    viajesSinUnidad: 0
  });

  // Nuevo estado para el resumen de viajes de la operadora
  const [resumenViajesOperadora, setResumenViajesOperadora] = useState({
    viajesAsignados: 0,
    canceladosPorCliente: 0,
    canceladosPorConductor: 0,
    total: 0
  });

  const [alertasEnPantalla, setAlertasEnPantalla] = useState([]);
  const [sonidoBloqueado, setSonidoBloqueado] = useState(false);
  const alertaAudioRef = useRef(null);
  const alertaCargaInicial = useRef(true);
  const alertasTimeouts = useRef({});

const cerrarAlerta = useCallback((alertaId) => {
  setAlertasEnPantalla((prev) => prev.filter((alerta) => alerta.id !== alertaId));
  if (alertasTimeouts.current[alertaId]) {
    clearTimeout(alertasTimeouts.current[alertaId]);
    delete alertasTimeouts.current[alertaId];
  }
}, []);

const intentarReproducirAlerta = useCallback(async () => {
  if (!alertaAudioRef.current) return;
  try {
    alertaAudioRef.current.currentTime = 0;
    await alertaAudioRef.current.play();
    setSonidoBloqueado(false);
  } catch (error) {
    console.warn('El navegador bloqueó el sonido de la alerta:', error);
    setSonidoBloqueado(true);
  }
}, []);

const habilitarSonidoManualmente = useCallback(async () => {
  if (!alertaAudioRef.current) return;
  try {
    await alertaAudioRef.current.play();
    alertaAudioRef.current.pause();
    alertaAudioRef.current.currentTime = 0;
    setSonidoBloqueado(false);
  } catch (error) {
    console.error('No se pudo habilitar el sonido de alertas:', error);
    setSonidoBloqueado(true);
  }
}, []);

const obtenerTimestampConversacion = (data) => {
  if (!data) return Date.now();
  try {
    if (data.timestamp?.seconds) {
      return data.timestamp.seconds * 1000;
    }
    if (data.timestamp?.toDate) {
      return data.timestamp.toDate().getTime();
    }
    if (typeof data.timestamp === 'string') {
      const parsed = Date.parse(data.timestamp);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (typeof data.created_at === 'string') {
      const parsed = Date.parse(data.created_at);
      if (!Number.isNaN(parsed)) return parsed;
    }
  } catch (error) {
    console.warn('No se pudo interpretar la fecha del chat:', error);
  }
  return Date.now();
};

const obtenerColorPorTipo = (tipo, origen) => {
  const valor = (tipo || '').toString().trim().toUpperCase();
  const origenValor = (origen || '').toString().trim().toLowerCase();
  if (valor.includes('URG') || valor.includes('ALERTA')) return '#dc2626';
  if (valor.includes('SALUD')) return '#0ea5e9';
  if (valor.includes('REPET')) return '#facc15';
  if (origenValor.includes('whatsapp')) return '#25d366';
  return '#3b82f6';
};

const formatearHoraCorta = (timestamp) => {
  if (!timestamp) return '--:--';
  try {
    return new Date(timestamp).toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    console.warn('No se pudo formatear la hora de la alerta:', error);
    return '--:--';
  }
};

useEffect(() => {
  try {
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
    audio.preload = 'auto';
    audio.volume = 1;
    audio.crossOrigin = 'anonymous';
    alertaAudioRef.current = audio;
  } catch (error) {
    console.warn('No se pudo inicializar el audio de alertas:', error);
  }

  return () => {
    if (alertaAudioRef.current) {
      alertaAudioRef.current.pause();
      alertaAudioRef.current = null;
    }
  };
}, []);

  useEffect(() => {
    let unsubscribeAlertas;

    try {
      const alertasRef = collection(db, 'chatConversaciones');
      unsubscribeAlertas = onSnapshot(
        alertasRef,
        (snapshot) => {
          if (alertaCargaInicial.current) {
            alertaCargaInicial.current = false;
            return;
          }

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data() || {};
              const nuevaAlerta = {
                id: change.doc.id,
                ...data,
                recibidoEn: obtenerTimestampConversacion(data)
              };

              setAlertasEnPantalla((prev) => {
                if (prev.some((alerta) => alerta.id === nuevaAlerta.id)) {
                  return prev;
                }
                return [...prev, nuevaAlerta];
              });

              intentarReproducirAlerta();

              const timeoutId = setTimeout(() => {
                cerrarAlerta(nuevaAlerta.id);
              }, 15000);
              alertasTimeouts.current[nuevaAlerta.id] = timeoutId;
            }
          });
        },
        (error) => {
          console.error('❌ Error escuchando alertas:', error);
        }
      );
    } catch (error) {
      console.error('❌ Error configurando listener de alertas:', error);
    }

    return () => {
      if (unsubscribeAlertas) {
        unsubscribeAlertas();
      }
      Object.values(alertasTimeouts.current).forEach((timeoutId) => clearTimeout(timeoutId));
      alertasTimeouts.current = {};
    };
  }, [cerrarAlerta, intentarReproducirAlerta]);

  // Disparador para abrir el modal de autenticación en TaxiForm
  const [authTrigger, setAuthTrigger] = useState(0);
  const solicitarAutenticacionOperadora = () => setAuthTrigger((v) => v + 1);

  // Restaurar operador autenticado desde localStorage al cargar
  useEffect(() => {
    try {
      const saved = localStorage.getItem('operadorAutenticado');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.nombre) {
          setOperadorAutenticado(parsed);
        }
      }
    } catch (e) {
      console.error('Error leyendo operadorAutenticado desde localStorage:', e);
    }
  }, []);

  // Persistir cambios del operador en localStorage
  useEffect(() => {
    try {
      if (operadorAutenticado) {
        localStorage.setItem('operadorAutenticado', JSON.stringify(operadorAutenticado));
      } else {
        localStorage.removeItem('operadorAutenticado');
      }
    } catch (e) {
      console.error('Error guardando operadorAutenticado en localStorage:', e);
    }
  }, [operadorAutenticado]);

  // Función para cargar el resumen de viajes de la operadora (retorna la función de desuscripción)
  const cargarResumenViajesOperadora = (nombreOperadora) => {
    if (!nombreOperadora) return undefined;

    try {
      const qPedidosEnCurso = query(collection(db, 'pedidoEnCurso'));
      const unsubscribe = onSnapshot(qPedidosEnCurso, (querySnapshot) => {
        let asignados = 0;
        let canceladosPorCliente = 0;
        let canceladosPorConductor = 0;

        querySnapshot.forEach((docSnap) => {
          const pedido = docSnap.data();
          if (pedido && pedido.operadora === nombreOperadora) {
            const estado = pedido.pedido || pedido.estado || '';
            if (estado.includes('Aceptado') || estado.includes('En Curso') || estado.includes('Iniciado')) {
              asignados++;
            } else if (estado.includes('Cancelado por Cliente')) {
              canceladosPorCliente++;
            } else if (estado.includes('Cancelado por Unidad') || estado.includes('Cancelado por Conductor')) {
              canceladosPorConductor++;
            }
          }
        });

        setResumenViajesOperadora({
          viajesAsignados: asignados,
          canceladosPorCliente,
          canceladosPorConductor,
          total: asignados + canceladosPorCliente + canceladosPorConductor
        });
      });

      return unsubscribe;
    } catch (error) {
      console.error('❌ Error al cargar resumen de viajes de la operadora:', error);
      return undefined;
    }
  };

  // Efecto para cargar el resumen cuando cambie la operadora autenticada
  useEffect(() => {
    let unsubscribeRef;
    if (operadorAutenticado && operadorAutenticado.nombre) {
      unsubscribeRef = cargarResumenViajesOperadora(operadorAutenticado.nombre);
    } else {
      setResumenViajesOperadora({
        viajesAsignados: 0,
        canceladosPorCliente: 0,
        canceladosPorConductor: 0,
        total: 0
      });
    }

    return () => {
      if (typeof unsubscribeRef === 'function') {
        unsubscribeRef();
      }
    };
  }, [operadorAutenticado]);

  // Listener en tiempo real de reportesDiarios para el operador y la fecha actual
  useEffect(() => {
    let unsubscribeReporte;
    try {
      if (operadorAutenticado && operadorAutenticado.nombre) {
        const hoy = new Date();
        const fechaHoy = hoy
          .toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
          .replace(/\//g, '-');
        const reporteId = `${operadorAutenticado.nombre}_${fechaHoy}`;
        const reporteRef = doc(db, 'reportesDiarios', reporteId);
        unsubscribeReporte = onSnapshot(reporteRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setReporteDiario({
              viajesRegistrados: data.viajesRegistrados || 0,
              viajesAsignados: data.viajesAsignados || 0,
              viajesCancelados: data.viajesCancelados || 0,
              viajesCanceladosPorCliente: data.viajesCanceladosPorCliente || 0,
              viajesCanceladosPorConductor: data.viajesCanceladosPorConductor || 0,
              viajesFinalizados: data.viajesFinalizados || 0,
              vouchersGenerados: data.vouchersGenerados || 0,
              viajesAutomaticos: data.viajesAutomaticos || 0,
            });
          } else {
            setReporteDiario({
              viajesRegistrados: 0,
              viajesAsignados: 0,
              viajesCancelados: 0,
              viajesCanceladosPorCliente: 0,
              viajesCanceladosPorConductor: 0,
              viajesFinalizados: 0,
              vouchersGenerados: 0,
              viajesAutomaticos: 0,
            });
          }
        });
      } else {
        setReporteDiario({
          viajesRegistrados: 0,
          viajesAsignados: 0,
          viajesCancelados: 0,
          viajesCanceladosPorCliente: 0,
          viajesCanceladosPorConductor: 0,
          viajesFinalizados: 0,
          vouchersGenerados: 0,
          viajesAutomaticos: 0,
        });
      }
    } catch (e) {
      console.error('Error escuchando reportesDiarios:', e);
    }

    return () => {
      if (typeof unsubscribeReporte === 'function') {
        unsubscribeReporte();
      }
    };
  }, [operadorAutenticado]);

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <Sidebar 
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        cerrarSesionGeneral={() => {
          console.log('Cerrando sesión general del sistema');
        }}
      />
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <Header 
          activeSection={activeSection}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          operadorAutenticado={operadorAutenticado}
          reporteDiario={reporteDiario}
          resumenViajesOperadora={resumenViajesOperadora}
          onSolicitarAutenticacionOperadora={solicitarAutenticacionOperadora}
          cambiarUsuario={() => {
            setOperadorAutenticado(null);
            localStorage.removeItem('operadorAutenticado');
            setReporteDiario({
              viajesRegistrados: 0,
              viajesAsignados: 0,
              viajesCancelados: 0,
              viajesCanceladosPorCliente: 0,
              viajesCanceladosPorConductor: 0,
              viajesSinUnidad: 0
            });
            setResumenViajesOperadora({
              viajesAsignados: 0,
              canceladosPorCliente: 0,
              canceladosPorConductor: 0,
              total: 0
            });
          }}
        />
        <MainContent 
          activeSection={activeSection} 
          operadorAutenticado={operadorAutenticado}
          setOperadorAutenticado={setOperadorAutenticado}
          reporteDiario={reporteDiario}
          setReporteDiario={setReporteDiario}
          authTrigger={authTrigger}
          setIsCollapsed={setIsCollapsed}
        />
      </div>
      {alertasEnPantalla.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 90,
            right: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            zIndex: 3000,
            maxWidth: 360
          }}
        >
          {alertasEnPantalla.map((alerta) => {
            const tipoTexto = ((alerta?.tipo || alerta?.TipoAlerta || alerta?.tipoAlerta || 'Mensaje') ?? 'Mensaje').toString().trim() || 'Mensaje';
            const origenTexto = (alerta?.origen || 'Sistema').toString().trim();
            const colorPrioridad = obtenerColorPorTipo(tipoTexto, origenTexto);
            const telefono = alerta?.telefono || alerta?.senderId || '';
            const telefonoLimpio = telefono ? telefono.replace(/[^0-9]/g, '') : '';
            const enlaceWhatsapp = telefonoLimpio ? `https://wa.me/${telefonoLimpio}` : null;
            const nombreContacto = (alerta?.nombre || alerta?.metadata?.nombre || 'Contacto desconocido').toString();
            const mensajeTexto = (alerta?.mensaje || alerta?.metadata?.mensaje || 'Sin mensaje').toString();
            const esSaludo = alerta?.metadata?.esSaludo ?? alerta?.esSaludo;
            const esRepetido = alerta?.metadata?.esRepetido ?? alerta?.esRepetido;
            return (
              <div
                key={alerta.id}
                style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: 18,
                  borderLeft: `6px solid ${colorPrioridad}`,
                  boxShadow: '0 25px 45px rgba(15,23,42,0.25)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: '#0f172a' }}>
                    💬 {tipoTexto}
                  </div>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{formatearHoraCorta(alerta.recibidoEn)}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: `3px solid ${colorPrioridad}`, color: '#0f172a', fontWeight: 700 }}>
                    {origenTexto?.[0]?.toUpperCase() || 'C'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                      {nombreContacto}
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', textTransform: 'capitalize' }}>
                      {origenTexto}
                    </div>
                    {telefono && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Teléfono: {telefono}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 12, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>
                  {mensajeTexto}
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {esSaludo && (
                      <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>
                        Saludo
                      </span>
                    )}
                    {esRepetido && (
                      <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: '#fef3c7', color: '#b45309', fontWeight: 600 }}>
                        Repetido
                      </span>
                    )}
                    <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: '#e2e8f0', color: '#0f172a', fontWeight: 600 }}>
                      {new Date(alerta.recibidoEn).toLocaleString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                  {enlaceWhatsapp && (
                    <button
                      type="button"
                      onClick={() => window.open(enlaceWhatsapp, '_blank')}
                      style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Responder
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cerrarAlerta(alerta.id)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {sonidoBloqueado && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            background: '#0f172a',
            color: 'white',
            padding: '16px 20px',
            borderRadius: 14,
            boxShadow: '0 15px 35px rgba(0,0,0,0.35)',
            zIndex: 4000,
            maxWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            🔊 Activa el sonido de alertas
          </div>
          <div style={{ fontSize: 13, color: '#cbd5f5' }}>
            Tu navegador bloqueó el audio automático. Haz clic para habilitarlo.
          </div>
          <button
            type="button"
            onClick={habilitarSonidoManualmente}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: 'none',
              background: '#22c55e',
              color: '#052e16',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Permitir sonido
          </button>
        </div>
      )}
    </div>
  );
}

export default Dashboard; 