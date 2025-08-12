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
  },
  // Puedes agregar más objetos aquí
];

const resumen = {
  aceptados: viajes.filter(v => v.estado === 'Aceptado').length,
  manuales: viajes.filter(v => v.tipoPedido === 'Manual').length,
  // Agrega más resumen si lo necesitas
};

function ReporteViajes() {
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
            <th>Tipo Pedido</th>
            <th>Unidad</th>
            <th>Valor</th>
            <th>Modo Asignación</th>
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
              <td>{v.tipoPedido}</td>
              <td>{v.unidad}</td>
              <td>{v.valor}</td>
              <td>{v.modoAsignacion}</td>
              <td>{v.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ReporteViajes;
