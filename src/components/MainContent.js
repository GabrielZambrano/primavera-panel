import React, { useState, useEffect, useRef, useCallback } from "react";
import { Wrapper, Status } from "@googlemaps/react-wrapper";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import axios from 'axios';

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
          componentRestrictions: { country: 'ec' }, // Restringir a Ecuador
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
     const [viajesAsignados, setViajesAsignados] = useState([]);
   const [cargandoViajes, setCargandoViajes] = useState(false);
   const [editandoViaje, setEditandoViaje] = useState(null);
   const [tiempoEdit, setTiempoEdit] = useState('');
   const [unidadEdit, setUnidadEdit] = useState('');
   const [pedidosDisponibles, setPedidosDisponibles] = useState([]);
   const [cargandoPedidosDisp, setCargandoPedidosDisp] = useState(false);
   const [pedidosEnCurso, setPedidosEnCurso] = useState([]);
   const [cargandoPedidosCurso, setCargandoPedidosCurso] = useState(false);


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

  // Cargar viajes asignados, pedidos disponibles y pedidos en curso
  useEffect(() => {
    cargarViajesAsignados();
    cargarPedidosDisponibles();
    cargarPedidosEnCurso();
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
  const cargarPedidosDisponibles = async () => {
    setCargandoPedidosDisp(true);
    try {
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
      
      setPedidosDisponibles(pedidos);
    } catch (error) {
      console.error('Error al cargar pedidos disponibles:', error);
    } finally {
      setCargandoPedidosDisp(false);
    }
  };

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

  const buscarUsuario = async (numeroTelefono) => {
    if (numeroTelefono.length < 7) {
      setUsuarioEncontrado(null);
      setNombre('');
      setDireccion('');
      setCoordenadas('');
      setMostrarModal(false);
      return;
    }

    setBuscandoUsuario(true);
    try {
      let coleccionNombre = '';
      if (numeroTelefono.length === 7) {
        coleccionNombre = 'usuarios';
      } else if (numeroTelefono.length > 7) {
        coleccionNombre = 'usuariosfijos';
      }

      const q = query(
        collection(db, coleccionNombre),
        where("telefono", "==", numeroTelefono)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        setUsuarioEncontrado(userData);
        if (userData.nombre) setNombre(userData.nombre);
        if (userData.direccion) setDireccion(userData.direccion);
        if (userData.coordenadas) setCoordenadas(userData.coordenadas);
        setMostrarModal(false);
      } else {
        setUsuarioEncontrado(null);
        setNombre('');
        setDireccion('');
        setCoordenadas('');
        setMostrarModal(true);
        setNuevoCliente({ nombre: '', direccion: '', coordenadas: '', email: '' });
      }
    } catch (error) {
      console.error('Error al buscar usuario:', error);
      setUsuarioEncontrado(null);
    } finally {
      setBuscandoUsuario(false);
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
      if (value.length >= 7) {
        buscarUsuario(value);
      } else {
        setUsuarioEncontrado(null);
        setNombre('');
        setDireccion('');
        setCoordenadas('');
        setMostrarModal(false);
      }
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
  };

     // Función para insertar pedido disponible
   const handleInsertarViajePendiente = async () => {
     try {
       const fecha = new Date().toISOString().replace('T', ' ').substring(0, 19);
       const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
       
       const pedidoData = {
         // Estructura basada en tu colección pedidosDisponibles
         clave: clave,
         codigo: nombre || '',
         nombreCliente: nombre || '',
         telefono: telefono || '',
         direccion: direccion || '',
         destino: '', // Se puede editar después
         fecha: fecha,
         estado: 'Disponible',
         idConductor: 'Sin asignar',
         latitud: coordenadas ? coordenadas.split(',')[0] : '',
         longitud: coordenadas ? coordenadas.split(',')[1] : '',
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
         rango: '2',
         viajes: '',
         foto: '0'
       };

       // Guardar en la colección "pedidosDisponibles"
       await addDoc(collection(db, 'pedidosDisponibles'), pedidoData);
       
       // Recargar las tablas
       cargarViajesAsignados();
       cargarPedidosDisponibles();
       
              cargarPedidosEnCurso();
       
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
      
       const fecha = new Date().toISOString().replace('T', ' ').substring(0, 19);
       const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
       
       const pedidoData = {
         // Estructura basada en tu colección pedidosDisponibles
         clave: clave,
         codigo: nombre || '',
         nombreCliente: nombre || '',
         telefono: telefono || '',
         direccion: direccion || '',
         destino: '', // Se puede editar después
         fecha: fecha,
         estado: 'Asignado',
         idConductor: conductorData.id || '',
         latitud: coordenadas ? coordenadas.split(',')[0] : '',
         longitud: coordenadas ? coordenadas.split(',')[1] : '',
         latitudDestino: '',
         longitudDestino: '',
         sector: '', // Se puede editar después
         tipoPedido: 'ok',
         valor: 'Central',
         central: true,
         coorporativo: false,
         llegue: false,
         pedido: 'Asignado',
         puerto: '3020',
         randon: clave,
         rango: '2',
         viajes: '',
         foto: '0',
         // Información del conductor
         nombreConductor: conductorData.nombre || '',
         placa: conductorData.placa || '',
         numeroUnidad: unidad,
         tiempo: tiempo
       };

       // Guardar en la colección "pedidosDisponibles"
       await addDoc(collection(db, 'pedidosDisponibles'), pedidoData);
       
       // Recargar las tablas
       cargarViajesAsignados();
       cargarPedidosDisponibles();
       
              cargarPedidosEnCurso();
       
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar el formulario
       limpiarFormulario();
       
       setModal({ 
         open: true, 
         success: true, 
         message: `¡Viaje asignado exitosamente!\nConductor: ${conductorData.nombre}\nUnidad: ${unidad}\nPlaca: ${conductorData.placa}` 
       });
    } catch (error) {
      console.error('Error al registrar el viaje:', error);
      setModal({ open: true, success: false, message: 'Error al registrar el viaje asignado.' });
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
         // Datos del conductor
         idConductor: conductorData.correo || conductorData.id || '',
         nombre: conductorData.nombre || '',
         nombreConductor: conductorData.nombre || '',
         placa: conductorData.placa || '',
         color: conductorData.color || '',
         telefonoConductor: conductorData.telefono || '',
         foto: conductorData.foto || '',
         minutos: parseInt(tiempoEdit) || 0,
         distancia: '0.00 Mts', // Valor inicial
         latitudConductor: '',
         longitudConductor: ''
       };

       // 3. Agregar a pedidoEnCurso
       await addDoc(collection(db, 'pedidoEnCurso'), pedidoEnCursoData);

       // 4. Eliminar de pedidosDisponibles
       await deleteDoc(pedidoOriginalRef);

       // Cancelar edición y recargar todas las tablas
       cancelarEdicionViaje();
       cargarViajesAsignados();
       cargarPedidosDisponibles();
       cargarPedidosEnCurso();
       
       setModal({ 
         open: true, 
         success: true, 
         message: `¡Pedido movido a "En Curso" exitosamente!\nConductor: ${conductorData.nombre}\nUnidad: ${unidadEdit}\nPlaca: ${conductorData.placa}` 
       });
     } catch (error) {
       console.error('Error al mover el pedido:', error);
       setModal({ open: true, success: false, message: 'Error al mover el pedido a "En Curso".' });
     }
   };

   function generarIdRandom(length = 20) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function generarRandon(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  const handleSolicitarAplicacion = async () => {
    if (!coordenadas.trim()) {
      setModal({ open: true, success: false, message: 'Por favor, ingrese las coordenadas antes de solicitar por aplicación.' });
      return;
    }
    try {
      const [latitud, longitud] = coordenadas.split(',').map(s => s.trim());
      const fecha = new Date().toLocaleString('es-EC');
      const id = generarIdRandom();
      const randon = generarRandon();
      const data = {
        id,
        central: false,
        clave: unidad || '',
        codigo: nombre || '',
        coorporativo: false,
        destino: 'QUITO-ECUADOR',
        direccion: direccion || '',
        estado: 'Disponible',
        fecha,
        foto: '0',
        idConductor: 'Sin asignar',
        latitud: latitud || '',
        latitudConductor: '',
        llegue: false,
        longitud: longitud || '',
        longitudConductor: '',
        nombreCliente: nombre || '',
        pedido: 'Disponible',
        puerto: '3020',
        randon,
        rango: '10',
        sector: direccion || '',
        tarifaSeleccionada: true,
        telefono: telefono || '',
        valor: '',
        viajes: unidad || ''
      };
      
      // Enviar a la API externa
      await axios.post('http://84.46.245.131:3020/api/pedidos', data, {
        headers: { 'content-type': 'application/json' }
      });

      // También guardar en pedidosDisponibles para que aparezca en la tabla
      const pedidoData = {
        ...data, // Usar la misma estructura que se envía a la API
        modoSeleccion: 'aplicacion' // Identificar como pedido de aplicación
      };

      // Guardar en la colección "pedidosDisponibles"
      await addDoc(collection(db, 'pedidosDisponibles'), pedidoData);
      
      // Recargar las tablas
      cargarViajesAsignados();
      cargarPedidosDisponibles();

       cargarPedidosEnCurso();
       
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar el formulario
       limpiarFormulario();
       
       setModal({ open: true, success: true, message: '¡Viaje registrado exitosamente!' });
    } catch (error) {
      setModal({ open: true, success: false, message: 'Error al registrar el viaje.' });
    }
  };

  // Callbacks memoizados para evitar re-renders innecesarios
  const handleCoordinatesSelect = useCallback(async (nuevasCoordenadas) => {
    setCoordenadas(nuevasCoordenadas);
    
    // Ocultar el mapa automáticamente
    setMapaVisible(false);
    
    // Guardar coordenadas y dirección en subcolección del usuario si existe
    if (telefono && direccion && nuevasCoordenadas) {
      try {
        // Determinar la colección base según el tipo de teléfono
        const coleccionBase = telefono.length === 7 ? 'usuarios' : 'usuariosfijos';
        
        // Buscar el usuario por teléfono
        const qUsuario = query(
          collection(db, coleccionBase),
          where("telefono", "==", telefono)
        );
        
        const snapshotUsuario = await getDocs(qUsuario);
        
        if (!snapshotUsuario.empty) {
          const userDoc = snapshotUsuario.docs[0];
          const direccionData = {
            direccion: direccion,
            coordenadas: nuevasCoordenadas,
            fechaRegistro: new Date().toISOString(),
            activa: true
          };
          
          // Guardar en subcolección 'direcciones' del usuario
          await addDoc(collection(db, coleccionBase, userDoc.id, 'direcciones'), direccionData);
          
          console.log('Dirección guardada en subcolección del usuario');
        }
      } catch (error) {
        console.error('Error al guardar dirección en subcolección:', error);
      }
    }
  }, [telefono, direccion, setMapaVisible]);

  const handleAddressSelect = useCallback((nuevaDireccion) => {
    setDireccion(nuevaDireccion);
  }, []);

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
              if (e.key === 'Delete') {
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
            padding: 30,
            borderRadius: 8,
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
            maxWidth: 400,
            width: '90%'
          }}>
            <h2 style={{ marginBottom: 20, textAlign: 'center' }}>
              Nuevo Cliente Registrado
            </h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              registrarCliente();
            }}>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5 }}>Nombre:</label>
                <input
                  type="text"
                  value={nuevoCliente.nombre}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    width: '100%',
                    fontSize: 16
                  }}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5 }}>Dirección:</label>
                <input
                  type="text"
                  value={nuevoCliente.direccion}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    width: '100%',
                    fontSize: 16
                  }}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5 }}>Coordenadas:</label>
                <input
                  type="text"
                  value={nuevoCliente.coordenadas}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, coordenadas: e.target.value })}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    width: '100%',
                    fontSize: 16
                  }}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5 }}>Email (opcional):</label>
                <input
                  type="email"
                  value={nuevoCliente.email}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    width: '100%',
                    fontSize: 16
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  padding: '12px 20px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 18,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                Registrar Cliente
              </button>
              <button
                type="button"
                onClick={() => setMostrarModal(false)}
                style={{
                  padding: '12px 20px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 18,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%',
                  marginTop: 10
                }}
              >
                Cancelar
              </button>
            </form>
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

              {/* Tabla de Pedidos (Principal) */}
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
            🚗 Pedidos Registrados
            <span style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 'normal'
            }}>
              {viajesAsignados.length} registros
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
            <div>Cargando viajes asignados...</div>
          </div>
        ) : viajesAsignados.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
              No hay pedidos registrados
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
                          new Date(viaje.fecha).toLocaleDateString('es-EC') + ' ' +
                          new Date(viaje.fecha).toLocaleTimeString('es-EC', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
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
                       {viaje.nombreCliente || '-'}
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
        marginTop: 40,
        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
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
              Los pedidos aparecerán aquí cuando sean asignados a conductores
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
                    🕐 Fecha
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    🔑 Clave
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
                    📍 Origen
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    🎯 Destino
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}>
                    🚗 Conductor
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
                    🏷️ Estado
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
                        new Date(pedido.fecha).toLocaleDateString('es-EC') + ' ' +
                        new Date(pedido.fecha).toLocaleTimeString('es-EC', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                        : '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      fontWeight: 'bold',
                      color: '#1f2937'
                    }}>
                      {pedido.clave || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      color: '#374151'
                    }}>
                      {pedido.nombreCliente || pedido.codigo || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      color: '#374151'
                    }}>
                      {pedido.telefono || '-'}
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
                      color: '#374151',
                      maxWidth: 150,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {pedido.destino || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      color: '#374151'
                    }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: 12, color: '#dc2626' }}>
                          {pedido.nombre || pedido.nombreConductor || '-'}
                        </div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>
                          {pedido.placa || '-'}
                        </div>
                        {pedido.telefonoConductor && (
                          <div style={{ fontSize: 10, color: '#6b7280' }}>
                            📞 {pedido.telefonoConductor}
                          </div>
                        )}
                      </div>
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
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#059669'
                    }}>
                      {pedido.tiempo || pedido.minutos ? `${pedido.tiempo || pedido.minutos} min` : '-'}
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
                          background: pedido.estado === 'Aceptado' ? '#dc2626' : '#6b7280',
                          color: 'white'
                        }}
                      >
                        {pedido.estado || 'En Curso'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
  return (
    <div style={{ padding: 20 }}>
      <h2>Reportes del Sistema</h2>
      <p>Visualiza reportes y estadísticas del sistema de taxis.</p>
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