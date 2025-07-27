import React from 'react';
import { useAuth } from '../AuthContext';

function Header({ activeSection }) {
  const { currentUser, logout } = useAuth();

  const getSectionTitle = () => {
    switch (activeSection) {
      case 'dashboard':
        return 'Dashboard';
      case 'conductores':
        return 'Conductores';
      case 'reportes':
        return 'Reportes';
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

  return (
    <header style={{
      background: '#f8fafc',
      borderBottom: '1px solid #e2e8f0',
      padding: '15px 25px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div>
        <h1 style={{
          margin: 0,
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#1f2937'
        }}>
          {getSectionTitle()}
        </h1>
      </div>
      
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
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
      </div>
    </header>
  );
}

export default Header; 