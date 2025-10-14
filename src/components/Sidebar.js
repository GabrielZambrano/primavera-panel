import React from 'react';

function Sidebar({ activeSection, setActiveSection, isCollapsed, setIsCollapsed, cerrarSesionGeneral }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'conductores', label: 'Conductores', icon: '👨‍💼' },
    { id: 'mapa-conductores', label: 'Mapa Conductores', icon: '🗺️' },
    { id: 'reportes', label: 'Reportes', icon: '📈' },
    { id: 'operadores', label: 'Operadores', icon: '👥' },
    { id: 'whatsapp1', label: 'Whatsapp1', icon: '💬' }
  ];

  return (
    <div style={{
      width: isCollapsed ? '70px' : '250px',
      background: '#1f2937',
      color: 'white',
      padding: '20px 0',
      transition: 'width 0.3s ease',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '0 20px',
        marginBottom: '30px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {!isCollapsed && (
          <h2 style={{ 
            margin: 0, 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: '#f9fafb'
          }}>
            Primavera
          </h2>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '5px',
            borderRadius: '4px'
          }}
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>

      {/* Menu Items */}
      <nav style={{ flex: 1 }}>
        {menuItems.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              // Para WhatsApp, abrir en ventana nueva
              if (item.id === 'whatsapp1') {
                window.open('http://5.189.168.188:3020/', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
              } else {
              // Cambiar a la sección correspondiente dentro del mismo sistema
              setActiveSection(item.id);
              }
            }}
            style={{
              padding: '15px 20px',
              cursor: 'pointer',
              background: activeSection === item.id ? '#374151' : 'transparent',
              borderLeft: activeSection === item.id ? '4px solid #3b82f6' : '4px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeSection !== item.id) {
                e.target.style.background = '#374151';
              }
            }}
            onMouseLeave={(e) => {
              if (activeSection !== item.id) {
                e.target.style.background = 'transparent';
              }
            }}
          >
            <span style={{ fontSize: '20px' }}>{item.icon}</span>
            {!isCollapsed && (
              <span style={{ 
                fontSize: '16px',
                fontWeight: activeSection === item.id ? 'bold' : 'normal'
              }}>
                {item.label}
              </span>
            )}
          </div>
        ))}
      </nav>

      {/* Botón de cerrar sesión en la parte inferior */}
      <div style={{
        padding: '20px',
        borderTop: '1px solid #374151',
        marginTop: 'auto'
      }}>
        <button
          onClick={cerrarSesionGeneral}
          style={{
            width: '100%',
            padding: '12px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.background = '#b91c1c'}
          onMouseLeave={(e) => e.target.style.background = '#dc2626'}
        >
          <span>🔌</span>
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  );
}

export default Sidebar; 