import React, { useState, useEffect } from 'react';
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
    </div>
  );
}

export default Dashboard; 