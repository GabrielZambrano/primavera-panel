import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [totalCarrerasConDuplicados, setTotalCarrerasConDuplicados] = useState(0);
  const [busquedaUnidad, setBusquedaUnidad] = useState('');

  // Establecer fechas por defecto (solo el día actual)
  useEffect(() => {
    const hoy = new Date();
    
    const formatoFecha = (fecha) => {
      const año = fecha.getFullYear();
      const mes = String(fecha.getMonth() + 1).padStart(2, '0');
      const dia = String(fecha.getDate()).padStart(2, '0');
      return `${año}-${mes}-${dia}`;
    };
    
    setFechaInicio(formatoFecha(hoy));
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

  // Helper para obtener operador
  const getOperador = (v) =>
    (v?.operador && (v.operador.nombre || v.operador.name)) || v?.operadora || v?.operador || v?.operator || v?.atendidoPor || '';

  // Función para identificar la base según el teléfono
  const obtenerBasePorTelefono = (telefono) => {
    if (!telefono) return null;
    const telefonoStr = telefono.toString().trim();
    
    if (telefonoStr === '3243000' || telefonoStr.includes('3243000')) {
      return 'base5';
    } else if (telefonoStr === '7777777' || telefonoStr.includes('7777777')) {
      return 'base0';
    } else if (telefonoStr === '8888888' || telefonoStr.includes('8888888')) {
      return 'base8';
    }
    return null;
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

  // Helper para generar una clave única basada solo en unidad, fecha/hora y teléfono
  const generarClaveUnica = (viaje) => {
    const fechaViaje = obtenerFechaViaje(viaje);
    const unidad = obtenerUnidad(viaje);
    const telefono = obtenerTelefono(viaje);
    
    try {
      let fechaHoraStr = '';
      if (fechaViaje) {
        let fecha;
        if (fechaViaje.toDate) {
          fecha = fechaViaje.toDate();
        } else if (typeof fechaViaje === 'string' || typeof fechaViaje === 'number') {
          fecha = new Date(fechaViaje);
        }
        
        if (fecha && !isNaN(fecha.getTime())) {
          // Formato: YYYY-MM-DDTHH:mm (sin segundos para agrupar por minuto)
          const año = fecha.getFullYear();
          const mes = String(fecha.getMonth() + 1).padStart(2, '0');
          const dia = String(fecha.getDate()).padStart(2, '0');
          const horas = String(fecha.getHours()).padStart(2, '0');
          const minutos = String(fecha.getMinutes()).padStart(2, '0');
          fechaHoraStr = `${año}-${mes}-${dia}T${horas}:${minutos}`;
        }
      }
      
      // Normalizar unidad (convertir a string y limpiar)
      const unidadStr = String(unidad || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Normalizar teléfono (remover espacios y caracteres especiales, solo números)
      // Si es '—' o vacío, usar cadena vacía para que coincidan
      let telefonoStr = '';
      if (telefono && telefono !== '—' && telefono !== '-') {
        telefonoStr = String(telefono).trim().replace(/\D/g, '');
      }
      
      // Solo usar unidad, fecha/hora y teléfono para identificar duplicados
      const clave = `${fechaHoraStr}_${unidadStr}_${telefonoStr}`;
      return clave;
    } catch (error) {
      console.error('Error al generar clave única:', error);
      return `${viaje.id || Math.random()}`;
    }
  };

  // Función para eliminar duplicados pero mantener el conteo
  const eliminarDuplicadosMantenerConteo = (viajes) => {
    const viajesUnicos = new Map();
    const conteoDuplicados = new Map();
    
    viajes.forEach(viaje => {
      const clave = generarClaveUnica(viaje);
      
      if (!viajesUnicos.has(clave)) {
        viajesUnicos.set(clave, viaje);
        conteoDuplicados.set(clave, 1);
      } else {
        // Incrementar contador de duplicados
        conteoDuplicados.set(clave, conteoDuplicados.get(clave) + 1);
      }
    });
    
    return {
      viajesUnicos: Array.from(viajesUnicos.values()),
      conteoDuplicados: conteoDuplicados
    };
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

      // Eliminar duplicados basados en unidad, teléfono, dirección, nombre cliente, operador y conductor
      // pero mantener el conteo para las estadísticas
      const { viajesUnicos, conteoDuplicados } = eliminarDuplicadosMantenerConteo(viajesCargados);
      
      console.log('📊 Total viajes cargados:', viajesCargados.length);
      console.log('✅ Viajes únicos después de eliminar duplicados:', viajesUnicos.length);
      console.log('🔄 Duplicados encontrados:', viajesCargados.length - viajesUnicos.length);
      
      // Ordenar por fecha de creación (más recientes primero)
      viajesUnicos.sort((a, b) => {
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
      const viajesConUnidad = viajesUnicos.filter(v => {
        const unidad = obtenerUnidad(v);
        return unidad && unidad !== '—' && unidad !== '';
      });

      // Agrupar por unidad y contar carreras, incluyendo nombre del conductor y bases
      // Usar el conteo de duplicados para las estadísticas
      const unidadesMap = new Map();
      const clavesPorUnidad = new Map(); // Para rastrear claves únicas por unidad
      
      viajesConUnidad.forEach(v => {
        const unidad = obtenerUnidad(v);
        const nombreConductor = obtenerNombreConductor(v);
        const telefono = obtenerTelefono(v);
        const base = obtenerBasePorTelefono(telefono);
        const clave = generarClaveUnica(v);
        const cantidadDuplicados = conteoDuplicados.get(clave) || 1; // Contar duplicados
        
        if (unidad && unidad !== '—' && unidad !== '') {
          // Inicializar Set de claves para esta unidad si no existe
          if (!clavesPorUnidad.has(unidad)) {
            clavesPorUnidad.set(unidad, new Set());
          }
          
          const clavesUnidad = clavesPorUnidad.get(unidad);
          const esDuplicadoEnUnidad = clavesUnidad.has(clave);
          
          if (unidadesMap.has(unidad)) {
            const datosUnidad = unidadesMap.get(unidad);
            const nuevasBases = { ...datosUnidad.bases };
            
            // Solo agregar el viaje a la lista si no es duplicado dentro de esta unidad
            if (!esDuplicadoEnUnidad) {
              clavesUnidad.add(clave);
              datosUnidad.viajes.push(v);
            }
            
            // Incrementar contador de base si aplica (sumar cantidad de duplicados)
            if (base) {
              nuevasBases[base] = (nuevasBases[base] || 0) + cantidadDuplicados;
            }
            
            unidadesMap.set(unidad, {
              cantidad: datosUnidad.cantidad + cantidadDuplicados, // Sumar duplicados al conteo
              conductor: nombreConductor !== '—' ? nombreConductor : datosUnidad.conductor,
              viajes: datosUnidad.viajes, // Solo viajes únicos dentro de la unidad
              bases: nuevasBases
            });
          } else {
            const nuevasBases = { base5: 0, base0: 0, base8: 0 };
            if (base) {
              nuevasBases[base] = cantidadDuplicados; // Usar cantidad de duplicados
            }
            
            clavesUnidad.add(clave);
            unidadesMap.set(unidad, {
              cantidad: cantidadDuplicados, // Usar cantidad de duplicados
              conductor: nombreConductor,
              viajes: [v], // Solo guardar el viaje único
              bases: nuevasBases
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

      // Filtrar reservas para el total (usar viajes únicos pero contar duplicados)
      const reservas = viajesConUnidad.filter(v => {
        const tipoPedido = (v.tipoPedido || '').toString().toLowerCase();
        return tipoPedido === 'reserva';
      });

      // Calcular totales de reservas por base (contando duplicados)
      let reservasBase5 = 0;
      let reservasBase0 = 0;
      let reservasBase8 = 0;
      
      reservas.forEach(v => {
        const clave = generarClaveUnica(v);
        const cantidadDuplicados = conteoDuplicados.get(clave) || 1;
        const telefono = obtenerTelefono(v);
        const base = obtenerBasePorTelefono(telefono);
        if (base === 'base5') reservasBase5 += cantidadDuplicados;
        else if (base === 'base0') reservasBase0 += cantidadDuplicados;
        else if (base === 'base8') reservasBase8 += cantidadDuplicados;
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
            cantidad: datos.cantidad, // Esta cantidad incluye duplicados
            conductor: conductorPrincipal,
            viajes: datos.viajes, // Solo viajes únicos para mostrar
            base5: datos.bases?.base5 || 0,
            base0: datos.bases?.base0 || 0,
            base8: datos.bases?.base8 || 0
          };
        })
        .sort((a, b) => b.cantidad - a.cantidad);

      // Calcular cantidad total de reservas contando duplicados
      let totalReservas = 0;
      reservas.forEach(v => {
        const clave = generarClaveUnica(v);
        totalReservas += conteoDuplicados.get(clave) || 1;
      });

      // Agregar fila de reservas al inicio si hay reservas
      if (reservas.length > 0) {
        resumenUnidades.unshift({
          unidad: '10300',
          cantidad: totalReservas, // Usar total contando duplicados
          conductor: 'Todas las Reservas',
          viajes: reservas, // Solo mostrar viajes únicos
          base5: reservasBase5,
          base0: reservasBase0,
          base8: reservasBase8
        });
      }

      // Actualizar resumen (contando duplicados)
      let aceptados = 0;
      let manuales = 0;
      
      viajesConUnidad.forEach(v => {
        const clave = generarClaveUnica(v);
        const cantidadDuplicados = conteoDuplicados.get(clave) || 1;
        
        if (v.estado === 'Aceptado' || v.estado === 'Finalizado' || v.estado === 'finalizado') {
          aceptados += cantidadDuplicados;
        }
        if ((v.tipoPedido || '').toLowerCase().includes('manual')) {
          manuales += cantidadDuplicados;
        }
      });
      
      // Guardar viajes por unidad para el modal
      const viajesPorUnidadMap = {};
      resumenUnidades.forEach(item => {
        viajesPorUnidadMap[item.unidad] = item.viajes.map(v => {
          const telefono = obtenerTelefono(v);
          const base = obtenerBasePorTelefono(telefono);
          return {
            id: v.id || Math.random().toString(),
            fecha: formatearFecha(obtenerFechaViaje(v)),
            telefono: telefono,
            direccion: v.direccion || '—',
            nombreCliente: v.nombreCliente || v.nombre || '—',
            operador: getOperador(v) || '—',
            conductor: obtenerNombreConductor(v),
            estado: v.estado || '—',
            valor: v.valor || '—',
            tipoPedido: v.tipoPedido || '—',
            base5: base === 'base5' ? 1 : 0,
            base0: base === 'base0' ? 1 : 0,
            base8: base === 'base8' ? 1 : 0
          };
        });
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

      // Calcular el total de carreras incluyendo duplicados (para estadísticas)
      const totalConDuplicados = resumenUnidades.reduce((sum, item) => sum + item.cantidad, 0);
      // Calcular el total de viajes únicos (para mostrar en resumen)
      const totalUnicos = todosLosViajesDetalle.length;
      
      setViajes(viajesConUnidad);
      setReportePorUnidad(resumenUnidades);
      setViajesPorUnidad(viajesPorUnidadMap);
      setTodosLosViajes(todosLosViajesDetalle);
      setTotalCarrerasConDuplicados(totalConDuplicados);
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

  // Función para exportar a PDF
  const exportarAPDF = () => {
    try {
      if (reportePorUnidad.length === 0) {
        alert('No hay datos para exportar');
        return;
      }

      const doc = new jsPDF('landscape'); // Orientación horizontal para más espacio
      
      // Título
      doc.setFontSize(18);
      doc.text('Reporte Unidades', 14, 15);
      
      // Fechas
      doc.setFontSize(10);
      doc.text(`Desde: ${fechaInicio} - Hasta: ${fechaFin}`, 14, 22);
      
      // Preparar datos para la tabla
      const tableData = reportePorUnidad.map(item => [
        item.unidad,
        item.conductor || '—',
        item.cantidad.toString(),
        (item.base5 || 0).toString(),
        (item.base0 || 0).toString(),
        (item.base8 || 0).toString()
      ]);

      // Crear la tabla
      autoTable(doc, {
        startY: 28,
        head: [['Unidad', 'Conductor', 'Cant. Carreras', 'Base 5 (3243000)', 'Base 0 (7777777)', 'Base 8 (8888888)']],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [107, 114, 128], // Gris
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251] // Gris claro
        },
        didParseCell: function (data) {
          // Resaltar la fila de reservas (10300)
          if (data.row.index < reportePorUnidad.length && reportePorUnidad[data.row.index]?.unidad === '10300') {
            data.cell.styles.fillColor = [254, 243, 199]; // Amarillo claro
            data.cell.styles.textColor = [146, 64, 14]; // Marrón oscuro
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });

      // Fila de totales
      const totalCantidad = reportePorUnidad.reduce((sum, item) => sum + item.cantidad, 0);
      const totalBase5 = reportePorUnidad.reduce((sum, item) => sum + (item.base5 || 0), 0);
      const totalBase0 = reportePorUnidad.reduce((sum, item) => sum + (item.base0 || 0), 0);
      const totalBase8 = reportePorUnidad.reduce((sum, item) => sum + (item.base8 || 0), 0);
      
      const finalY = doc.lastAutoTable?.finalY || 28;
      autoTable(doc, {
        startY: finalY + 5,
        body: [
          ['TOTAL', '—', totalCantidad.toString(), totalBase5.toString(), totalBase0.toString(), totalBase8.toString()]
        ],
        theme: 'grid',
        styles: {
          fontSize: 9,
          fontStyle: 'bold',
          fillColor: [245, 245, 245], // Gris claro
          textColor: [31, 41, 55] // Gris oscuro
        }
      });

      // Guardar el PDF
      const hoyISO = new Date().toISOString().split('T')[0];
      doc.save(`reporte_unidades_${hoyISO}.pdf`);
      
      console.log('✅ PDF exportado exitosamente');
    } catch (error) {
      console.error('❌ Error al exportar PDF:', error);
      alert('Error al exportar el PDF: ' + error.message);
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
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>🔍 Buscar Unidad:</label>
            <input
              type="text"
              value={busquedaUnidad}
              onChange={(e) => setBusquedaUnidad(e.target.value)}
              placeholder="Ej: 593, 45, 554..."
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                width: '150px'
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
          <button
            onClick={exportarAPDF}
            disabled={reportePorUnidad.length === 0 || cargando}
            style={{
              background: reportePorUnidad.length === 0 || cargando ? '#9ca3af' : '#dc2626',
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
                e.target.style.background = '#b91c1c';
              }
            }}
            onMouseLeave={(e) => {
              if (reportePorUnidad.length > 0 && !cargando) {
                e.target.style.background = '#dc2626';
              }
            }}
          >
            📄 Exportar a PDF
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
              overflow: 'auto',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              maxHeight: 'calc(100vh - 300px)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Unidad</th>
                    <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Conductor</th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Cantidad de Carreras</th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb', background: '#f5f5f5' }}>Base 5<br/>(3243000)<br/><small style={{ fontSize: '11px', color: '#6b7280' }}>base 5</small></th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb', background: '#f5f5f5' }}>Base 0<br/>(7777777)<br/><small style={{ fontSize: '11px', color: '#6b7280' }}>aire</small></th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb', background: '#f5f5f5' }}>Base 8<br/>(8888888)<br/><small style={{ fontSize: '11px', color: '#6b7280' }}>base 8</small></th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reportePorUnidad
                    .filter(item => {
                      if (!busquedaUnidad.trim()) return true;
                      const unidadStr = item.unidad?.toString().toLowerCase() || '';
                      const busquedaStr = busquedaUnidad.trim().toLowerCase();
                      return unidadStr.includes(busquedaStr);
                    })
                    .map((item, idx) => {
                      const esReserva = item.unidad === '10300';
                      return (
                      <tr key={item.unidad} style={{ 
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: esReserva ? '#fef3c7' : (idx % 2 === 0 ? '#ffffff' : '#f9fafb'),
                        transition: 'background 0.2s',
                        borderTop: esReserva ? '3px solid #f59e0b' : 'none'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = esReserva ? '#fde68a' : '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = esReserva ? '#fef3c7' : (idx % 2 === 0 ? '#ffffff' : '#f9fafb')}>
                      <td style={{ padding: '15px', fontWeight: 'bold', fontSize: '16px', color: esReserva ? '#92400e' : '#1f2937' }}>
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
                        <span style={{
                          display: 'inline-block',
                          background: '#8b5cf6',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          minWidth: '40px'
                        }}>
                          {item.base5 || 0}
                        </span>
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          background: '#f59e0b',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          minWidth: '40px'
                        }}>
                          {item.base0 || 0}
                        </span>
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          background: '#10b981',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          minWidth: '40px'
                        }}>
                          {item.base8 || 0}
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
                    );
                  })}
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
                        {todosLosViajes
                          .filter(viaje => {
                            if (!busquedaUnidad.trim()) return true;
                            const unidadStr = viaje.unidad?.toString().toLowerCase() || '';
                            const busquedaStr = busquedaUnidad.trim().toLowerCase();
                            return unidadStr.includes(busquedaStr);
                          }).length}
                      </span>
                    </td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        background: '#8b5cf6',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        minWidth: '40px'
                      }}>
                        {reportePorUnidad
                          .filter(item => {
                            if (!busquedaUnidad.trim()) return true;
                            const unidadStr = item.unidad?.toString().toLowerCase() || '';
                            const busquedaStr = busquedaUnidad.trim().toLowerCase();
                            return unidadStr.includes(busquedaStr);
                          })
                          .reduce((sum, item) => sum + (item.base5 || 0), 0)}
                      </span>
                    </td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        background: '#f59e0b',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        minWidth: '40px'
                      }}>
                        {reportePorUnidad
                          .filter(item => {
                            if (!busquedaUnidad.trim()) return true;
                            const unidadStr = item.unidad?.toString().toLowerCase() || '';
                            const busquedaStr = busquedaUnidad.trim().toLowerCase();
                            return unidadStr.includes(busquedaStr);
                          })
                          .reduce((sum, item) => sum + (item.base0 || 0), 0)}
                      </span>
                    </td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        background: '#10b981',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        minWidth: '40px'
                      }}>
                        {reportePorUnidad
                          .filter(item => {
                            if (!busquedaUnidad.trim()) return true;
                            const unidadStr = item.unidad?.toString().toLowerCase() || '';
                            const busquedaStr = busquedaUnidad.trim().toLowerCase();
                            return unidadStr.includes(busquedaStr);
                          })
                          .reduce((sum, item) => sum + (item.base8 || 0), 0)}
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
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb', background: '#f5f5f5' }}>Base 5<br/>(3243000)</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb', background: '#f5f5f5' }}>Base 0<br/>(7777777)</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e5e7eb', background: '#f5f5f5' }}>Base 8<br/>(8888888)</th>
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
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {viaje.base5 === 1 ? (
                          <span style={{
                            display: 'inline-block',
                            background: '#8b5cf6',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            ✓
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {viaje.base0 === 1 ? (
                          <span style={{
                            display: 'inline-block',
                            background: '#f59e0b',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            ✓
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {viaje.base8 === 1 ? (
                          <span style={{
                            display: 'inline-block',
                            background: '#10b981',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            ✓
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
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
              Total de viajes: {totalCarrerasConDuplicados} (mostrando {todosLosViajes.length} únicos)
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ReporteViajes;
