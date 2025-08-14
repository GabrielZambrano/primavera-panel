import React from 'react';

// Datos de ejemplo, reemplaza por tus datos reales o por props
const viajes = [
  {
    fecha: '10 de agosto de 2025, 11:33:16 p.m. UTC-5',
    telefono: '593987939987',
    direccion: 'RIO SUNO Y DIEGO CESPEDES ESQ',
    sector: 'RIO SUNO Y DIEGO CESPEDES ESQ',
    modoSeleccion: 'manual',
    nombre: 'OSCAR NOGUERA',
    nombreCliente: 'CRISTIAN RAMIREZ',
    tipoPedido: 'Manual',
    unidad: '86',
    valor: '',
    modoAsignacion: 'manual',
    estado: 'Aceptado',
    rating: 4,
    operadora: 'Op2 Sofy',
    comentario: 'Excelente servicio'
  },
  {
    fecha: '11 de agosto de 2025, 09:15:20 a.m. UTC-5',
    telefono: '593998765432',
    direccion: 'AV. AMAZONAS Y NACIONES UNIDAS',
    sector: 'CENTRO',
    modoSeleccion: 'automatico',
    nombre: 'MARIA LOPEZ',
    nombreCliente: 'JUAN PEREZ',
    tipoPedido: 'Automatico',
    unidad: '42',
    valor: '5.50',
    modoAsignacion: 'automatico',
    estado: 'Finalizado',
    rating: 5,
    operadora: 'Op1 Ana',
    comentario: 'Muy puntual'
  },
  // Puedes agregar más objetos aquí
];

const resumen = {
  aceptados: viajes.filter(v => v.estado === 'Aceptado').length,
  manuales: viajes.filter(v => v.tipoPedido === 'Manual').length,
  // Agrega más resumen si lo necesitas
};

function ReporteViajes() {
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
      <div className="resumen-boxes" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ background: '#e3fcec', padding: '1rem', borderRadius: '8px' }}>
          <strong>Aceptados:</strong> {resumen.aceptados}
        </div>
        <div style={{ background: '#fff3cd', padding: '1rem', borderRadius: '8px' }}>
          <strong>Manual:</strong> {resumen.manuales}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th>Fecha</th>
            <th>Teléfono</th>
            <th>Dirección</th>
            <th>Sector</th>
            <th>Modo Selección</th>
            <th>Nombre</th>
            <th>Cliente</th>
            <th>Operador</th>
            <th>Tipo Pedido</th>
            <th>Unidad</th>
            <th>Valor</th>
            <th>Modo Asignación</th>
            <th>Calificación</th>
            <th>Comentario</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {viajes.map((v, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
              <td>{v.fecha}</td>
              <td>{v.telefono}</td>
              <td>{v.direccion}</td>
              <td>{v.sector}</td>
              <td>{v.modoSeleccion}</td>
              <td>{v.nombre}</td>
              <td>{v.nombreCliente}</td>
              <td>{getOperador(v) || '—'}</td>
              <td>{v.tipoPedido}</td>
              <td>{v.unidad}</td>
              <td>{v.valor}</td>
              <td>{v.modoAsignacion}</td>
              <td>{getRating(v) || '—'}</td>
              <td style={{ maxWidth: 360, wordBreak: 'break-word' }}>{getComment(v) || '—'}</td>
              <td>{v.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ReporteViajes;
