import React, { useState, useEffect, useRef } from 'react';

function DriverTracking() {
  const [drivers, setDrivers] = useState([]);
  const [map, setMap] = useState(null);
  const [markers, setMarkers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [movementDetected, setMovementDetected] = useState(false);
  const [trackedDriver, setTrackedDriver] = useState(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  // Función para obtener ubicaciones de conductores desde la API
  const fetchDriverLocations = async () => {
    try {
      console.log('🚗 Obteniendo ubicaciones de conductores desde API real...');
      setError(null); // Limpiar errores anteriores
      
      // Intentar con diferentes métodos para evitar CORS
      let response;
      try {
        // Método 1: Fetch directo
        response = await fetch('https://taxibot.click/plaza25/api/location/', {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }
        });
      } catch (corsError) {
        console.log('⚠️ Error CORS detectado, intentando con proxy...');
        
        // Método 2: Intentar con múltiples proxies CORS
        const proxies = [
          `https://api.allorigins.win/raw?url=${encodeURIComponent('https://taxibot.click/plaza25/api/location/')}`,
          `https://cors-anywhere.herokuapp.com/https://taxibot.click/plaza25/api/location/`,
          `https://thingproxy.freeboard.io/fetch/https://taxibot.click/plaza25/api/location/`
        ];
        
        for (const proxyUrl of proxies) {
          try {
            console.log(`🔄 Intentando con proxy: ${proxyUrl.split('/')[2]}`);
            const proxyResponse = await fetch(proxyUrl, {
              headers: proxyUrl.includes('cors-anywhere') ? {
                'X-Requested-With': 'XMLHttpRequest'
              } : {}
            });
            
            if (proxyResponse.ok) {
              const proxyData = await proxyResponse.json();
              console.log('✅ Datos obtenidos via proxy:', proxyData);
              
              if (proxyData.success && proxyData.data) {
                setDrivers(proxyData.data);
                setLastUpdate(new Date());
                setError(null);
                updateMapMarkers(proxyData.data);
                setIsLoading(false);
                return;
              }
            }
          } catch (proxyError) {
            console.log(`⚠️ Proxy ${proxyUrl.split('/')[2]} falló:`, proxyError.message);
            continue;
          }
        }
        
        // Si el proxy también falla, mostrar error
        throw new Error('No se pudo obtener datos de la API. Verifique la conexión.');
      }
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📍 Datos recibidos de la API:', data);
      
      if (data.success && data.data) {
        setDrivers(data.data);
        setLastUpdate(new Date());
        setError(null);
        
        // Actualizar marcadores en el mapa
        updateMapMarkers(data.data);
      } else {
        throw new Error('Datos inválidos recibidos de la API');
      }
    } catch (error) {
      console.error('❌ Error al obtener ubicaciones:', error);
      
      // Mostrar error sin datos de ejemplo
      setError(`Error al obtener datos reales: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Función para inicializar Google Maps
  const initializeMap = () => {
    if (!window.google) {
      console.log('⚠️ Google Maps no está disponible, usando mapa alternativo...');
      initializeAlternativeMap();
      return;
    }

    try {
      // Coordenadas de Quito como centro por defecto
      const quito = { lat: -0.2295, lng: -78.5249 };
      
      const mapInstance = new window.google.maps.Map(mapRef.current, {
        zoom: 12,
        center: quito,
        mapTypeId: 'roadmap',
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      setMap(mapInstance);
      console.log('🗺️ Google Maps inicializado correctamente');
    } catch (error) {
      console.error('❌ Error al inicializar Google Maps:', error);
      setError('Error al cargar Google Maps. Usando mapa alternativo.');
      initializeAlternativeMap();
    }
  };

  // Función para inicializar mapa alternativo usando Leaflet
  const initializeAlternativeMap = () => {
    try {
      // Crear un mapa simple usando coordenadas
      const mapContainer = mapRef.current;
      mapContainer.innerHTML = `
        <div style="
          width: 100%; 
          height: 100%; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: white;
          font-family: Arial, sans-serif;
        ">
          <div style="text-align: center; padding: 20px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px;">🗺️ Vista de Ubicaciones</h2>
            <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 10px;">
              <h3 style="margin: 0 0 15px 0;">📍 Conductores Activos</h3>
              <div id="drivers-list" style="text-align: left;">
                <!-- Los conductores se mostrarán aquí -->
              </div>
            </div>
            <div style="margin-top: 20px; font-size: 14px; opacity: 0.8;">
              💡 Para ver el mapa interactivo, configure la API de Google Maps
            </div>
          </div>
        </div>
      `;
      
      console.log('🗺️ Mapa alternativo inicializado');
    } catch (error) {
      console.error('❌ Error al inicializar mapa alternativo:', error);
      setError('No se pudo cargar ningún mapa');
    }
  };

  // Función para crear/actualizar marcadores de conductores
  const updateMapMarkers = (driversData) => {
    if (!map && !mapRef.current) return;

    // Si estamos usando el mapa alternativo
    if (!map && mapRef.current) {
      updateAlternativeMap(driversData);
      return;
    }

    console.log('🔄 Actualizando marcadores con datos:', driversData);

    driversData.forEach(driver => {
      if (driver.latitud && driver.longitud) {
        const newPosition = {
          lat: parseFloat(driver.latitud),
          lng: parseFloat(driver.longitud)
        };

        // Verificar si el marcador ya existe
        if (markersRef.current[driver.id]) {
          const existingMarker = markersRef.current[driver.id];
          const currentPosition = existingMarker.getPosition();
          
          // Solo actualizar si la posición cambió
          if (currentPosition && 
              (Math.abs(currentPosition.lat() - newPosition.lat) > 0.0001 || 
               Math.abs(currentPosition.lng() - newPosition.lng) > 0.0001)) {
            
            console.log(`🚗 Moviendo marcador ${driver.unidad} de (${currentPosition.lat()}, ${currentPosition.lng()}) a (${newPosition.lat}, ${newPosition.lng})`);
            
            // Detectar movimiento y mostrar indicador
            setMovementDetected(true);
            setTimeout(() => setMovementDetected(false), 3000);
            
            // Animar el movimiento del marcador
            existingMarker.setPosition(newPosition);
            
            // Agregar animación de movimiento
            existingMarker.setAnimation(window.google.maps.Animation.BOUNCE);
            setTimeout(() => {
              existingMarker.setAnimation(null);
            }, 1000);
            
            // Si este conductor está siendo seguido, centrar el mapa en él
            if (trackedDriver && trackedDriver.id === driver.id) {
              console.log(`🎯 Siguiendo movimiento de unidad ${driver.unidad}`);
              map.setCenter(newPosition);
              
              // Mantener la ventana de información abierta si estaba abierta
              if (existingMarker.infoWindow) {
                existingMarker.infoWindow.open(map, existingMarker);
              }
            }
            
            // Actualizar la ventana de información si está abierta
            if (existingMarker.infoWindow) {
              existingMarker.infoWindow.setContent(`
                <div style="padding: 10px; font-family: Arial, sans-serif; min-width: 200px;">
                  <h3 style="margin: 0 0 10px 0; color: #1e40af; font-size: 16px;">
                    🚕 Unidad ${driver.unidad}
                  </h3>
                  <div style="margin-bottom: 8px;">
                    <strong>📧 Email:</strong> ${driver.email}
                  </div>
                  <div style="margin-bottom: 8px;">
                    <strong>📍 Ubicación:</strong><br>
                    Lat: ${driver.latitud}<br>
                    Lng: ${driver.longitud}
                  </div>
                  <div style="margin-bottom: 8px;">
                    <strong>🕐 Última actualización:</strong><br>
                    ${driver.fecha} ${driver.hora}
                  </div>
                  <div style="margin-bottom: 8px;">
                    <strong>📊 Estado:</strong> 
                    <span style="color: ${driver.estado === '1' ? '#10b981' : '#ef4444'};">
                      ${driver.estado === '1' ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">
                    Recibido: ${new Date(driver.received_at).toLocaleString()}
                  </div>
                </div>
              `);
            }
          }
        } else {
          // Crear nuevo marcador si no existe
          console.log(`🆕 Creando nuevo marcador para unidad ${driver.unidad}`);
          
          // Crear icono personalizado de taxi
          const taxiIcon = {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="18" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
                <path d="M12 16h16v8H12z" fill="#ffffff"/>
                <circle cx="16" cy="24" r="2" fill="#1e40af"/>
                <circle cx="24" cy="24" r="2" fill="#1e40af"/>
                <rect x="14" y="14" width="12" height="4" fill="#1e40af"/>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(40, 40),
            anchor: new window.google.maps.Point(20, 20)
          };

          // Crear marcador
          const marker = new window.google.maps.Marker({
            position: newPosition,
            map: map,
            icon: taxiIcon,
            title: `Unidad ${driver.unidad} - ${driver.email}`,
            animation: window.google.maps.Animation.DROP
          });

          // Crear ventana de información
          const infoWindow = new window.google.maps.InfoWindow({
            content: `
              <div style="padding: 10px; font-family: Arial, sans-serif; min-width: 200px;">
                <h3 style="margin: 0 0 10px 0; color: #1e40af; font-size: 16px;">
                  🚕 Unidad ${driver.unidad}
                </h3>
                <div style="margin-bottom: 8px;">
                  <strong>📧 Email:</strong> ${driver.email}
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>📍 Ubicación:</strong><br>
                  Lat: ${driver.latitud}<br>
                  Lng: ${driver.longitud}
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>🕐 Última actualización:</strong><br>
                  ${driver.fecha} ${driver.hora}
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>📊 Estado:</strong> 
                  <span style="color: ${driver.estado === '1' ? '#10b981' : '#ef4444'};">
                    ${driver.estado === '1' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">
                  Recibido: ${new Date(driver.received_at).toLocaleString()}
                </div>
              </div>
            `
          });

          // Agregar evento click al marcador
          marker.addListener('click', () => {
            // Cerrar otras ventanas de información
            Object.values(markersRef.current).forEach(m => {
              if (m.infoWindow) m.infoWindow.close();
            });
            
            infoWindow.open(map, marker);
            marker.infoWindow = infoWindow;
          });

          markersRef.current[driver.id] = marker;
        }
      }
    });

    // Limpiar marcadores que ya no existen en los datos
    Object.keys(markersRef.current).forEach(driverId => {
      const driverExists = driversData.some(driver => driver.id == driverId);
      if (!driverExists) {
        console.log(`🗑️ Eliminando marcador para conductor ${driverId}`);
        markersRef.current[driverId].setMap(null);
        delete markersRef.current[driverId];
      }
    });

    console.log(`📍 ${driversData.length} marcadores procesados en Google Maps`);
  };

  // Función para actualizar el mapa alternativo
  const updateAlternativeMap = (driversData) => {
    const driversListElement = document.getElementById('drivers-list');
    if (!driversListElement) return;

    driversListElement.innerHTML = driversData.map(driver => `
      <div style="
        background: rgba(255,255,255,0.1); 
        margin: 10px 0; 
        padding: 15px; 
        border-radius: 8px;
        border-left: 4px solid ${driver.estado === '1' ? '#10b981' : '#ef4444'};
      ">
        <div style="font-weight: bold; margin-bottom: 8px;">
          🚕 Unidad ${driver.unidad} 
          <span style="font-size: 12px; color: ${driver.estado === '1' ? '#10b981' : '#ef4444'};">
            ${driver.estado === '1' ? '● Activo' : '● Inactivo'}
          </span>
        </div>
        <div style="font-size: 14px; margin-bottom: 4px;">📧 ${driver.email}</div>
        <div style="font-size: 12px; opacity: 0.8;">
          📍 ${driver.latitud}, ${driver.longitud}
        </div>
        <div style="font-size: 12px; opacity: 0.8;">
          🕐 ${driver.fecha} ${driver.hora}
        </div>
      </div>
    `).join('');

    console.log(`📍 ${driversData.length} conductores mostrados en mapa alternativo`);
  };

  // Cargar Google Maps API
  useEffect(() => {
    const loadGoogleMaps = () => {
      // Verificar si Google Maps ya está cargado
      if (window.google && window.google.maps) {
        console.log('🗺️ Google Maps ya está disponible');
        initializeMap();
        return;
      }

      // Verificar si ya hay un script de Google Maps cargándose
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        console.log('🗺️ Google Maps script ya existe, esperando carga...');
        existingScript.onload = () => {
          console.log('🗺️ Google Maps API cargada desde script existente');
          initializeMap();
        };
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDs00kpzo5RKbOhpvXeIQbSuaApb5qQWK8&libraries=geometry&loading=async`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('🗺️ Google Maps API cargada');
        initializeMap();
      };
      script.onerror = () => {
        console.log('⚠️ Error al cargar Google Maps API, usando mapa alternativo');
        setError('Google Maps API no disponible. Usando vista alternativa.');
        initializeAlternativeMap();
        setIsLoading(false);
      };
      
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, []);

  // Cargar datos iniciales y configurar actualización automática
  useEffect(() => {
    fetchDriverLocations();
    
    // Actualizar cada 10 segundos para mejor seguimiento en tiempo real
    const interval = setInterval(() => {
      console.log('⏰ Actualización automática de ubicaciones...');
      fetchDriverLocations();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [map]);

  // Función para centrar el mapa en un conductor específico y activar seguimiento
  const centerOnDriver = (driver) => {
    if (!map || !driver.latitud || !driver.longitud) return;
    
    console.log(`🎯 Activando seguimiento de unidad ${driver.unidad}`);
    
    // Activar seguimiento de este conductor
    setTrackedDriver(driver);
    
    const position = {
      lat: parseFloat(driver.latitud),
      lng: parseFloat(driver.longitud)
    };
    
    // Centrar y hacer zoom en el conductor
    map.setCenter(position);
    map.setZoom(18); // Zoom más cercano para mejor seguimiento
    
    // Abrir ventana de información del conductor
    if (markersRef.current[driver.id]) {
      markersRef.current[driver.id].infoWindow?.open(map, markersRef.current[driver.id]);
    }
    
    // Mostrar mensaje de seguimiento activo
    console.log(`✅ Seguimiento activo: Unidad ${driver.unidad} - ${driver.email}`);
  };

  // Función para detener el seguimiento
  const stopTracking = () => {
    console.log('🛑 Deteniendo seguimiento automático');
    setTrackedDriver(null);
    map.setZoom(12); // Volver al zoom normal
  };

  // Función para centrar el mapa en todos los conductores
  const centerOnAllDrivers = () => {
    if (!map || drivers.length === 0) return;
    
    const bounds = new window.google.maps.LatLngBounds();
    drivers.forEach(driver => {
      if (driver.latitud && driver.longitud) {
        bounds.extend({
          lat: parseFloat(driver.latitud),
          lng: parseFloat(driver.longitud)
        });
      }
    });
    
    map.fitBounds(bounds);
  };

  // Función para probar la API de Google Maps
  const testGoogleMapsAPI = async () => {
    console.log('🧪 Iniciando prueba de Google Maps API...');
    
    try {
      // Probar si Google Maps está disponible
      if (!window.google || !window.google.maps) {
        console.log('❌ Google Maps no está disponible');
        setError('Google Maps no está cargado. Recargando...');
        
        // Intentar recargar Google Maps
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDs00kpzo5RKbOhpvXeIQbSuaApb5qQWK8&libraries=geometry&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          console.log('✅ Google Maps recargado exitosamente');
          setError(null);
          initializeMap();
        };
        script.onerror = () => {
          console.log('❌ Error al recargar Google Maps');
          setError('Error: API key inválida o no activada');
        };
        
        document.head.appendChild(script);
        return;
      }

      // Probar creación de mapa
      console.log('🧪 Probando creación de mapa...');
      const testDiv = document.createElement('div');
      testDiv.style.width = '100px';
      testDiv.style.height = '100px';
      testDiv.style.position = 'absolute';
      testDiv.style.top = '-1000px';
      document.body.appendChild(testDiv);

      try {
        const testMap = new window.google.maps.Map(testDiv, {
          zoom: 10,
          center: { lat: -0.2295, lng: -78.5249 }
        });
        
        console.log('✅ Google Maps API funciona correctamente');
        console.log('✅ API Key válida y activada');
        setError(null);
        
        // Limpiar elemento de prueba
        document.body.removeChild(testDiv);
        
        // Si el mapa principal no está inicializado, inicializarlo
        if (!map) {
          console.log('🔄 Inicializando mapa principal...');
          initializeMap();
        }
        
      } catch (mapError) {
        console.log('❌ Error al crear mapa de prueba:', mapError);
        setError(`Error de Google Maps: ${mapError.message}`);
        document.body.removeChild(testDiv);
      }

    } catch (error) {
      console.log('❌ Error en prueba de API:', error);
      setError(`Error en prueba: ${error.message}`);
    }
  };

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: '#0f172a',
      color: '#f1f5f9'
    }}>
      {/* Header con controles */}
      <div style={{
        padding: '24px',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '28px',
              fontWeight: 'bold',
              color: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{
                fontSize: '32px',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>🗺️</span>
              Seguimiento de Conductores
            </h1>
            <div style={{
              marginTop: '8px',
              fontSize: '14px',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: error ? '#ef4444' : '#10b981',
                  animation: isLoading ? 'pulse 2s infinite' : 'none'
                }}></div>
                <strong>Activos:</strong> {drivers.filter(d => d.estado === '1').length}
                {!error && drivers.length > 0 && (
                  <span style={{ fontSize: '12px', color: '#10b981', marginLeft: '8px' }}>
                    📡 Datos reales
                  </span>
                )}
                {movementDetected && (
                  <span style={{ fontSize: '12px', color: '#f59e0b', marginLeft: '8px', animation: 'pulse 1s infinite' }}>
                    🚗 Movimiento detectado
                  </span>
                )}
                {trackedDriver && (
                  <span style={{ fontSize: '12px', color: '#3b82f6', marginLeft: '8px', fontWeight: 'bold' }}>
                    🎯 Siguiendo: Unidad {trackedDriver.unidad}
                  </span>
                )}
              </span>
              <span><strong>Total:</strong> {drivers.length}</span>
              {lastUpdate && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px' }}>🕐</span>
                  <strong>Actualizado:</strong> {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={fetchDriverLocations}
              disabled={isLoading}
              style={{
                padding: '12px 20px',
                background: isLoading 
                  ? '#475569' 
                  : '#475569',
                color: '#e2e8f0',
                border: '1px solid #64748b',
                borderRadius: '8px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: isLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.target.style.backgroundColor = '#64748b';
                  e.target.style.borderColor = '#94a3b8';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.target.style.backgroundColor = '#475569';
                  e.target.style.borderColor = '#64748b';
                }
              }}
            >
              {isLoading ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #64748b',
                    borderTop: '2px solid #e2e8f0',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  Actualizando...
                </>
              ) : (
                <>
                  <span>🔄</span>
                  Actualizar
                </>
              )}
            </button>
            
            <button
              onClick={() => {
                console.log('🧪 Probando conexión a la API...');
                testGoogleMapsAPI();
              }}
              style={{
                padding: '12px 20px',
                background: '#475569',
                color: '#e2e8f0',
                border: '1px solid #64748b',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#64748b';
                e.target.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#475569';
                e.target.style.borderColor = '#64748b';
              }}
            >
              <span>🧪</span>
              Probar API
            </button>
            
            <button
              onClick={centerOnAllDrivers}
              style={{
                padding: '12px 20px',
                background: '#475569',
                color: '#e2e8f0',
                border: '1px solid #64748b',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#64748b';
                e.target.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#475569';
                e.target.style.borderColor = '#64748b';
              }}
            >
              <span>🎯</span>
              Ver Todos
            </button>
            
            {trackedDriver && (
              <button
                onClick={stopTracking}
                style={{
                  padding: '12px 20px',
                  background: '#dc2626',
                  color: 'white',
                  border: '1px solid #b91c1c',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#b91c1c';
                  e.target.style.borderColor = '#991b1b';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#dc2626';
                  e.target.style.borderColor = '#b91c1c';
                }}
              >
                <span>🛑</span>
                Detener Seguimiento
              </button>
            )}
          </div>
        </div>

        {/* Botones de unidades */}
        {drivers.length > 0 && (
          <div style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#334155',
            borderRadius: '12px',
            border: '1px solid #475569'
          }}>
            <h3 style={{
              margin: '0 0 12px 0',
              fontSize: '16px',
              fontWeight: '600',
              color: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🚕</span>
              Unidades Disponibles
            </h3>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              {drivers.map((driver) => (
                <button
                  key={driver.id}
                  onClick={() => centerOnDriver(driver)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: trackedDriver && trackedDriver.id === driver.id
                      ? '#1e40af'  // Azul para unidad siendo seguida
                      : driver.estado === '1' 
                        ? '#374151' 
                        : '#4b5563',
                    color: trackedDriver && trackedDriver.id === driver.id
                      ? '#ffffff'  // Blanco para unidad siendo seguida
                      : driver.estado === '1' ? '#d1fae5' : '#fecaca',
                    border: trackedDriver && trackedDriver.id === driver.id
                      ? '2px solid #3b82f6'  // Borde más grueso para unidad siendo seguida
                      : `1px solid ${driver.estado === '1' ? '#4ade80' : '#f87171'}`,
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: trackedDriver && trackedDriver.id === driver.id ? 'bold' : '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: trackedDriver && trackedDriver.id === driver.id
                      ? '0 2px 4px rgba(59, 130, 246, 0.3)'  // Sombra especial para seguimiento
                      : '0 1px 2px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s ease',
                    minWidth: '80px',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (!trackedDriver || trackedDriver.id !== driver.id) {
                      e.target.style.backgroundColor = driver.estado === '1' ? '#4b5563' : '#6b7280';
                      e.target.style.borderColor = driver.estado === '1' ? '#6ee7b7' : '#fbbf24';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!trackedDriver || trackedDriver.id !== driver.id) {
                      e.target.style.backgroundColor = driver.estado === '1' ? '#374151' : '#4b5563';
                      e.target.style.borderColor = driver.estado === '1' ? '#4ade80' : '#f87171';
                    }
                  }}
                >
                  <span style={{ fontSize: '12px' }}>
                    {driver.estado === '1' ? '●' : '●'}
                  </span>
                  {driver.unidad}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: '#374151',
            border: '1px solid #6b7280',
            borderRadius: '8px',
            color: '#d1d5db',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️</span>
            {error}
          </div>
        )}
      </div>

      {/* Contenido principal - Solo mapa */}
      <div style={{ 
        flex: 1, 
        padding: '24px',
        overflow: 'hidden'
      }}>
        {/* Mapa expandido */}
        <div style={{ 
          width: '100%',
          height: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
          backgroundColor: '#1e293b',
          border: '1px solid #334155'
        }}>
          <div
            ref={mapRef}
            style={{ 
              width: '100%', 
              height: '100%',
              minHeight: '600px'
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default DriverTracking;

// Estilos CSS para animaciones
const styles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

// Agregar estilos al documento
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
