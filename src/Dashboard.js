import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';

function Dashboard() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);

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
        />
        <MainContent activeSection={activeSection} />
      </div>
    </div>
  );
}

export default Dashboard; 