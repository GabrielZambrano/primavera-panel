import React, { useState, useEffect, useRef, useCallback } from "react";
import { Wrapper, Status } from "@googlemaps/react-wrapper";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc, deleteDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
// import axios from 'axios'; // Comentado porque no se usa

/**
 * Funcionalidad de tokens de conductores:
 * - Cuando se asigna manualmente una unidad/conductor, se incluye el token FCM del conductor
 * - El token se obtiene de los campos: token, fcmToken, o deviceToken del documento del conductor
 * - Se valida que el token tenga al menos 100 caracteres para considerarlo válido
 * - Se muestra un indicador visual en la gestión de conductores
 * - Los mensajes de confirmación incluyen el estado del token
 * 
 * Funcionalidad de NotificaciOnenCurso:
 * - Se crea un duplicado automático en la colección "NotificaciOnenCurso" 
 * - Incluye todos los datos del pedido más campos específicos para notificaciones
 * - Mantiene el mismo ID del documento original para referencia
 * - Agrega fechaNotificacion y estadoNotificacion para seguimiento
 */

// Configuración de Google Maps
const GOOGLE_MAPS_API_KEY = "AIzaSyBWqJ5_eaGfM6epbuChtkq0W5eqv2Ew37c";

// Componente del Mapa de Google con Places API
function GoogleMapComponent({ onCoordinatesSelect, onAddressSelect, coordenadas, direccionFormulario, center }) {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [marker, setMarker] = useState(null);
  const [autocomplete, setAutocomplete] = useState(null);
  const [geocoder, setGeocoder] = useState(null);
  const autocompleteInputRef = useRef(null);

  // Callbacks memoizados para evitar recreación en cada render
  const handleCoordinatesSelect = useCallback((coords) => {
    onCoordinatesSelect(coords);
  }, [onCoordinatesSelect]);

  const handleAddressSelect = useCallback((address) => {
    onAddressSelect(address);
  }, [onAddressSelect]);

  useEffect(() => {
    if (mapRef.current && !map && window.google && window.google.maps) {
      const newMap = new window.google.maps.Map(mapRef.current, {
        center: center || { lat: -0.2298500, lng: -78.5249500 }, // Quito por defecto
        zoom: 13,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
      });

      setMap(newMap);

      // Inicializar Geocoder
      const newGeocoder = new window.google.maps.Geocoder();
      setGeocoder(newGeocoder);

      // Agregar listener para clics en el mapa
      newMap.addListener("click", (event) => {
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        const nuevasCoordenadas = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        handleCoordinatesSelect(nuevasCoordenadas);

        // Hacer geocoding reverso para obtener la dirección
        newGeocoder.geocode(
          { location: { lat, lng } },
          (results, status) => {
            if (status === "OK" && results[0]) {
              const address = results[0].formatted_address;
              handleAddressSelect(address);
              if (autocompleteInputRef.current) {
                autocompleteInputRef.current.value = address;
              }
            }
          }
        );
      });
    }
  }, [center, handleCoordinatesSelect, handleAddressSelect]); // Dependencias estables

  // Inicializar Autocomplete
  useEffect(() => {
    if (map && autocompleteInputRef.current && !autocomplete && 
        window.google && window.google.maps && window.google.maps.places) {
      
      const newAutocomplete = new window.google.maps.places.Autocomplete(
        autocompleteInputRef.current,
        {
          types: ['address'],
          componentRestrictions: { country: ['ec', 'ni'] }, // Restringir a Ecuador y Nicaragua
          fields: ['formatted_address', 'geometry', 'name']
        }
      );

      newAutocomplete.addListener('place_changed', () => {
        const place = newAutocomplete.getPlace();
        
        if (place.geometry && place.geometry.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const nuevasCoordenadas = `${lat.toFixed(6)},${lng.toFixed(6)}`;
          const address = place.formatted_address || place.name;
          
          handleCoordinatesSelect(nuevasCoordenadas);
          handleAddressSelect(address);
          
          // Centrar el mapa en la nueva ubicación
          map.setCenter({ lat, lng });
          map.setZoom(15);
        }
      });

      setAutocomplete(newAutocomplete);
    }
  }, [map, handleCoordinatesSelect, handleAddressSelect]); // Dependencias estables

  // Actualizar marcador cuando cambien las coordenadas (con debounce)
  useEffect(() => {
    if (map && coordenadas && geocoder) {
      const [lat, lng] = coordenadas.split(',').map(Number);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        const position = { lat, lng };

        // Remover marcador anterior si existe
        if (marker) {
          marker.setMap(null);
        }

        // Crear nuevo marcador
        const newMarker = new window.google.maps.Marker({
          position,
          map,
          title: "Ubicación seleccionada",
          animation: window.google.maps.Animation.DROP,
          draggable: true, // Hacer el marcador arrastrable
        });

        // Listener para cuando se arrastra el marcador
        newMarker.addListener('dragend', (event) => {
          const dragLat = event.latLng.lat();
          const dragLng = event.latLng.lng();
          const nuevasCoordenadas = `${dragLat.toFixed(6)},${dragLng.toFixed(6)}`;
          handleCoordinatesSelect(nuevasCoordenadas);

          // Hacer geocoding reverso para obtener la dirección
          geocoder.geocode(
            { location: { lat: dragLat, lng: dragLng } },
            (results, status) => {
              if (status === "OK" && results[0]) {
                const address = results[0].formatted_address;
                handleAddressSelect(address);
                if (autocompleteInputRef.current) {
                  autocompleteInputRef.current.value = address;
                }
              }
            }
          );
        });

        setMarker(newMarker);
        map.setCenter(position);
      }
    }
  }, [map, coordenadas, geocoder, handleCoordinatesSelect, handleAddressSelect]); // Dependencias controladas

  // Sincronizar el input de búsqueda con la dirección del formulario (solo si es diferente)
  useEffect(() => {
    if (autocompleteInputRef.current && direccionFormulario && 
        autocompleteInputRef.current.value !== direccionFormulario) {
      autocompleteInputRef.current.value = direccionFormulario;
    }
  }, [direccionFormulario]);

  const handleBuscarDireccion = () => {
    const address = autocompleteInputRef.current?.value;
    if (!address || !geocoder) return;

    geocoder.geocode({ address }, (results, status) => {
      
      if (status === "OK" && results[0]) {
        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        const nuevasCoordenadas = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        const formattedAddress = results[0].formatted_address;
        
        handleCoordinatesSelect(nuevasCoordenadas);
        handleAddressSelect(formattedAddress);
        
        // Centrar el mapa en la nueva ubicación
        map.setCenter({ lat, lng });
        map.setZoom(15);
      } else {
        alert('No se pudo encontrar la dirección: ' + address);
      }
    });
  };

  // Verificar si Google Maps está disponible
  if (!window.google || !window.google.maps) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        background: '#fff3cd',
        borderRadius: '8px',
        border: '2px solid #ffeaa7',
        color: '#856404'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
          <div>Esperando Google Maps API...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Buscador de direcciones */}
      <div style={{
        marginBottom: 15,
        padding: 15,
        background: 'white',
        borderRadius: 8,
        border: '2px solid #d1d5db'
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 'bold', minWidth: '80px' }}>Buscar:</span>
          <input
            ref={autocompleteInputRef}
            type="text"
            placeholder="Busca una dirección en Ecuador..."
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: 4,
              fontSize: 14
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleBuscarDireccion();
              }
            }}
          />
          <button
            type="button"
            onClick={handleBuscarDireccion}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            🔍 Buscar
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          💡 Escribe una dirección, haz clic en el mapa o arrastra el marcador para seleccionar ubicación
        </div>
      </div>

      {/* Mapa */}
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "400px",
          borderRadius: "8px",
          border: "2px solid #d1d5db"
        }}
      />
    </div>
  );
}

// Wrapper para manejar el estado de carga de Google Maps
function MapaSelector({ onCoordinatesSelect, onAddressSelect, coordenadas, direccionFormulario }) {
  const [mapaVisible, setMapaVisible] = useState(false);
  const [coordenadasTemp, setCoordenadasTemp] = useState(coordenadas || '-0.2298500,-78.5249500');

  useEffect(() => {
    if (coordenadas && coordenadas !== coordenadasTemp) {
      setCoordenadasTemp(coordenadas);
    }
  }, [coordenadas]); // Solo depende de coordenadas

  const render = (status) => {
    switch (status) {
      case Status.LOADING:
        return (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '200px',
            background: '#f3f4f6',
            borderRadius: '8px',
            border: '2px solid #d1d5db'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>🗺️</div>
              <div>Cargando Google Maps...</div>
            </div>
          </div>
        );
      case Status.FAILURE:
        return (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '200px',
            background: '#fee2e2',
            borderRadius: '8px',
            border: '2px solid #fecaca',
            color: '#dc2626'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>❌</div>
              <div>Error al cargar Google Maps</div>
              <div style={{ fontSize: '12px', marginTop: '5px' }}>
                Verifique la conexión a internet y la API key
              </div>
            </div>
          </div>
        );
      case Status.SUCCESS:
        return (
          <GoogleMapComponent
            onCoordinatesSelect={onCoordinatesSelect}
            onAddressSelect={onAddressSelect}
            coordenadas={coordenadas}
            direccionFormulario={direccionFormulario}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>
          🗺️ Google Maps - Selector de Coordenadas
        </h3>
        <button
          type="button"
          onClick={() => setMapaVisible(!mapaVisible)}
          style={{
            padding: '8px 12px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          {mapaVisible ? 'Ocultar Mapa' : 'Mostrar Mapa'}
        </button>
      </div>

      {mapaVisible && (
        <div style={{
          border: '2px solid #ccc',
          borderRadius: 8,
          background: '#f8f9fa',
          overflow: 'hidden'
        }}>
          {/* Google Maps con Places API */}
          <Wrapper 
            apiKey={GOOGLE_MAPS_API_KEY} 
            render={render} 
            libraries={['places']}
          />

          {/* Controles de coordenadas manuales */}
          <div style={{
            padding: 15,
            borderTop: '1px solid #ddd',
            background: 'white'
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 'bold' }}>Coordenadas:</span>
              <input
                type="text"
                value={coordenadasTemp}
                onChange={(e) => {
                  setCoordenadasTemp(e.target.value);
                }}
                onBlur={(e) => {
                  onCoordinatesSelect(e.target.value);
                }}
                placeholder="Lat,Lng (ej: -0.2298500,-78.5249500)"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  await onCoordinatesSelect(coordenadasTemp);
                  alert('Coordenadas aplicadas y mapa ocultado');
                }}
                style={{
                  padding: '8px 12px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Formulario principal de Taxi
function TaxiForm() {
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [coordenadas, setCoordenadas] = useState('');
  const [direccion, setDireccion] = useState('');
  const [tiempo, setTiempo] = useState('');
  const [unidad, setUnidad] = useState('');
  const [modoSeleccion, setModoSeleccion] = useState('aplicacion');
  const [usuarioEncontrado, setUsuarioEncontrado] = useState(null);
  const [buscandoUsuario, setBuscandoUsuario] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '',
    direccion: '',
    coordenadas: '',
    email: ''
  });
  const [modal, setModal] = useState({ open: false, success: true, message: '' });
    const [mapaVisible, setMapaVisible] = useState(false); // Para controlar el mapa desde el formulario
  const [modalRegistroCliente, setModalRegistroCliente] = useState({ 
    open: false, 
    tipoCliente: '', 
    coleccion: '', 
    modoAplicacion: false,
    datosCliente: { nombre: '', direccion: '', coordenadas: '', sector: '', prefijo: 'Ecuador' }
  });
       const [viajesAsignados, setViajesAsignados] = useState([]);
   const [cargandoViajes, setCargandoViajes] = useState(false);
   const [editandoViaje, setEditandoViaje] = useState(null);
   const [tiempoEdit, setTiempoEdit] = useState('');
   const [unidadEdit, setUnidadEdit] = useState('');
   const [pedidosEnCurso, setPedidosEnCurso] = useState([]);
   const [cargandoPedidosCurso, setCargandoPedidosCurso] = useState(false);
  // Nuevo estado para direcciones guardadas
  const [direccionesGuardadas, setDireccionesGuardadas] = useState([]);
  const [direccionSeleccionada, setDireccionSeleccionada] = useState(null);
  // Estados para edición de direcciones
  const [editandoDireccion, setEditandoDireccion] = useState(null);
  const [textoEditado, setTextoEditado] = useState('');

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setModoSeleccion(prevModo =>
          prevModo === 'aplicacion' ? 'manual' : 'aplicacion'
        );
      }
      if (event.key === 'Escape') {
        setMostrarModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Configurar listeners en tiempo real para las colecciones
  useEffect(() => {
    // Listener para pedidosDisponibles
    const qDisponibles = query(collection(db, 'pedidosDisponibles'));
    const unsubscribeDisponibles = onSnapshot(qDisponibles, (querySnapshot) => {
      const pedidos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar por fecha de creación más reciente primero
      pedidos.sort((a, b) => {
        if (a.fecha && b.fecha) {
          const fechaA = new Date(a.fecha);
          const fechaB = new Date(b.fecha);
          return fechaB - fechaA;
        }
        return 0;
      });
      
      setViajesAsignados(pedidos);
      setCargandoViajes(false);
    }, (error) => {
      console.error('Error en listener de pedidosDisponibles:', error);
      setCargandoViajes(false);
    });

    // Listener para pedidoEnCurso
    const qEnCurso = query(collection(db, 'pedidoEnCurso'));
    const unsubscribeEnCurso = onSnapshot(qEnCurso, (querySnapshot) => {
      const pedidos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar por fecha de creación más reciente primero
      pedidos.sort((a, b) => {
        if (a.fecha && b.fecha) {
          const fechaA = new Date(a.fecha);
          const fechaB = new Date(b.fecha);
          return fechaB - fechaA;
        }
        return 0;
      });
      
      setPedidosEnCurso(pedidos);
      setCargandoPedidosCurso(false);
    }, (error) => {
      console.error('Error en listener de pedidoEnCurso:', error);
      setCargandoPedidosCurso(false);
    });

    // Cleanup function para desuscribirse cuando el componente se desmonte
    return () => {
      unsubscribeDisponibles();
      unsubscribeEnCurso();
    };
  }, []);

  const cargarViajesAsignados = async () => {
    setCargandoViajes(true);
    try {
      // Leer todos los pedidos disponibles
      const q = query(collection(db, 'pedidosDisponibles'));
      const querySnapshot = await getDocs(q);
      const pedidos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar por fecha de creación más reciente primero
      pedidos.sort((a, b) => {
        if (a.fecha && b.fecha) {
          const fechaA = new Date(a.fecha);
          const fechaB = new Date(b.fecha);
          return fechaB - fechaA;
        }
        return 0;
      });
      
      setViajesAsignados(pedidos);
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
    } finally {
      setCargandoViajes(false);
    }
  };

      // Cargar pedidos disponibles


      // Cargar pedidos en curso
  const cargarPedidosEnCurso = async () => {
    setCargandoPedidosCurso(true);
    try {
      const q = query(collection(db, 'pedidoEnCurso'));
      const querySnapshot = await getDocs(q);
      const pedidos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar por fecha de creación más reciente primero
      pedidos.sort((a, b) => {
        if (a.fecha && b.fecha) {
          const fechaA = new Date(a.fecha);
          const fechaB = new Date(b.fecha);
        return fechaB - fechaA;
        }
        return 0;
      });

      setPedidosEnCurso(pedidos);
    } catch (error) {
      console.error('Error al cargar pedidos en curso:', error);
    } finally {
      setCargandoPedidosCurso(false);
    }
  };



  // Nueva función para buscar en clientes fijos cuando se presione Insertar
  const buscarClienteFijo = async (numeroTelefono) => {
    if (numeroTelefono.length !== 7) {
      return null; // Solo buscar si tiene exactamente 7 dígitos
    }

    try {
      // Buscar en la colección "clientes fijos"
      const qClientesFijos = query(
        collection(db, 'clientes fijos'),
        where("telefono", "==", numeroTelefono)
      );
      const clientesSnapshot = await getDocs(qClientesFijos);

      if (!clientesSnapshot.empty) {
        const clienteData = clientesSnapshot.docs[0].data();
        console.log('Cliente fijo encontrado:', clienteData);
        return clienteData;
      }

      // Si no se encuentra en "clientes fijos", buscar en "teléfonos fijos"
      const qTelefonosFijos = query(
        collection(db, 'teléfonos fijos'),
        where("telefono", "==", numeroTelefono)
      );
      const telefonosSnapshot = await getDocs(qTelefonosFijos);

      if (!telefonosSnapshot.empty) {
        const telefonoData = telefonosSnapshot.docs[0].data();
        console.log('Teléfono fijo encontrado:', telefonoData);
        return telefonoData;
      }

      return null; // No se encontró en ninguna colección
    } catch (error) {
      console.error('Error al buscar cliente fijo:', error);
      return null;
    }
  };

  // Nueva función para buscar en ambas colecciones de clientes
  const buscarCliente = async (numeroTelefono) => {
    try {
      let coleccionNombre = '';
      let tipoCliente = '';
      
      console.log('🔍 Iniciando búsqueda de cliente con teléfono:', numeroTelefono);
      
      // Determinar el tipo de cliente según la longitud del teléfono
      let telefonoBusqueda = numeroTelefono;
      
      if (numeroTelefono.length === 7) {
        coleccionNombre = 'clientes';
        tipoCliente = 'cliente';
        telefonoBusqueda = numeroTelefono;
        console.log('📱 Buscando en colección "clientes" (7 dígitos)');
        
        // Buscar directamente por ID (teléfono)
        console.log('🔎 Buscando cliente por ID (teléfono):', telefonoBusqueda);
        const clienteDoc = doc(db, coleccionNombre, telefonoBusqueda);
        const clienteSnapshot = await getDoc(clienteDoc);
        
        if (clienteSnapshot.exists()) {
          const clienteData = clienteSnapshot.data();
          console.log('📄 Documento del cliente encontrado:', clienteData);
          
          // Cargar la primera dirección del array (si existe)
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            // Buscar la dirección activa más reciente
            const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
            clienteData.direccion = direccionActiva.direccion;
            clienteData.coordenadas = direccionActiva.coordenadas;
            console.log('📍 Dirección encontrada en array:', direccionActiva);
            console.log('📍 Total de direcciones del cliente:', clienteData.direcciones.length);
          } else {
            console.log('⚠️ No se encontraron direcciones para el cliente');
            clienteData.direccion = '';
            clienteData.coordenadas = '';
          }
          
          console.log(`✅ ${tipoCliente} encontrado con datos completos:`, clienteData);
          return { 
            encontrado: true, 
            datos: clienteData, 
            tipoCliente: tipoCliente,
            coleccion: coleccionNombre
          };
        } else {
          console.log(`❌ No se encontró ${tipoCliente} con teléfono ${numeroTelefono} en ${coleccionNombre}`);
          return { 
            encontrado: false, 
            tipoCliente: tipoCliente,
            coleccion: coleccionNombre
          };
        }
      } else if (numeroTelefono.length >= 9 && numeroTelefono.length <= 10) {
        coleccionNombre = 'clientestelefonos';
        tipoCliente = 'cliente telefono';
        
        // Para celulares, intentar primero con telefonoCompleto (Ecuador por defecto)
        const telefonoCompleto = concatenarTelefonoWhatsApp(numeroTelefono, 'Ecuador');
        console.log('📱 Intentando buscar con telefonoCompleto:', telefonoCompleto);
        
        // Intentar primero con telefonoCompleto
        let clienteDoc = doc(db, coleccionNombre, telefonoCompleto);
        let clienteSnapshot = await getDoc(clienteDoc);
        
        if (clienteSnapshot.exists()) {
          telefonoBusqueda = telefonoCompleto;
          console.log('✅ Cliente encontrado con telefonoCompleto como ID');
        } else {
          // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
        telefonoBusqueda = numeroTelefono.slice(-9);
          console.log('📱 Intentando con últimos 9 dígitos como fallback:', telefonoBusqueda);
          clienteDoc = doc(db, coleccionNombre, telefonoBusqueda);
          clienteSnapshot = await getDoc(clienteDoc);
        }
        
        if (clienteSnapshot.exists()) {
          const clienteData = clienteSnapshot.data();
          console.log('📄 Documento del cliente encontrado:', clienteData);
          
          // Cargar la primera dirección del array (si existe)
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            // Buscar la dirección activa más reciente
            const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
            clienteData.direccion = direccionActiva.direccion;
            clienteData.coordenadas = direccionActiva.coordenadas;
            console.log('📍 Dirección encontrada en array:', direccionActiva);
            console.log('📍 Total de direcciones del cliente:', clienteData.direcciones.length);
          } else {
            console.log('⚠️ No se encontraron direcciones para el cliente');
            clienteData.direccion = '';
            clienteData.coordenadas = '';
          }
          
          console.log(`✅ ${tipoCliente} encontrado con datos completos:`, clienteData);
          return { 
            encontrado: true, 
            datos: clienteData, 
            tipoCliente: tipoCliente,
            coleccion: coleccionNombre
          };
        } else {
          console.log(`❌ No se encontró ${tipoCliente} con teléfono ${numeroTelefono} en ${coleccionNombre}`);
          return { 
            encontrado: false, 
            tipoCliente: tipoCliente,
            coleccion: coleccionNombre
          };
        }
      } else if (numeroTelefono.length > 10) {
        coleccionNombre = 'clientes fijos';
        tipoCliente = 'cliente fijo';
        telefonoBusqueda = numeroTelefono;
        console.log('📱 Buscando en colección "clientes fijos" (>10 dígitos)');

      // Buscar directamente por ID (teléfono)
      console.log('🔎 Buscando cliente por ID (teléfono):', telefonoBusqueda);
      const clienteDoc = doc(db, coleccionNombre, telefonoBusqueda);
      const clienteSnapshot = await getDoc(clienteDoc);
      
      if (clienteSnapshot.exists()) {
        const clienteData = clienteSnapshot.data();
        console.log('📄 Documento del cliente encontrado:', clienteData);
        
        // Cargar la primera dirección del array (si existe)
        if (clienteData.direcciones && clienteData.direcciones.length > 0) {
          // Buscar la dirección activa más reciente
          const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
          clienteData.direccion = direccionActiva.direccion;
          clienteData.coordenadas = direccionActiva.coordenadas;
          console.log('📍 Dirección encontrada en array:', direccionActiva);
          console.log('📍 Total de direcciones del cliente:', clienteData.direcciones.length);
        } else {
          console.log('⚠️ No se encontraron direcciones para el cliente');
          clienteData.direccion = '';
          clienteData.coordenadas = '';
        }
        
        console.log(`✅ ${tipoCliente} encontrado con datos completos:`, clienteData);
        return { 
          encontrado: true, 
          datos: clienteData, 
          tipoCliente: tipoCliente,
          coleccion: coleccionNombre
        };
      } else {
        console.log(`❌ No se encontró ${tipoCliente} con teléfono ${numeroTelefono} en ${coleccionNombre}`);
        return { 
          encontrado: false, 
          tipoCliente: tipoCliente,
          coleccion: coleccionNombre
        };
        }
      } else {
        console.log('❌ Teléfono no cumple criterios:', numeroTelefono.length, 'dígitos');
        return { encontrado: false, tipoCliente: null };
      }
    } catch (error) {
      console.error('💥 Error al buscar cliente:', error);
      return { encontrado: false, tipoCliente: null };
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Datos del formulario:', { telefono, nombre, coordenadas, direccion, tiempo, unidad, modoSeleccion, usuarioEncontrado });
  };

  const handleTelefonoChange = (e) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) {
      setTelefono(value);
      // Limpiar datos cuando el teléfono cambie
      if (value.length < 7) {
        setUsuarioEncontrado(null);
        setNombre('');
        setDireccion('');
        setCoordenadas('');
        setMostrarModal(false);
      }
    }
  };

  // Nueva función para manejar Enter en el campo teléfono
  const handleTelefonoKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // Solo buscar si el teléfono tiene 7 dígitos, 9-10 dígitos, o más de 10
      if (telefono && (telefono.length === 7 || (telefono.length >= 9 && telefono.length <= 10) || telefono.length > 10)) {
        console.log('🔍 Buscando cliente con teléfono:', telefono);
        
        // Debug: Verificar estructura de datos directamente
        if (telefono === '2511511') {
          console.log('🔍 DEBUG: Verificando estructura para HOTEL VIENA...');
          try {
            const q = query(collection(db, 'clientes'), where("telefono", "==", "2511511"));
            const snapshot = await getDocs(q);
            console.log('📊 Documentos encontrados:', snapshot.size);
            
            if (!snapshot.empty) {
              const doc = snapshot.docs[0];
              console.log('📄 Documento principal:', doc.data());
              console.log('🆔 ID del documento:', doc.id);
              
              // Verificar subcolección direcciones
              const direccionesRef = collection(db, 'clientes', doc.id, 'direcciones');
              const direccionesSnapshot = await getDocs(direccionesRef);
              console.log('📍 Direcciones en subcolección:', direccionesSnapshot.size);
              
              direccionesSnapshot.forEach((doc, index) => {
                console.log(`📍 Dirección ${index + 1}:`, doc.data());
              });
            }
          } catch (error) {
            console.error('💥 Error en debug:', error);
          }
        }
        
        const resultadoBusqueda = await buscarCliente(telefono);
        console.log('📋 Resultado de búsqueda:', resultadoBusqueda);
        
        if (resultadoBusqueda && resultadoBusqueda.encontrado) {
          // Cliente encontrado, cargar datos automáticamente
          const clienteData = resultadoBusqueda.datos;
          console.log('📋 Datos completos del cliente encontrado:', clienteData);
          
          if (clienteData.nombre) {
            setNombre(clienteData.nombre);
            console.log('✅ Nombre cargado:', clienteData.nombre);
          }
          
          if (clienteData.direccion) {
            setDireccion(clienteData.direccion);
            console.log('✅ Dirección cargada:', clienteData.direccion);
          } else {
            console.log('⚠️ No se encontró dirección para el cliente');
          }
          
          if (clienteData.coordenadas) {
            setCoordenadas(clienteData.coordenadas);
            console.log('✅ Coordenadas cargadas:', clienteData.coordenadas);
          } else {
            console.log('⚠️ No se encontraron coordenadas para el cliente');
          }
          
          console.log(`✅ Datos del ${resultadoBusqueda.tipoCliente} cargados automáticamente:`, clienteData);
          
          // Cargar direcciones guardadas directamente
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            setDireccionesGuardadas(clienteData.direcciones);
            // Seleccionar la primera dirección por defecto
            if (clienteData.direcciones.length > 0) {
              const primeraDireccion = clienteData.direcciones[0];
              setDireccionSeleccionada(primeraDireccion);
              setDireccion(primeraDireccion.direccion);
              setCoordenadas(primeraDireccion.coordenadas || '');
              console.log('📍 Primera dirección seleccionada automáticamente:', primeraDireccion);
            }
            console.log('📍 Direcciones guardadas cargadas:', clienteData.direcciones.length);
          } else {
            setDireccionesGuardadas([]);
            setDireccionSeleccionada(null);
            console.log('⚠️ No hay direcciones guardadas para este cliente');
          }
        } else {
          // Cliente no encontrado, mostrar modal de registro
          console.log('❌ Cliente no encontrado, mostrando modal de registro');
          setDireccionesGuardadas([]);
          setDireccionSeleccionada(null);
          setModalRegistroCliente({
            open: true,
            tipoCliente: resultadoBusqueda ? resultadoBusqueda.tipoCliente : 'cliente',
            coleccion: resultadoBusqueda ? resultadoBusqueda.coleccion : 'clientes',
            modoAplicacion: modoSeleccion === 'aplicacion',
            datosCliente: { 
              nombre: '', 
              direccion: '', 
              coordenadas: '', 
              sector: ''
            }
          });
          console.log('📝 Modal de registro configurado:', {
            open: true,
            tipoCliente: resultadoBusqueda ? resultadoBusqueda.tipoCliente : 'cliente',
            coleccion: resultadoBusqueda ? resultadoBusqueda.coleccion : 'clientes',
            modoAplicacion: modoSeleccion === 'aplicacion'
          });
        }
      } else {
        console.log('📱 Teléfono no cumple criterios para búsqueda:', telefono);
      }
    }
  };

  // Función para seleccionar una dirección del listado
  const seleccionarDireccion = (direccion) => {
    setDireccionSeleccionada(direccion);
    setDireccion(direccion.direccion);
    setCoordenadas(direccion.coordenadas || '');
    console.log('📍 Dirección seleccionada:', direccion);
  };

  // Función para iniciar edición de dirección
  const iniciarEdicionDireccion = (direccion) => {
    setEditandoDireccion(direccion);
    setTextoEditado(direccion.direccion);
  };

  // Función para guardar edición de dirección
  const guardarEdicionDireccion = async () => {
    if (!editandoDireccion || !textoEditado.trim()) return;

    try {
      // Determinar la colección según la longitud del teléfono
      let coleccionNombre = '';
      if (telefono.length === 7) {
        coleccionNombre = 'clientes';
      } else if (telefono.length >= 9 && telefono.length <= 10) {
        coleccionNombre = 'clientestelefonos';
      } else {
        console.log('❌ Tipo de teléfono no válido para editar historial');
        return;
      }

      // Buscar el cliente
      let telefonoId = telefono;
      let clienteRef;

      if (telefono.length >= 9 && telefono.length <= 10) {
        const telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
        clienteRef = doc(db, coleccionNombre, telefonoCompleto);
        let clienteSnapshot = await getDoc(clienteRef);

        if (!clienteSnapshot.exists()) {
          telefonoId = telefono.slice(-9);
          clienteRef = doc(db, coleccionNombre, telefonoId);
          clienteSnapshot = await getDoc(clienteRef);
        }
      } else {
        clienteRef = doc(db, coleccionNombre, telefonoId);
      }

      const clienteSnapshot = await getDoc(clienteRef);
      if (!clienteSnapshot.exists()) {
        console.log('❌ Cliente no encontrado para editar historial');
        return;
      }

      const clienteData = clienteSnapshot.data();
      const direccionesActuales = clienteData.direcciones || [];

      // Encontrar y actualizar la dirección específica
      const direccionIndex = direccionesActuales.findIndex(dir => 
        dir.direccion === editandoDireccion.direccion && 
        dir.coordenadas === editandoDireccion.coordenadas
      );

      if (direccionIndex !== -1) {
        direccionesActuales[direccionIndex].direccion = textoEditado.trim();
        direccionesActuales[direccionIndex].fechaActualizacion = new Date();

        // Actualizar en Firestore
        await updateDoc(clienteRef, {
          direcciones: direccionesActuales
        });

        // Actualizar el estado local
        setDireccionesGuardadas(direccionesActuales);
        
        // Si la dirección editada es la seleccionada, actualizar también
        if (direccionSeleccionada === editandoDireccion) {
          const direccionActualizada = direccionesActuales[direccionIndex];
          setDireccionSeleccionada(direccionActualizada);
          setDireccion(direccionActualizada.direccion);
        }

        console.log('✅ Dirección editada exitosamente');
      }

      // Limpiar estado de edición
      setEditandoDireccion(null);
      setTextoEditado('');
    } catch (error) {
      console.error('💥 Error al editar dirección:', error);
    }
  };

  // Función para cancelar edición
  const cancelarEdicionDireccion = () => {
    setEditandoDireccion(null);
    setTextoEditado('');
  };

  // Función para eliminar dirección del historial
  const eliminarDireccion = async (direccionAEliminar) => {
    try {
      // Determinar la colección según la longitud del teléfono
      let coleccionNombre = '';
      if (telefono.length === 7) {
        coleccionNombre = 'clientes';
      } else if (telefono.length >= 9 && telefono.length <= 10) {
        coleccionNombre = 'clientestelefonos';
      } else {
        console.log('❌ Tipo de teléfono no válido para eliminar del historial');
        return;
      }

      // Buscar el cliente
      let telefonoId = telefono;
      let clienteRef;

      if (telefono.length >= 9 && telefono.length <= 10) {
        const telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
        clienteRef = doc(db, coleccionNombre, telefonoCompleto);
        let clienteSnapshot = await getDoc(clienteRef);

        if (!clienteSnapshot.exists()) {
          telefonoId = telefono.slice(-9);
          clienteRef = doc(db, coleccionNombre, telefonoId);
          clienteSnapshot = await getDoc(clienteRef);
        }
      } else {
        clienteRef = doc(db, coleccionNombre, telefonoId);
      }

      const clienteSnapshot = await getDoc(clienteRef);
      if (!clienteSnapshot.exists()) {
        console.log('❌ Cliente no encontrado para eliminar del historial');
        return;
      }

      const clienteData = clienteSnapshot.data();
      const direccionesActuales = clienteData.direcciones || [];

      // Filtrar la dirección a eliminar
      const direccionesFiltradas = direccionesActuales.filter(dir => 
        !(dir.direccion === direccionAEliminar.direccion && 
          dir.coordenadas === direccionAEliminar.coordenadas)
      );

      // Actualizar en Firestore
      await updateDoc(clienteRef, {
        direcciones: direccionesFiltradas
      });

      // Actualizar el estado local
      setDireccionesGuardadas(direccionesFiltradas);
      
      // Si la dirección eliminada era la seleccionada, limpiar selección
      if (direccionSeleccionada === direccionAEliminar) {
        setDireccionSeleccionada(null);
        setDireccion('');
        setCoordenadas('');
      }

      console.log('✅ Dirección eliminada del historial');
    } catch (error) {
      console.error('💥 Error al eliminar dirección:', error);
    }
  };

  const registrarCliente = async () => {
    try {
      const coleccionNombre = telefono.length === 7 ? 'usuarios' : 'usuariosfijos';
      const nuevoUsuario = {
        telefono: telefono,
        nombre: nuevoCliente.nombre,
        direccion: nuevoCliente.direccion,
        coordenadas: nuevoCliente.coordenadas,
        email: nuevoCliente.email,
        fechaRegistro: new Date().toISOString()
      };
      await addDoc(collection(db, coleccionNombre), nuevoUsuario);
      setNombre(nuevoCliente.nombre);
      setDireccion(nuevoCliente.direccion);
      setCoordenadas(nuevoCliente.coordenadas);
      setUsuarioEncontrado(nuevoUsuario);
      setMostrarModal(false);
      alert('Cliente registrado exitosamente');
    } catch (error) {
      console.error('Error al registrar cliente:', error);
      alert('Error al registrar cliente. Intente nuevamente.');
    }
  };

  // Nueva función para registrar clientes con direcciones mapeadas
  const registrarNuevoCliente = async (datosCliente, tipoCliente, modoAplicacion) => {
    try {
      let coleccionNombre = '';
      
      // Determinar la colección según el tipo de cliente
      if (tipoCliente === 'cliente') {
        coleccionNombre = 'clientes';
      } else if (tipoCliente === 'cliente telefono') {
        coleccionNombre = 'clientestelefonos';
      } else if (tipoCliente === 'cliente fijo') {
        coleccionNombre = 'clientes fijos';
      } else {
        throw new Error('Tipo de cliente no válido');
      }

      // Crear array de direcciones
      const direcciones = [];
      
      // Si hay dirección, agregarla al array
      if (datosCliente.direccion) {
        const nuevaDireccion = {
          direccion: datosCliente.direccion,
          coordenadas: datosCliente.coordenadas || '',
          fechaRegistro: new Date(),
          activa: true,
          modoRegistro: modoAplicacion ? 'aplicacion' : 'manual'
        };
        
        direcciones.push(nuevaDireccion);
        console.log('📍 Dirección agregada al array:', nuevaDireccion);
      }

      // Crear el documento principal del cliente con direcciones mapeadas
      const nuevoCliente = {
        telefono: telefono,
        telefonoCompleto: concatenarTelefonoWhatsApp(telefono, datosCliente.prefijo || 'Ecuador'),
        nombre: datosCliente.nombre,
        fechaRegistro: new Date(),
        activo: true,
        sector: datosCliente.sector || '',
        prefijo: datosCliente.prefijo || 'Ecuador', // Prefijo por defecto
        direcciones: direcciones // Array mapeado de direcciones
      };

      // Crear el documento del cliente usando el teléfono como ID
      let telefonoId = telefono;
      if (tipoCliente === 'cliente telefono') {
        // Para celulares, usar el telefonoCompleto como ID (sin el cero inicial)
        telefonoId = concatenarTelefonoWhatsApp(telefono, datosCliente.prefijo || 'Ecuador');
        console.log('📱 Usando telefonoCompleto como ID:', telefonoId);
      }
      
      const clienteRef = doc(db, coleccionNombre, telefonoId);
      await setDoc(clienteRef, nuevoCliente);
      
      console.log('📍 Cliente registrado con direcciones mapeadas:', nuevoCliente);
      
      // Actualizar los campos del formulario
      setNombre(datosCliente.nombre);
      setDireccion(datosCliente.direccion);
      if (datosCliente.coordenadas) {
        setCoordenadas(datosCliente.coordenadas);
      }
      
      // Cerrar el modal de registro
      setModalRegistroCliente({ 
        open: false, 
        tipoCliente: '', 
        coleccion: '', 
        modoAplicacion: false,
        datosCliente: { nombre: '', direccion: '', coordenadas: '', sector: '', prefijo: 'Ecuador' } 
      });
      
      setModal({ 
        open: true, 
        success: true, 
        message: `${tipoCliente} registrado exitosamente en la colección ${coleccionNombre}` 
      });
      
    } catch (error) {
      console.error('Error al registrar cliente:', error);
      setModal({ 
        open: true, 
        success: false, 
        message: `Error al registrar ${tipoCliente}. Intente nuevamente.` 
      });
    }
  };

  // Función para agregar nueva dirección a cliente existente
  const agregarNuevaDireccion = async (telefono, nuevaDireccion, tipoCliente) => {
    try {
      let coleccionNombre = '';
      
      if (tipoCliente === 'cliente') {
        coleccionNombre = 'clientes';
      } else if (tipoCliente === 'cliente telefono') {
        coleccionNombre = 'clientestelefonos';
      } else if (tipoCliente === 'cliente fijo') {
        coleccionNombre = 'clientes fijos';
      } else {
        throw new Error('Tipo de cliente no válido');
      }

      // Obtener el documento del cliente
      let telefonoId = telefono;
      let clienteRef;
      let clienteSnapshot;
      
      if (tipoCliente === 'cliente telefono') {
        // Para celulares, intentar primero con telefonoCompleto (Ecuador por defecto)
        const telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
        console.log('📱 Intentando buscar cliente con telefonoCompleto:', telefonoCompleto);
        
        clienteRef = doc(db, coleccionNombre, telefonoCompleto);
        clienteSnapshot = await getDoc(clienteRef);
        
        if (clienteSnapshot.exists()) {
          telefonoId = telefonoCompleto;
          console.log('✅ Cliente encontrado con telefonoCompleto como ID');
        } else {
          // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
        telefonoId = telefono.slice(-9);
          console.log('📱 Intentando con últimos 9 dígitos como fallback:', telefonoId);
          clienteRef = doc(db, coleccionNombre, telefonoId);
          clienteSnapshot = await getDoc(clienteRef);
        }
      } else {
        // Para otros tipos de cliente, usar el teléfono original
        clienteRef = doc(db, coleccionNombre, telefonoId);
        clienteSnapshot = await getDoc(clienteRef);
      }
      
      if (!clienteSnapshot.exists()) {
        throw new Error('Cliente no encontrado');
      }

      const clienteData = clienteSnapshot.data();
      const direccionesActuales = clienteData.direcciones || [];
      
      // Agregar nueva dirección al array
      const nuevaDireccionData = {
        direccion: nuevaDireccion.direccion,
        coordenadas: nuevaDireccion.coordenadas || '',
        fechaRegistro: new Date(),
        activa: true,
        modoRegistro: nuevaDireccion.modoRegistro || 'manual'
      };
      
      direccionesActuales.push(nuevaDireccionData);
      
      // Actualizar el documento con el nuevo array de direcciones
      await updateDoc(clienteRef, {
        direcciones: direccionesActuales
      });
      
      console.log('📍 Nueva dirección agregada al cliente:', nuevaDireccionData);
      console.log('📍 Total de direcciones del cliente:', direccionesActuales.length);
      
      return true;
    } catch (error) {
      console.error('Error al agregar nueva dirección:', error);
      return false;
    }
  };

  // Función para validar si el token del conductor está configurado
  const validarTokenConductor = (token) => {
    if (!token || token.trim() === '') {
      return false;
    }
    // Validar que el token tenga el formato básico de FCM (al menos 100 caracteres)
    return token.length >= 100;
  };

  // Función para concatenar prefijo con teléfono para WhatsApp
  const concatenarTelefonoWhatsApp = (telefono, prefijo) => {
    const prefijosWhatsApp = {
      'Ecuador': '593',
      'Nicaragua': '505',
      'Colombia': '57',
      'Peru': '51',
      'Chile': '56',
      'Argentina': '54',
      'Mexico': '52',
      'Espana': '34',
      'Estados Unidos': '1'
    };
    
    const codigoPais = prefijosWhatsApp[prefijo] || '593'; // Por defecto Ecuador
    let telefonoLimpio = telefono.replace(/\D/g, ''); // Remover caracteres no numéricos
    
    // Remover el 0 inicial si existe
    if (telefonoLimpio.startsWith('0')) {
      telefonoLimpio = telefonoLimpio.substring(1);
    }
    
    return `${codigoPais}${telefonoLimpio}`;
  };

  // Función para actualizar coordenadas de cliente existente (solo para teléfonos de 7 dígitos y celulares)
  const actualizarCoordenadasCliente = async (telefono, nuevasCoordenadas, nuevaDireccion) => {
    try {
      // Solo actualizar si el teléfono tiene 7 dígitos o es celular (9-10 dígitos)
      if (telefono.length !== 7 && (telefono.length < 9 || telefono.length > 10)) {
        console.log('⚠️ Solo se actualizan coordenadas para teléfonos de 7 dígitos o celulares (9-10 dígitos)');
        return false;
      }

      console.log('📍 Actualizando coordenadas para cliente:', telefono);
      
      // Determinar la colección según la longitud del teléfono
      let coleccionNombre = '';
      if (telefono.length === 7) {
        coleccionNombre = 'clientes';
      } else if (telefono.length >= 9 && telefono.length <= 10) {
        coleccionNombre = 'clientestelefonos';
      } else {
        console.log('❌ Tipo de teléfono no válido para actualizar coordenadas');
        return false;
      }
      
      // Buscar el cliente en la colección correspondiente
      let telefonoId = telefono;
      let clienteRef;
      let clienteSnapshot;
      
      if (telefono.length >= 9 && telefono.length <= 10) {
        // Para celulares, intentar primero con telefonoCompleto (Ecuador por defecto)
        const telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
        console.log('📱 Intentando buscar cliente con telefonoCompleto:', telefonoCompleto);
        
        clienteRef = doc(db, coleccionNombre, telefonoCompleto);
        clienteSnapshot = await getDoc(clienteRef);
        
        if (clienteSnapshot.exists()) {
          telefonoId = telefonoCompleto;
          console.log('✅ Cliente encontrado con telefonoCompleto como ID');
        } else {
          // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
        telefonoId = telefono.slice(-9);
          console.log('📱 Intentando con últimos 9 dígitos como fallback:', telefonoId);
          clienteRef = doc(db, coleccionNombre, telefonoId);
          clienteSnapshot = await getDoc(clienteRef);
        }
      } else {
        // Para teléfonos de 7 dígitos, usar el teléfono original
        clienteRef = doc(db, coleccionNombre, telefonoId);
        clienteSnapshot = await getDoc(clienteRef);
      }
      
      if (!clienteSnapshot.exists()) {
        throw new Error('Cliente no encontrado');
      }

      const clienteData = clienteSnapshot.data();
      const direccionesActuales = clienteData.direcciones || [];
      
      // Buscar si ya existe una dirección con coordenadas
      const direccionConCoordenadas = direccionesActuales.find(dir => dir.coordenadas && dir.coordenadas.trim() !== '');
      
      if (direccionConCoordenadas) {
        // Actualizar las coordenadas existentes
        direccionConCoordenadas.coordenadas = nuevasCoordenadas;
        direccionConCoordenadas.direccion = nuevaDireccion;
        direccionConCoordenadas.fechaActualizacion = new Date();
        console.log('📍 Coordenadas actualizadas en dirección existente:', direccionConCoordenadas);
      } else {
        // Agregar nueva dirección con coordenadas
        const nuevaDireccionData = {
          direccion: nuevaDireccion,
          coordenadas: nuevasCoordenadas,
          fechaRegistro: new Date(),
          activa: true,
          modoRegistro: 'aplicacion'
        };
        
        direccionesActuales.push(nuevaDireccionData);
        console.log('📍 Nueva dirección con coordenadas agregada:', nuevaDireccionData);
      }
      
      // Actualizar el documento del cliente
      await updateDoc(clienteRef, {
        direcciones: direccionesActuales
      });
      
      console.log('✅ Coordenadas actualizadas exitosamente para el cliente:', telefono);
      return true;
      
    } catch (error) {
      console.error('💥 Error al actualizar coordenadas del cliente:', error);
      return false;
    }
  };

  const limpiarFormulario = () => {
    setTelefono('');
    setNombre('');
    setCoordenadas('');
    setDireccion('');
    setTiempo('');
    setUnidad('');
    setUsuarioEncontrado(null);
    setBuscandoUsuario(false);
    setMostrarModal(false);
    setNuevoCliente({ nombre: '', direccion: '', coordenadas: '', email: '' });
    setMapaVisible(false); // Oculta el mapa
    // Limpiar direcciones guardadas
    setDireccionesGuardadas([]);
    setDireccionSeleccionada(null);
    // Limpiar estados de edición
    setEditandoDireccion(null);
    setTextoEditado('');
  };

     // Función para insertar pedido disponible
   const handleInsertarViajePendiente = async () => {
     try {

       const fecha = new Date(); // Timestamp
       const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
       
       // Coordenadas por defecto si no hay coordenadas
       const coordenadasPorDefecto = '-0.2298500,-78.5249500'; // Quito centro
       const coordenadasFinales = coordenadas || coordenadasPorDefecto;
       const [latitud, longitud] = coordenadasFinales.split(',').map(s => s.trim());
       
       // Determinar el teléfono completo para WhatsApp
       let telefonoCompleto = telefono || '';
       if (telefono && telefono.length >= 9 && telefono.length <= 10) {
         // Para celulares, buscar el cliente y obtener su prefijo
         try {
           // Intentar primero con telefonoCompleto (Ecuador por defecto)
           const telefonoCompletoBusqueda = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
           let clienteRef = doc(db, 'clientestelefonos', telefonoCompletoBusqueda);
           let clienteSnapshot = await getDoc(clienteRef);
           
           if (clienteSnapshot.exists()) {
             const clienteData = clienteSnapshot.data();
             telefonoCompleto = concatenarTelefonoWhatsApp(telefono, clienteData.prefijo || 'Ecuador');
             console.log('📱 Teléfono completo para WhatsApp:', telefonoCompleto);
           } else {
             // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
             const telefonoBusqueda = telefono.slice(-9);
             clienteRef = doc(db, 'clientestelefonos', telefonoBusqueda);
             clienteSnapshot = await getDoc(clienteRef);
             
             if (clienteSnapshot.exists()) {
               const clienteData = clienteSnapshot.data();
               telefonoCompleto = concatenarTelefonoWhatsApp(telefono, clienteData.prefijo || 'Ecuador');
               console.log('📱 Teléfono completo para WhatsApp (fallback):', telefonoCompleto);
             }
           }
         } catch (error) {
           console.log('⚠️ No se pudo obtener el prefijo del cliente, usando teléfono original');
         }
       }
       
       const pedidoData = {
         // Estructura basada en tu colección pedidosDisponibles
         clave: clave,
         codigo: nombre || '',
         nombreCliente: nombre || '',
         telefono: telefonoCompleto || telefono || '', // Usar telefonoCompleto si está disponible
         telefonoCompleto: telefonoCompleto, // Teléfono completo para WhatsApp
         direccion: direccion || '',
         destino: '', // Se puede editar después
         fecha: fecha,
         estado: 'Disponible',
         idConductor: 'Sin asignar',
         latitud: latitud,
         longitud: longitud,
         latitudDestino: '',
         longitudDestino: '',
         sector: '', // Se puede editar después
         tipoPedido: 'ok',
         valor: 'Central',
         central: true,
         coorporativo: false,
         llegue: false,
         pedido: 'Disponible',
         puerto: '3020',
         randon: clave,
         rango: coordenadas ? '2' : '0', // Rango 0 si no hay coordenadas
         viajes: '',
         foto: '0',
         tarifaSeleccionada: true
       };

       // Guardar en la colección "pedidosDisponibles"
       const docRef = await addDoc(collection(db, 'pedidosDisponibles'), pedidoData);
       
       // Actualizar el documento con su propio ID
       await updateDoc(docRef, { id: docRef.id });
       
       // Guardar en historial del cliente si hay dirección
       if (telefono && direccion) {
         await guardarEnHistorialCliente(telefono, direccion, coordenadas, 'manual');
       }
       
       // Los listeners en tiempo real actualizarán automáticamente las tablas
       
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar el formulario
       limpiarFormulario();
       
       setModal({ 
         open: true, 
         success: true, 
         message: '¡Pedido registrado exitosamente!\nPuedes editarlo desde la tabla de pedidos disponibles.' 
       });
     } catch (error) {
       console.error('Error al registrar el pedido:', error);
       setModal({ open: true, success: false, message: 'Error al registrar el pedido.' });
     }
   };

   // Función para insertar viaje en modo manual
   // Incluye el token del conductor para notificaciones push cuando se asigna manualmente
   const handleInsertarViaje = async () => {
     // Validaciones
     if (!tiempo.trim()) {
       setModal({ open: true, success: false, message: 'Por favor, ingrese el tiempo del viaje.' });
       return;
     }
     if (!unidad.trim()) {
       setModal({ open: true, success: false, message: 'Por favor, ingrese el número de unidad.' });
       return;
     }

    try {
      // Buscar datos del conductor por número de unidad
      const conductoresQuery = query(
        collection(db, 'conductores'),
        where("unidad", "==", unidad.trim())
      );
      
      const conductoresSnapshot = await getDocs(conductoresQuery);
      
      if (conductoresSnapshot.empty) {
        setModal({ open: true, success: false, message: `No se encontró un conductor con la unidad ${unidad}` });
        return;
      }

      // Obtener datos del conductor
      const conductorData = conductoresSnapshot.docs[0].data();
      
       // Generar ID único para asignación manual
       const idConductorManual = `conductor_${Date.now()}_${Math.random().toString(36).substring(2, 8)}@manual.com`;
       
       // Obtener el token del conductor (si existe)
       const tokenConductor = conductorData.token || conductorData.fcmToken || conductorData.deviceToken || '';
       const tokenValido = validarTokenConductor(tokenConductor);
       
       // Coordenadas por defecto si no hay coordenadas
       const coordenadasPorDefecto = '-0.2298500,-78.5249500'; // Quito centro
       const coordenadasFinales = coordenadas || coordenadasPorDefecto;
       const [latitud, longitud] = coordenadasFinales.split(',').map(s => s.trim());
       
       const fecha = new Date(); // Timestamp
       const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
       
       // Determinar el teléfono completo para WhatsApp
       let telefonoCompleto = telefono || '';
       if (telefono && telefono.length >= 9 && telefono.length <= 10) {
         // Para celulares, buscar el cliente y obtener su prefijo
         try {
           // Intentar primero con telefonoCompleto (Ecuador por defecto)
           const telefonoCompletoBusqueda = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
           let clienteRef = doc(db, 'clientestelefonos', telefonoCompletoBusqueda);
           let clienteSnapshot = await getDoc(clienteRef);
           
           if (clienteSnapshot.exists()) {
             const clienteData = clienteSnapshot.data();
             telefonoCompleto = concatenarTelefonoWhatsApp(telefono, clienteData.prefijo || 'Ecuador');
             console.log('📱 Teléfono completo para WhatsApp:', telefonoCompleto);
           } else {
             // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
             const telefonoBusqueda = telefono.slice(-9);
             clienteRef = doc(db, 'clientestelefonos', telefonoBusqueda);
             clienteSnapshot = await getDoc(clienteRef);
             
             if (clienteSnapshot.exists()) {
               const clienteData = clienteSnapshot.data();
               telefonoCompleto = concatenarTelefonoWhatsApp(telefono, clienteData.prefijo || 'Ecuador');
               console.log('📱 Teléfono completo para WhatsApp (fallback):', telefonoCompleto);
             }
           }
         } catch (error) {
           console.log('⚠️ No se pudo obtener el prefijo del cliente, usando teléfono original');
         }
       }
       
       const pedidoEnCursoData = {
         // Estructura para pedidoEnCurso
         clave: clave,
         codigo: nombre || '',
         nombreCliente: nombre || '',
         telefono: telefonoCompleto || telefono || '', // Usar telefonoCompleto si está disponible
         telefonoCompleto: telefonoCompleto, // Teléfono completo para WhatsApp
         direccion: direccion || '',
         destino: 'QUITO-ECUADOR', // Destino por defecto
         fecha: fecha,
         estado: 'Aceptado',
         pedido: 'Aceptado',
         // Datos del conductor - ID único para asignación manual
         idConductor: idConductorManual, // ID único generado
         correo: conductorData.correo || conductorData.id || '', // Correo real del conductor
         nombre: conductorData.nombre || '',
         nombreConductor: conductorData.nombre || '',
         placa: conductorData.placa || '',
         color: conductorData.color || '',
         telefonoConductor: conductorData.telefono || '',
         foto: conductorData.foto || '',
         tokenConductor: conductorData.token || '', // Token del conductor para notificaciones push (FCM)
         // Datos de asignación
         tiempo: tiempo,
         numeroUnidad: unidad,
         unidad: unidad,
         minutos: parseInt(tiempo) || 0,
         distancia: '0.00 Mts',
         latitudConductor: '',
         longitudConductor: '',
         // Datos adicionales
         latitud: latitud,
         longitud: longitud,
         latitudDestino: '',
         longitudDestino: '',
         sector: direccion || '',
         tipoPedido: 'ok',
         valor: '',
         central: false,
         coorporativo: false,
         llegue: false,
         puerto: '3020',
         randon: clave,
         rango: coordenadas ? '1' : '0', // Rango 0 si no hay coordenadas
         viajes: unidad || '',
         tarifaSeleccionada: true,
         modoSeleccion: 'manual',
         modoAsignacion: 'manual' // Campo adicional para indicar asignación manual
       };

       // Guardar directamente en la colección "pedidoEnCurso"
       const docRef = await addDoc(collection(db, 'pedidoEnCurso'), pedidoEnCursoData);
       
       // Actualizar el documento con su propio ID
       await updateDoc(docRef, { id: docRef.id });
       
       // Crear duplicado en la colección "NotificaciOnenCurso" para sistema de notificaciones
       const notificacionEnCursoData = {
         ...pedidoEnCursoData,
         id: docRef.id, // Mantener el mismo ID del documento original para referencia
         fechaNotificacion: new Date(), // Fecha específica para la notificación
         estadoNotificacion: 'pendiente' // Estado de la notificación (pendiente, enviada, fallida)
       };
       
       await addDoc(collection(db, 'NotificaciOnenCurso'), notificacionEnCursoData);
       
       // Guardar en historial del cliente si hay dirección
       if (telefono && direccion) {
         await guardarEnHistorialCliente(telefono, direccion, coordenadas, 'manual');
       }
       
       // Los listeners en tiempo real actualizarán automáticamente las tablas
       
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar el formulario
       limpiarFormulario();
       
       setModal({ 
         open: true, 
         success: true, 
         message: `¡Pedido registrado directamente en "En Curso"!\nConductor: ${conductorData.nombre}\nUnidad: ${unidad}\nPlaca: ${conductorData.placa}\nTiempo: ${tiempo} min${tokenValido ? '\n✅ Token de notificaciones configurado' : '\n⚠️ Token de notificaciones no configurado'}\n📋 Duplicado creado en "NotificaciOnenCurso"`
       });
    } catch (error) {
      console.error('Error al registrar el viaje:', error);
      setModal({ open: true, success: false, message: 'Error al registrar el pedido en curso.' });
         }
   };

   // Función para iniciar edición de un viaje
   const iniciarEdicionViaje = (viaje) => {
     setEditandoViaje(viaje.id);
     setTiempoEdit(viaje.tiempo || '');
     setUnidadEdit(viaje.numeroUnidad || '');
   };

   // Función para cancelar edición
   const cancelarEdicionViaje = () => {
     setEditandoViaje(null);
     setTiempoEdit('');
     setUnidadEdit('');
   };

   // Función para mover pedido de disponibles a en curso
   // Incluye el token del conductor para notificaciones push cuando se asigna manualmente
   const guardarEdicionViaje = async (viajeId) => {
     if (!tiempoEdit.trim() || !unidadEdit.trim()) {
       setModal({ open: true, success: false, message: 'Por favor, ingrese tiempo y número de unidad.' });
       return;
     }

     try {
       // Buscar datos del conductor por número de unidad
       const conductoresQuery = query(
         collection(db, 'conductores'),
         where("unidad", "==", unidadEdit.trim())
       );
       
       const conductoresSnapshot = await getDocs(conductoresQuery);
       
       if (conductoresSnapshot.empty) {
         setModal({ open: true, success: false, message: `No se encontró un conductor con la unidad ${unidadEdit}` });
         return;
       }

       // Obtener datos del conductor
       const conductorData = conductoresSnapshot.docs[0].data();

       // Generar ID único para asignación manual
       const idConductorManual = `conductor_${Date.now()}_${Math.random().toString(36).substring(2, 8)}@manual.com`;
       
              // Obtener el token del conductor (si existe)
       const tokenConductor = conductorData.token || conductorData.fcmToken || conductorData.deviceToken || '';
       const tokenValido = validarTokenConductor(tokenConductor);
 
       // 1. Obtener el pedido actual de pedidosDisponibles
       const pedidoOriginalRef = doc(db, 'pedidosDisponibles', viajeId);
       const pedidoOriginalSnap = await getDoc(pedidoOriginalRef);
       
       if (!pedidoOriginalSnap.exists()) {
         setModal({ open: true, success: false, message: 'Pedido no encontrado.' });
         return;
       }

       const pedidoOriginal = pedidoOriginalSnap.data();

       // 2. Crear el pedido en curso con todos los datos del conductor
       const pedidoEnCursoData = {
         ...pedidoOriginal,
         // Datos de asignación
         tiempo: tiempoEdit,
         numeroUnidad: unidadEdit,
         unidad: unidadEdit,
         estado: 'Aceptado',
         pedido: 'Aceptado',
         // Fecha como timestamp
         fecha: new Date(),
         // Datos del conductor - ID único para asignación manual
         idConductor: idConductorManual, // ID único generado
         correo: conductorData.correo || conductorData.id || '', // Correo real del conductor
         nombre: conductorData.nombre || '',
           nombreConductor: conductorData.nombre || '',
           placa: conductorData.placa || '',
         color: conductorData.color || '',
           telefonoConductor: conductorData.telefono || '',
         foto: conductorData.foto || '',
         tokenConductor: conductorData.fcmToken || conductorData.token || conductorData.notificationToken || '', // Token del conductor para notificaciones
         minutos: parseInt(tiempoEdit) || 0,
         distancia: '0.00 Mts', // Valor inicial
         latitudConductor: '',
         longitudConductor: '',
         tarifaSeleccionada: true,
         modoAsignacion: 'manual' // Campo adicional para indicar asignación manual
       };

       // 3. Agregar a pedidoEnCurso
       const docRef = await addDoc(collection(db, 'pedidoEnCurso'), pedidoEnCursoData);
       
       // Actualizar el documento con su propio ID
       await updateDoc(docRef, { id: docRef.id });

       // 4. Crear duplicado en la colección "NotificaciOnenCurso" para sistema de notificaciones
       const notificacionEnCursoData = {
         ...pedidoEnCursoData,
         id: docRef.id, // Mantener el mismo ID del documento original para referencia
         fechaNotificacion: new Date(), // Fecha específica para la notificación
         estadoNotificacion: 'pendiente' // Estado de la notificación (pendiente, enviada, fallida)
       };
       
       await addDoc(collection(db, 'NotificaciOnenCurso'), notificacionEnCursoData);

       // 5. Eliminar de pedidosDisponibles
       await deleteDoc(pedidoOriginalRef);

       // Guardar en historial del cliente si hay dirección
       if (pedidoOriginal.telefono && pedidoOriginal.direccion) {
         await guardarEnHistorialCliente(
           pedidoOriginal.telefono, 
           pedidoOriginal.direccion, 
           `${pedidoOriginal.latitud || ''},${pedidoOriginal.longitud || ''}`, 
           'manual'
         );
       }

       // Cancelar edición - los listeners en tiempo real actualizarán automáticamente las tablas
       cancelarEdicionViaje();
       
       setModal({ 
         open: true, 
         success: true, 
         message: `¡Pedido movido a "En Curso" exitosamente!\nConductor: ${conductorData.nombre}\nUnidad: ${unidadEdit}\nPlaca: ${conductorData.placa}${tokenValido ? '\n✅ Token de notificaciones configurado' : '\n⚠️ Token de notificaciones no configurado'}\n📋 Duplicado creado en "NotificaciOnenCurso"` 
       });
     } catch (error) {
       console.error('Error al mover el pedido:', error);
       setModal({ open: true, success: false, message: 'Error al mover el pedido a "En Curso".' });
     }
   };

 

  const handleSolicitarAplicacion = async () => {
    try {

      // Coordenadas por defecto si no hay coordenadas
      const coordenadasPorDefecto = '-0.2298500,-78.5249500'; // Quito centro
      const coordenadasFinales = coordenadas || coordenadasPorDefecto;
      const [latitud, longitud] = coordenadasFinales.split(',').map(s => s.trim());
      const fecha = new Date(); // Timestamp
      const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Determinar el teléfono completo para WhatsApp
      let telefonoCompleto = telefono || '';
      if (telefono && telefono.length >= 9 && telefono.length <= 10) {
        // Para celulares, buscar el cliente y obtener su prefijo
        try {
          // Intentar primero con telefonoCompleto (Ecuador por defecto)
          const telefonoCompletoBusqueda = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
          let clienteRef = doc(db, 'clientestelefonos', telefonoCompletoBusqueda);
          let clienteSnapshot = await getDoc(clienteRef);
          
          if (clienteSnapshot.exists()) {
            const clienteData = clienteSnapshot.data();
            telefonoCompleto = concatenarTelefonoWhatsApp(telefono, clienteData.prefijo || 'Ecuador');
            console.log('📱 Teléfono completo para WhatsApp:', telefonoCompleto);
          } else {
            // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
            const telefonoBusqueda = telefono.slice(-9);
            clienteRef = doc(db, 'clientestelefonos', telefonoBusqueda);
            clienteSnapshot = await getDoc(clienteRef);
            
            if (clienteSnapshot.exists()) {
              const clienteData = clienteSnapshot.data();
              telefonoCompleto = concatenarTelefonoWhatsApp(telefono, clienteData.prefijo || 'Ecuador');
              console.log('📱 Teléfono completo para WhatsApp (fallback):', telefonoCompleto);
            }
          }
        } catch (error) {
          console.log('⚠️ No se pudo obtener el prefijo del cliente, usando teléfono original');
        }
      }
      
      // Datos para inserción directa en pedidosDisponibles
      const pedidoData = {
        // Datos básicos del pedido
        clave: clave,
        codigo: nombre || '',
        nombreCliente: nombre || '',
        telefono: telefonoCompleto || telefono || '', // Usar telefonoCompleto si está disponible
        telefonoCompleto: telefonoCompleto, // Teléfono completo para WhatsApp
        direccion: direccion || '',
        destino: 'QUITO-ECUADOR',
        fecha: fecha, // Timestamp
        estado: 'Disponible',
        pedido: 'Disponible',
        idConductor: 'Sin asignar',
        
        // Coordenadas
        latitud: latitud || '',
        longitud: longitud || '',
        latitudDestino: '',
        longitudDestino: '',
        
        // Datos adicionales
        sector: direccion || '',
        tipoPedido: 'ok',
        valor: '',
        central: false,
        coorporativo: false,
        llegue: false,
        puerto: '3020',
        randon: clave,
        rango: coordenadas ? '1' : '0', // Rango 0 si no hay coordenadas
        viajes: unidad || '',
        foto: '0',
        tarifaSeleccionada: true,
        
        // Identificación del modo
        modoSeleccion: 'aplicacion'
      };

      // Inserción directa en la colección "pedidosDisponibles"
      const docRef = await addDoc(collection(db, 'pedidosDisponibles'), pedidoData);
      
      // Actualizar el documento con su propio ID
      await updateDoc(docRef, { id: docRef.id });
      
      // Guardar en historial del cliente si hay dirección
      if (telefono && direccion) {
        await guardarEnHistorialCliente(telefono, direccion, coordenadas, 'aplicacion');
      }
      
      // Los listeners en tiempo real actualizarán automáticamente las tablas
      
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar el formulario
       limpiarFormulario();

     /// setModal({ open: true, success: true, message: '¡Pedido registrado directamente en la base de datos!' });
    } catch (error) {
      console.error('Error al registrar el pedido:', error);
      setModal({ open: true, success: false, message: 'Error al registrar el pedido en la base de datos.' });
    }
  };

  // Callbacks memoizados para evitar re-renders innecesarios
  const handleCoordinatesSelect = useCallback(async (nuevasCoordenadas) => {
    setCoordenadas(nuevasCoordenadas);
    
    // Ocultar el mapa automáticamente
    setMapaVisible(false);
    
    // NOTA: Se eliminó la funcionalidad de guardado automático de coordenadas
    // Las coordenadas solo se guardarán cuando se envíe un pedido real
  }, [setMapaVisible]);

  const handleAddressSelect = useCallback((nuevaDireccion) => {
    setDireccion(nuevaDireccion);
  }, []);

  // Función para guardar coordenadas y direcciones en el historial del cliente
  const guardarEnHistorialCliente = async (telefono, direccion, coordenadas, modoRegistro = 'manual') => {
    try {
      if (!telefono || !direccion) {
        console.log('⚠️ No se pueden guardar coordenadas sin teléfono o dirección');
        return false;
      }

      console.log('📍 Guardando en historial del cliente:', { telefono, direccion, coordenadas, modoRegistro });

      // Determinar la colección según la longitud del teléfono
      let coleccionNombre = '';
      if (telefono.length === 7) {
        coleccionNombre = 'clientes';
      } else if (telefono.length >= 9 && telefono.length <= 10) {
        coleccionNombre = 'clientestelefonos';
      } else {
        console.log('❌ Tipo de teléfono no válido para guardar historial');
        return false;
      }

      // Buscar el cliente en la colección correspondiente
      let telefonoId = telefono;
      let clienteRef;
      let clienteSnapshot;

      if (telefono.length >= 9 && telefono.length <= 10) {
        // Para celulares, intentar primero con telefonoCompleto (Ecuador por defecto)
        const telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
        console.log('📱 Intentando buscar cliente con telefonoCompleto:', telefonoCompleto);

        clienteRef = doc(db, coleccionNombre, telefonoCompleto);
        clienteSnapshot = await getDoc(clienteRef);

        if (clienteSnapshot.exists()) {
          telefonoId = telefonoCompleto;
          console.log('✅ Cliente encontrado con telefonoCompleto como ID');
        } else {
          // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
          telefonoId = telefono.slice(-9);
          console.log('📱 Intentando con últimos 9 dígitos como fallback:', telefonoId);
          clienteRef = doc(db, coleccionNombre, telefonoId);
          clienteSnapshot = await getDoc(clienteRef);
        }
      } else {
        // Para teléfonos de 7 dígitos, usar el teléfono original
        clienteRef = doc(db, coleccionNombre, telefonoId);
        clienteSnapshot = await getDoc(clienteRef);
      }

      if (!clienteSnapshot.exists()) {
        console.log('❌ Cliente no encontrado para guardar historial');
        return false;
      }

      const clienteData = clienteSnapshot.data();
      const direccionesActuales = clienteData.direcciones || [];

      // Normalizar la dirección y coordenadas para comparación
      const direccionNormalizada = direccion.toLowerCase().trim();
      const coordenadasNormalizadas = coordenadas ? coordenadas.trim() : '';

      // Verificar si ya existe esta dirección exacta O estas coordenadas exactas
      const direccionExistente = direccionesActuales.find(dir => {
        const dirNormalizada = dir.direccion.toLowerCase().trim();
        const coordNormalizadas = dir.coordenadas ? dir.coordenadas.trim() : '';
        
        // Si la dirección es exactamente igual
        if (dirNormalizada === direccionNormalizada) {
          return true;
        }
        
        // Si las coordenadas son exactamente iguales (y no están vacías)
        if (coordenadasNormalizadas && coordNormalizadas && coordenadasNormalizadas === coordNormalizadas) {
          return true;
        }
        
        return false;
      });

      if (direccionExistente) {
        // Si encontramos una dirección existente, actualizar información si es necesario
        let actualizado = false;
        
        // Si la dirección es igual pero las coordenadas son diferentes, actualizar coordenadas
        if (direccionExistente.direccion.toLowerCase().trim() === direccionNormalizada && 
            direccionExistente.coordenadas !== coordenadasNormalizadas) {
          direccionExistente.coordenadas = coordenadasNormalizadas;
          direccionExistente.fechaActualizacion = new Date();
          actualizado = true;
          console.log('📍 Coordenadas actualizadas en dirección existente:', direccionExistente);
        }
        
        // Si las coordenadas son iguales pero la dirección es diferente, actualizar dirección
        else if (direccionExistente.coordenadas === coordenadasNormalizadas && 
                 direccionExistente.direccion.toLowerCase().trim() !== direccionNormalizada) {
          direccionExistente.direccion = direccion;
          direccionExistente.fechaActualizacion = new Date();
          actualizado = true;
          console.log('📍 Dirección actualizada en coordenadas existentes:', direccionExistente);
        }
        
        // Si tanto dirección como coordenadas son iguales, no hacer nada
        else {
          console.log('📍 Dirección y coordenadas ya existen exactamente iguales');
        }
        
        // Solo actualizar en Firestore si hubo cambios
        if (actualizado) {
          await updateDoc(clienteRef, {
            direcciones: direccionesActuales
          });
          console.log('✅ Historial actualizado exitosamente para el cliente:', telefono);
        }
        
        return true;
      } else {
        // Agregar nueva dirección al historial solo si es realmente diferente
        const nuevaDireccionData = {
            direccion: direccion,
          coordenadas: coordenadasNormalizadas,
          fechaRegistro: new Date(),
          activa: true,
          modoRegistro: modoRegistro
        };

        direccionesActuales.push(nuevaDireccionData);
        console.log('📍 Nueva dirección agregada al historial:', nuevaDireccionData);

        // Actualizar el documento del cliente
        await updateDoc(clienteRef, {
          direcciones: direccionesActuales
        });

        console.log('✅ Historial actualizado exitosamente para el cliente:', telefono);
        return true;
      }

      } catch (error) {
      console.error('💥 Error al guardar en historial del cliente:', error);
      return false;
    }
  };

  // Función para mostrar direcciones guardadas del cliente
  const mostrarDireccionesGuardadas = async (telefono) => {
    try {
      if (!telefono) return;

      console.log('🔍 Buscando direcciones guardadas para:', telefono);

      // Determinar la colección según la longitud del teléfono
      let coleccionNombre = '';
      if (telefono.length === 7) {
        coleccionNombre = 'clientes';
      } else if (telefono.length >= 9 && telefono.length <= 10) {
        coleccionNombre = 'clientestelefonos';
      } else {
        return;
      }

      // Buscar el cliente
      let telefonoId = telefono;
      let clienteRef;
      let clienteSnapshot;

      if (telefono.length >= 9 && telefono.length <= 10) {
        const telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
        clienteRef = doc(db, coleccionNombre, telefonoCompleto);
        clienteSnapshot = await getDoc(clienteRef);

        if (clienteSnapshot.exists()) {
          telefonoId = telefonoCompleto;
        } else {
          telefonoId = telefono.slice(-9);
          clienteRef = doc(db, coleccionNombre, telefonoId);
          clienteSnapshot = await getDoc(clienteRef);
        }
      } else {
        clienteRef = doc(db, coleccionNombre, telefonoId);
        clienteSnapshot = await getDoc(clienteRef);
      }

      if (clienteSnapshot.exists()) {
        const clienteData = clienteSnapshot.data();
        const direcciones = clienteData.direcciones || [];

        if (direcciones.length > 0) {
          console.log('📍 Direcciones encontradas:', direcciones.length);
          
          // Mostrar modal con direcciones guardadas
          setModal({
            open: true,
            success: true,
            message: `Direcciones guardadas (${direcciones.length}):\n\n${direcciones.map((dir, index) => 
              `${index + 1}. ${dir.direccion}${dir.coordenadas ? ` (${dir.coordenadas})` : ''}`
            ).join('\n')}`
          });
        } else {
          console.log('⚠️ No hay direcciones guardadas para este cliente');
        }
      }
    } catch (error) {
      console.error('Error al buscar direcciones guardadas:', error);
    }
  };


     return (
     <div style={{
       background: '#f3f4f6',
       padding: 20,
       borderRadius: 8,
       border: '1px solid #d1d5db',
       width: '50%',
       minWidth: 800,
       fontFamily: 'Arial, sans-serif',
       boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
     }}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 15, marginBottom: 15 }}>
          <input
            type="text"
            placeholder="Ingrese Teléfono"
            value={telefono}
            onChange={handleTelefonoChange}
            onKeyDown={handleTelefonoKeyDown}
            style={{
              padding: '12px 16px',
              border: `2px solid ${
                buscandoUsuario ? '#f59e0b' : 
                usuarioEncontrado ? '#10b981' : 
                telefono.length >= 7 && !usuarioEncontrado ? '#ef4444' : '#666'
              }`,
              borderRadius: 4,
              fontSize: 18,
              fontWeight: 'bold',
              width: 180,
              backgroundColor: buscandoUsuario ? '#fef3c7' : 
                            usuarioEncontrado ? '#d1fae5' :
                            telefono.length >= 7 && !usuarioEncontrado ? '#fee2e2' : 'white'
            }}
          />
          <select 
            value={modoSeleccion}
            onChange={(e) => setModoSeleccion(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '2px solid #666',
              borderRadius: 4,
              fontSize: 18,
              fontWeight: 'bold',
              minWidth: 180
            }}
          >
            <option value="">Selecciona</option>
            <option value="manual">Selección Manual</option>
            <option value="aplicacion">Modo Aplicación</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 15, marginBottom: 15 }}>
          <input
            type="text"
            placeholder="Ingrese nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '2px solid #666',
              borderRadius: 4,
              fontSize: 18,
              fontWeight: 'bold',
              flex: 1
            }}
          />
          {modoSeleccion === 'aplicacion' && (
            <input
              type="text"
              placeholder="Ingrese coordenadas"
              value={coordenadas}
              onChange={(e) => setCoordenadas(e.target.value)}
              style={{
                padding: '12px 16px',
                border: '2px solid #666',
                borderRadius: 4,
                fontSize: 18,
                fontWeight: 'bold',
                flex: 1
              }}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: 15, marginBottom: 15 }}>
          <input
            type="text"
            placeholder="Ingrese dirección"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Enter') {
                e.preventDefault();
                handleInsertarViajePendiente();
              }
            }}
            style={{
              padding: '12px 16px',
              border: '2px solid #666',
              borderRadius: 4,
              fontSize: 18,
              fontWeight: 'bold',
              flex: modoSeleccion === 'aplicacion' ? '0 0 80%' : 1
            }}
          />
          
          {modoSeleccion === 'aplicacion' && (
            <button
              type="button"
              onClick={handleSolicitarAplicacion}
              disabled={!coordenadas.trim()}
              style={{
                padding: '12px 16px',
                background: !coordenadas.trim() ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 18,
                fontWeight: 'bold',
                cursor: !coordenadas.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s ease',
                flex: '0 0 20%',
                opacity: !coordenadas.trim() ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (coordenadas.trim()) {
                  e.target.style.background = '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (coordenadas.trim()) {
                  e.target.style.background = '#3b82f6';
                }
              }}
              title={!coordenadas.trim() ? 'Debe ingresar coordenadas para solicitar por aplicación' : 'Solicitar servicio por aplicación'}
            >
              Solicitar App
            </button>
          )}
          
                     {modoSeleccion === 'manual' && (
             <>
               <input
                 type="text"
                 placeholder="Tiempo"
                 value={tiempo}
                 onChange={(e) => setTiempo(e.target.value)}
                 maxLength="3"
                 style={{
                   padding: '12px 16px',
                   border: '2px solid #666',
                   borderRadius: 4,
                   fontSize: 18,
                   fontWeight: 'bold',
                   width: 100
                 }}
               />
               <input
                  type="text"
                  placeholder="Unidad"
                  value={unidad}
                  onChange={(e) => setUnidad(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (tiempo.trim() && unidad.trim()) {
                        handleInsertarViaje();
                      } else {
                        handleInsertarViajePendiente();
                      }
                    }
                  }}
                  maxLength="3"
                  style={{
                    padding: '12px 16px',
                    border: '2px solid #666',
                    borderRadius: 4,
                    fontSize: 18,
                    fontWeight: 'bold',
                    width: 100
                  }}
                />
               <button
                 type="button"
                 onClick={handleInsertarViaje}
                 disabled={!tiempo.trim() || !unidad.trim()}
                 style={{
                   padding: '12px 16px',
                   background: (!tiempo.trim() || !unidad.trim()) ? '#9ca3af' : '#10b981',
                   color: 'white',
                   border: 'none',
                   borderRadius: 4,
                   fontSize: 18,
                   fontWeight: 'bold',
                   cursor: (!tiempo.trim() || !unidad.trim()) ? 'not-allowed' : 'pointer',
                   transition: 'background 0.2s ease',
                   minWidth: 120,
                   opacity: (!tiempo.trim() || !unidad.trim()) ? 0.6 : 1
                 }}
                 onMouseEnter={(e) => {
                   if (tiempo.trim() && unidad.trim()) {
                     e.target.style.background = '#059669';
                   }
                 }}
                 onMouseLeave={(e) => {
                   if (tiempo.trim() && unidad.trim()) {
                     e.target.style.background = '#10b981';
                   }
                 }}
                 title={(!tiempo.trim() || !unidad.trim()) ? 'Debe ingresar tiempo y número de unidad' : 'Insertar viaje asignado'}
               >
                 Asignar
               </button>
               <button
                 type="button"
                 onClick={handleInsertarViajePendiente}
                 style={{
                   padding: '12px 16px',
                   background: '#f59e0b',
                   color: 'white',
                   border: 'none',
                   borderRadius: 4,
                   fontSize: 18,
                   fontWeight: 'bold',
                   cursor: 'pointer',
                   transition: 'background 0.2s ease',
                   minWidth: 120
                 }}
                 onMouseEnter={(e) => {
                   e.target.style.background = '#d97706';
                 }}
                 onMouseLeave={(e) => {
                   e.target.style.background = '#f59e0b';
                 }}
                 title="Registrar viaje pendiente de asignación"
               >
                 Pendiente
               </button>
             </>
           )}
        </div>

        {/* Listado de direcciones guardadas - JUSTO DESPUÉS DEL INPUT DE DIRECCIÓN */}
        {direccionesGuardadas.length > 0 && (
          <div style={{ marginBottom: 15 }}>
            <div style={{ 
              fontSize: 16, 
              fontWeight: 'bold', 
              color: '#374151', 
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              📍 Direcciones guardadas ({direccionesGuardadas.length}):
            </div>
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 8,
              maxHeight: 200,
              overflowY: 'auto',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: 8,
              backgroundColor: '#f9fafb'
            }}>
              {direccionesGuardadas.map((dir, index) => (
                <div
                  key={index}
                  style={{
                    padding: '10px 12px',
                    border: direccionSeleccionada === dir ? '2px solid #3b82f6' : '1px solid #d1d5db',
                    borderRadius: 4,
                    backgroundColor: direccionSeleccionada === dir ? '#eff6ff' : 'white',
                    transition: 'all 0.2s ease',
                    fontSize: 14,
                    lineHeight: 1.4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div 
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => seleccionarDireccion(dir)}
                    onDoubleClick={() => iniciarEdicionDireccion(dir)}
                    onMouseEnter={(e) => {
                      if (direccionSeleccionada !== dir) {
                        e.target.parentElement.style.backgroundColor = '#f3f4f6';
                        e.target.parentElement.style.borderColor = '#9ca3af';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (direccionSeleccionada !== dir) {
                        e.target.parentElement.style.backgroundColor = 'white';
                        e.target.parentElement.style.borderColor = '#d1d5db';
                      }
                    }}
                  >
                    {editandoDireccion === dir ? (
                      <input
                        type="text"
                        value={textoEditado}
                        onChange={(e) => setTextoEditado(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            guardarEdicionDireccion();
                          } else if (e.key === 'Escape') {
                            cancelarEdicionDireccion();
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '4px 8px',
                          border: '1px solid #3b82f6',
                          borderRadius: 3,
                          fontSize: 14,
                          fontWeight: 'bold'
                        }}
                        autoFocus
                      />
                    ) : (
                      <div style={{ fontWeight: 'bold', color: '#1f2937', marginBottom: 4 }}>
                        {dir.direccion}
                      </div>
                    )}
                    {dir.coordenadas && (
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        📍 {dir.coordenadas}
                      </div>
                    )}
                  </div>
                  
                  {/* Botones de acción dentro de la tarjeta */}
                  <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                    {editandoDireccion === dir ? (
                      <>
                        {/* Botón Guardar */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            guardarEdicionDireccion();
                          }}
                          style={{
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: 3,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            opacity: 0.9,
                            transition: 'opacity 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = 1}
                          onMouseLeave={(e) => e.target.style.opacity = 0.9}
                          title="Guardar cambios"
                        >
                          ✅
                        </button>
                        {/* Botón Cancelar */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelarEdicionDireccion();
                          }}
                          style={{
                            background: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: 3,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            opacity: 0.9,
                            transition: 'opacity 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = 1}
                          onMouseLeave={(e) => e.target.style.opacity = 0.9}
                          title="Cancelar edición"
                        >
                          ❌
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Botón Editar */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            iniciarEdicionDireccion(dir);
                          }}
                          style={{
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: 3,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            opacity: 0.8,
                            transition: 'opacity 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = 1}
                          onMouseLeave={(e) => e.target.style.opacity = 0.8}
                          title="Editar dirección"
                        >
                          ✏️
                        </button>
                        {/* Botón Eliminar */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            eliminarDireccion(dir);
                          }}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: 3,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            opacity: 0.8,
                            transition: 'opacity 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = 1}
                          onMouseLeave={(e) => e.target.style.opacity = 0.8}
                          title="Eliminar dirección"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Google Maps con búsqueda de direcciones - solo en modo aplicación */}
      {modoSeleccion === 'aplicacion' && (
        <MapaSelector 
          onCoordinatesSelect={handleCoordinatesSelect}
          onAddressSelect={handleAddressSelect}
          coordenadas={coordenadas}
          direccionFormulario={direccion}
        />
      )}

      {/* Modal de registro de cliente */}
      {mostrarModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: 20,
            borderRadius: 8,
            width: 400,
            maxWidth: '90%'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 15 }}>Registrar Nuevo Cliente</h3>
              <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Nombre:</label>
                <input
                  type="text"
                  value={nuevoCliente.nombre}
                onChange={(e) => setNuevoCliente({...nuevoCliente, nombre: e.target.value})}
                  style={{
                    width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: 4
                  }}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Dirección:</label>
                <input
                  type="text"
                  value={nuevoCliente.direccion}
                onChange={(e) => setNuevoCliente({...nuevoCliente, direccion: e.target.value})}
                  style={{
                    width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: 4
                  }}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Coordenadas:</label>
                <input
                  type="text"
                  value={nuevoCliente.coordenadas}
                onChange={(e) => setNuevoCliente({...nuevoCliente, coordenadas: e.target.value})}
                  style={{
                    width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: 4
                  }}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Email:</label>
                <input
                  type="email"
                  value={nuevoCliente.email}
                onChange={(e) => setNuevoCliente({...nuevoCliente, email: e.target.value})}
                  style={{
                    width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: 4
                  }}
                />
              </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMostrarModal(false)}
                style={{
                  padding: '8px 16px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={registrarCliente}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal moderno */}
      {modal.open && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
            padding: '40px 32px 32px 32px',
            minWidth: 340,
            maxWidth: '90vw',
            textAlign: 'center',
            position: 'relative',
            fontFamily: 'inherit'
          }}>
            <div style={{ fontSize: 54, marginBottom: 12 }}>
              {modal.success ? '✅' : '❌'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>
              {modal.success ? '¡Éxito!' : 'Error'}
            </div>
            <div style={{ fontSize: 18, color: '#444', marginBottom: 28 }}>
              {modal.message}
            </div>
            <button
              onClick={() => {
                setModal({ ...modal, open: false });
                limpiarFormulario();
              }}
              style={{
                background: modal.success ? '#10b981' : '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 20,
                fontWeight: 700,
                padding: '14px 48px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                transition: 'background 0.2s',
                outline: 'none',
              }}
              autoFocus
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

              {/* Tabla de Pedidos Disponibles */}
      <div style={{
        marginTop: 30,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            🚗 Pedidos Disponibles
            <span style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 'normal'
            }}>
              {viajesAsignados.length} disponibles
            </span>
          </h3>
          <button
            onClick={cargarViajesAsignados}
            disabled={cargandoViajes}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: cargandoViajes ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 'bold',
              opacity: cargandoViajes ? 0.7 : 1
            }}
          >
            {cargandoViajes ? '🔄 Cargando...' : '🔄 Actualizar'}
          </button>
        </div>

        {cargandoViajes ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
            <div>Cargando pedidos disponibles...</div>
          </div>
        ) : viajesAsignados.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
              No hay pedidos disponibles
            </div>
            <div style={{ fontSize: 14 }}>
              Los pedidos aparecerán aquí cuando se registren desde el formulario
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14
            }}>
                             <thead>
                 <tr style={{ background: '#f8fafc' }}>
                                       <th style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      whiteSpace: 'nowrap'
          
          
                    }}>
                      🕐 Hora
                    </th>
                   <th style={{
                     padding: '12px 16px',
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     📞 Teléfono
                   </th>
                   <th style={{
                     padding: '12px 16px',
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     👤 Cliente
                   </th>
                   <th style={{
                     padding: '12px 16px',
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     📍 Dirección
                   </th>
                   <th style={{
                     padding: '12px 16px',
                     textAlign: 'center',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     ⏱️ Tiempo
                   </th>
                   <th style={{
                     padding: '12px 16px',
                     textAlign: 'center',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     🚕 Unidad
                   </th>
                   <th style={{
                     padding: '12px 16px',
                     textAlign: 'center',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     🏷️ Tipo
                   </th>
                 </tr>
               </thead>
              <tbody>
                {viajesAsignados.map((viaje, index) => (
                  <tr
                    key={viaje.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: index % 2 === 0 ? '#fff' : '#fafbff',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f0f9ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = index % 2 === 0 ? '#fff' : '#fafbff';
                                         }}
                   >
                                           <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: 12,
                        fontWeight: 'bold'
                      }}>
                        {viaje.fecha ? 
                          (() => {
                            let fechaObj;
                            if (viaje.fecha.toDate) {
                              // Es un Firestore Timestamp
                              fechaObj = viaje.fecha.toDate();
                            } else if (viaje.fecha.seconds) {
                              // Es un Firestore Timestamp como objeto
                              fechaObj = new Date(viaje.fecha.seconds * 1000);
                            } else {
                              // Es un objeto Date normal
                              fechaObj = new Date(viaje.fecha);
                            }
                            return fechaObj.toLocaleTimeString('es-EC', {
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          })()
                          : '-'}
                      </td>
                     <td style={{
                       padding: '12px 16px',
                       fontWeight: 'bold',
                       color: '#1f2937'
                     }}>
                       {viaje.telefono || '-'}
                     </td>
                     <td style={{
                       padding: '12px 16px',
                       color: '#374151'
                     }}>
                       {viaje.nombreCliente || viaje.codigo || '-'}
                     </td>
                     <td style={{
                       padding: '12px 16px',
                       color: '#374151',
                       maxWidth: 200,
                       overflow: 'hidden',
                       textOverflow: 'ellipsis',
                       whiteSpace: 'nowrap'
                     }}>
                       {viaje.direccion || '-'}
                     </td>
                                           <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: '#059669'
                      }}>
                        {!viaje.tiempo ? (
                        <input
                          type="text"
                          value={editandoViaje === viaje.id ? tiempoEdit : ''}
                          onChange={(e) => {
                            if (editandoViaje !== viaje.id) {
                              iniciarEdicionViaje(viaje);
                            }
                            setTiempoEdit(e.target.value);
                          }}
                          maxLength="3"
                          style={{
                            width: '60px',
                            padding: '4px 8px',
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            textAlign: 'center',
                            fontSize: 12,
                            fontWeight: 'bold'
                          }}
                          placeholder="Tiempo"
                        />
                      ) : (
                        `${viaje.tiempo} min`
                      )}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: '#dc2626',
                        fontSize: 16
                      }}>
                        {!viaje.numeroUnidad ? (
                          <input
                            type="text"
                            value={editandoViaje === viaje.id ? unidadEdit : ''}
                            onChange={(e) => {
                              if (editandoViaje !== viaje.id) {
                                iniciarEdicionViaje(viaje);
                              }
                              setUnidadEdit(e.target.value);
                            }}
                            maxLength="3"
                            style={{
                              width: '60px',
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: 4,
                              textAlign: 'center',
                              fontSize: 12,
                              fontWeight: 'bold'
                            }}
                            placeholder="Unidad"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (tiempoEdit.trim() && unidadEdit.trim()) {
                                  guardarEdicionViaje(viaje.id);
                                }
                              }
                            }}
                          />
                        ) : (
                          viaje.numeroUnidad
                        )}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'center'
                      }}>
                        <button
                          style={{
                            padding: '4px 12px',
                            borderRadius: 20,
                            border: 'none',
                            fontSize: 12,
                            fontWeight: 'bold',
                            cursor: 'default',
                            background: (viaje.tiempo && viaje.numeroUnidad) ? '#10b981' : '#f59e0b',
                            color: 'white'
                          }}
                        >
                          {(viaje.tiempo && viaje.numeroUnidad) ? 'Asignado' : 'Pendiente'}
                        </button>
                      </td>
                   </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>



              {/* Tabla de Pedidos en Curso */}
      <div style={{
        marginTop: 30,
        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        borderRadius: 12,
        padding: '20px 20px 0 20px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          color: 'white'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            🚗 Pedidos en Curso
            <span style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 'normal'
            }}>
              {pedidosEnCurso.length} activos
            </span>
          </h3>
          <button
            onClick={cargarPedidosEnCurso}
            disabled={cargandoPedidosCurso}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: cargandoPedidosCurso ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 'bold',
              opacity: cargandoPedidosCurso ? 0.7 : 1
            }}
          >
            {cargandoPedidosCurso ? '🔄 Cargando...' : '🔄 Actualizar'}
          </button>
        </div>

        {cargandoPedidosCurso ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
            <div>Cargando pedidos en curso...</div>
          </div>
        ) : pedidosEnCurso.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🚗</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
              No hay pedidos en curso
            </div>
            <div style={{ fontSize: 14 }}>
              Los pedidos aparecerán aquí cuando sean asignados desde la tabla de disponibles
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14
            }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    🕐 Hora
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    📞 Teléfono
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    👤 Cliente
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    📍 Dirección
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    ⏱️ Tiempo
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    🚕 Unidad
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    🏷️ Tipo
                  </th>
                </tr>
              </thead>
              <tbody>
                {pedidosEnCurso.map((pedido, index) => (
                  <tr
                    key={pedido.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: index % 2 === 0 ? '#fff' : '#fafbff',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#fef2f2';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = index % 2 === 0 ? '#fff' : '#fafbff';
                    }}
                  >
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      color: '#6b7280',
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}>
                      {pedido.fecha ? 
                        (() => {
                          let fechaObj;
                          if (pedido.fecha.toDate) {
                            // Es un Firestore Timestamp
                            fechaObj = pedido.fecha.toDate();
                          } else if (pedido.fecha.seconds) {
                            // Es un Firestore Timestamp como objeto
                            fechaObj = new Date(pedido.fecha.seconds * 1000);
                          } else {
                            // Es un objeto Date normal
                            fechaObj = new Date(pedido.fecha);
                          }
                          return fechaObj.toLocaleTimeString('es-EC', {
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                        })()
                        : '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      fontWeight: 'bold',
                      color: '#1f2937'
                    }}>
                      {pedido.telefono || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      color: '#374151'
                    }}>
                      {pedido.nombreCliente || pedido.codigo || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      color: '#374151',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {pedido.direccion || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#059669'
                    }}>
                      {pedido.tiempo || pedido.minutos ? `${pedido.tiempo || pedido.minutos} min` : '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#dc2626'
                    }}>
                      {pedido.unidad || pedido.numeroUnidad || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center'
                    }}>
                      <button
                        style={{
                          padding: '4px 12px',
                          borderRadius: 20,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 'bold',
                          cursor: 'default',
                          background: pedido.modoSeleccion === 'aplicacion' ? '#3b82f6' : '#059669',
                          color: 'white'
                        }}
                      >
                        {pedido.modoSeleccion === 'aplicacion' ? 'Aplicación' : 'Manual'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de registro de clientes */}
      {modalRegistroCliente.open && (
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
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: modalRegistroCliente.modoAplicacion ? '800px' : '500px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              margin: '0 0 20px 0',
              color: '#1f2937',
              fontSize: '24px',
              fontWeight: 'bold',
              textAlign: 'center'
            }}>
              📝 Registrar {modalRegistroCliente.tipoCliente}
              {modalRegistroCliente.modoAplicacion && ' (Modo Aplicación)'}
            </h2>
            
            <p style={{
              margin: '0 0 20px 0',
              color: '#6b7280',
              fontSize: '16px',
              textAlign: 'center'
            }}>
              El teléfono <strong>{telefono}</strong> no está registrado en la colección <strong>{modalRegistroCliente.coleccion}</strong>.
              <br />
              ¿Deseas registrarlo ahora?
            </p>

            {/* Formulario en la parte superior */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    color: '#374151'
                  }}>
                    Nombre del cliente:
                  </label>
                  <input
                    type="text"
                    placeholder="Ingrese el nombre completo *"
                    value={modalRegistroCliente.datosCliente.nombre}
                    onChange={(e) => setModalRegistroCliente(prev => ({
                      ...prev,
                      datosCliente: { ...prev.datosCliente, nombre: e.target.value }
                    }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: `2px solid ${modalRegistroCliente.datosCliente.nombre.trim() ? '#10b981' : '#ef4444'}`,
                      borderRadius: '8px',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    color: '#374151'
                  }}>
                    Sector:
                  </label>
                  <input
                    type="text"
                    placeholder="Ingrese el sector *"
                    value={modalRegistroCliente.datosCliente.sector}
                    onChange={(e) => setModalRegistroCliente(prev => ({
                      ...prev,
                      datosCliente: { ...prev.datosCliente, sector: e.target.value }
                    }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: `2px solid ${modalRegistroCliente.datosCliente.sector.trim() ? '#10b981' : '#ef4444'}`,
                      borderRadius: '8px',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    color: '#374151'
                  }}>
                    Prefijo País:
                  </label>
                  <select
                    value={modalRegistroCliente.datosCliente.prefijo}
                    onChange={(e) => setModalRegistroCliente(prev => ({
                      ...prev,
                      datosCliente: { ...prev.datosCliente, prefijo: e.target.value }
                    }))}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Ecuador">Ecuador</option>
                    <option value="Nicaragua">Nicaragua</option>
                    <option value="Colombia">Colombia</option>
                    <option value="Peru">Perú</option>
                    <option value="Chile">Chile</option>
                    <option value="Argentina">Argentina</option>
                    <option value="Mexico">México</option>
                    <option value="Espana">España</option>
                    <option value="Estados Unidos">Estados Unidos</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Campo de dirección para modo manual */}
            {!modalRegistroCliente.modoAplicacion && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ width: '100%' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    color: '#374151'
                  }}>
                    Dirección:
                  </label>
                  <input
                    type="text"
                    placeholder="Ingrese la dirección completa *"
                    value={modalRegistroCliente.datosCliente.direccion}
                    onChange={(e) => setModalRegistroCliente(prev => ({
                      ...prev,
                      datosCliente: { ...prev.datosCliente, direccion: e.target.value }
                    }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: `2px solid ${modalRegistroCliente.datosCliente.direccion.trim() ? '#10b981' : '#ef4444'}`,
                      borderRadius: '8px',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Campos de dirección y coordenadas para modo aplicación */}
            {modalRegistroCliente.modoAplicacion && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '2', minWidth: '300px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: 'bold',
                      color: '#374151'
                    }}>
                      Dirección (selecciona en el mapa):
                    </label>
                    <input
                      type="text"
                      placeholder="Busca una dirección o selecciona en el mapa *"
                      value={modalRegistroCliente.datosCliente.direccion}
                      onChange={(e) => setModalRegistroCliente(prev => ({
                        ...prev,
                        datosCliente: { ...prev.datosCliente, direccion: e.target.value }
                      }))}
                      required
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        border: `2px solid ${modalRegistroCliente.datosCliente.direccion.trim() ? '#10b981' : '#ef4444'}`,
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ flex: '1', minWidth: '200px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: 'bold',
                      color: '#374151'
                    }}>
                      Coordenadas:
                    </label>
                    <input
                      type="text"
                      placeholder="Se seleccionarán automáticamente *"
                      value={modalRegistroCliente.datosCliente.coordenadas}
                      readOnly
                      required
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        border: `2px solid ${modalRegistroCliente.datosCliente.coordenadas.trim() ? '#10b981' : '#ef4444'}`,
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxSizing: 'border-box',
                        backgroundColor: '#f3f4f6'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Mapa grande en la parte inferior (solo modo aplicación) */}
            {modalRegistroCliente.modoAplicacion && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  width: '100%',
                  height: '400px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  <MapaSelector 
                    onCoordinatesSelect={(coords) => {
                      setModalRegistroCliente(prev => ({
                        ...prev,
                        datosCliente: { ...prev.datosCliente, coordenadas: coords }
                      }));
                    }}
                    onAddressSelect={(address) => {
                      setModalRegistroCliente(prev => ({
                        ...prev,
                        datosCliente: { ...prev.datosCliente, direccion: address }
                      }));
                    }}
                    coordenadas={modalRegistroCliente.datosCliente.coordenadas}
                    direccionFormulario={modalRegistroCliente.datosCliente.direccion}
                  />
                </div>
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '15px',
              justifyContent: 'center',
              marginTop: '20px'
            }}>
              <button
                onClick={() => setModalRegistroCliente({ 
                  open: false, 
                  tipoCliente: '', 
                  coleccion: '', 
                  modoAplicacion: false,
                  datosCliente: { nombre: '', direccion: '', coordenadas: '', sector: '', prefijo: 'Ecuador' } 
                })}
                style={{
                  padding: '12px 24px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ❌ Cancelar
              </button>
              
              <button
                                  onClick={async () => {
                    // Validar campos obligatorios
                    if (!modalRegistroCliente.datosCliente.nombre.trim()) {
                      setModal({ 
                        open: true, 
                        success: false, 
                        message: 'Por favor, complete el nombre del cliente.' 
                      });
                      return;
                    }

                    if (!modalRegistroCliente.datosCliente.sector.trim()) {
                      setModal({ 
                        open: true, 
                        success: false, 
                        message: 'Por favor, complete el sector del cliente.' 
                      });
                      return;
                    }

                    if (modalRegistroCliente.modoAplicacion) {
                      if (!modalRegistroCliente.datosCliente.direccion.trim()) {
                        setModal({ 
                          open: true, 
                          success: false, 
                          message: 'En modo aplicación, debes seleccionar una dirección en el mapa.' 
                        });
                        return;
                      }
                      
                      if (!modalRegistroCliente.datosCliente.coordenadas.trim()) {
                        setModal({ 
                          open: true, 
                          success: false, 
                          message: 'En modo aplicación, debes seleccionar coordenadas en el mapa.' 
                        });
                        return;
                      }
                    } else {
                      if (!modalRegistroCliente.datosCliente.direccion.trim()) {
                        setModal({ 
                          open: true, 
                          success: false, 
                          message: 'Por favor, complete la dirección del cliente.' 
                        });
                        return;
                      }
                    }
                  
                  await registrarNuevoCliente(
                    modalRegistroCliente.datosCliente, 
                    modalRegistroCliente.tipoCliente,
                    modalRegistroCliente.modoAplicacion
                  );
                  setModalRegistroCliente({ 
                    open: false, 
                    tipoCliente: '', 
                    coleccion: '', 
                    modoAplicacion: false,
                    datosCliente: { nombre: '', direccion: '', coordenadas: '', sector: '', prefijo: 'Ecuador' } 
                  });
                }}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#059669',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ✅ Registrar {modalRegistroCliente.tipoCliente}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {modal.open && (
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
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '400px',
            maxWidth: '90vw',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '20px'
            }}>
              {modal.success ? '✅' : '❌'}
            </div>
            <h3 style={{
              margin: '0 0 15px 0',
              color: modal.success ? '#059669' : '#dc2626',
              fontSize: '20px',
              fontWeight: 'bold'
            }}>
              {modal.success ? 'Éxito' : 'Error'}
            </h3>
            <div style={{
              fontSize: '16px',
              marginBottom: '20px'
            }}>
              {modal.message}
            </div>
            <button
              onClick={() => setModal({ open: false, success: true, message: '' })}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: modal.success ? '#059669' : '#dc2626',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}


    </div>
  );
}

// Otros componentes de contenido
function DashboardContent() {
  return (
    <div style={{ padding: 0 }}>
      <TaxiForm />
    </div>
  );
}

function ConductoresContent() {
  const [conductores, setConductores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editIndex, setEditIndex] = useState(null);
  const [editData, setEditData] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchConductores = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'conductores'));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setConductores(data);
      } catch (error) {
        alert('Error al cargar conductores');
      } finally {
        setLoading(false);
      }
    };
    fetchConductores();
  }, []);

  const handleEdit = (index) => {
    setEditIndex(index);
    setEditData({ ...conductores[index] });
  };

  const handleCancel = () => {
    setEditIndex(null);
    setEditData({});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      const conductorRef = doc(db, 'conductores', editData.id);
      await updateDoc(conductorRef, editData);
      setConductores(prev => prev.map((c, i) => i === editIndex ? { ...editData } : c));
      setEditIndex(null);
      setEditData({});
      alert('Conductor actualizado');
    } catch (error) {
      alert('Error al actualizar conductor');
    }
  };

  const handleFotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setEditData(prev => ({ ...prev, foto: URL.createObjectURL(file) }));
    // En producción, reemplaza la línea anterior por la subida real y la URL de Firebase Storage
  };

  // Cambia el estatus y lo guarda en Firestore inmediatamente
  const handleToggleEstatusDirecto = async (conductor, idx) => {
    const nuevoEstatus = !conductor.estatus;
    try {
      const conductorRef = doc(db, 'conductores', conductor.id);
      await updateDoc(conductorRef, { estatus: nuevoEstatus });
      setConductores(prev => prev.map((c, i) => i === idx ? { ...c, estatus: nuevoEstatus } : c));
    } catch (error) {
      alert('Error al actualizar estatus');
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 20 }}>Gestión de Conductores</h2>
      {loading ? (
        <div>Cargando conductores...</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'flex-start' }}>
          {conductores.map((conductor, idx) => (
            <div key={conductor.id} style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
              padding: 32,
              minWidth: 340,
              maxWidth: 370,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
              marginBottom: 24
            }}>
              <div style={{ marginBottom: 24, width: '100%' }}>
                <div style={{ width: '100%', height: 180, border: '2.5px solid #3b82f6', borderRadius: '12px 12px 0 0', boxShadow: '0 2px 8px #3b82f633', overflow: 'hidden', background: 'transparent', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={editIndex === idx ? (editData.foto || conductor.foto) : conductor.foto}
                    alt={conductor.nombre}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                {editIndex === idx && (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      onChange={handleFotoChange}
                    />
                    <button
                      onClick={() => fileInputRef.current.click()}
                      style={{ marginTop: 10, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 4, padding: '5px 12px', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 }}
                    >
                      Cambiar Foto
                    </button>
                  </>
                )}
              </div>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Nombre:</strong>
                  {editIndex === idx ? (
                    <input name="nombre" value={editData.nombre} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.nombre}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Correo:</strong>
                  <input
                    value={conductor.correo}
                    disabled
                    style={{ color: '#374151', background: '#f3f4f6', borderRadius: 4, padding: '7px 8px', width: '100%', border: 'none', fontWeight: 'bold' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Teléfono:</strong>
                  {editIndex === idx ? (
                    <input name="telefono" value={editData.telefono} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.telefono}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Unidad:</strong>
                  {editIndex === idx ? (
                    <input name="unidad" value={editData.unidad} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.unidad}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Placa:</strong>
                  {editIndex === idx ? (
                    <input name="placa" value={editData.placa || ''} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.placa || '-'}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Color:</strong>
                  {editIndex === idx ? (
                    <input name="color" value={editData.color || ''} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.color || '-'}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Token:</strong>
                  {editIndex === idx ? (
                    <input 
                      name="token" 
                      value={editData.token || ''} 
                      onChange={handleChange} 
                      placeholder="Token FCM para notificaciones"
                      style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} 
                    />
                  ) : (
                    <span style={{ flex: 1, fontSize: '12px', color: '#6b7280' }}>
                      {conductor.token ? (
                        <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                          ✅ ${conductor.token.substring(0, 20)}...
                        </span>
                      ) : (
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                          ⚠️ No configurado
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              {/* Botones de acción y estatus en la misma línea, centrados y del mismo tamaño */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
                {editIndex === idx ? (
                  <>
                    <button onClick={handleSave} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: 6, padding: '14px 0', width: 120, fontWeight: 'bold', cursor: 'pointer', fontSize: 17 }}>Guardar</button>
                    <button onClick={handleCancel} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '14px 0', width: 120, fontWeight: 'bold', cursor: 'pointer', fontSize: 17 }}>Cancelar</button>
                    <button
                      type="button"
                      onClick={() => handleToggleEstatusDirecto(conductor, idx)}
                      style={{
                        background: conductor.estatus ? '#10b981' : '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 10,
                        padding: '14px 0',
                        width: 120,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: 17,
                        transition: 'background 0.2s',
                        boxShadow: conductor.estatus ? '0 2px 8px #10b98133' : '0 2px 8px #ef444433'
                      }}
                    >
                      {conductor.estatus ? 'Activo' : 'Inactivo'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleEdit(idx)}
                      style={{
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        padding: '14px 0',
                        width: 140,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: 19
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleEstatusDirecto(conductor, idx)}
                      style={{
                        background: conductor.estatus ? '#10b981' : '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 10,
                        padding: '14px 0',
                        width: 140,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: 19,
                        transition: 'background 0.2s',
                        boxShadow: conductor.estatus ? '0 2px 8px #10b98133' : '0 2px 8px #ef444433'
                      }}
                    >
                      {conductor.estatus ? 'Activo' : 'Inactivo'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportesContent() {
  const [viajes, setViajes] = useState([]);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  // Función para obtener la fecha actual en formato DD-MM-YYYY
  const obtenerFechaActual = () => {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const año = hoy.getFullYear();
    return `${dia}-${mes}-${año}`;
  };

  // Función para cargar viajes por rango de fechas
  const cargarViajesPorRango = async (fechaInicio, fechaFin) => {
    setCargando(true);
    setError('');
    
    try {
      console.log('📊 Cargando viajes desde:', fechaInicio, 'hasta:', fechaFin);
      
      const todosLosViajes = [];
      
      // Generar array de fechas entre fechaInicio y fechaFin
      const fechas = generarRangoFechas(fechaInicio, fechaFin);
      
      // Cargar viajes de cada fecha
      for (const fecha of fechas) {
        try {
          const viajesRef = collection(db, 'todosLosViajes', fecha, 'viajes');
          console.log('🔍 Consultando colección:', `todosLosViajes/${fecha}/viajes`);
          
          const viajesSnapshot = await getDocs(viajesRef);
          
          viajesSnapshot.forEach((doc) => {
            const viaje = {
              id: doc.id,
              fecha: fecha || 'N/A',
              ...doc.data()
            };
            todosLosViajes.push(viaje);
            console.log('📄 Viaje encontrado:', doc.id, viaje.nombreCliente || viaje.nombre);
          });
        } catch (error) {
          console.log(`⚠️ No se encontraron viajes para ${fecha}:`, error.message);
        }
      }
      
      console.log(`✅ Se encontraron ${todosLosViajes.length} viajes en total`);
      setViajes(todosLosViajes);
      
    } catch (error) {
      console.error('❌ Error al cargar viajes:', error);
      
      // Mensajes de error más específicos
      if (error.code === 'permission-denied') {
        setError('No tienes permisos para acceder a los viajes.');
      } else {
        setError(`Error al cargar los viajes: ${error.message}`);
      }
    } finally {
      setCargando(false);
    }
  };

  // Función para generar rango de fechas
  const generarRangoFechas = (fechaInicio, fechaFin) => {
    if (!fechaInicio || !fechaFin) {
      console.warn('⚠️ Fechas de inicio o fin no válidas:', { fechaInicio, fechaFin });
      return [];
    }
    
    const fechas = [];
    const [diaInicio, mesInicio, añoInicio] = fechaInicio.split('-').map(Number);
    const [diaFin, mesFin, añoFin] = fechaFin.split('-').map(Number);
    
    // Verificar que las fechas sean válidas
    if (isNaN(diaInicio) || isNaN(mesInicio) || isNaN(añoInicio) || 
        isNaN(diaFin) || isNaN(mesFin) || isNaN(añoFin)) {
      console.error('❌ Formato de fecha inválido:', { fechaInicio, fechaFin });
      return [];
    }
    
    const fechaInicioObj = new Date(añoInicio, mesInicio - 1, diaInicio);
    const fechaFinObj = new Date(añoFin, mesFin - 1, diaFin);
    
    // Verificar que las fechas sean válidas
    if (isNaN(fechaInicioObj.getTime()) || isNaN(fechaFinObj.getTime())) {
      console.error('❌ Fechas inválidas:', { fechaInicio, fechaFin });
      return [];
    }
    
    const fechaActual = new Date(fechaInicioObj);
    
    while (fechaActual <= fechaFinObj) {
      const dia = String(fechaActual.getDate()).padStart(2, '0');
      const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
      const año = fechaActual.getFullYear();
      fechas.push(`${dia}-${mes}-${año}`);
      fechaActual.setDate(fechaActual.getDate() + 1);
    }
    
    return fechas;
  };

  // Función para manejar cambio de fecha inicio
  const handleFechaInicioChange = (e) => {
    const fechaInput = e.target.value; // Formato YYYY-MM-DD
    if (fechaInput) {
      const [año, mes, dia] = fechaInput.split('-');
      const fechaFormateada = `${dia}-${mes}-${año}`;
      setFechaInicio(fechaFormateada);
    }
  };

  // Función para manejar cambio de fecha fin
  const handleFechaFinChange = (e) => {
    const fechaInput = e.target.value; // Formato YYYY-MM-DD
    if (fechaInput) {
      const [año, mes, dia] = fechaInput.split('-');
      const fechaFormateada = `${dia}-${mes}-${año}`;
      setFechaFin(fechaFormateada);
    }
  };

  // Función para aplicar filtros
  const aplicarFiltros = () => {
    if (fechaInicio && fechaFin) {
      console.log('🔍 Aplicando filtros:', { fechaInicio, fechaFin });
      cargarViajesPorRango(fechaInicio, fechaFin);
    } else {
      console.warn('⚠️ Fechas no válidas para filtrar:', { fechaInicio, fechaFin });
      setError('Por favor, selecciona fechas de inicio y fin válidas.');
    }
  };

  // Función para formatear fecha para mostrar
  const formatearFechaMostrar = (fecha) => {
    if (!fecha || typeof fecha !== 'string') return 'N/A';
    const partes = fecha.split('-');
    if (partes.length !== 3) return 'N/A';
    const [dia, mes, año] = partes;
    return `${dia}/${mes}/${año}`;
  };

  // Función para obtener estado con color
  const obtenerEstadoConColor = (estado) => {
    const colores = {
      'Aceptado': '#10b981',
      'Finalizado': '#3b82f6',
      'En Curso': '#f59e0b',
      'Cancelado': '#ef4444',
      'Pendiente': '#6b7280'
    };
    
    return {
      texto: estado,
      color: colores[estado] || '#6b7280'
    };
  };

  // Cargar viajes de la fecha actual al montar el componente
  useEffect(() => {
    const fechaActual = obtenerFechaActual();
    setFechaInicio(fechaActual);
    setFechaFin(fechaActual);
    cargarViajesPorRango(fechaActual, fechaActual);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 30 }}>
        <h2 style={{ 
          margin: '0 0 10px 0', 
          color: '#1f2937',
          fontSize: '28px',
          fontWeight: 'bold'
        }}>
          📊 Reportes del Sistema
        </h2>
        <p style={{ 
          margin: '0 0 20px 0', 
          color: '#6b7280',
          fontSize: '16px'
        }}>
          Visualiza todos los viajes por rango de fechas. Selecciona fechas de inicio y fin para filtrar los registros.
        </p>
        
        {/* Filtros de fecha */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 15,
          marginBottom: 20,
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ 
              fontWeight: 'bold', 
              color: '#374151',
              fontSize: '16px'
            }}>
              📅 Desde:
            </label>
            <input
              type="date"
              value={fechaInicio ? fechaInicio.split('-').reverse().join('-') : ''}
              onChange={handleFechaInicioChange}
              style={{
                padding: '10px 15px',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '16px',
                backgroundColor: 'white',
                color: '#374151'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ 
              fontWeight: 'bold', 
              color: '#374151',
              fontSize: '16px'
            }}>
              📅 Hasta:
            </label>
            <input
              type="date"
              value={fechaFin ? fechaFin.split('-').reverse().join('-') : ''}
              onChange={handleFechaFinChange}
              style={{
                padding: '10px 15px',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '16px',
                backgroundColor: 'white',
                color: '#374151'
              }}
            />
          </div>
          
          <button
            onClick={aplicarFiltros}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#2563eb'}
            onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
          >
            🔍 Buscar
          </button>
          
          {fechaInicio && fechaFin && (
            <span style={{ 
              color: '#6b7280',
              fontSize: '14px'
            }}>
              Mostrando viajes del {formatearFechaMostrar(fechaInicio)} al {formatearFechaMostrar(fechaFin)}
            </span>
          )}
        </div>
      </div>

      {/* Estado de carga */}
      {cargando && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
          Cargando viajes...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ 
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          ❌ {error}
        </div>
      )}

      {/* Tabla de viajes */}
      {!cargando && !error && (
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3 style={{ 
              margin: 0, 
              color: '#1f2937',
              fontSize: '20px'
            }}>
              🚗 Viajes ({viajes.length})
            </h3>
            {viajes.length > 0 && (
              <div style={{ 
                color: '#6b7280',
                fontSize: '14px'
              }}>
                Total de registros: {viajes.length}
              </div>
            )}
          </div>

          {viajes.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              color: '#6b7280',
              background: '#f9fafb',
              borderRadius: '12px',
              border: '2px dashed #d1d5db'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                No hay viajes registrados
              </div>
              <div style={{ fontSize: '14px' }}>
                No se encontraron viajes para el rango de fechas seleccionado
              </div>
            </div>
          ) : (
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                overflowX: 'auto'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px'
                }}>
                  <thead>
                    <tr style={{
                      background: '#f8fafc',
                      borderBottom: '2px solid #e5e7eb'
                    }}>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        👤 Cliente
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        🚗 Vehículo
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        📍 Origen
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        🎯 Destino
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        💰 Valor
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        ⏱️ Tiempo
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        📱 Teléfono
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        👨‍💼 Conductor
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        🏷️ Estado
                      </th>
                      <th style={{
                        padding: '15px 12px',
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        📅 Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viajes.map((viaje, index) => {
                      const estadoInfo = obtenerEstadoConColor(viaje.estado || viaje.pedido);
                      
                      return (
                        <tr key={viaje.id} style={{
                          borderBottom: '1px solid #f3f4f6',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'white';
                        }}>
                          <td style={{
                            padding: '12px',
                            color: '#1f2937',
                            fontWeight: '500'
                          }}>
                            {viaje.nombreCliente || viaje.nombre || 'N/A'}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#6b7280',
                            fontSize: '13px'
                          }}>
                            {viaje.placa || 'Sin placa'} • {viaje.clave || viaje.id}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#374151',
                            maxWidth: '200px',
                            wordWrap: 'break-word'
                          }}>
                            {viaje.direccion || 'N/A'}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#374151',
                            maxWidth: '200px',
                            wordWrap: 'break-word'
                          }}>
                            {viaje.destino || 'N/A'}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#059669',
                            fontWeight: 'bold'
                          }}>
                            ${viaje.valor || viaje.montoTotalCalculado || '0.00'}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#374151'
                          }}>
                            {viaje.tiempoTotal || (viaje.minutos ? `${viaje.minutos} min` : 'N/A')}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#374151',
                            fontFamily: 'monospace'
                          }}>
                            {viaje.telefono || 'N/A'}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#374151'
                          }}>
                            {viaje.codigo || viaje.idConductor || 'N/A'}
                          </td>
                          <td style={{
                            padding: '12px'
                          }}>
                            <span style={{
                              background: estadoInfo.color,
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}>
                              {estadoInfo.texto}
                            </span>
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#6b7280',
                            fontSize: '13px'
                          }}>
                            {formatearFechaMostrar(viaje.fecha)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VouchersContent() {
  return (
    <div style={{ padding: 20 }}>
      <h2>Gestión de Vouchers</h2>
      <p>Administra los vouchers y comprobantes del sistema.</p>
    </div>
  );
}

// Componente principal
function MainContent({ activeSection }) {
  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardContent />;
      case 'conductores':
        return <ConductoresContent />;
      case 'reportes':
        return <ReportesContent />;
      case 'vouchers':
        return <VouchersContent />;
      default:
        return <DashboardContent />;
    }
  };

  return (
    <main style={{
      flex: 1,
      padding: 0,
      background: '#f9fafb',
      overflow: 'auto'
    }}>
      {renderContent()}
    </main>
  );
}

export default MainContent; 



