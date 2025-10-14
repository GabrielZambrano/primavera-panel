import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function Header({ activeSection, operadorAutenticado, reporteDiario, resumenViajesOperadora, cambiarUsuario, onSolicitarAutenticacionOperadora }) {
  const { currentUser, logout } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [toast, setToast] = useState({ visible: false, text: '' });

  useEffect(() => {
    let t;
    if (toast.visible) {
      t = setTimeout(() => setToast({ visible: false, text: '' }), 3000);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [toast.visible]);

  const getSectionTitle = () => {
    if (operadorAutenticado) {
      return operadorAutenticado.nombre;
    }
    
    switch (activeSection) {
      case 'dashboard':
        return 'Dashboard';
      case 'resumen-viajes':
        return 'Resumen de Viajes';
      case 'conductores':
        return 'Conductores';
      case 'reportes':
        return 'Reportes';
      case 'operadores':
        return 'Operadores';
      case 'vouchers':
        return 'Vouchers';
      default:
        return 'Sistema de Taxis';
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const eliminarReporteActualYCambiar = async () => {
    if (!operadorAutenticado) return;
    try {
      setLoadingConfirm(true);
      const hoy = new Date();
      const fechaHoy = hoy
        .toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .replace(/\//g, '-');
      const reporteId = `${operadorAutenticado.nombre}_${fechaHoy}`;
      await deleteDoc(doc(db, 'reportesDiarios', reporteId));
      console.log('🧹 Reporte diario eliminado:', reporteId);
    } catch (e) {
      console.error('Error eliminando reporte diario del operador:', e);
      // Fallback de alerta si algo sale mal
      window.alert('Ocurrió un error al eliminar el reporte diario. Intente nuevamente.');
    } finally {
      setLoadingConfirm(false);
      setShowConfirm(false);
      cambiarUsuario();
      setToast({ visible: true, text: 'Usuario cambiado exitosamente' });
    }
  };

  return (
         <header style={{
       background: '#f8fafc',
       borderBottom: '1px solid #e2e8f0',
       padding: '10px 25px',
       display: 'flex',
       justifyContent: 'space-between',
       alignItems: 'center',
       boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
     }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
                 <h1 style={{
           margin: 0,
           fontSize: '20px',
           fontWeight: 'bold',
           color: '#1f2937'
         }}>
           {getSectionTitle()}
         </h1>
        
        {/* Chips del reporte diario del operador */}
        {operadorAutenticado ? (
          <div style={{
            display: 'flex',
            gap: '8px',
            marginLeft: '20px',
            flexWrap: 'wrap'
          }}>
            {/* Manuales (viajesRegistrados son los registrados manualmente) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
              backgroundColor: '#3b82f6', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'white'
            }}>
              <span>�</span>
              <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{reporteDiario.viajesRegistrados || 0}</span>
              <span>Manuales</span>
            </div>

            {/* Cancelados (total) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
              backgroundColor: '#ef4444', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'white'
            }}>
              <span>❌</span>
              <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{reporteDiario.viajesCancelados || 0}</span>
              <span>Cancelados</span>
            </div>

            {/* Automáticos (desde backend) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
              backgroundColor: '#f59e0b', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'white'
            }}>
              <span>⚙️</span>
              <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{reporteDiario.viajesAutomaticos || 0}</span>
              <span>Automáticos</span>
            </div>

            {/* Total (Manuales + Automáticos) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
              backgroundColor: '#059669', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'white'
            }}>
              <span>📊</span>
              <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{(reporteDiario.viajesRegistrados || 0) + (reporteDiario.viajesAutomaticos || 0)}</span>
              <span>Total</span>
            </div>

            {/* Indicador de estado */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#f3f4f6',
              borderRadius: '4px', fontSize: '10px', fontWeight: '500', color: '#6b7280', border: '1px solid #e5e7eb'
            }}>
              <span>🔄</span>
              <span>Tiempo Real</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', backgroundColor: '#fef3c7', borderRadius: '6px', fontSize: '12px', fontWeight: '500', color: '#92400e', border: '1px solid #fbbf24' }}>
              <span>🔐</span>
              <span>Autentíquese como operadora para ver el resumen</span>
            </div>
            <button onClick={onSolicitarAutenticacionOperadora} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }} onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'} onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}>
              Autenticar
            </button>
          </div>
        )}
      </div>
      
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
        {operadorAutenticado ? (
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#2563eb'}
            onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
          >
            Cambiar Usuario
          </button>
        ) : (
          <>
            <span style={{
              color: '#6b7280',
              fontSize: '14px'
            }}>
              {currentUser?.email}
            </span>
            <button
              onClick={handleLogout}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#dc2626'}
              onMouseLeave={(e) => e.target.style.background = '#ef4444'}
            >
              Cerrar Sesión
            </button>
          </>
        )}
      </div>

      {/* Modal de confirmación moderno */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 460, borderRadius: 12, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🔄</span>
                <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>Cambiar de usuario</h3>
              </div>
            </div>
            <div style={{ padding: 20, color: '#374151', fontSize: 14, lineHeight: 1.5 }}>
              <p style={{ margin: 0 }}>¿Desea cambiar de usuario?</p>
              <p style={{ marginTop: 6, color: '#6b7280' }}>Se enviará el reporte actual para: <b>{operadorAutenticado?.nombre}</b>.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: 16, borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
              <button onClick={() => setShowConfirm(false)} disabled={loadingConfirm} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={eliminarReporteActualYCambiar} disabled={loadingConfirm} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: loadingConfirm ? '#9ca3af' : '#ef4444', color: 'white', cursor: loadingConfirm ? 'not-allowed' : 'pointer' }}>
                {loadingConfirm ? 'Eliminando…' : 'Sí, cambiar usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.visible && (
        <div style={{ position: 'fixed', right: 16, bottom: 16, background: '#111827', color: 'white', padding: '10px 14px', borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10000 }}>
          ✅ {toast.text}
        </div>
      )}
    </header>
  );
}

export default Header; 