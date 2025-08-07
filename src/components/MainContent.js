import React, { useState, useEffect, useRef, useCallback } from "react";
import { Wrapper, Status } from "@googlemaps/react-wrapper";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc, deleteDoc, onSnapshot, setDoc, orderBy, limit, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebaseConfig";
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
  // Estados para autenticación de operadores
  const [operadorAutenticado, setOperadorAutenticado] = useState(null);
  const [mostrarModalOperador, setMostrarModalOperador] = useState(true);
  const [usuarioOperador, setUsuarioOperador] = useState('');
  const [codigoOperador, setCodigoOperador] = useState('');
  const [errorAutenticacion, setErrorAutenticacion] = useState('');
  const [cargandoAutenticacion, setCargandoAutenticacion] = useState(false);

  // Estados para reportes diarios
  const [reporteDiario, setReporteDiario] = useState({
    viajesRegistrados: 0,
    viajesAsignados: 0,
    viajesCancelados: 0,
    viajesFinalizados: 0,
    vouchersGenerados: 0
  });

  // Función para autenticar operador
  const autenticarOperador = async () => {
    if (!usuarioOperador.trim()) {
      setErrorAutenticacion('El usuario es obligatorio');
      return;
    }

    if (!codigoOperador || codigoOperador.length !== 4 || !/^\d{4}$/.test(codigoOperador)) {
      setErrorAutenticacion('El código debe tener exactamente 4 dígitos numéricos');
      return;
    }

    setCargandoAutenticacion(true);
    setErrorAutenticacion('');

    try {
      const operadoresRef = collection(db, 'operadores');
      const q = query(operadoresRef, 
        where('usuario', '==', usuarioOperador.trim()),
        where('codigo', '==', codigoOperador)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const operador = snapshot.docs[0].data();
        setOperadorAutenticado({
          id: snapshot.docs[0].id,
          nombre: operador.nombre,
          usuario: operador.usuario,
          codigo: operador.codigo
        });
        setMostrarModalOperador(false);
        console.log('✅ Operador autenticado:', operador.nombre);
        
        // Cargar reporte diario del operador
        await cargarReporteDiario(operador.nombre);
      } else {
        setErrorAutenticacion('Usuario o código incorrecto');
      }
    } catch (error) {
      console.error('❌ Error al autenticar operador:', error);
      setErrorAutenticacion('Error al autenticar operador');
    } finally {
      setCargandoAutenticacion(false);
    }
  };

  // Función para cargar reporte diario
  const cargarReporteDiario = async (nombreOperador) => {
    try {
      const hoy = new Date();
      const fechaHoy = hoy.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const reporteRef = doc(db, 'reportesDiarios', `${nombreOperador}_${fechaHoy}`);
      const reporteDoc = await getDoc(reporteRef);

      if (reporteDoc.exists()) {
        setReporteDiario(reporteDoc.data());
      } else {
        // Crear reporte inicial si no existe
        const reporteInicial = {
          operador: nombreOperador,
          fecha: fechaHoy,
          viajesRegistrados: 0,
          viajesAsignados: 0,
          viajesCancelados: 0,
          viajesFinalizados: 0,
          vouchersGenerados: 0,
          ultimaActualizacion: new Date()
        };
        await setDoc(reporteRef, reporteInicial);
        setReporteDiario(reporteInicial);
      }
    } catch (error) {
      console.error('❌ Error al cargar reporte diario:', error);
    }
  };

  // Función para actualizar contador en reporte diario
  const actualizarContadorReporte = async (tipoAccion) => {
    if (!operadorAutenticado) return;

    try {
      const hoy = new Date();
      const fechaHoy = hoy.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const reporteRef = doc(db, 'reportesDiarios', `${operadorAutenticado.nombre}_${fechaHoy}`);
      
      // Actualizar contador específico
      const campoContador = tipoAccion;
      await updateDoc(reporteRef, {
        [campoContador]: increment(1),
        ultimaActualizacion: new Date()
      });

      // Actualizar estado local
      setReporteDiario(prev => ({
        ...prev,
        [campoContador]: prev[campoContador] + 1
      }));

      console.log(`📊 Contador actualizado: ${tipoAccion}`);
    } catch (error) {
      console.error('❌ Error al actualizar contador:', error);
    }
  };

  // Función para cerrar sesión de operador
  const cerrarSesionOperador = () => {
    setOperadorAutenticado(null);
    setMostrarModalOperador(true);
    setUsuarioOperador('');
    setCodigoOperador('');
    setErrorAutenticacion('');
    setReporteDiario({
      viajesRegistrados: 0,
      viajesAsignados: 0,
      viajesCancelados: 0,
      viajesFinalizados: 0,
      vouchersGenerados: 0
    });
  };

  const [coordenadas, setCoordenadas] = useState('');
  const [direccion, setDireccion] = useState('');
  const [base, setBase] = useState('0');
  const [tiempo, setTiempo] = useState('');
  const [unidad, setUnidad] = useState('');
  // Inicializar modoSeleccion (fijo en manual, no cambia la interfaz)
  const [modoSeleccion, setModoSeleccion] = useState('manual');
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
  const [baseEdit, setBaseEdit] = useState('');
   const [pedidosEnCurso, setPedidosEnCurso] = useState([]);
   const [cargandoPedidosCurso, setCargandoPedidosCurso] = useState(false);
  // Nuevo estado para direcciones guardadas
  const [direccionesGuardadas, setDireccionesGuardadas] = useState([]);
  const [direccionSeleccionada, setDireccionSeleccionada] = useState(null);
  // Estados para edición de direcciones
  const [editandoDireccion, setEditandoDireccion] = useState(null);
  const [textoEditado, setTextoEditado] = useState('');

  // Referencias para los inputs del formulario
  const baseInputRef = useRef(null);
  const tiempoInputRef = useRef(null);
  const unidadInputRef = useRef(null);

  // Estados para modal de acciones del pedido
  const [modalAccionesPedido, setModalAccionesPedido] = useState({
    open: false,
    pedido: null,
    coleccion: '' // 'pedidosDisponibles' o 'pedidoEnCurso'
  });

  // Estado para controlar múltiples inserciones
  const [insertandoRegistro, setInsertandoRegistro] = useState(false);

  // Estado para mostrar el texto de la selección
  const [textoSeleccion, setTextoSeleccion] = useState('Selección Manual');

  // Función para actualizar la configuración en la colección
  const actualizarConfiguracion = async (nuevoEstado) => {
    try {
      // Obtener el documento de configuración
      const configRef = doc(db, 'configuracion', 'status');
      
      // Actualizar el documento
      await updateDoc(configRef, {
        estado: nuevoEstado,
        fechaActualizacion: new Date()
      });
      
      console.log(`✅ Estado de configuración actualizado a: ${nuevoEstado ? 'Automático' : 'Manual'}`);
    } catch (error) {
      console.error('❌ Error al actualizar configuración:', error);
    }
  };

  // Función para cambiar el estado en la colección configuracion (F1)
  const cambiarEstadoConfiguracion = async () => {
    try {
      // Obtener el documento de configuración
      const configRef = doc(db, 'configuracion', 'status');
      
      // Obtener el estado actual del documento
      const configDoc = await getDoc(configRef);
      
      if (configDoc.exists()) {
        const estadoActual = configDoc.data().estado;
        // Cambiar al estado opuesto (true = automático, false = manual)
        const nuevoEstado = !estadoActual;
        
        // Actualizar el documento
        await updateDoc(configRef, {
          estado: nuevoEstado,
          fechaActualizacion: new Date()
        });
        
        // Actualizar solo el texto mostrado
        setTextoSeleccion(nuevoEstado ? 'Selección Automática' : 'Selección Manual');
        
        console.log(`✅ Estado de configuración cambiado de ${estadoActual ? 'Automático' : 'Manual'} a ${nuevoEstado ? 'Automático' : 'Manual'}`);
      } else {
        // Si el documento no existe, crearlo con estado manual (false)
        await setDoc(configRef, {
          estado: false,
          fechaActualizacion: new Date()
        });
        
        setTextoSeleccion('Selección Manual');
        console.log('✅ Documento de configuración creado con estado Manual');
      }
    } catch (error) {
      console.error('❌ Error al actualizar configuración:', error);
    }
  };

  // Función para cargar el estado inicial desde la colección configuracion
  const cargarEstadoConfiguracion = async () => {
    try {
      const configRef = doc(db, 'configuracion', 'status');
      const configDoc = await getDoc(configRef);
      
      if (configDoc.exists()) {
        const estado = configDoc.data().estado;
        // Actualizar el texto según el estado en la BD
        setTextoSeleccion(estado ? 'Selección Automática' : 'Selección Manual');
        console.log(`📋 Estado cargado: ${estado ? 'Automático' : 'Manual'} - Texto: ${estado ? 'Selección Automática' : 'Selección Manual'}`);
      } else {
        // Si no existe el documento, crear con estado manual por defecto
        await setDoc(configRef, {
          estado: false,
          fechaActualizacion: new Date()
        });
        setTextoSeleccion('Selección Manual');
        console.log('📋 Documento de configuración creado con estado Manual por defecto');
      }
    } catch (error) {
      console.error('❌ Error al cargar configuración:', error);
    }
  };

  // Cargar estado inicial al montar el componente (solo para crear documento si no existe)
  useEffect(() => {
    cargarEstadoConfiguracion();
  }, []);

  // Guardar modoSeleccion en localStorage cuando cambie
  useEffect(() => {
    localStorage.setItem('modoSeleccion', modoSeleccion);
    console.log(`🔄 Modo cambiado a: ${modoSeleccion}`);
  }, [modoSeleccion]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        // Solo cambiar el estado en la colección configuracion
        cambiarEstadoConfiguracion();
      }
      if (event.key === 'Escape') {
        setMostrarModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modoSeleccion]); // Agregar modoSeleccion como dependencia

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
    const qEnCurso = query(
      collection(db, 'pedidoEnCurso'),
      orderBy('fecha', 'desc')
    );
    const unsubscribeEnCurso = onSnapshot(qEnCurso, async (querySnapshot) => {
      const pedidos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setPedidosEnCurso(pedidos);
      setCargandoPedidosCurso(false);
      
      // Verificar si hay pedidos de aplicación con estado "Iniciado"
      const pedidosIniciados = pedidos.filter(pedido => 
        pedido.tipopedido === 'Automático' && pedido.pedido === 'Iniciado'
      );
      
      if (pedidosIniciados.length > 0) {
        console.log(`🚀 ${pedidosIniciados.length} pedidos de aplicación iniciados`);
      }
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

  // Cargar pedidos en curso
  const cargarPedidosEnCurso = async () => {
    setCargandoPedidosCurso(true);
    try {
      const q = query(
        collection(db, 'pedidoEnCurso'),
        orderBy('fecha', 'desc') // Ordenar por fecha más reciente
      );
      
      // Usar onSnapshot para escuchar cambios en tiempo real
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const pedidos = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setPedidosEnCurso(pedidos);
        console.log(`📊 Pedidos en curso cargados: ${pedidos.length}`);
        
        // Verificar si hay pedidos de aplicación con estado "Iniciado"
        const pedidosIniciados = pedidos.filter(pedido => 
          pedido.tipopedido === 'Automático' && pedido.pedido === 'Iniciado'
        );
        
        if (pedidosIniciados.length > 0) {
          console.log(`🚀 ${pedidosIniciados.length} pedidos de aplicación iniciados`);
        }
      }, (error) => {
        console.error('Error al escuchar pedidos en curso:', error);
      });

      // Guardar la función de limpieza para cuando el componente se desmonte
      return unsubscribe;
    } catch (error) {
      console.error('Error al cargar pedidos en curso:', error);
    } finally {
      setCargandoPedidosCurso(false);
    }
  };

      // Cargar pedidos disponibles


 


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
          
          // Enfocar el input de base después de encontrar el cliente
          setTimeout(() => {
            if (baseInputRef.current) {
              baseInputRef.current.focus();
              console.log('🎯 Enfoque automático en input de base');
            }
          }, 100);
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

  // Función para convertir número a texto de base
  const convertirNumeroABase = (numero) => {
    if (numero === '0' || numero === 0) {
      return 'aire';
    }
    return `base ${numero}`;
  };

  // Nueva función para limpiar solo tiempo y unidad, manteniendo datos del cliente
  const limpiarTiempoYUnidad = () => {
    setBase('0');
    setTiempo('');
    setUnidad('');
    setMapaVisible(false); // Oculta el mapa
  };

  // Nueva función para limpiar formulario completo y enfocar teléfono
  const limpiarFormularioCompleto = () => {
    setTelefono('');
    setNombre('');
    setCoordenadas('');
    setDireccion('');
    setBase('0');
    setTiempo('');
    setUnidad('');
    setUsuarioEncontrado(null);
    setBuscandoUsuario(false);
    setMostrarModal(false);
    setNuevoCliente({ nombre: '', direccion: '', coordenadas: '', email: '' });
    setMapaVisible(false);
    setDireccionesGuardadas([]);
    setDireccionSeleccionada(null);
    setEditandoDireccion(null);
    setTextoEditado('');
    
    // Enfocar el campo de teléfono después de limpiar
    setTimeout(() => {
      const telefonoInput = document.querySelector('input[placeholder="Ingrese Teléfono"]');
      if (telefonoInput) {
        telefonoInput.focus();
      }
    }, 100);
  };

     // Función para insertar pedido disponible
   const handleInsertarViajePendiente = async () => {
     // Evitar múltiples inserciones simultáneas
     if (insertandoRegistro) {
       console.log('⚠️ Ya se está insertando un registro, esperando...');
       return;
     }
     
     setInsertandoRegistro(true);
     
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
         base: convertirNumeroABase(base || '0'), // Nuevo campo base
         destino: '', // Se puede editar después
         fecha: fecha,
         estado: 'Disponible',
         idConductor: 'Sin asignar',
         latitud: latitud,
         longitud: longitud,
         latitudDestino: '',
         longitudDestino: '',
         sector: '', // Se puede editar después
         tipoPedido: 'Manual',
         valor: 'Central',
         central: true,
         coorporativo: false,
         llegue: false,
         pedido: 'Disponible',
         puerto: '3020',
         randon: clave,
         rango: '0', // Rango siempre 0 para pedidos manuales
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
       
       // Limpiar formulario completo y enfocar teléfono
       limpiarFormularioCompleto();
       
       // Registro silencioso - sin mostrar alert de éxito
       console.log('✅ Pedido registrado silenciosamente en pedidosDisponibles');
     } catch (error) {
       console.error('Error al registrar el pedido:', error);
       setModal({ open: true, success: false, message: 'Error al registrar el pedido.' });
     } finally {
       setInsertandoRegistro(false);
     }
   };

   // Función para insertar viaje en modo manual
   // Incluye el token del conductor para notificaciones push cuando se asigna manualmente
   const handleInsertarViaje = async () => {
     // Evitar múltiples inserciones simultáneas
     if (insertandoRegistro) {
       console.log('⚠️ Ya se está insertando un registro, esperando...');
       return;
     }
     
     // Validaciones
     if (!tiempo.trim()) {
       setModal({ open: true, success: false, message: 'Por favor, ingrese el tiempo del viaje.' });
       return;
     }
     if (!unidad.trim()) {
       setModal({ open: true, success: false, message: 'Por favor, ingrese el número de unidad.' });
       return;
     }
     
     setInsertandoRegistro(true);

    try {
      // Buscar datos del conductor por número de unidad
      const conductoresQuery = query(
        collection(db, 'conductores'),
        where("unidad", "==", unidad.trim())
      );
      
      const conductoresSnapshot = await getDocs(conductoresQuery);
      
      if (conductoresSnapshot.empty) {
        setModal({ open: true, success: false, message: `No se encontró un conductor con la unidad ${unidad}. Por favor, ingrese una unidad válida.` });
        // NO hacer return, permitir que el usuario siga editando
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
         base: convertirNumeroABase(base || '0'), // Nuevo campo base
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
         tipoPedido: 'Manual',
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

       // Registrar automáticamente en la colección de pedidos manuales
       try {
         const pedidoManualData = {
           ...pedidoEnCursoData,
           idOriginal: docRef.id, // Referencia al documento original
           fechaRegistro: new Date(),
           tipo: 'manual',
           estadoRegistro: 'Registrado',
           modoRegistro: 'manual'
         };

         await addDoc(collection(db, 'pedidosManuales'), pedidoManualData);
         console.log('✅ Pedido manual registrado en colección separada');
       } catch (error) {
         console.error('❌ Error al registrar pedido manual:', error);
         // No fallar si no se puede registrar en la colección separada
       }
       
       // Los listeners en tiempo real actualizarán automáticamente las tablas
       
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar formulario completo y enfocar teléfono
       limpiarFormularioCompleto();
       
       // Registro silencioso - sin mostrar alert de éxito
       console.log(`✅ Pedido registrado silenciosamente en "En Curso" - Conductor: ${conductorData.nombre}, Unidad: ${unidad}`);
       
       // Actualizar contador de viajes registrados
       await actualizarContadorReporte('viajesRegistrados');
    } catch (error) {
      console.error('Error al registrar el viaje:', error);
      setModal({ open: true, success: false, message: 'Error al registrar el pedido en curso.' });
    } finally {
      setInsertandoRegistro(false);
    }
   };

     // Función para abrir modal de acciones del pedido
  const abrirModalAccionesPedido = (pedido, coleccion) => {
    setModalAccionesPedido({
      open: true,
      pedido: pedido,
      coleccion: coleccion
    });
  };

  // Función para cerrar modal de acciones del pedido
  const cerrarModalAccionesPedido = () => {
    setModalAccionesPedido({
      open: false,
      pedido: null,
      coleccion: ''
    });
  };

  // Función para cancelar pedido por cliente
  const cancelarPedidoPorCliente = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const pedidoRef = doc(db, modalAccionesPedido.coleccion, modalAccionesPedido.pedido.id);
      
      // Actualizar el pedido original
      await updateDoc(pedidoRef, {
        estado: 'Cancelado por Cliente',
        fechaCancelacion: new Date(),
        motivoCancelacion: 'Cancelado por el cliente'
      });

      // Guardar en todosLosViajes con la estructura de fecha
      const fechaActual = new Date();
      const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const viajeCanceladoData = {
        ...modalAccionesPedido.pedido,
        estado: 'Cancelado por Cliente',
        fechaCancelacion: fechaActual,
        motivoCancelacion: 'Cancelado por el cliente',
        fechaRegistroCancelacion: fechaActual
      };

      // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
      const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
      await setDoc(doc(db, rutaTodosLosViajes), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido cancelado por cliente, guardado en todosLosViajes y eliminado de la colección original');
      
      // Actualizar contador de viajes cancelados
      await actualizarContadorReporte('viajesCancelados');
      
      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al cancelar pedido:', error);
      setModal({ open: true, success: false, message: 'Error al cancelar el pedido.' });
    }
  };

  // Función para cancelar pedido por unidad
  const cancelarPedidoPorUnidad = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const pedidoRef = doc(db, modalAccionesPedido.coleccion, modalAccionesPedido.pedido.id);
      
      // Actualizar el pedido original
      await updateDoc(pedidoRef, {
        estado: 'Cancelado por Unidad',
        fechaCancelacion: new Date(),
        motivoCancelacion: 'Cancelado por la unidad'
      });

      // Guardar en todosLosViajes con la estructura de fecha
      const fechaActual = new Date();
      const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const viajeCanceladoData = {
        ...modalAccionesPedido.pedido,
        estado: 'Cancelado por Unidad',
        fechaCancelacion: fechaActual,
        motivoCancelacion: 'Cancelado por la unidad',
        fechaRegistroCancelacion: fechaActual
      };

      // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
      const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
      await setDoc(doc(db, rutaTodosLosViajes), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido cancelado por unidad, guardado en todosLosViajes y eliminado de la colección original');
      
      // Actualizar contador de viajes cancelados
      await actualizarContadorReporte('viajesCancelados');
      
      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al cancelar pedido por unidad:', error);
      setModal({ open: true, success: false, message: 'Error al cancelar el pedido por unidad.' });
    }
  };

  // Estados para modal de voucher
  const [modalVoucher, setModalVoucher] = useState({
    open: false,
    voucher: {
      fechaHora: '',
      nombreCliente: '',
      telefono: '',
      direccion: '',
      destino: '',
      valor: '',
      motivo: '',
      informacionViaje: '',
      numeroUnidad: '',
      empresa: ''
    }
  });

  // Estado para pre-registro de voucher
  const [preRegistroVoucher, setPreRegistroVoucher] = useState({
    numeroAutorizacion: null,
    activo: false
  });

  // Lista de empresas para el voucher
  const empresasVoucher = [
    'LOGIRAN O RANZA',
    'ETERNIT',
    'NOVACERO',
    'RENE CHARDON',
    'FUND.TIERRA NUEVA (CARDENAL DE LA TORRE)',
    'HOSP.UN CANTO A LA VIDA (LAS CUADRAS)',
    'SUNCHEMICAL O SINCLAIR',
    'HYUNDAI/ASIACAR',
    'AUDESUR O NISSAN - AV MARISCAL SUCRE',
    'COLISIONES AUDESUR - AV TABIAZO',
    'FUNDACION MATILDE SUR',
    'FUND.MATILDE NORTE'
  ];

  // Función para pre-registrar voucher
  const preRegistrarVoucher = async () => {
    if (!telefono.trim() || !nombre.trim()) {
      setModal({ open: true, success: false, message: 'Debe ingresar teléfono y nombre para pre-registrar voucher.' });
      return;
    }

    try {
      // Obtener el último número de autorización
      const vouchersRef = collection(db, 'voucherCorporativos');
      const q = query(vouchersRef, orderBy('numeroAutorizacion', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      
      let numeroAutorizacion = 40000; // Número inicial
      
      if (!querySnapshot.empty) {
        const ultimoVoucher = querySnapshot.docs[0].data();
        numeroAutorizacion = Math.max(40000, (ultimoVoucher.numeroAutorizacion || 39999) + 1);
      }

      // Guardar pre-registro en Firestore
      const preRegistroData = {
        numeroAutorizacion: numeroAutorizacion,
        telefono: telefono,
        nombreCliente: nombre,
        direccion: direccion,
        fechaPreRegistro: new Date(),
        estado: 'Pre-Registrado',
        activo: true
      };

      await addDoc(collection(db, 'voucherCorporativos'), preRegistroData);

      setPreRegistroVoucher({
        numeroAutorizacion: numeroAutorizacion,
        activo: true
      });

      console.log('✅ Voucher pre-registrado con número:', numeroAutorizacion);
      setModal({ open: true, success: true, message: `Voucher pre-registrado exitosamente. Número de autorización: ${numeroAutorizacion}` });
    } catch (error) {
      console.error('❌ Error al pre-registrar voucher:', error);
      setModal({ open: true, success: false, message: 'Error al pre-registrar el voucher.' });
    }
  };

  // Función para generar voucher
  const generarVoucher = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const pedido = modalAccionesPedido.pedido;
      
      // Preparar datos del voucher
      const voucherData = {
        fechaHora: new Date().toLocaleString('es-EC'),
        nombreCliente: pedido.nombreCliente || pedido.codigo || 'N/A',
        telefono: pedido.telefono || 'N/A',
        direccion: pedido.direccion || 'N/A',
        destino: '', // Campo vacío para que el usuario lo digite
        valor: pedido.valor || '0.00',
        motivo: '',
        informacionViaje: `Base: ${pedido.base || 'N/A'}, Tiempo: ${pedido.tiempo || 'N/A'}, Unidad: ${pedido.unidad || 'N/A'}`,
        numeroUnidad: pedido.unidad || '',
        empresa: ''
      };

      setModalVoucher({
        open: true,
        voucher: voucherData
      });

      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al preparar voucher:', error);
      setModal({ open: true, success: false, message: 'Error al preparar el voucher.' });
    }
  };

  // Función para cerrar modal de voucher
  const cerrarModalVoucher = () => {
    setModalVoucher({
      open: false,
      voucher: {
        fechaHora: '',
        nombreCliente: '',
        telefono: '',
        direccion: '',
        destino: '',
        valor: '',
        motivo: '',
        informacionViaje: '',
        numeroUnidad: '',
        empresa: ''
      }
    });
    
    // Limpiar pre-registro cuando se cierra el modal
    setPreRegistroVoucher({
      numeroAutorizacion: null,
      activo: false
    });
  };

  // Función para guardar voucher
  const guardarVoucher = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      let numeroAutorizacion = 40000; // Número inicial
      
      // Si hay un pre-registro activo, usar ese número
      if (preRegistroVoucher.activo && preRegistroVoucher.numeroAutorizacion) {
        numeroAutorizacion = preRegistroVoucher.numeroAutorizacion;
      } else {
        // Obtener el último número de autorización
        const vouchersRef = collection(db, 'voucherCorporativos');
        const q = query(vouchersRef, orderBy('numeroAutorizacion', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const ultimoVoucher = querySnapshot.docs[0].data();
          numeroAutorizacion = Math.max(40000, (ultimoVoucher.numeroAutorizacion || 39999) + 1);
        }
      }

      // Crear el voucher con número único
      const voucherData = {
        ...modalVoucher.voucher,
        numeroAutorizacion: numeroAutorizacion,
        fechaCreacion: new Date(),
        pedidoId: modalAccionesPedido.pedido?.id || 'N/A',
        estado: 'Activo'
      };

      // Guardar en voucherCorporativos
      await addDoc(collection(db, 'voucherCorporativos'), voucherData);

      // Aplicar la misma lógica que finalizarPedido
      const fechaActual = new Date();
      const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const pedidoRef = doc(db, modalAccionesPedido.coleccion, modalAccionesPedido.pedido.id);
      
      // Preparar datos del viaje finalizado tipo voucher
      const viajeVoucherFinalizadoData = {
        ...modalAccionesPedido.pedido,
        estado: 'Finalizado',
        pedido: 'Voucher',
        fechaFinalizacion: fechaActual,
        fechaRegistroFinalizacion: fechaActual,
        motivoFinalizacion: 'Voucher corporativo generado',
        numeroAutorizacionVoucher: numeroAutorizacion,
        voucherData: voucherData,
        esVoucher: true,
        colorFondo: '#fef3c7' // Color de fondo amarillo para vouchers
      };

      // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
      const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
      await setDoc(doc(db, rutaTodosLosViajes), viajeVoucherFinalizadoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log(`✅ Voucher generado y guardado en todosLosViajes: ${rutaTodosLosViajes}`);
      console.log('✅ Voucher guardado en voucherCorporativos con número:', numeroAutorizacion);
      
      // Actualizar contador de vouchers generados
      await actualizarContadorReporte('vouchersGenerados');
      
      setModal({ open: true, success: true, message: `Voucher generado exitosamente. Número de autorización: ${numeroAutorizacion}` });
      
      cerrarModalVoucher();
    } catch (error) {
      console.error('❌ Error al generar voucher:', error);
      setModal({ open: true, success: false, message: 'Error al generar el voucher.' });
    }
  };

  // Función para ver ubicación
  const verUbicacion = () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const pedido = modalAccionesPedido.pedido;
      const latitud = pedido.latitud || pedido.latitudConductor;
      const longitud = pedido.longitud || pedido.longitudConductor;
      
      if (latitud && longitud) {
        // Abrir Google Maps con las coordenadas
        const url = `https://www.google.com/maps?q=${latitud},${longitud}`;
        window.open(url, '_blank');
        console.log('📍 Abriendo ubicación en Google Maps:', url);
      } else {
        console.log('⚠️ No hay coordenadas disponibles para este pedido');
        setModal({ open: true, success: false, message: 'No hay coordenadas disponibles para este pedido.' });
      }
    } catch (error) {
      console.error('❌ Error al abrir ubicación:', error);
      setModal({ open: true, success: false, message: 'Error al abrir la ubicación.' });
    }
  };

  // Funciones para pedidos disponibles
  const cancelarPedidoSinAsignar = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const pedidoRef = doc(db, modalAccionesPedido.coleccion, modalAccionesPedido.pedido.id);
      
      // Actualizar el pedido original
      await updateDoc(pedidoRef, {
        estado: 'Cancelado por Cliente Sin Asignar',
        fechaCancelacion: new Date(),
        motivoCancelacion: 'Cancelado por el cliente sin asignar unidad'
      });

      // Guardar en todosLosViajes con la estructura de fecha
      const fechaActual = new Date();
      const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const viajeCanceladoData = {
        ...modalAccionesPedido.pedido,
        estado: 'Cancelado por Cliente Sin Asignar',
        fechaCancelacion: fechaActual,
        motivoCancelacion: 'Cancelado por el cliente sin asignar unidad',
        fechaRegistroCancelacion: fechaActual
      };

      // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
      const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
      await setDoc(doc(db, rutaTodosLosViajes), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido cancelado sin asignar, guardado en todosLosViajes y eliminado de la colección original');
      
      // Actualizar contador de viajes cancelados
      await actualizarContadorReporte('viajesCancelados');
      
      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al cancelar pedido sin asignar:', error);
      setModal({ open: true, success: false, message: 'Error al cancelar el pedido sin asignar.' });
    }
  };

  const noHuboUnidadDisponible = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const pedidoRef = doc(db, modalAccionesPedido.coleccion, modalAccionesPedido.pedido.id);
      
      // Actualizar el pedido original
      await updateDoc(pedidoRef, {
        estado: 'No Hubo Unidad Disponible',
        fechaCancelacion: new Date(),
        motivoCancelacion: 'No hubo unidad disponible para asignar'
      });

      // Guardar en todosLosViajes con la estructura de fecha
      const fechaActual = new Date();
      const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const viajeCanceladoData = {
        ...modalAccionesPedido.pedido,
        estado: 'No Hubo Unidad Disponible',
        fechaCancelacion: fechaActual,
        motivoCancelacion: 'No hubo unidad disponible para asignar',
        fechaRegistroCancelacion: fechaActual
      };

      // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
      const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
      await setDoc(doc(db, rutaTodosLosViajes), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido marcado como no hubo unidad disponible, guardado en todosLosViajes y eliminado de la colección original');
      
      // Actualizar contador de viajes cancelados
      await actualizarContadorReporte('viajesCancelados');
      
      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al marcar como no hubo unidad disponible:', error);
      setModal({ open: true, success: false, message: 'Error al marcar como no hubo unidad disponible.' });
    }
  };

  const generarReserva = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      // Aquí puedes implementar la lógica para generar la reserva
      console.log('📅 Generando reserva para pedido:', modalAccionesPedido.pedido.id);
      
      // Por ahora solo cerramos el modal
      cerrarModalAccionesPedido();
      setModal({ open: true, success: true, message: 'Reserva generada exitosamente.' });
    } catch (error) {
      console.error('❌ Error al generar reserva:', error);
      setModal({ open: true, success: false, message: 'Error al generar la reserva.' });
    }
  };

  // Función para cambiar estado del pedido
  const cambiarEstadoPedido = async (nuevoEstado) => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const pedidoRef = doc(db, modalAccionesPedido.coleccion, modalAccionesPedido.pedido.id);
      
      // Actualizar el pedido original
      await updateDoc(pedidoRef, {
        estado: nuevoEstado,
        fechaActualizacion: new Date()
      });

      // Si el estado es de cancelación o finalización, guardar también en todosLosViajes
      if (nuevoEstado === 'Cancelado' || nuevoEstado === 'Rechazado' || nuevoEstado === 'Finalizado') {
        const fechaActual = new Date();
        const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).replace(/\//g, '-');

        const viajeData = {
          ...modalAccionesPedido.pedido,
          estado: nuevoEstado,
          fechaFinalizacion: fechaActual,
          motivoFinalizacion: nuevoEstado === 'Cancelado' ? 'Pedido cancelado' : 
                             nuevoEstado === 'Rechazado' ? 'Pedido rechazado' : 
                             'Pedido finalizado',
          fechaRegistroFinalizacion: fechaActual
        };

        // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
        const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
        await setDoc(doc(db, rutaTodosLosViajes), viajeData);

        // Eliminar el documento original de la colección
        await deleteDoc(pedidoRef);

        console.log(`✅ Pedido ${nuevoEstado.toLowerCase()}, guardado en todosLosViajes y eliminado de la colección original`);
      } else {
        console.log(`✅ Estado del pedido cambiado a: ${nuevoEstado}`);
      }

      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al cambiar estado del pedido:', error);
      setModal({ open: true, success: false, message: 'Error al cambiar el estado del pedido.' });
    }
  };

  // Función específica para finalizar pedido
  const finalizarPedido = async () => {
    if (!modalAccionesPedido.pedido) return;

    try {
      const fechaActual = new Date();
      const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');

      const pedidoRef = doc(db, modalAccionesPedido.coleccion, modalAccionesPedido.pedido.id);
      
      // Preparar datos del viaje finalizado
      const viajeFinalizadoData = {
        ...modalAccionesPedido.pedido,
        estado: 'Finalizado',
        pedido: 'Finalizado',
        fechaFinalizacion: fechaActual,
        fechaRegistroFinalizacion: fechaActual,
        motivoFinalizacion: 'Pedido completado exitosamente',
        esViajeFinalizado: true,
        colorFondo: '#dbeafe' // Color de fondo azul claro para viajes finalizados
      };

      // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
      const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
      await setDoc(doc(db, rutaTodosLosViajes), viajeFinalizadoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log(`✅ Pedido finalizado y guardado en todosLosViajes: ${rutaTodosLosViajes}`);
      
      // Actualizar contador de viajes finalizados
      await actualizarContadorReporte('viajesFinalizados');
      
      setModal({ open: true, success: true, message: 'Pedido finalizado exitosamente.' });
      
      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al finalizar el pedido:', error);
      setModal({ open: true, success: false, message: 'Error al finalizar el pedido.' });
    }
  };

  // Función para iniciar edición de un viaje
  const iniciarEdicionViaje = (viaje) => {
    setEditandoViaje(viaje.id);
    setTiempoEdit(viaje.tiempo || '');
    setUnidadEdit(viaje.numeroUnidad || '');
    setBaseEdit(viaje.base || '0');
  };

   // Función para cancelar edición
     const cancelarEdicionViaje = () => {
    setEditandoViaje(null);
    setTiempoEdit('');
    setUnidadEdit('');
    setBaseEdit('0');
  };

   // Función para mover pedido de disponibles a en curso
   // Incluye el token del conductor para notificaciones push cuando se asigna manualmente
   const guardarEdicionViaje = async (viajeId) => {
     if (!baseEdit.trim() || !tiempoEdit.trim() || !unidadEdit.trim()) {
       setModal({ open: true, success: false, message: 'Por favor, ingrese base, tiempo y número de unidad.' });
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
         setModal({ open: true, success: false, message: `No se encontró un conductor con la unidad ${unidadEdit}. Por favor, ingrese una unidad válida.` });
         // NO hacer return, permitir que el usuario siga editando
         // NO limpiar el formulario, mantener los datos
         // Mantener el estado de edición activo
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
         base: convertirNumeroABase(baseEdit),
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

       // Registrar automáticamente en la colección de pedidos manuales
       try {
         const pedidoManualData = {
           ...pedidoEnCursoData,
           idOriginal: viajeId, // Referencia al documento original
           fechaRegistro: new Date(),
           tipo: 'manual',
           estadoRegistro: 'Registrado',
           modoRegistro: 'manual',
           origen: 'pedidosDisponibles' // Indicar de dónde viene
         };

         await addDoc(collection(db, 'pedidosManuales'), pedidoManualData);
         console.log('✅ Pedido manual registrado en colección separada (desde disponibles)');
       } catch (error) {
         console.error('❌ Error al registrar pedido manual:', error);
         // No fallar si no se puede registrar en la colección separada
       }

       // Cancelar edición - los listeners en tiempo real actualizarán automáticamente las tablas
       cancelarEdicionViaje();
       
       // Registro silencioso - sin mostrar alert de éxito
       console.log(`✅ Pedido movido silenciosamente a "En Curso" - Conductor: ${conductorData.nombre}, Unidad: ${unidadEdit}`);
       
       // Actualizar contador de viajes asignados
       await actualizarContadorReporte('viajesAsignados');
     } catch (error) {
       console.error('Error al mover el pedido:', error);
       setModal({ open: true, success: false, message: 'Error al mover el pedido a "En Curso".' });
     }
   };

 

  const handleSolicitarAplicacion = async () => {
    // Evitar múltiples inserciones simultáneas
    if (insertandoRegistro) {
      console.log('⚠️ Ya se está insertando un registro, esperando...');
      return;
    }
    
    setInsertandoRegistro(true);
    
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
        base: convertirNumeroABase(base || '0'), // Nuevo campo base
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
        tipoPedido: modoSeleccion === 'manual' ? 'Manual' : 'Automático',
        valor: '',
        central: false,
        coorporativo: false,
        llegue: false,
        puerto: '3020',
        randon: clave,
        rango: modoSeleccion === 'manual' ? '0' : (coordenadas ? '1' : '0'), // Rango 0 si es manual, 1 si hay coordenadas en aplicación
        viajes: unidad || '',
        foto: '0',
        tarifaSeleccionada: true,
        
        // Identificación del modo
        modoSeleccion: modoSeleccion
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
       
       // Limpiar formulario completo y enfocar teléfono
       limpiarFormularioCompleto();

     /// setModal({ open: true, success: true, message: '¡Pedido registrado directamente en la base de datos!' });
    } catch (error) {
      console.error('Error al registrar el pedido:', error);
      setModal({ open: true, success: false, message: 'Error al registrar el pedido en la base de datos.' });
    } finally {
      setInsertandoRegistro(false);
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


  // Modal de autenticación de operador
  if (mostrarModalOperador) {
    return (
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
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center'
        }}>
          <h2 style={{
            color: '#1f2937',
            marginBottom: '20px',
            fontSize: '24px',
            fontWeight: 'bold'
          }}>
            🔐 Autenticación de Operador
          </h2>
          
          <p style={{
            color: '#6b7280',
            marginBottom: '25px',
            fontSize: '14px'
          }}>
            Ingrese su usuario y código de operador para acceder al sistema
          </p>

          <input
            type="text"
            value={usuarioOperador}
            onChange={(e) => setUsuarioOperador(e.target.value)}
            placeholder="Usuario"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '16px',
              marginBottom: '15px',
              textAlign: 'center'
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                autenticarOperador();
              }
            }}
          />

          <input
            type="password"
            value={codigoOperador}
            onChange={(e) => setCodigoOperador(e.target.value)}
            placeholder="Código de 4 dígitos"
            maxLength="4"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '16px',
              marginBottom: '15px',
              textAlign: 'center',
              letterSpacing: '8px',
              fontFamily: 'monospace'
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                autenticarOperador();
              }
            }}
          />

          {errorAutenticacion && (
            <div style={{
              color: '#dc2626',
              fontSize: '14px',
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: '#fef2f2',
              borderRadius: '6px',
              border: '1px solid #fecaca'
            }}>
              {errorAutenticacion}
            </div>
          )}

          <button
            onClick={autenticarOperador}
            disabled={cargandoAutenticacion}
            style={{
              width: '100%',
              padding: '12px 20px',
              backgroundColor: cargandoAutenticacion ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: cargandoAutenticacion ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!cargandoAutenticacion) {
                e.target.style.backgroundColor = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (!cargandoAutenticacion) {
                e.target.style.backgroundColor = '#3b82f6';
              }
            }}
          >
            {cargandoAutenticacion ? '🔐 Autenticando...' : '🔐 Ingresar'}
          </button>
        </div>
      </div>
    );
  }

     return (
     <div style={{
       background: '#f3f4f6',
       padding: '20px',
       borderRadius: 8,
       border: '1px solid #d1d5db',
       width: '100%',
       maxWidth: '100%',
       minWidth: 'auto',
       fontFamily: 'Arial, sans-serif',
       boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
       boxSizing: 'border-box'
     }}>
      
      {/* Panel de información del operador y reportes diarios */}
      {operadorAutenticado && (
        <div style={{
          backgroundColor: '#ffffff',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '15px'
          }}>
            <div>
              <h3 style={{
                margin: '0 0 5px 0',
                color: '#1f2937',
                fontSize: '18px',
                fontWeight: 'bold'
              }}>
                👤 Operador: {operadorAutenticado.nombre}
              </h3>
              <p style={{
                margin: '0 0 3px 0',
                color: '#6b7280',
                fontSize: '14px'
              }}>
                👤 Usuario: {operadorAutenticado.usuario}
              </p>
              <p style={{
                margin: '0',
                color: '#6b7280',
                fontSize: '14px'
              }}>
                📊 Reporte Diario - {new Date().toLocaleDateString('es-EC')}
              </p>
            </div>
            <button
              onClick={cerrarSesionOperador}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#dc2626'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#ef4444'}
            >
              🚪 Cerrar Sesión
            </button>
          </div>

          {/* Contadores de reporte diario */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px'
          }}>
            <div style={{
              backgroundColor: '#dbeafe',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'center',
              border: '1px solid #bfdbfe'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>
                {reporteDiario.viajesRegistrados}
              </div>
              <div style={{ fontSize: '12px', color: '#374151' }}>
                🚗 Viajes Registrados
              </div>
            </div>

            <div style={{
              backgroundColor: '#d1fae5',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'center',
              border: '1px solid #a7f3d0'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#065f46' }}>
                {reporteDiario.viajesAsignados}
              </div>
              <div style={{ fontSize: '12px', color: '#374151' }}>
                ✅ Viajes Asignados
              </div>
            </div>

            <div style={{
              backgroundColor: '#fef3c7',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'center',
              border: '1px solid #fde68a'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#92400e' }}>
                {reporteDiario.viajesFinalizados}
              </div>
              <div style={{ fontSize: '12px', color: '#374151' }}>
                🏁 Viajes Finalizados
              </div>
            </div>

            <div style={{
              backgroundColor: '#fee2e2',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'center',
              border: '1px solid #fecaca'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#991b1b' }}>
                {reporteDiario.viajesCancelados}
              </div>
              <div style={{ fontSize: '12px', color: '#374151' }}>
                ❌ Viajes Cancelados
              </div>
            </div>

            <div style={{
              backgroundColor: '#f3e8ff',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'center',
              border: '1px solid #e9d5ff'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#7c3aed' }}>
                {reporteDiario.vouchersGenerados}
              </div>
              <div style={{ fontSize: '12px', color: '#374151' }}>
                🎫 Vouchers Generados
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          marginBottom: '15px',
          flexWrap: 'wrap'
        }}>
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
              fontSize: '18px',
              fontWeight: 'bold',
              minWidth: '180px',
              flex: '1 1 200px',
              backgroundColor: buscandoUsuario ? '#fef3c7' : 
                            usuarioEncontrado ? '#d1fae5' :
                            telefono.length >= 7 && !usuarioEncontrado ? '#fee2e2' : 'white'
            }}
          />
          <select 
            value={textoSeleccion}
            onChange={(e) => {
              const nuevoTexto = e.target.value;
              setTextoSeleccion(nuevoTexto);
              
              // Determinar el nuevo estado basado en el texto seleccionado
              const nuevoEstado = nuevoTexto === 'Selección Automática';
              
              // Actualizar la colección de configuración
              actualizarConfiguracion(nuevoEstado);
            }}
            style={{
              padding: '12px 16px',
              border: '2px solid #666',
              borderRadius: 4,
              fontSize: '18px',
              fontWeight: 'bold',
              minWidth: '180px',
              flex: '1 1 200px'
            }}
          >
            <option value="Selección Manual">Selección Manual</option>
            <option value="Selección Automática">Selección Automática</option>
          </select>
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          marginBottom: '15px',
          flexWrap: 'wrap'
        }}>
          <input
            type="text"
            placeholder="Ingrese nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '2px solid #666',
              borderRadius: 4,
              fontSize: '18px',
              fontWeight: 'bold',
              flex: '1 1 250px',
              minWidth: '200px'
            }}
          />
          <button
            type="button"
            onClick={preRegistrarVoucher}
            disabled={!telefono.trim() || !nombre.trim()}
            style={{
              padding: '12px 16px',
              background: (!telefono.trim() || !nombre.trim()) ? '#9ca3af' : '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: (!telefono.trim() || !nombre.trim()) ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease',
              flex: '0 0 auto',
              minWidth: '180px',
              opacity: (!telefono.trim() || !nombre.trim()) ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (telefono.trim() && nombre.trim()) {
                e.target.style.background = '#6d28d9';
              }
            }}
            onMouseLeave={(e) => {
              if (telefono.trim() && nombre.trim()) {
                e.target.style.background = '#7c3aed';
              }
            }}
          >
            {preRegistroVoucher.activo ? `🎫 Voucher #${preRegistroVoucher.numeroAutorizacion}` : '🎫 Pre-Registrar Voucher'}
          </button>
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
                fontSize: '18px',
                fontWeight: 'bold',
                flex: '1 1 250px',
                minWidth: '200px'
              }}
            />
          )}
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          marginBottom: '15px',
          flexWrap: 'wrap'
        }}>
          <input
            type="text"
            placeholder="Ingrese dirección"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation(); // Prevenir que el evento llegue al formulario
                handleInsertarViajePendiente();
              }
            }}
            style={{
              padding: '12px 16px',
              border: '2px solid #666',
              borderRadius: 4,
              fontSize: '18px',
              fontWeight: 'bold',
              flex: '1 1 300px',
              minWidth: '250px'
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
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: !coordenadas.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s ease',
                flex: '0 0 auto',
                minWidth: '150px',
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
                 ref={baseInputRef}
                 type="text"
                 placeholder="Base"
                 value={base}
                 onChange={(e) => {
                   const valor = e.target.value;
                   // Solo permitir 01, 02, 03 (máximo 2 dígitos)
                   if (valor === '' || valor === '0' || valor === '01' || valor === '02' || valor === '03') {
                     setBase(valor);
                     // Si se completaron 2 dígitos, saltar al campo tiempo
                     if (valor.length === 2) {
                       setTimeout(() => {
                         if (tiempoInputRef.current) {
                           tiempoInputRef.current.focus();
                           console.log('🎯 Saltando automáticamente al campo tiempo');
                         }
                       }, 50);
                     }
                   }
                 }}
                 maxLength="2"
                 style={{
                   padding: '12px 16px',
                   border: '2px solid #666',
                   borderRadius: 4,
                   fontSize: '18px',
                   fontWeight: 'bold',
                   width: 100
                 }}
               />
               <input
                 ref={tiempoInputRef}
                 type="text"
                 placeholder="Tiempo"
                 value={tiempo}
                 onChange={(e) => {
                   const valor = e.target.value;
                   // Solo permitir números y máximo 2 dígitos
                   if (/^\d{0,2}$/.test(valor)) {
                     setTiempo(valor);
                     // Si se completaron 2 dígitos, saltar al campo unidad
                     if (valor.length === 2) {
                       setTimeout(() => {
                         if (unidadInputRef.current) {
                           unidadInputRef.current.focus();
                           console.log('🎯 Saltando automáticamente al campo unidad');
                         }
                       }, 50);
                     }
                   }
                 }}
                 maxLength="2"
                 style={{
                   padding: '12px 16px',
                   border: '2px solid #666',
                   borderRadius: 4,
                   fontSize: '18px',
                   fontWeight: 'bold',
                   width: 100
                 }}
               />
               <input
                  ref={unidadInputRef}
                  type="text"
                  placeholder="Unidad"
                  value={unidad}
                  onChange={(e) => setUnidad(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation(); // Prevenir que el evento llegue al formulario
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
                   opacity: (!tiempo.trim() || !unidad.trim()) ? 0.6 : 1,
                   display: 'none'
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
                   minWidth: 120,
                   display: 'none'
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
                // Solo limpiar el formulario si no es un mensaje de registro de cliente
                // Y NO limpiar si es un mensaje de unidad no encontrada
                if (!modal.message.includes('registrado') && 
                    !modal.message.includes('cliente') && 
                    !modal.message.includes('unidad') && 
                    !modal.message.includes('conductor')) {
                  limpiarFormulario();
                }
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
          <div style={{ 
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              minWidth: '600px'
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
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     🏘️ Sector
                   </th>
                   <th style={{
                     padding: '12px 16px',
                     textAlign: 'center',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap'
                   }}>
                     🏢 Base
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
                       color: '#374151',
                       maxWidth: 150,
                       overflow: 'hidden',
                       textOverflow: 'ellipsis',
                       whiteSpace: 'nowrap'
                     }}>
                       {viaje.destino || '-'}
                     </td>
                     <td style={{
                       padding: '12px 16px',
                       textAlign: 'center',
                       fontWeight: 'bold',
                       color: '#7c3aed'
                     }}>
                       {!viaje.base ? (
                         <input
                           type="text"
                           value={editandoViaje === viaje.id ? baseEdit : ''}
                           onChange={(e) => {
                             const valor = e.target.value;
                             // Solo permitir 01, 02, 03 (máximo 2 dígitos)
                             if (valor === '' || valor === '0' || valor === '01' || valor === '02' || valor === '03') {
                               if (editandoViaje !== viaje.id) {
                                 iniciarEdicionViaje(viaje);
                               }
                               setBaseEdit(valor);
                             }
                           }}
                           maxLength="2"
                           style={{
                             width: '80px',
                             padding: '4px 8px',
                             border: '1px solid #ccc',
                             borderRadius: 4,
                             textAlign: 'center',
                             fontSize: 12,
                             fontWeight: 'bold'
                           }}
                           placeholder="Base"
                         />
                       ) : (
                         viaje.base
                       )}
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
                           const valor = e.target.value;
                           // Solo permitir números y máximo 2 dígitos
                           if (/^\d{0,2}$/.test(valor)) {
                           if (editandoViaje !== viaje.id) {
                             iniciarEdicionViaje(viaje);
                           }
                             setTiempoEdit(valor);
                           }
                         }}
                         maxLength="2"
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
                                e.stopPropagation(); // Prevenir propagación del evento
                                if (baseEdit.trim() && tiempoEdit.trim() && unidadEdit.trim()) {
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
                          onClick={() => abrirModalAccionesPedido(viaje, 'pedidosDisponibles')}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 20,
                            border: 'none',
                            fontSize: 12,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            background: (viaje.tiempo && viaje.numeroUnidad) ? '#10b981' : '#f59e0b',
                            color: 'white',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.05)';
                            e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                            e.target.style.boxShadow = 'none';
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
          <div style={{ 
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              minWidth: '600px'
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
                    🏢 Base
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
                {pedidosEnCurso.map((pedido, index) => {
                  // Determinar si el pedido está iniciado (solo para pedidos de aplicación)
                  const esPedidoIniciado = pedido.tipopedido === 'Automático' && pedido.pedido === 'Iniciado';
                  
                  return (
                    <tr
                      key={pedido.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: esPedidoIniciado 
                          ? '#fef3c7' // Color amarillo claro para pedidos iniciados
                          : (index % 2 === 0 ? '#fff' : '#fafbff'),
                        transition: 'background 0.2s ease',
                        borderLeft: esPedidoIniciado ? '4px solid #f59e0b' : 'none' // Borde naranja para destacar
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = esPedidoIniciado ? '#fde68a' : '#fef2f2';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = esPedidoIniciado 
                          ? '#fef3c7' 
                          : (index % 2 === 0 ? '#fff' : '#fafbff');
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
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#7c3aed'
                    }}>
                      {pedido.base || '-'}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center'
                    }}>
                      <button
                        onClick={() => abrirModalAccionesPedido(pedido, 'pedidoEnCurso')}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 20,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          background: pedido.tipopedido === 'Automático' ? '#3b82f6' : '#059669',
                          color: 'white',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.transform = 'scale(1.05)';
                          e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.transform = 'scale(1)';
                          e.target.style.boxShadow = 'none';
                        }}
                      >
                        {pedido.tipopedido === 'Automático' ? 'Aplicación' : 'Manual'}
                      </button>
                    </td>
                  </tr>
                );
              })}
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

      {/* Modal de acciones del pedido */}
      {modalAccionesPedido.open && (
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
            width: '500px',
            maxWidth: '90vw',
            textAlign: 'center'
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              color: '#1f2937',
              fontSize: '20px',
              fontWeight: 'bold'
            }}>
              🎛️ Acciones del Pedido
            </h3>
            
            <div style={{
              marginBottom: '20px',
              padding: '15px',
              background: '#f8fafc',
              borderRadius: '8px',
              textAlign: 'left'
            }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#374151' }}>
                📞 Cliente: {modalAccionesPedido.pedido?.nombreCliente || modalAccionesPedido.pedido?.codigo || 'N/A'}
              </p>
              <p style={{ margin: '0 0 10px 0', color: '#6b7280' }}>
                📍 Dirección: {modalAccionesPedido.pedido?.direccion || 'N/A'}
              </p>
              <p style={{ margin: '0', color: '#6b7280' }}>
                🏷️ Tipo: {modalAccionesPedido.pedido?.tipopedido === 'Automático' ? 'Aplicación' : 'Manual'}
              </p>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {/* Botones para pedidos en curso */}
              {modalAccionesPedido.coleccion === 'pedidoEnCurso' && (
                <>
              <button
                onClick={cancelarPedidoPorCliente}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#b91c1c';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#dc2626';
                }}
              >
                    ❌ Cancelado por Cliente
              </button>

              <button
                    onClick={cancelarPedidoPorUnidad}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#ef4444';
                }}
              >
                    🚫 Cancelado por Unidad
              </button>

              <button
                    onClick={generarVoucher}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#6d28d9';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#7c3aed';
                }}
              >
                    🎫 Generar Voucher
              </button>

              <button
                    onClick={finalizarPedido}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                      backgroundColor: '#10b981',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#059669';
                }}
                onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#10b981';
                }}
              >
                    🏁 Finalizar Pedido
              </button>

                  {/* Botón Ver Ubicación - Solo para pedidos de aplicación */}
                  {modalAccionesPedido.pedido?.tipopedido === 'Automático' && (
              <button
                      onClick={verUbicacion}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                        backgroundColor: '#3b82f6',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#3b82f6';
                }}
              >
                      📍 Ver Ubicación
              </button>
                  )}
                </>
              )}

              {/* Botones para pedidos disponibles */}
              {modalAccionesPedido.coleccion === 'pedidosDisponibles' && (
                <>
                  <button
                    onClick={cancelarPedidoSinAsignar}
                    style={{
                      padding: '12px 20px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#b91c1c';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#dc2626';
                    }}
                  >
                    ❌ Cancelado por Cliente Sin Asignar
                  </button>

                  <button
                    onClick={noHuboUnidadDisponible}
                    style={{
                      padding: '12px 20px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#dc2626';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#ef4444';
                    }}
                  >
                    🚫 No Hubo Unidad Disponible
                  </button>

                  <button
                    onClick={generarReserva}
                    style={{
                      padding: '12px 20px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: '#7c3aed',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#6d28d9';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#7c3aed';
                    }}
                  >
                    📅 Generar Reserva
                  </button>
                </>
              )}

              <button
                onClick={cerrarModalAccionesPedido}
                style={{
                  padding: '12px 20px',
                  border: '2px solid #6b7280',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                ✖️ Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de voucher */}
      {modalVoucher.open && (
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
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              color: '#1f2937',
              fontSize: '20px',
              fontWeight: 'bold',
              textAlign: 'center'
            }}>
              🎫 Generar Voucher Corporativo
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
              marginBottom: '20px'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  📅 Fecha y Hora
                </label>
                <input
                  type="text"
                  value={modalVoucher.voucher.fechaHora}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, fechaHora: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  👤 Nombre del Cliente
                </label>
                <input
                  type="text"
                  value={modalVoucher.voucher.nombreCliente}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, nombreCliente: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  📞 Teléfono
                </label>
                <input
                  type="text"
                  value={modalVoucher.voucher.telefono}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, telefono: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  💰 Valor
                </label>
                <input
                  type="text"
                  value={modalVoucher.voucher.valor}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, valor: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  🚗 Número de Unidad
                </label>
                <input
                  type="text"
                  value={modalVoucher.voucher.numeroUnidad}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, numeroUnidad: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  🏢 Empresa
                </label>
                <select
                  value={modalVoucher.voucher.empresa}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, empresa: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Seleccione una empresa</option>
                  {empresasVoucher.map((empresa, index) => (
                    <option key={index} value={empresa}>
                      {empresa}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  📍 Dirección
                </label>
                <input
                  type="text"
                  value={modalVoucher.voucher.direccion}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, direccion: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  🎯 Destino
                </label>
                <input
                  type="text"
                  value={modalVoucher.voucher.destino}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, destino: e.target.value }
                  }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  📝 Motivo
                </label>
                <textarea
                  value={modalVoucher.voucher.motivo}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, motivo: e.target.value }
                  }))}
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  🚗 Información del Viaje
                </label>
                <textarea
                  value={modalVoucher.voucher.informacionViaje}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, informacionViaje: e.target.value }
                  }))}
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'center'
            }}>
              <button
                onClick={guardarVoucher}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#059669';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#10b981';
                }}
              >
                💾 Guardar Voucher
              </button>

              <button
                onClick={cerrarModalVoucher}
                style={{
                  padding: '12px 24px',
                  border: '2px solid #6b7280',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                ❌ Cancelar
              </button>
            </div>
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
  const [viewMode, setViewMode] = useState('cards'); // 'cards' o 'table'
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBy, setSearchBy] = useState('nombre'); // 'nombre' o 'unidad'
  const fileInputRef = useRef(null);

  const fetchConductores = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'conductores'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Limpiar URLs inválidas de los conductores
      const conductoresLimpios = limpiarURLsInvalidas(data);
      setConductores(conductoresLimpios);
      
      console.log('✅ Conductores cargados y URLs validadas');
    } catch (error) {
      console.error('Error al cargar conductores:', error);
      alert('Error al cargar conductores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConductores();
  }, []);

  const handleEdit = (index) => {
    const conductor = conductoresFiltrados[index];
    setEditIndex(conductor.id); // Usar el ID en lugar del índice
    setEditData({ ...conductor });
  };

  const handleCancel = () => {
    // Limpiar URL temporal si existe
    if (editData.foto && editData.foto.startsWith('blob:')) {
      URL.revokeObjectURL(editData.foto);
      console.log('🧹 URL temporal limpiada');
    }
    
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
      
      // Si hay una nueva foto, eliminar la foto anterior si existe
      if (editData.foto && editData.foto !== conductores.find(c => c.id === editData.id)?.foto) {
        const conductorOriginal = conductores.find(c => c.id === editData.id);
        if (conductorOriginal?.foto && conductorOriginal.foto.startsWith('https://firebasestorage.googleapis.com')) {
          try {
            // Extraer la ruta del archivo de la URL
            const urlParts = conductorOriginal.foto.split('/');
            const filePath = urlParts.slice(urlParts.indexOf('o') + 1, urlParts.indexOf('?')).join('/');
            const decodedPath = decodeURIComponent(filePath);
            const oldPhotoRef = ref(storage, decodedPath);
            await deleteObject(oldPhotoRef);
            console.log('✅ Foto anterior eliminada');
          } catch (deleteError) {
            console.warn('⚠️ No se pudo eliminar la foto anterior:', deleteError);
            // No bloquear la operación si falla la eliminación de la foto
          }
        }
      }
      
      // Preparar datos para guardar en Firestore
      const datosParaGuardar = { ...editData };
      
      // Validar y limpiar la foto antes de guardar
      if (datosParaGuardar.foto) {
        if (datosParaGuardar.foto.startsWith('blob:')) {
          console.log('⚠️ No guardando URL temporal (blob) en Firestore');
          delete datosParaGuardar.foto;
          alert('⚠️ La foto no se pudo subir a Firebase Storage. Se guardará sin foto.');
        } else if (datosParaGuardar.foto.startsWith('https://firebasestorage.googleapis.com')) {
          console.log('✅ Guardando URL de Firebase Storage en Firestore');
        } else {
          console.log('⚠️ URL de foto no válida, eliminando del documento');
          delete datosParaGuardar.foto;
        }
      }
      
      await updateDoc(conductorRef, datosParaGuardar);
      
      // Actualizar tanto el array original como el filtrado
      setConductores(prev => prev.map((c, i) => c.id === editData.id ? { ...editData } : c));
      
      setEditIndex(null);
      setEditData({});
      alert('Conductor actualizado exitosamente');
    } catch (error) {
      console.error('❌ Error al actualizar conductor:', error);
      alert('Error al actualizar conductor');
    }
  };

  const handleFotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log('📁 Archivo seleccionado:', file.name, 'Tamaño:', file.size, 'Tipo:', file.type);

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona solo archivos de imagen');
      return;
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen debe ser menor a 5MB');
      return;
    }

    // Crear URL temporal inmediatamente para preview
    const tempURL = URL.createObjectURL(file);
    setEditData(prev => ({ ...prev, foto: tempURL }));
    console.log('🖼️ Preview creado con URL temporal');

    try {
      // Verificar configuración de Firebase
      console.log('🔧 Verificando configuración de Firebase...');
      console.log('• Storage Bucket:', storage.app.options.storageBucket);
      console.log('• Project ID:', storage.app.options.projectId);

      // Verificar autenticación antes de subir
      const { auth } = await import('../firebaseConfig');
      const user = auth.currentUser;
      
      if (!user) {
        console.warn('⚠️ Usuario no autenticado, usando fallback local');
        alert('⚠️ Debes estar autenticado para subir fotos. La foto se guardará localmente.');
        return;
      }

      console.log('👤 Usuario autenticado:', user.email);

      // Crear referencia única para la imagen usando el ID del conductor
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `conductores/${editData.id || 'temp'}_${timestamp}.${fileExtension}`;
      const storageRef = ref(storage, fileName);

      console.log('📤 Iniciando subida a Firebase Storage:', fileName);
      console.log('📍 Ruta completa:', `gs://${storage.app.options.storageBucket}/${fileName}`);

      // Subir archivo a Firebase Storage
      console.log('⏳ Subiendo archivo...');
      const snapshot = await uploadBytes(storageRef, file);
      
      console.log('✅ Archivo subido exitosamente');
      console.log('📊 Bytes transferidos:', snapshot.bytesTransferred);
      
      // Obtener URL de descarga
      console.log('🔗 Obteniendo URL de descarga...');
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      console.log('✅ URL de descarga obtenida:', downloadURL);
      
      // Actualizar estado con la URL de Firebase Storage
      setEditData(prev => ({ ...prev, foto: downloadURL }));
      
      // Limpiar URL temporal
      URL.revokeObjectURL(tempURL);
      
      console.log('✅ Foto subida exitosamente a Firebase Storage');
      
      // Mostrar mensaje de éxito
      alert('✅ Foto subida exitosamente a Firebase Storage');
      
    } catch (error) {
      console.error('❌ Error al subir foto:', error);
      console.error('❌ Código de error:', error.code);
      console.error('❌ Mensaje de error:', error.message);
      
      // Mantener la URL temporal como fallback
      console.log('⚠️ Manteniendo URL temporal como fallback debido a error de subida');
      
      // Mostrar mensaje específico según el tipo de error
      let errorMessage = 'Error al subir la foto. Por favor intenta de nuevo.';
      
      if (error.code === 'storage/unauthorized') {
        errorMessage = 'Error de permisos. Verifica las reglas de Firebase Storage.';
      } else if (error.code === 'storage/cors') {
        errorMessage = 'Error de CORS. Verifica la configuración de dominios autorizados.';
      } else if (error.code === 'storage/network-request-failed') {
        errorMessage = 'Error de conexión. Verifica tu conexión a internet.';
      } else if (error.code === 'storage/bucket-not-found') {
        errorMessage = 'Bucket de Storage no encontrado. Verifica la configuración.';
      } else if (error.code === 'storage/object-not-found') {
        errorMessage = 'Objeto no encontrado en Storage.';
      } else if (error.code === 'storage/quota-exceeded') {
        errorMessage = 'Cuota de Storage excedida.';
      }
      
      console.warn('⚠️', errorMessage);
      alert(`⚠️ ${errorMessage}\n\nCódigo: ${error.code}\n\nLa foto se guardará localmente por ahora.`);
    }
  };

  // Cambia el estatus y lo guarda en Firestore inmediatamente
  const handleToggleEstatusDirecto = async (conductor, idx) => {
    const nuevoEstatus = !conductor.estatus;
    try {
      const conductorRef = doc(db, 'conductores', conductor.id);
      await updateDoc(conductorRef, { estatus: nuevoEstatus });
      
      // Actualizar por ID en lugar de por índice
      setConductores(prev => prev.map((c, i) => c.id === conductor.id ? { ...c, estatus: nuevoEstatus } : c));
    } catch (error) {
      alert('Error al actualizar estatus');
    }
  };

  const handleEliminarConductor = async (conductor) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar al conductor ${conductor.nombre}?\n\nEsta acción eliminará:\n• El conductor de la base de datos\n• Su foto de Firebase Storage (si existe)`)) {
      return;
    }

    try {
      console.log('🗑️ Iniciando eliminación del conductor:', conductor.nombre);
      
      // Eliminar foto de Firebase Storage si existe
      if (conductor.foto && conductor.foto.startsWith('https://firebasestorage.googleapis.com')) {
        try {
          console.log('📸 Eliminando foto de Firebase Storage...');
          
          // Extraer la ruta del archivo de la URL de Firebase Storage
          const urlParts = conductor.foto.split('/');
          const filePath = urlParts.slice(urlParts.indexOf('o') + 1, urlParts.indexOf('?')).join('/');
          const decodedPath = decodeURIComponent(filePath);
          
          console.log('🗂️ Ruta del archivo a eliminar:', decodedPath);
          
          const photoRef = ref(storage, decodedPath);
          await deleteObject(photoRef);
          
          console.log('✅ Foto eliminada exitosamente de Firebase Storage');
        } catch (deleteError) {
          console.warn('⚠️ No se pudo eliminar la foto de Storage:', deleteError);
          // Continuar con la eliminación del conductor aunque falle la eliminación de la foto
        }
      } else {
        console.log('ℹ️ No hay foto de Firebase Storage para eliminar');
      }

      // Eliminar documento de Firestore
      console.log('📄 Eliminando documento de Firestore...');
      const conductorRef = doc(db, 'conductores', conductor.id);
      await deleteDoc(conductorRef);
      
      console.log('✅ Documento eliminado exitosamente de Firestore');
      
      // Actualizar estado local
      setConductores(prev => prev.filter(c => c.id !== conductor.id));
      
      console.log('✅ Estado local actualizado');
      
      alert('✅ Conductor eliminado exitosamente');
    } catch (error) {
      console.error('❌ Error al eliminar conductor:', error);
      
      let errorMessage = 'Error al eliminar conductor';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'No tienes permisos para eliminar conductores';
      } else if (error.code === 'not-found') {
        errorMessage = 'El conductor no fue encontrado';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Servicio no disponible. Intenta de nuevo';
      }
      
      alert(`❌ ${errorMessage}`);
    }
  };

  // Filtrar conductores basado en búsqueda
  const conductoresFiltrados = conductores.filter(conductor => {
    if (!searchTerm) return true;
    
    const termino = searchTerm.toLowerCase();
    
    if (searchBy === 'nombre') {
      return conductor.nombre && conductor.nombre.toLowerCase().includes(termino);
    } else if (searchBy === 'unidad') {
      return conductor.unidad && conductor.unidad.toString().includes(termino);
    }
    
    return true;
  });

  // Función para obtener el índice real en el array original
  const getOriginalIndex = (filteredIndex) => {
    const conductor = conductoresFiltrados[filteredIndex];
    return conductores.findIndex(c => c.id === conductor.id);
  };

  // Función para verificar si una URL de imagen es válida
  const isImageUrlValid = (url) => {
    if (!url) return false;
    if (url.startsWith('blob:')) return true; // URLs temporales son válidas para preview
    if (url.startsWith('https://firebasestorage.googleapis.com')) return true; // URLs de Firebase Storage
    if (url.startsWith('https://') && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.gif'))) return true; // URLs de imágenes válidas
    return false;
  };

  // Función para limpiar URLs inválidas de los conductores
  const limpiarURLsInvalidas = (conductores) => {
    return conductores.map(conductor => {
      if (conductor.foto && !isImageUrlValid(conductor.foto)) {
        console.log('🧹 Limpiando URL inválida del conductor:', conductor.nombre);
        return { ...conductor, foto: null };
      }
      return conductor;
    });
  };

  // Función para obtener información de Firebase Storage
  const getStorageInfo = () => {
    console.log('📊 Información de Firebase Storage:');
    console.log('• Bucket:', storage.app.options.storageBucket);
    console.log('• Proyecto:', storage.app.options.projectId);
    console.log('• Configuración completa:', storage.app.options);
  };

  // Función para verificar conectividad con Firebase Storage
  const testStorageConnection = async () => {
    try {
      console.log('🔍 Probando conexión con Firebase Storage...');
      console.log('📍 Bucket:', storage.app.options.storageBucket);
      console.log('📍 Project ID:', storage.app.options.projectId);
      
      const testRef = ref(storage, 'test-connection.txt');
      const testBlob = new Blob(['test'], { type: 'text/plain' });
      
      console.log('📤 Subiendo archivo de prueba...');
      const snapshot = await uploadBytes(testRef, testBlob);
      console.log('✅ Archivo subido exitosamente');
      
      console.log('🗑️ Eliminando archivo de prueba...');
      await deleteObject(testRef);
      console.log('✅ Archivo eliminado exitosamente');
      
      console.log('✅ Conexión con Firebase Storage exitosa');
      return true;
    } catch (error) {
      console.error('❌ Error de conexión con Firebase Storage:', error);
      console.error('❌ Código de error:', error.code);
      console.error('❌ Mensaje de error:', error.message);
      
      if (error.code === 'storage/unauthorized') {
        console.error('❌ Error de permisos. Verifica las reglas de Storage.');
      } else if (error.code === 'storage/bucket-not-found') {
        console.error('❌ Bucket no encontrado. Verifica la configuración.');
      } else if (error.code === 'storage/cors') {
        console.error('❌ Error de CORS. Verifica dominios autorizados.');
      }
      
      return false;
    }
  };

  // Función para limpiar URLs inválidas en Firestore
  const limpiarURLsInvalidasEnFirestore = async () => {
    try {
      console.log('🧹 Iniciando limpieza de URLs inválidas en Firestore...');
      
      const querySnapshot = await getDocs(collection(db, 'conductores'));
      let actualizaciones = 0;
      
      for (const doc of querySnapshot.docs) {
        const conductor = doc.data();
        if (conductor.foto && !isImageUrlValid(conductor.foto)) {
          console.log(`🧹 Limpiando URL inválida del conductor: ${conductor.nombre}`);
          await updateDoc(doc.ref, { foto: null });
          actualizaciones++;
        }
      }
      
      console.log(`✅ Limpieza completada. ${actualizaciones} conductores actualizados.`);
      alert(`✅ Limpieza completada. ${actualizaciones} conductores actualizados.`);
      
      // Recargar conductores
      fetchConductores();
      
    } catch (error) {
      console.error('❌ Error durante la limpieza:', error);
      alert('❌ Error durante la limpieza de URLs inválidas');
    }
  };

  // Función para diagnosticar problemas de Firebase Storage
  const diagnosticarStorage = async () => {
    try {
      console.log('🔍 Iniciando diagnóstico de Firebase Storage...');
      
      // 1. Verificar configuración
      console.log('📊 Configuración de Firebase:');
      console.log('• Project ID:', storage.app.options.projectId);
      console.log('• Storage Bucket:', storage.app.options.storageBucket);
      console.log('• Auth Domain:', storage.app.options.authDomain);
      console.log('• API Key:', storage.app.options.apiKey ? '✅ Configurado' : '❌ No configurado');
      
      // 2. Verificar autenticación
      const { auth } = await import('../firebaseConfig');
      const user = auth.currentUser;
      console.log('👤 Usuario autenticado:', user ? user.email : 'No autenticado');
      
      // 3. Verificar variables de entorno
      console.log('🔧 Variables de entorno:');
      console.log('• REACT_APP_FIREBASE_STORAGE_BUCKET:', process.env.REACT_APP_FIREBASE_STORAGE_BUCKET);
      console.log('• REACT_APP_FIREBASE_PROJECT_ID:', process.env.REACT_APP_FIREBASE_PROJECT_ID);
      
      // 4. Probar conexión básica
      console.log('🌐 Probando conexión con Storage...');
      const testRef = ref(storage, 'test-diagnostico.txt');
      const testBlob = new Blob(['test'], { type: 'text/plain' });
      
      console.log('📤 Subiendo archivo de prueba...');
      const snapshot = await uploadBytes(testRef, testBlob);
      console.log('✅ Archivo subido exitosamente');
      
      console.log('🔗 Obteniendo URL de descarga...');
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log('✅ URL obtenida:', downloadURL);
      
      console.log('🗑️ Eliminando archivo de prueba...');
      await deleteObject(testRef);
      console.log('✅ Archivo eliminado exitosamente');
      
      alert('✅ Diagnóstico completado. Firebase Storage funciona correctamente.');
      
    } catch (error) {
      console.error('❌ Error en diagnóstico:', error);
      console.error('❌ Código de error:', error.code);
      console.error('❌ Mensaje de error:', error.message);
      
      let mensaje = 'Error desconocido en Firebase Storage.';
      
      if (error.code === 'storage/unauthorized') {
        mensaje = 'Error de permisos. Verifica las reglas de Storage.';
      } else if (error.code === 'storage/bucket-not-found') {
        mensaje = 'Bucket de Storage no encontrado. Verifica la configuración.';
      } else if (error.code === 'storage/network-request-failed') {
        mensaje = 'Error de red. Verifica tu conexión a internet.';
      } else if (error.code === 'storage/cors') {
        mensaje = 'Error de CORS. Verifica la configuración de dominios autorizados.';
      } else if (error.code === 'storage/object-not-found') {
        mensaje = 'Objeto no encontrado en Storage.';
      } else if (error.code === 'storage/quota-exceeded') {
        mensaje = 'Cuota de Storage excedida.';
      }
      
      alert(`❌ ${mensaje}\n\nCódigo de error: ${error.code}\n\nVerifica:\n1. Reglas de Storage\n2. Dominios autorizados\n3. Configuración del proyecto`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 20 }}>Gestión de Conductores</h2>
      
      {/* Controles de vista y búsqueda */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 15
      }}>
        {/* Controles de vista */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 'bold', color: '#374151' }}>Vista:</span>
          <button
            onClick={() => setViewMode('cards')}
            style={{
              background: viewMode === 'cards' ? '#3b82f6' : '#e5e7eb',
              color: viewMode === 'cards' ? 'white' : '#374151',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            🃏 Cuadros
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{
              background: viewMode === 'table' ? '#3b82f6' : '#e5e7eb',
              color: viewMode === 'table' ? 'white' : '#374151',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            📊 Tabla
          </button>
          <button
            onClick={async () => {
              getStorageInfo();
              const isConnected = await testStorageConnection();
              alert(isConnected ? '✅ Firebase Storage conectado correctamente' : '❌ Error de conexión con Firebase Storage');
            }}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 12
            }}
            title="Probar conexión con Firebase Storage"
          >
            🔧 Storage
          </button>
          <button
            onClick={limpiarURLsInvalidasEnFirestore}
            style={{
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 12
            }}
            title="Limpiar URLs inválidas en Firestore"
          >
            🧹 Limpiar URLs
          </button>
          <button
            onClick={diagnosticarStorage}
            style={{
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 12
            }}
            title="Diagnosticar problemas de Firebase Storage"
          >
            🔍 Diagnosticar
          </button>
        </div>

        {/* Controles de búsqueda */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', color: '#374151' }}>Buscar por:</span>
          <select
            value={searchBy}
            onChange={(e) => setSearchBy(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              background: 'white'
            }}
          >
            <option value="nombre">Nombre</option>
            <option value="unidad">Número de Unidad</option>
          </select>
          <input
            type="text"
            placeholder={`Buscar por ${searchBy === 'nombre' ? 'nombre' : 'unidad'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              minWidth: 200
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              ✕ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Información de resultados */}
      <div style={{ 
        marginBottom: 20, 
        padding: '10px 15px', 
        background: '#f3f4f6', 
        borderRadius: 6,
        fontSize: 14,
        color: '#6b7280'
      }}>
        Mostrando {conductoresFiltrados.length} de {conductores.length} conductores
        {searchTerm && ` (filtrado por "${searchTerm}")`}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
          Cargando conductores...
        </div>
      ) : conductoresFiltrados.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px 20px',
          color: '#6b7280',
          background: '#f9fafb',
          borderRadius: 12,
          border: '2px dashed #d1d5db'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>🔍</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
            No se encontraron conductores
          </div>
          <div style={{ fontSize: '14px' }}>
            {searchTerm ? 'Intenta con otros términos de búsqueda' : 'No hay conductores registrados'}
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'flex-start' }}>
          {conductoresFiltrados.map((conductor, idx) => (
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
                  {(() => {
                    const fotoUrl = editIndex === conductor.id ? (editData.foto || conductor.foto) : conductor.foto;
                    return isImageUrlValid(fotoUrl) ? (
                      <img
                        src={fotoUrl}
                        alt={conductor.nombre}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => {
                          console.warn('⚠️ Error al cargar imagen:', e.target.src);
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                        onLoad={(e) => {
                          console.log('✅ Imagen cargada exitosamente:', e.target.src);
                        }}
                      />
                    ) : null;
                  })()}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: (editIndex === conductor.id ? (editData.foto || conductor.foto) : conductor.foto) ? 'none' : 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f3f4f6',
                    color: '#6b7280',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}>
                    👤 {conductor.nombre ? conductor.nombre.charAt(0) : 'C'}
                  </div>
                </div>
                {editIndex === conductor.id && (
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
                  {editIndex === conductor.id ? (
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
                  {editIndex === conductor.id ? (
                    <input name="telefono" value={editData.telefono} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.telefono}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Unidad:</strong>
                  {editIndex === conductor.id ? (
                    <input name="unidad" value={editData.unidad} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.unidad}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Placa:</strong>
                  {editIndex === conductor.id ? (
                    <input name="placa" value={editData.placa || ''} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.placa || '-'}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Color:</strong>
                  {editIndex === conductor.id ? (
                    <input name="color" value={editData.color || ''} onChange={handleChange} style={{ flex: 1, padding: 7, borderRadius: 4, border: '1px solid #ccc' }} />
                  ) : (
                    <span style={{ flex: 1 }}>{conductor.color || '-'}</span>
                  )}
                </div>

              </div>
              {/* Botones de acción y estatus en la misma línea, centrados y del mismo tamaño */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
                {editIndex === conductor.id ? (
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
                        width: 120,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: 17
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
                    <button
                      onClick={() => handleEliminarConductor(conductor)}
                      style={{
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        padding: '14px 0',
                        width: 120,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: 17,
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.background = '#b91c1c'}
                      onMouseLeave={(e) => e.target.style.background = '#dc2626'}
                    >
                      🗑️ Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Vista de tabla
        <div style={{
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ 
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              minWidth: '800px'
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
                    👤 Conductor
                  </th>
                  <th style={{
                    padding: '15px 12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    📧 Correo
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
                    🚗 Unidad
                  </th>
                  <th style={{
                    padding: '15px 12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    🏷️ Placa
                  </th>
                  <th style={{
                    padding: '15px 12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    🎨 Color
                  </th>

                  <th style={{
                    padding: '15px 12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    📊 Estado
                  </th>
                  <th style={{
                    padding: '15px 12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    ⚙️ Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {conductoresFiltrados.map((conductor, idx) => (
                  <tr key={conductor.id} style={{
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
                      {editIndex === conductor.id ? (
                        <input 
                          name="nombre" 
                          value={editData.nombre} 
                          onChange={handleChange} 
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', width: '100%' }} 
                        />
                      ) : (
                        conductor.nombre
                      )}
                    </td>
                    <td style={{
                      padding: '12px',
                      color: '#6b7280'
                    }}>
                      {conductor.correo}
                    </td>
                    <td style={{
                      padding: '12px',
                      color: '#374151'
                    }}>
                      {editIndex === conductor.id ? (
                        <input 
                          name="telefono" 
                          value={editData.telefono} 
                          onChange={handleChange} 
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', width: '100%' }} 
                        />
                      ) : (
                        conductor.telefono
                      )}
                    </td>
                    <td style={{
                      padding: '12px',
                      color: '#374151'
                    }}>
                      {editIndex === conductor.id ? (
                        <input 
                          name="unidad" 
                          value={editData.unidad} 
                          onChange={handleChange} 
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', width: '100%' }} 
                        />
                      ) : (
                        conductor.unidad
                      )}
                    </td>
                    <td style={{
                      padding: '12px',
                      color: '#374151'
                    }}>
                      {editIndex === conductor.id ? (
                        <input 
                          name="placa" 
                          value={editData.placa || ''} 
                          onChange={handleChange} 
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', width: '100%' }} 
                        />
                      ) : (
                        conductor.placa || '-'
                      )}
                    </td>
                    <td style={{
                      padding: '12px',
                      color: '#374151'
                    }}>
                      {editIndex === conductor.id ? (
                        <input 
                          name="color" 
                          value={editData.color || ''} 
                          onChange={handleChange} 
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', width: '100%' }} 
                        />
                      ) : (
                        conductor.color || '-'
                      )}
                    </td>

                    <td style={{
                      padding: '12px'
                    }}>
                      <span style={{
                        background: conductor.estatus ? '#10b981' : '#ef4444',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }}>
                        {conductor.estatus ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{
                      padding: '12px'
                    }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {editIndex === idx ? (
                          <>
                            <button
                              onClick={handleSave}
                              style={{
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              ✅ Guardar
                            </button>
                            <button
                              onClick={handleCancel}
                              style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              ❌ Cancelar
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
                                borderRadius: 4,
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => handleToggleEstatusDirecto(conductor, idx)}
                              style={{
                                background: conductor.estatus ? '#ef4444' : '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              {conductor.estatus ? '❌ Desactivar' : '✅ Activar'}
                            </button>
                            <button
                              onClick={() => handleEliminarConductor(conductor)}
                              style={{
                                background: '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              🗑️ Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportesContent() {
  const [viajes, setViajes] = useState([]);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [horaInicio, setHoraInicio] = useState('00:00');
  const [horaFin, setHoraFin] = useState('23:59');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resumenEstados, setResumenEstados] = useState({});
  const [resumenTipos, setResumenTipos] = useState({});

  // Inicializar fechas por defecto al cargar el componente
  useEffect(() => {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const año = hoy.getFullYear();
    const fechaHoy = `${dia}-${mes}-${año}`;
    
    if (!fechaInicio && !fechaFin) {
      setFechaInicio(fechaHoy);
      setFechaFin(fechaHoy);
      // Cargar datos automáticamente después de un breve delay
      setTimeout(() => {
        cargarViajesPorRango(fechaHoy, fechaHoy);
      }, 100);
    }
  }, [fechaInicio, fechaFin]);

  // Función para obtener la fecha actual en formato DD-MM-YYYY
  const obtenerFechaActual = () => {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const año = hoy.getFullYear();
    return `${dia}-${mes}-${año}`;
  };

  // Función para calcular resumen de estados
  const calcularResumenEstados = (viajes) => {
    const resumen = {};
    viajes.forEach(viaje => {
      const estado = viaje.estado || viaje.pedido || 'Sin Estado';
      resumen[estado] = (resumen[estado] || 0) + 1;
    });
    return resumen;
  };

  // Función para calcular resumen de tipos de viaje
  const calcularResumenTipos = (viajes) => {
    const resumen = {};
    viajes.forEach(viaje => {
      const tipo = viaje.tipopedido || viaje.tipoViaje || 'Sin Tipo';
      resumen[tipo] = (resumen[tipo] || 0) + 1;
    });
    return resumen;
  };

  // Función para cargar viajes por rango de fechas
  const cargarViajesPorRango = async (fechaInicio, fechaFin) => {
    setCargando(true);
    setError('');
    
    try {
      console.log('📊 Cargando viajes desde:', fechaInicio, 'hasta:', fechaFin, 'hora inicio:', horaInicio, 'hora fin:', horaFin);
      
      const todosLosViajes = [];
      
      // Generar array de fechas entre fechaInicio y fechaFin
      const fechas = generarRangoFechas(fechaInicio, fechaFin);
      
      // Cargar viajes de cada fecha desde la estructura todosLosViajes
      for (const fecha of fechas) {
        try {
          const viajesRef = collection(db, 'todosLosViajes', fecha, 'viajes');
          console.log('🔍 Consultando colección:', `todosLosViajes/${fecha}/viajes`);
          
          const viajesSnapshot = await getDocs(viajesRef);
          
          viajesSnapshot.forEach((doc) => {
            const viajeData = doc.data();
            
            // Verificar si el viaje está dentro del rango de horas
            if (viajeData.fecha) {
              const fechaViaje = viajeData.fecha.toDate ? viajeData.fecha.toDate() : new Date(viajeData.fecha);
              const horaViaje = fechaViaje.getHours().toString().padStart(2, '0') + ':' + fechaViaje.getMinutes().toString().padStart(2, '0');
              
              // Solo incluir si está dentro del rango de horas
              if (horaViaje >= horaInicio && horaViaje <= horaFin) {
                const viaje = {
                  id: doc.id,
                  fecha: formatearFechaParaReporte(fecha),
                  ...viajeData
                };
                todosLosViajes.push(viaje);
                console.log('📄 Viaje encontrado:', doc.id, viaje.nombreCliente || viaje.nombre, 'hora:', horaViaje);
              }
            } else {
              // Si no tiene fecha, incluir de todas formas
              const viaje = {
                id: doc.id,
                fecha: formatearFechaParaReporte(fecha),
                ...viajeData
              };
              todosLosViajes.push(viaje);
              console.log('📄 Viaje encontrado (sin fecha):', doc.id, viaje.nombreCliente || viaje.nombre);
            }
          });
        } catch (error) {
          console.log(`⚠️ No se encontraron viajes para ${fecha}:`, error.message);
        }
      }
      
      // Verificar si hay más de 10 pedidos activos para evitar duplicación
      try {
        const pedidosEnCursoRef = collection(db, 'pedidoEnCurso');
        const pedidosEnCursoSnapshot = await getDocs(pedidosEnCursoRef);
        const totalPedidosActivos = pedidosEnCursoSnapshot.size;
        
        console.log(`📊 Pedidos activos detectados: ${totalPedidosActivos}`);
        
        // Solo cargar desde otras colecciones si hay menos de 10 pedidos activos
        if (totalPedidosActivos < 10) {
          console.log('📄 Cargando datos adicionales desde otras colecciones...');
          
          // Cargar desde pedidosDisponibles como respaldo
          try {
            const pedidosDisponiblesRef = collection(db, 'pedidosDisponibles');
            const pedidosSnapshot = await getDocs(pedidosDisponiblesRef);
            
            pedidosSnapshot.forEach((doc) => {
              const viaje = doc.data();
              const fechaViaje = viaje.fecha ? new Date(viaje.fecha.toDate ? viaje.fecha.toDate() : viaje.fecha) : null;
              
              if (fechaViaje) {
                // Verificar si está dentro del rango de fechas
                const fechaViajeFormateada = fechaViaje.toLocaleDateString('es-EC', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                }).replace(/\//g, '-');
                
                if (fechaViajeFormateada >= fechaInicio && fechaViajeFormateada <= fechaFin) {
                  // Verificar si está dentro del rango de horas
                  const horaViaje = fechaViaje.getHours().toString().padStart(2, '0') + ':' + fechaViaje.getMinutes().toString().padStart(2, '0');
                  
                  if (horaViaje >= horaInicio && horaViaje <= horaFin) {
                    const fechaFormateada = formatearFechaParaReporte(fechaViaje);
                    const viajeFormateado = {
                      id: doc.id,
                      fecha: fechaFormateada,
                      ...viaje
                    };
                    todosLosViajes.push(viajeFormateado);
                    console.log('📄 Viaje disponible encontrado:', doc.id, viaje.nombreCliente || viaje.nombre, 'hora:', horaViaje);
                  }
                }
              }
            });
          } catch (error) {
            console.log('⚠️ Error al cargar pedidosDisponibles:', error.message);
          }
          
          // Cargar desde pedidoEnCurso como respaldo
          pedidosEnCursoSnapshot.forEach((doc) => {
            const viaje = doc.data();
            const fechaViaje = viaje.fecha ? new Date(viaje.fecha.toDate ? viaje.fecha.toDate() : viaje.fecha) : null;
            
            if (fechaViaje) {
              // Verificar si está dentro del rango de fechas
              const fechaViajeFormateada = fechaViaje.toLocaleDateString('es-EC', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              }).replace(/\//g, '-');
              
              if (fechaViajeFormateada >= fechaInicio && fechaViajeFormateada <= fechaFin) {
                // Verificar si está dentro del rango de horas
                const horaViaje = fechaViaje.getHours().toString().padStart(2, '0') + ':' + fechaViaje.getMinutes().toString().padStart(2, '0');
                
                if (horaViaje >= horaInicio && horaViaje <= horaFin) {
                  const fechaFormateada = formatearFechaParaReporte(fechaViaje);
                  const viajeFormateado = {
                    id: doc.id,
                    fecha: fechaFormateada,
                    ...viaje
                  };
                  todosLosViajes.push(viajeFormateado);
                  console.log('📄 Viaje en curso encontrado:', doc.id, viaje.nombreCliente || viaje.nombre, 'hora:', horaViaje);
                }
              }
            }
          });
        } else {
          console.log('⚠️ Se detectaron 10+ pedidos activos. Solo cargando desde todosLosViajes para evitar duplicación.');
        }
      } catch (error) {
        console.log('⚠️ Error al verificar pedidos activos:', error.message);
      }
      
      // Ordenar por fecha más reciente primero
      todosLosViajes.sort((a, b) => {
        try {
          let fechaA = new Date(0);
          let fechaB = new Date(0);
          
          if (a.fecha) {
            if (typeof a.fecha === 'string') {
              if (a.fecha.includes('/')) {
                // Formato DD/MM/YYYY HH:MM o DD/MM/YYYY
                const partes = a.fecha.split(' ');
                if (partes.length >= 1) {
                  const fechaParte = partes[0];
                  fechaA = new Date(fechaParte.split('/').reverse().join('-'));
                }
              } else if (a.fecha.includes('-')) {
                // Formato DD-MM-YYYY
                fechaA = new Date(a.fecha.split('-').reverse().join('-'));
              } else {
                // Intentar parsear como fecha directa
                fechaA = new Date(a.fecha);
              }
            } else if (a.fecha instanceof Date) {
              fechaA = a.fecha;
            } else if (a.fecha.toDate) {
              // Timestamp de Firestore
              fechaA = a.fecha.toDate();
            }
          }
          
          if (b.fecha) {
            if (typeof b.fecha === 'string') {
              if (b.fecha.includes('/')) {
                // Formato DD/MM/YYYY HH:MM o DD/MM/YYYY
                const partes = b.fecha.split(' ');
                if (partes.length >= 1) {
                  const fechaParte = partes[0];
                  fechaB = new Date(fechaParte.split('/').reverse().join('-'));
                }
              } else if (b.fecha.includes('-')) {
                // Formato DD-MM-YYYY
                fechaB = new Date(b.fecha.split('-').reverse().join('-'));
              } else {
                // Intentar parsear como fecha directa
                fechaB = new Date(b.fecha);
              }
            } else if (b.fecha instanceof Date) {
              fechaB = b.fecha;
            } else if (b.fecha.toDate) {
              // Timestamp de Firestore
              fechaB = b.fecha.toDate();
            }
          }
          
          return fechaB - fechaA;
        } catch (error) {
          console.error('Error al ordenar fechas:', error);
          return 0;
        }
      });
      
      console.log(`✅ Se encontraron ${todosLosViajes.length} viajes en total`);
      setViajes(todosLosViajes);
      
      // Calcular resúmenes
      const resumenEstadosCalculado = calcularResumenEstados(todosLosViajes);
      const resumenTiposCalculado = calcularResumenTipos(todosLosViajes);
      setResumenEstados(resumenEstadosCalculado);
      setResumenTipos(resumenTiposCalculado);
      
      console.log('📊 Resumen de estados:', resumenEstadosCalculado);
      console.log('📊 Resumen de tipos:', resumenTiposCalculado);
      
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

  // Función para manejar cambio de hora inicio
  const handleHoraInicioChange = (e) => {
    setHoraInicio(e.target.value);
  };

  // Función para manejar cambio de hora fin
  const handleHoraFinChange = (e) => {
    setHoraFin(e.target.value);
  };

  // Función para aplicar filtros
  const aplicarFiltros = () => {
    if (fechaInicio && fechaFin) {
      console.log('🔍 Aplicando filtros:', { fechaInicio, fechaFin, horaInicio, horaFin });
      cargarViajesPorRango(fechaInicio, fechaFin);
    } else {
      console.warn('⚠️ Fechas no válidas para filtrar:', { fechaInicio, fechaFin });
      setError('Por favor, selecciona fechas de inicio y fin válidas.');
    }
  };

  // Función para formatear fecha para mostrar
  const formatearFechaMostrar = (fecha) => {
    if (!fecha) return 'N/A';
    
    // Si ya está en formato DD/MM/YYYY HH:MM, devolverlo tal como está
    if (typeof fecha === 'string' && fecha.includes('/') && fecha.includes(':')) {
      return fecha;
    }
    
    // Si ya está en formato DD/MM/YYYY, agregar hora
    if (typeof fecha === 'string' && fecha.includes('/') && !fecha.includes(':')) {
      return fecha + ' 00:00';
    }
    
    // Si está en formato DD-MM-YYYY
    if (typeof fecha === 'string' && fecha.includes('-')) {
    const partes = fecha.split('-');
      if (partes.length === 3) {
    const [dia, mes, año] = partes;
        return `${dia}/${mes}/${año} 00:00`;
      }
    }
    
    // Si es un timestamp de Firestore
    if (fecha.toDate && typeof fecha.toDate === 'function') {
      try {
        const fechaObj = fecha.toDate();
        const dia = String(fechaObj.getDate()).padStart(2, '0');
        const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
        const año = fechaObj.getFullYear();
        const hora = String(fechaObj.getHours()).padStart(2, '0');
        const minutos = String(fechaObj.getMinutes()).padStart(2, '0');
        return `${dia}/${mes}/${año} ${hora}:${minutos}`;
      } catch (error) {
        console.error('Error al formatear timestamp de Firestore:', error);
      }
    }
    
    // Si es un objeto Date o timestamp
    try {
      const fechaObj = new Date(fecha);
      if (!isNaN(fechaObj.getTime())) {
        const dia = String(fechaObj.getDate()).padStart(2, '0');
        const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
        const año = fechaObj.getFullYear();
        const hora = String(fechaObj.getHours()).padStart(2, '0');
        const minutos = String(fechaObj.getMinutes()).padStart(2, '0');
        return `${dia}/${mes}/${año} ${hora}:${minutos}`;
      }
    } catch (error) {
      console.error('Error al formatear fecha:', error);
    }
    
    return 'N/A';
  };

  // Función para formatear fecha para reporte
  const formatearFechaParaReporte = (fecha) => {
    if (!fecha) return 'N/A';
    
    try {
      let fechaObj;
      
      // Si es un timestamp de Firestore
      if (fecha.toDate && typeof fecha.toDate === 'function') {
        fechaObj = fecha.toDate();
      }
      // Si es un objeto Date
      else if (fecha instanceof Date) {
        fechaObj = fecha;
      }
      // Si es una cadena de fecha
      else if (typeof fecha === 'string') {
        fechaObj = new Date(fecha);
      }
      // Si es un timestamp (número)
      else if (typeof fecha === 'number') {
        fechaObj = new Date(fecha);
      }
      // Intentar parsear como fecha
      else {
        fechaObj = new Date(fecha);
      }
      
      if (isNaN(fechaObj.getTime())) {
        console.warn('Fecha inválida:', fecha);
        return 'N/A';
      }
      
      const dia = String(fechaObj.getDate()).padStart(2, '0');
      const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
      const año = fechaObj.getFullYear();
      const hora = String(fechaObj.getHours()).padStart(2, '0');
      const minutos = String(fechaObj.getMinutes()).padStart(2, '0');
      
      return `${dia}/${mes}/${año} ${hora}:${minutos}`;
    } catch (error) {
      console.error('Error al formatear fecha:', error, 'Fecha original:', fecha);
      return 'N/A';
    }
  };

  // Función para formatear valor monetario
  const formatearValor = (valor) => {
    if (!valor) return '$0.00';
    
    try {
      const numero = parseFloat(valor);
      if (isNaN(numero)) return '$0.00';
      
      return `$${numero.toFixed(2)}`;
    } catch (error) {
      console.error('Error al formatear valor:', error);
      return '$0.00';
    }
  };

  // Función para formatear tiempo
  const formatearTiempo = (tiempo, minutos) => {
    if (tiempo) {
      // Si ya está formateado como tiempo (HH:MM:SS)
      if (typeof tiempo === 'string' && tiempo.includes(':')) {
        return tiempo;
      }
    }
    
    if (minutos) {
      const mins = parseInt(minutos);
      if (!isNaN(mins)) {
        if (mins < 60) {
          return `${mins} min`;
        } else {
          const horas = Math.floor(mins / 60);
          const minsRestantes = mins % 60;
          return `${horas}h ${minsRestantes}min`;
        }
      }
    }
    
    return 'N/A';
  };

  // Función para obtener estado con color
  const obtenerEstadoConColor = (estado) => {
    const colores = {
      'Aceptado': '#10b981',
      'Finalizado': '#3b82f6',
      'Voucher': '#7c3aed', // Color púrpura para vouchers
      'En Curso': '#f59e0b',
      'Cancelado': '#ef4444',
      'Pendiente': '#6b7280',
      'Disponible': '#3b82f6',
      'Aceptado': '#10b981'
    };
    
    // Normalizar el estado para mejor comparación
    const estadoNormalizado = estado ? estado.toString().toLowerCase() : '';
    
    let color = '#6b7280'; // Color por defecto
    
    if (estadoNormalizado.includes('aceptado') || estadoNormalizado.includes('finalizado')) {
      color = '#10b981';
    } else if (estadoNormalizado.includes('voucher')) {
      color = '#7c3aed'; // Color púrpura para vouchers
    } else if (estadoNormalizado.includes('disponible')) {
      color = '#3b82f6';
    } else if (estadoNormalizado.includes('curso')) {
      color = '#f59e0b';
    } else if (estadoNormalizado.includes('cancelado')) {
      color = '#ef4444';
    } else if (estadoNormalizado.includes('pendiente')) {
      color = '#6b7280';
    }
    
    return {
      texto: estado || 'N/A',
      color: color
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
        
        {/* Filtros de fecha y hora */}
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
            <input
              type="time"
              value={horaInicio}
              onChange={handleHoraInicioChange}
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
            <input
              type="time"
              value={horaFin}
              onChange={handleHoraFinChange}
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
              Mostrando viajes del {formatearFechaMostrar(fechaInicio)} {horaInicio} al {formatearFechaMostrar(fechaFin)} {horaFin}
              {viajes.length > 0 && ` • ${viajes.length} viajes encontrados`}
            </span>
          )}
        </div>
      </div>

      {/* Resumen de estados y tipos */}
      {!cargando && !error && viajes.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '20px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}>
          {/* Resumen de Estados */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            flex: '1',
            minWidth: '300px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h4 style={{
              margin: '0 0 15px 0',
              color: '#1f2937',
              fontSize: '18px',
              fontWeight: 'bold'
            }}>
              📊 Resumen por Estado
            </h4>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {Object.entries(resumenEstados).map(([estado, cantidad]) => (
                <div key={estado} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0'
                }}>
                  <span style={{
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    {estado}
                  </span>
                  <span style={{
                    background: '#3b82f6',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {cantidad}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen de Tipos de Viaje */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            flex: '1',
            minWidth: '300px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h4 style={{
              margin: '0 0 15px 0',
              color: '#1f2937',
              fontSize: '18px',
              fontWeight: 'bold'
            }}>
              🚗 Resumen por Tipo de Viaje
            </h4>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {Object.entries(resumenTipos).map(([tipo, cantidad]) => (
                <div key={tipo} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0'
                }}>
                  <span style={{
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    {tipo}
                  </span>
                  <span style={{
                    background: '#10b981',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {cantidad}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                overflowX: 'auto',
                maxWidth: '100%'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                  minWidth: '1000px'
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
                          transition: 'background 0.2s',
                          backgroundColor: viaje.esVoucher ? '#fef3c7' : 
                                         viaje.esViajeFinalizado ? '#dbeafe' : 'white' // Amarillo para vouchers, azul para finalizados
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = viaje.esVoucher ? '#fde68a' : 
                                                           viaje.esViajeFinalizado ? '#bfdbfe' : '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = viaje.esVoucher ? '#fef3c7' : 
                                                           viaje.esViajeFinalizado ? '#dbeafe' : 'white';
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
                            {viaje.placa || 'Sin placa'} • {viaje.clave || viaje.viajes || 'N/A'}
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
                            {formatearValor(viaje.valor || viaje.montoTotalCalculado)}
                          </td>
                          <td style={{
                            padding: '12px',
                            color: '#374151'
                          }}>
                            {formatearTiempo(viaje.tiempoTotal, viaje.minutos)}
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
                            {viaje.nombre || viaje.codigo || viaje.idConductor || 'N/A'}
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

function OperadoresContent() {
  const [operadores, setOperadores] = useState([]);
  const [cargandoOperadores, setCargandoOperadores] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoOperador, setNuevoOperador] = useState({
    nombre: '',
    usuario: '',
    codigo: ''
  });
  const [errorFormulario, setErrorFormulario] = useState('');

  // Cargar operadores
  const cargarOperadores = async () => {
    setCargandoOperadores(true);
    try {
      const operadoresRef = collection(db, 'operadores');
      const snapshot = await getDocs(operadoresRef);
      const operadoresData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOperadores(operadoresData);
    } catch (error) {
      console.error('❌ Error al cargar operadores:', error);
    } finally {
      setCargandoOperadores(false);
    }
  };

  // Crear nuevo operador
  const crearOperador = async () => {
    if (!nuevoOperador.nombre.trim() || !nuevoOperador.usuario.trim() || !nuevoOperador.codigo.trim()) {
      setErrorFormulario('Todos los campos son obligatorios');
      return;
    }

    if (nuevoOperador.codigo.length !== 4 || !/^\d{4}$/.test(nuevoOperador.codigo)) {
      setErrorFormulario('El código debe tener exactamente 4 dígitos numéricos');
      return;
    }

    try {
      // Verificar si el usuario ya existe
      const operadoresRef = collection(db, 'operadores');
      const q = query(operadoresRef, where('usuario', '==', nuevoOperador.usuario));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        setErrorFormulario('El usuario ya existe');
        return;
      }

      // Verificar si el código ya existe
      const qCodigo = query(operadoresRef, where('codigo', '==', nuevoOperador.codigo));
      const snapshotCodigo = await getDocs(qCodigo);

      if (!snapshotCodigo.empty) {
        setErrorFormulario('El código ya existe');
        return;
      }

      // Crear el operador
      await addDoc(collection(db, 'operadores'), {
        nombre: nuevoOperador.nombre.trim(),
        usuario: nuevoOperador.usuario.trim(),
        codigo: nuevoOperador.codigo.trim(),
        fechaCreacion: new Date(),
        activo: true
      });

      setNuevoOperador({ nombre: '', usuario: '', codigo: '' });
      setErrorFormulario('');
      setMostrarFormulario(false);
      cargarOperadores();
      
      alert('✅ Operador creado exitosamente');
    } catch (error) {
      console.error('❌ Error al crear operador:', error);
      setErrorFormulario('Error al crear el operador');
    }
  };

  // Eliminar operador
  const eliminarOperador = async (operadorId) => {
    if (confirm('¿Está seguro de que desea eliminar este operador?')) {
      try {
        await deleteDoc(doc(db, 'operadores', operadorId));
        cargarOperadores();
        alert('✅ Operador eliminado exitosamente');
      } catch (error) {
        console.error('❌ Error al eliminar operador:', error);
        alert('❌ Error al eliminar el operador');
      }
    }
  };

  useEffect(() => {
    cargarOperadores();
  }, []);

  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f9fafb',
      minHeight: '100vh'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{
          color: '#1f2937',
          fontSize: '24px',
          fontWeight: 'bold',
          margin: 0
        }}>
          👥 Gestión de Operadores
        </h2>
        <button
          onClick={() => setMostrarFormulario(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
        >
          ➕ Crear Operador
        </button>
      </div>

      {/* Formulario para crear operador */}
      {mostrarFormulario && (
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '20px'
        }}>
          <h3 style={{
            color: '#1f2937',
            marginBottom: '15px',
            fontSize: '18px',
            fontWeight: 'bold'
          }}>
            📝 Crear Nuevo Operador
          </h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '5px',
              color: '#374151',
              fontWeight: '600'
            }}>
              Nombre Completo:
            </label>
            <input
              type="text"
              value={nuevoOperador.nombre}
              onChange={(e) => setNuevoOperador({...nuevoOperador, nombre: e.target.value})}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px'
              }}
              placeholder="Ingrese el nombre completo"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '5px',
              color: '#374151',
              fontWeight: '600'
            }}>
              Usuario:
            </label>
            <input
              type="text"
              value={nuevoOperador.usuario}
              onChange={(e) => setNuevoOperador({...nuevoOperador, usuario: e.target.value})}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px'
              }}
              placeholder="Ingrese el nombre de usuario"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '5px',
              color: '#374151',
              fontWeight: '600'
            }}>
              Código (4 dígitos):
            </label>
            <input
              type="password"
              value={nuevoOperador.codigo}
              onChange={(e) => setNuevoOperador({...nuevoOperador, codigo: e.target.value})}
              maxLength="4"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'monospace',
                letterSpacing: '4px'
              }}
              placeholder="0000"
            />
          </div>

          {errorFormulario && (
            <div style={{
              color: '#dc2626',
              fontSize: '14px',
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: '#fef2f2',
              borderRadius: '6px',
              border: '1px solid #fecaca'
            }}>
              {errorFormulario}
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: '10px'
          }}>
            <button
              onClick={crearOperador}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#059669'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#10b981'}
            >
              ✅ Crear Operador
            </button>
            <button
              onClick={() => {
                setMostrarFormulario(false);
                setNuevoOperador({ nombre: '', usuario: '', codigo: '' });
                setErrorFormulario('');
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
            >
              ❌ Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de operadores */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{
          color: '#1f2937',
          marginBottom: '15px',
          fontSize: '18px',
          fontWeight: 'bold'
        }}>
          📋 Lista de Operadores ({operadores.length})
        </h3>

        {cargandoOperadores ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: '#6b7280' }}>Cargando operadores...</p>
          </div>
        ) : operadores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: '#6b7280' }}>No hay operadores registrados</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gap: '15px'
          }}>
            {operadores.map((operador) => (
              <div key={operador.id} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '15px',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h4 style={{
                      margin: '0 0 5px 0',
                      color: '#1f2937',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}>
                      {operador.nombre}
                    </h4>
                    <p style={{
                      margin: '0 0 5px 0',
                      color: '#6b7280',
                      fontSize: '14px'
                    }}>
                      Usuario: {operador.usuario}
                    </p>
                    <p style={{
                      margin: '0',
                      color: '#6b7280',
                      fontSize: '14px'
                    }}>
                      Código: {'•'.repeat(4)}
                    </p>
                  </div>
                  <button
                    onClick={() => eliminarOperador(operador.id)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#dc2626'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#ef4444'}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
      case 'operadores':
        return <OperadoresContent />;
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
      overflow: 'auto',
      minWidth: 0,
      width: '100%'
    }}>
      {renderContent()}
    </main>
  );
}

export default MainContent; 



