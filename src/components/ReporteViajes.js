import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import * as XLSX from 'xlsx';

function obtenerFechaActual() {
  const fecha = new Date();
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const año = fecha.getFullYear();
  return `${dia}-${mes}-${año}`;
}

function ReporteViajes() {
  const [viajes, setViajes] = useState([]);
  const [reportePorUnidad, setReportePorUnidad] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [resumen, setResumen] = useState({ aceptados: 0, manuales: 0 });
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [unidadSeleccionada, setUnidadSeleccionada] = useState(null);
  const [viajesPorUnidad, setViajesPorUnidad] = useState({});
  const [mostrarModalViajes, setMostrarModalViajes] = useState(false);
  const [mostrarTodosLosViajes, setMostrarTodosLosViajes] = useState(false);
  const [todosLosViajes, setTodosLosViajes] = useState([]);

  // Establecer fechas por defecto (últimos 30 días)
  useEffect(() => {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    
    const formatoFecha = (fecha) => {
      const año = fecha.getFullYear();
      const mes = String(fecha.getMonth() + 1).padStart(2, '0');
      const dia = String(fecha.getDate()).padStart(2, '0');
      return `${año}-${mes}-${dia}`;
    };
    
    setFechaInicio(formatoFecha(hace30Dias));
    setFechaFin(formatoFecha(hoy));
  }, []);

  useEffect(() => {
    if (fechaInicio && fechaFin) {
      cargarViajes();
    }
  }, [fechaInicio, fechaFin]);

  // Helper para formatear fecha desde timestamp de Firebase
  const formatearFecha = (timestamp) => {
    if (!timestamp) return '—';
    
    try {
      // Si es un timestamp de Firebase
      if (timestamp.toDate) {
        const fecha = timestamp.toDate();
        const dia = fecha.getDate().toString().padStart(2, '0');
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const año = fecha.getFullYear();
        const horas = fecha.getHours().toString().padStart(2, '0');
        const minutos = fecha.getMinutes().toString().padStart(2, '0');
        return `${dia}/${mes}/${año} ${horas}:${minutos}`;
      }
      
      // Si es un string o número
      if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        const fecha = new Date(timestamp);
        if (!isNaN(fecha.getTime())) {
          const dia = fecha.getDate().toString().padStart(2, '0');
          const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
          const año = fecha.getFullYear();
          const horas = fecha.getHours().toString().padStart(2, '0');
          const minutos = fecha.getMinutes().toString().padStart(2, '0');
          return `${dia}/${mes}/${año} ${horas}:${minutos}`;
        }
      }
      
      return timestamp.toString();
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return '—';
    }
  };

  // Helper para obtener la fecha del viaje (prioridad: fechaCreacion, fecha, fechaFinalizacion)
  const obtenerFechaViaje = (v) => {
    return v?.fechaCreacion || v?.fecha || v?.fechaFinalizacion || v?.createdAt || '';
  };

  // Helper para obtener teléfono (prioridad: telefono, telefonoCompleto)
  const obtenerTelefono = (v) => {
    return v?.telefono || v?.telefonoCompleto || '—';
  };

  // Helper para obtener unidad (prioridad: unidad, numeroUnidad)
  const obtenerUnidad = (v) => {
    return v?.unidad || v?.numeroUnidad || '—';
  };

  // Helper para obtener nombre del conductor (prioridad: nombreConductor, nombre)
  const obtenerNombreConductor = (v) => {
    return v?.nombreConductor || v?.nombre || '—';
  };

  // Helper para verificar si una fecha está en el rango
  const fechaEnRango = (fechaViaje, fechaInicio, fechaFin) => {
    if (!fechaViaje) return false;
    
    try {
      let fechaObj;
      if (fechaViaje.toDate) {
        fechaObj = fechaViaje.toDate();
      } else if (typeof fechaViaje === 'string' || typeof fechaViaje === 'number') {
        fechaObj = new Date(fechaViaje);
      } else {
        return false;
      }
      
      const inicio = new Date(fechaInicio + 'T00:00:00');
      const fin = new Date(fechaFin + 'T23:59:59');
      
      return fechaObj >= inicio && fechaObj <= fin;
    } catch (error) {
      return false;
    }
  };

  const cargarViajes = async () => {
    try {
      setCargando(true);
      setError(null);
      
      if (!fechaInicio || !fechaFin) {
        setCargando(false);
        return;
      }
      
      // Cargar viajes de la colección pedidosarchivados
      const viajesRef = collection(db, 'pedidosarchivados');
      const viajesSnapshot = await getDocs(viajesRef);
      
      const viajesCargados = [];
      viajesSnapshot.forEach((doc) => {
        const viajeData = doc.data();
        const fechaViaje = obtenerFechaViaje(viajeData);
        
        // Filtrar por rango de fechas
        if (fechaEnRango(fechaViaje, fechaInicio, fechaFin)) {
          viajesCargados.push({
            id: doc.id,
            ...viajeData
          });
        }
      });

      // Ordenar por fecha de creación (más recientes primero)
      viajesCargados.sort((a, b) => {
        const fechaA = obtenerFechaViaje(a);
        const fechaB = obtenerFechaViaje(b);
        
        if (!fechaA && !fechaB) return 0;
        if (!fechaA) return 1;
        if (!fechaB) return -1;
        
        try {
          const timestampA = fechaA.toDate ? fechaA.toDate() : new Date(fechaA);
          const timestampB = fechaB.toDate ? fechaB.toDate() : new Date(fechaB);
          return timestampB - timestampA; // Más recientes primero
        } catch (error) {
          return 0;
        }
      });

      // Filtrar viajes que no tienen unidad
      const viajesConUnidad = viajesCargados.filter(v => {
        const unidad = obtenerUnidad(v);
        return unidad && unidad !== '—' && unidad !== '';
      });

      // Agrupar por unidad y contar carreras, incluyendo nombre del conductor
      const unidadesMap = new Map();
      
      viajesConUnidad.forEach(v => {
        const unidad = obtenerUnidad(v);
        const nombreConductor = obtenerNombreConductor(v);
        
        if (unidad && unidad !== '—' && unidad !== '') {
          if (unidadesMap.has(unidad)) {
            const datosUnidad = unidadesMap.get(unidad);
            unidadesMap.set(unidad, {
              cantidad: datosUnidad.cantidad + 1,
              conductor: nombreConductor !== '—' ? nombreConductor : datosUnidad.conductor,
              viajes: [...datosUnidad.viajes, v]
            });
          } else {
            unidadesMap.set(unidad, {
              cantidad: 1,
              conductor: nombreConductor,
              viajes: [v]
            });
          }
        }
      });

      // Convertir el Map a un array con detalles de cada viaje por unidad
      const reporteConDetalles = [];
      
      unidadesMap.forEach((datos, unidad) => {
        // Para cada unidad, crear un registro por cada viaje
        datos.viajes.forEach(viaje => {
          reporteConDetalles.push({
            unidad: unidad,
            conductor: obtenerNombreConductor(viaje),
            fecha: formatearFecha(obtenerFechaViaje(viaje))
          });
        });
      });

      // Agrupar para mostrar resumen (unidad, conductor más frecuente, cantidad)
      const resumenUnidades = Array.from(unidadesMap.entries())
        .map(([unidad, datos]) => {
          // Encontrar el conductor más frecuente
          const conductoresFreq = new Map();
          datos.viajes.forEach(v => {
            const conductor = obtenerNombreConductor(v);
            if (conductor && conductor !== '—') {
              conductoresFreq.set(conductor, (conductoresFreq.get(conductor) || 0) + 1);
            }
          });
          
          let conductorPrincipal = datos.conductor;
          if (conductoresFreq.size > 0) {
            const conductorMasFrecuente = Array.from(conductoresFreq.entries())
              .sort((a, b) => b[1] - a[1])[0][0];
            conductorPrincipal = conductorMasFrecuente;
          }

          return {
            unidad,
            cantidad: datos.cantidad,
            conductor: conductorPrincipal,
            viajes: datos.viajes
          };
        })
        .sort((a, b) => b.cantidad - a.cantidad);

      // Actualizar resumen
      const aceptados = viajesConUnidad.filter(v => v.estado === 'Aceptado' || v.estado === 'Finalizado' || v.estado === 'finalizado').length;
      const manuales = viajesConUnidad.filter(v => (v.tipoPedido || '').toLowerCase().includes('manual')).length;
      
      // Guardar viajes por unidad para el modal
      const viajesPorUnidadMap = {};
      resumenUnidades.forEach(item => {
        viajesPorUnidadMap[item.unidad] = item.viajes.map(v => ({
          id: v.id || Math.random().toString(),
          fecha: formatearFecha(obtenerFechaViaje(v)),
          telefono: obtenerTelefono(v),
          direccion: v.direccion || '—',
          nombreCliente: v.nombreCliente || v.nombre || '—',
          operador: getOperador(v) || '—',
          conductor: obtenerNombreConductor(v),
          estado: v.estado || '—',
          valor: v.valor || '—',
          tipoPedido: v.tipoPedido || '—'
        }));
      });
      
      // Preparar todos los viajes para el modal global
      const todosLosViajesDetalle = viajesConUnidad.map(v => ({
        id: v.id || Math.random().toString(),
        unidad: obtenerUnidad(v),
        fecha: formatearFecha(obtenerFechaViaje(v)),
        telefono: obtenerTelefono(v),
        direccion: v.direccion || '—',
        nombreCliente: v.nombreCliente || v.nombre || '—',
        operador: getOperador(v) || '—',
        conductor: obtenerNombreConductor(v),
        estado: v.estado || '—',
        valor: v.valor || '—',
        tipoPedido: v.tipoPedido || '—'
      }));

      setViajes(viajesConUnidad);
      setReportePorUnidad(resumenUnidades);
      setViajesPorUnidad(viajesPorUnidadMap);
      setTodosLosViajes(todosLosViajesDetalle);
      setResumen({ aceptados, manuales });
      
    } catch (error) {
      console.error('Error al cargar viajes:', error);
      setError('Error al cargar los viajes: ' + error.message);
    } finally {
      setCargando(false);
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

  const exportarAExcel = () => {
    try {
      const headers = ['Unidad', 'Conductor', 'Cantidad de Carreras'];
      
      const rows = reportePorUnidad.map(item => [
        item.unidad,
        item.conductor,
        item.cantidad
      ]);

      const excelData = [headers, ...rows];

      // Crear workbook y worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Ajustar ancho de columnas
      ws['!cols'] = [
        { wch: 15 }, // Unidad
        { wch: 30 }, // Conductor
        { wch: 20 }  // Cantidad de Carreras
      ];
      
      // Agregar worksheet al workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte por Unidad');
      
      // Generar archivo XLSX
      const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Descargar archivo
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      const hoyISO = new Date().toISOString().split('T')[0];
      link.download = `reporte_carreras_por_unidad_${hoyISO}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('✅ Excel exportado exitosamente');
    } catch (error) {
      console.error('❌ Error al exportar Excel:', error);
      alert('Error al exportar el Excel: ' + error.message);
    }
  };

  return (
    <div className="reporte-viajes">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>📋 Reporte Unidades</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filtro de fechas */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>Desde:</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>Hasta:</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            />
          </div>
          <button
            onClick={() => setMostrarTodosLosViajes(true)}
            disabled={todosLosViajes.length === 0 || cargando}
            style={{
              background: todosLosViajes.length === 0 || cargando ? '#9ca3af' : '#6366f1',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              cursor: todosLosViajes.length === 0 || cargando ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              if (todosLosViajes.length > 0 && !cargando) {
                e.target.style.background = '#4f46e5';
              }
            }}
            onMouseLeave={(e) => {
              if (todosLosViajes.length > 0 && !cargando) {
                e.target.style.background = '#6366f1';
              }
            }}
          >
            👁️ Ver Todos los Viajes
          </button>
          <button
            onClick={exportarAExcel}
            disabled={reportePorUnidad.length === 0 || cargando}
            style={{
              background: reportePorUnidad.length === 0 || cargando ? '#9ca3af' : '#10b981',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              cursor: reportePorUnidad.length === 0 || cargando ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              if (reportePorUnidad.length > 0 && !cargando) {
                e.target.style.background = '#059669';
              }
            }}
            onMouseLeave={(e) => {
              if (reportePorUnidad.length > 0 && !cargando) {
                e.target.style.background = '#10b981';
              }
            }}
          >
            📥 Exportar a Excel
          </button>
        </div>
      </div>
      
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
          {reportePorUnidad.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem',
              background: '#f9fafb',
              borderRadius: '8px',
              color: '#6b7280'
            }}>
              No hay datos para mostrar
            </div>
          ) : (
            <div style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Unidad</th>
                    <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Conductor</th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Cantidad de Carreras</th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reportePorUnidad.map((item, idx) => (
                    <tr key={item.unidad} style={{ 
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb'}>
                      <td style={{ padding: '15px', fontWeight: 'bold', fontSize: '16px', color: '#1f2937' }}>
                        {item.unidad}
                      </td>
                      <td style={{ padding: '15px', color: '#374151', fontSize: '15px' }}>
                        {item.conductor || '—'}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          background: '#3b82f6',
                          color: 'white',
                          padding: '8px 16px',
                          borderRadius: '20px',
                          fontSize: '16px',
                          fontWeight: 'bold',
                          minWidth: '50px'
                        }}>
                          {item.cantidad}
                        </span>
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setUnidadSeleccionada(item.unidad);
                            setMostrarModalViajes(true);
                          }}
                          style={{
                            background: '#3b82f6',
                            color: 'white',
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#2563eb'}
                          onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
                        >
                          👁️ Ver Viajes
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Fila de total */}
                  <tr style={{ 
                    background: '#f5f5f5',
                    borderTop: '2px solid #e5e7eb',
                    fontWeight: 'bold'
                  }}>
                    <td style={{ padding: '15px', fontSize: '16px', color: '#1f2937' }}>
                      TOTAL
                    </td>
                    <td style={{ padding: '15px', fontSize: '16px', color: '#1f2937' }}>
                      —
                    </td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        background: '#10b981',
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        minWidth: '50px'
                      }}>
                        {reportePorUnidad.reduce((sum, item) => sum + item.cantidad, 0)}
                      </span>
                    </td>
                    <td style={{ padding: '15px' }}>
                      —
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal para ver todos los viajes de una unidad */}
      {mostrarModalViajes && unidadSeleccionada && viajesPorUnidad[unidadSeleccionada] && (
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
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={() => setMostrarModalViajes(false)}
        >
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            width: '90%',
            maxWidth: '1200px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '2px solid #e5e7eb',
              paddingBottom: '15px'
            }}>
              <h3 style={{ margin: 0, fontSize: '24px', color: '#1f2937' }}>
                📋 Todos los Viajes - Unidad {unidadSeleccionada}
              </h3>
              <button
                onClick={() => setMostrarModalViajes(false)}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => e.target.style.background = '#b91c1c'}
                onMouseLeave={(e) => e.target.style.background = '#dc2626'}
              >
                ✕ Cerrar
              </button>
            </div>
            
            <div style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '900px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Fecha</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Teléfono</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Dirección</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Nombre Cliente</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Operador</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Conductor</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Estado</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {viajesPorUnidad[unidadSeleccionada].map((viaje, idx) => (
                    <tr key={viaje.id} style={{ 
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb'}>
                      <td style={{ padding: '12px', color: '#6b7280', fontSize: '13px' }}>
                        {viaje.fecha}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.telefono}
                      </td>
                      <td style={{ padding: '12px', color: '#374151', maxWidth: '250px', wordBreak: 'break-word' }}>
                        {viaje.direccion}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.nombreCliente}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.operador}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.conductor}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: viaje.estado === 'Finalizado' || viaje.estado === 'finalizado' || viaje.estado === 'Completado' || viaje.estado === 'completado'
                            ? '#d1fae5' 
                            : viaje.estado === 'Aceptado' || viaje.estado === 'aceptado'
                            ? '#dbeafe'
                            : '#fee2e2',
                          color: viaje.estado === 'Finalizado' || viaje.estado === 'finalizado' || viaje.estado === 'Completado' || viaje.estado === 'completado'
                            ? '#065f46'
                            : viaje.estado === 'Aceptado' || viaje.estado === 'aceptado'
                            ? '#1e40af'
                            : '#991b1b'
                        }}>
                          {viaje.estado}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.valor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{
              marginTop: '20px',
              padding: '15px',
              background: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '16px',
              color: '#1f2937'
            }}>
              Total de viajes: {viajesPorUnidad[unidadSeleccionada]?.length || 0}
            </div>
          </div>
        </div>
      )}

      {/* Modal para ver TODOS los viajes */}
      {mostrarTodosLosViajes && (
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
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={() => setMostrarTodosLosViajes(false)}
        >
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            width: '95%',
            maxWidth: '1400px',
            maxHeight: '95vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '2px solid #e5e7eb',
              paddingBottom: '15px'
            }}>
              <h3 style={{ margin: 0, fontSize: '24px', color: '#1f2937' }}>
                📋 Todos los Viajes ({todosLosViajes.length})
              </h3>
              <button
                onClick={() => setMostrarTodosLosViajes(false)}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => e.target.style.background = '#b91c1c'}
                onMouseLeave={(e) => e.target.style.background = '#dc2626'}
              >
                ✕ Cerrar
              </button>
            </div>
            
            <div style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1100px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Unidad</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Fecha</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Teléfono</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Dirección</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Nombre Cliente</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Operador</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Conductor</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Estado</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {todosLosViajes.map((viaje, idx) => (
                    <tr key={viaje.id} style={{ 
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb'}>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#1f2937' }}>
                        {viaje.unidad}
                      </td>
                      <td style={{ padding: '12px', color: '#6b7280', fontSize: '13px' }}>
                        {viaje.fecha}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.telefono}
                      </td>
                      <td style={{ padding: '12px', color: '#374151', maxWidth: '250px', wordBreak: 'break-word' }}>
                        {viaje.direccion}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.nombreCliente}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.operador}
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.conductor}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: viaje.estado === 'Finalizado' || viaje.estado === 'finalizado' || viaje.estado === 'Completado' || viaje.estado === 'completado'
                            ? '#d1fae5' 
                            : viaje.estado === 'Aceptado' || viaje.estado === 'aceptado'
                            ? '#dbeafe'
                            : '#fee2e2',
                          color: viaje.estado === 'Finalizado' || viaje.estado === 'finalizado' || viaje.estado === 'Completado' || viaje.estado === 'completado'
                            ? '#065f46'
                            : viaje.estado === 'Aceptado' || viaje.estado === 'aceptado'
                            ? '#1e40af'
                            : '#991b1b'
                        }}>
                          {viaje.estado}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {viaje.valor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{
              marginTop: '20px',
              padding: '15px',
              background: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '16px',
              color: '#1f2937'
            }}>
              Total de viajes: {todosLosViajes.length}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ReporteViajes;
