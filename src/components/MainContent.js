  import React, { useState, useEffect, useRef, useCallback } from "react";
import { Wrapper, Status } from "@googlemaps/react-wrapper";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc, deleteDoc, onSnapshot, setDoc, orderBy, limit, increment, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebaseConfig";
import * as XLSX from 'xlsx';
import DriverTracking from './DriverTracking';
import ReporteViajes from './ReporteViajes';

// import axios from 'axios'; // Comentado porque no se usa

// Función para obtener y reservar el siguiente número de autorización (solo para vouchers completos)
const obtenerSiguienteAutorizacion = async () => {
  try {
    // Obtener el contador actual de autorizacionSecuencia
    const secuenciaRef = doc(db, 'autorizacionSecuencia', 'contador');
    const secuenciaDoc = await getDoc(secuenciaRef);
    
    let siguienteNumero = 200; // Número inicial según tu requerimiento
    
    if (secuenciaDoc.exists()) {
      const data = secuenciaDoc.data();
      siguienteNumero = (data.numero || 199) + 1;
    }

    // Actualizar el contador en autorizacionSecuencia
    await setDoc(secuenciaRef, {
      numero: siguienteNumero,
      ultimaActualizacion: new Date()
    }, { merge: true });

    console.log('✅ Autorización generada y contador actualizado:', siguienteNumero);
    return siguienteNumero;
  } catch (error) {
    console.error('Error al obtener siguiente autorización:', error);
    return 200;
  }
};

/**
 * Funcionalidad de tokens de conductores:
 * - Cuando se asigna manualmente una unidad/conductor, se incluye el token FCM del conductor
 * - El token se obtiene de los campos: tokenFCM, tokenConductor, etc.
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

  const handleCoordinatesSelect = useCallback((coords) => {
    if (onCoordinatesSelect) onCoordinatesSelect(coords);
  }, [onCoordinatesSelect]);

  const handleAddressSelect = useCallback((address) => {
    if (onAddressSelect) onAddressSelect(address);
  }, [onAddressSelect]);

  // Inicializar mapa y geocoder
  useEffect(() => {
    if (mapRef.current && !map && window.google && window.google.maps) {
      const newMap = new window.google.maps.Map(mapRef.current, {
        center: center || { lat: -0.22985, lng: -78.52495 },
        zoom: 13,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
      });
      setMap(newMap);
      setGeocoder(new window.google.maps.Geocoder());

      newMap.addListener('click', (event) => {
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        const nuevasCoordenadas = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        handleCoordinatesSelect(nuevasCoordenadas);
        if (geocoder) {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results[0]) {
              const address = results[0].formatted_address;
              handleAddressSelect(address);
              if (autocompleteInputRef.current) {
                autocompleteInputRef.current.value = address;
              }
            }
          });
        }
      });
    }
  }, [map, center, geocoder, handleCoordinatesSelect, handleAddressSelect]);

  // Inicializar Autocomplete
  useEffect(() => {
    if (map && autocompleteInputRef.current && !autocomplete && window.google?.maps?.places) {
      const newAutocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
        types: ['address'],
        componentRestrictions: { country: ['ec', 'ni'] },
        fields: ['formatted_address', 'geometry', 'name']
      });
      newAutocomplete.addListener('place_changed', () => {
        const place = newAutocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const nuevasCoordenadas = `${lat.toFixed(6)},${lng.toFixed(6)}`;
          const address = place.formatted_address || place.name;
          handleCoordinatesSelect(nuevasCoordenadas);
          handleAddressSelect(address);
          map.setCenter({ lat, lng });
          map.setZoom(15);
        }
      });
      setAutocomplete(newAutocomplete);
    }
  }, [map, autocomplete, handleCoordinatesSelect, handleAddressSelect]);

  // Actualizar marcador cuando cambian coordenadas
  useEffect(() => {
    if (map && coordenadas) {
      const [lat, lng] = (coordenadas || '').split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        const pos = { lat, lng };
        if (marker) marker.setMap(null);
        const newMarker = new window.google.maps.Marker({
          position: pos,
          map,
          title: 'Ubicación seleccionada',
          animation: window.google.maps.Animation.DROP,
          draggable: true,
        });
        newMarker.addListener('dragend', (event) => {
          const dragLat = event.latLng.lat();
          const dragLng = event.latLng.lng();
          const nuevasCoordenadas = `${dragLat.toFixed(6)},${dragLng.toFixed(6)}`;
          handleCoordinatesSelect(nuevasCoordenadas);
          if (geocoder) {
            geocoder.geocode({ location: { lat: dragLat, lng: dragLng } }, (results, status) => {
              if (status === 'OK' && results[0]) {
                const address = results[0].formatted_address;
                handleAddressSelect(address);
                if (autocompleteInputRef.current) {
                  autocompleteInputRef.current.value = address;
                }
              }
            });
          }
        });
        setMarker(newMarker);
        map.setCenter(pos);
      }
    }
  }, [map, coordenadas, marker, geocoder, handleCoordinatesSelect, handleAddressSelect]);

  // Sincronizar input de búsqueda con la dirección del formulario
  useEffect(() => {
    if (autocompleteInputRef.current && direccionFormulario && autocompleteInputRef.current.value !== direccionFormulario) {
      autocompleteInputRef.current.value = direccionFormulario;
    }
  }, [direccionFormulario]);

  const handleBuscarDireccion = () => {
    const address = autocompleteInputRef.current?.value;
    if (!address || !geocoder) return;
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        const nuevasCoordenadas = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        handleCoordinatesSelect(nuevasCoordenadas);
        handleAddressSelect(results[0].formatted_address);
        if (map) {
          map.setCenter({ lat, lng });
          map.setZoom(15);
        }
      }
    });
  };

  return (
    <div style={{ padding: 15 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <input
          ref={autocompleteInputRef}
          type="text"
          placeholder="Buscar dirección..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleBuscarDireccion();
            }
          }}
        />
        <button
          type="button"
          onClick={handleBuscarDireccion}
          style={{ padding: '8px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
        >
          🔍 Buscar
        </button>
      </div>
      <div ref={mapRef} style={{ width: '100%', height: 360, border: '2px solid #ddd', borderRadius: 8, background: '#f8f9fa' }} />
      <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
        💡 Escribe una dirección, haz clic en el mapa o arrastra el marcador para seleccionar ubicación
      </div>
    </div>
  );
}

// Selector con Wrapper y controles de visibilidad/coordenadas
function MapaSelector({ mapaVisible, setMapaVisible, onCoordinatesSelect, onAddressSelect, coordenadas, direccionFormulario, center }) {
  const [coordenadasTemp, setCoordenadasTemp] = useState(coordenadas || '');

  useEffect(() => {
    setCoordenadasTemp(coordenadas || '');
  }, [coordenadas]);

  const render = (status) => {
    switch (status) {
      case Status.LOADING:
        return (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, background: '#f3f4f6', borderRadius: 8, border: '2px solid #d1d5db' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>🗺️</div>
              <div>Cargando Google Maps...</div>
            </div>
          </div>
        );
      case Status.FAILURE:
        return (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, background: '#fee2e2', borderRadius: 8, border: '2px solid #fecaca', color: '#dc2626' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>❌</div>
              <div>Error al cargar Google Maps</div>
              <div style={{ fontSize: 12, marginTop: 5 }}>Verifique la conexión a internet y la API key</div>
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
            center={center}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>🗺️ Google Maps - Selector de Coordenadas</h3>
        <button
          type="button"
          onClick={() => setMapaVisible(!mapaVisible)}
          style={{ padding: '8px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
        >
          {mapaVisible ? 'Ocultar Mapa' : 'Mostrar Mapa'}
        </button>
      </div>

      {mapaVisible && (
        <div style={{ border: '2px solid #ccc', borderRadius: 8, background: '#f8f9fa', overflow: 'hidden' }}>
          <Wrapper apiKey={GOOGLE_MAPS_API_KEY} render={render} libraries={['places']} />

          {/* Controles de coordenadas manuales */}
          <div style={{ padding: 15, borderTop: '1px solid #ddd', background: 'white' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 'bold' }}>Coordenadas:</span>
              <input
                type="text"
                value={coordenadasTemp}
                onChange={(e) => setCoordenadasTemp(e.target.value)}
                onBlur={(e) => onCoordinatesSelect(e.target.value)}
                placeholder="Lat,Lng (ej: -0.2298500,-78.5249500)"
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
              />
              <button
                type="button"
                onClick={async () => {
                  await onCoordinatesSelect(coordenadasTemp);
                  setMapaVisible(false);
                }}
                style={{ padding: '8px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
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
// Formulario principal de Taxi
function TaxiForm({ operadorAutenticado, setOperadorAutenticado, reporteDiario, setReporteDiario, authTrigger, setIsCollapsed }) {
  // Estados para autenticación de operadores
  const [mostrarModalOperador, setMostrarModalOperador] = useState(false);
  const [codigoOperador, setCodigoOperador] = useState('');
  const [errorAutenticacion, setErrorAutenticacion] = useState('');
  const [cargandoAutenticacion, setCargandoAutenticacion] = useState(false);
  const [siguienteNumeroAutorizacion, setSiguienteNumeroAutorizacion] = useState(40000);

  // Abrir modal cuando se dispare authTrigger desde el Header
  useEffect(() => {
    if (authTrigger > 0) {
      setMostrarModalOperador(true);
      setCodigoOperador('');
      setErrorAutenticacion('');
    }
  }, [authTrigger]);

  // Restaurar operadora autenticada desde localStorage al montar el formulario
  useEffect(() => {
    try {
      if (!operadorAutenticado) {
        const saved = localStorage.getItem('operadorAutenticado');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.nombre) {
            setOperadorAutenticado(parsed);
          }
        }
      }
    } catch (e) {
      console.error('Error restaurando operadorAutenticado en TaxiForm:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Función para obtener el siguiente número de autorización
  const obtenerSiguienteNumeroAutorizacion = async () => {
    try {
      const vouchersRef = collection(db, 'voucherCorporativos');
      const q = query(vouchersRef, orderBy('numeroAutorizacion', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const ultimoVoucher = querySnapshot.docs[0].data();
        console.log('Último voucher encontrado:', ultimoVoucher.numeroAutorizacion);
        const siguienteNumero = Math.max(40000, (ultimoVoucher.numeroAutorizacion || 39999) + 1);
        console.log('Siguiente número calculado:', siguienteNumero);
        setSiguienteNumeroAutorizacion(siguienteNumero);
      } else {
        setSiguienteNumeroAutorizacion(40000);
      }
    } catch (error) {
      console.error('Error al obtener número de autorización:', error);
      setSiguienteNumeroAutorizacion(40000);
    }
  };

  // Función para obtener la siguiente autorización sin generarla (solo para mostrar)
  const obtenerSiguienteAutorizacionParaMostrar = async () => {
    try {
      // Obtener el contador actual de autorizacionSecuencia
      const secuenciaRef = doc(db, 'autorizacionSecuencia', 'contador');
      const secuenciaDoc = await getDoc(secuenciaRef);
      
      let siguienteNumero = 200; // Número inicial según tu requerimiento
      
      if (secuenciaDoc.exists()) {
        const data = secuenciaDoc.data();
        siguienteNumero = (data.numero || 199) + 1;
      }

      return siguienteNumero;
    } catch (error) {
      console.error('Error al obtener siguiente autorización para mostrar:', error);
      return 200;
    }
  };


  


  // Función para autenticar operador
  const autenticarOperador = async () => {
    if (!codigoOperador || codigoOperador.length !== 4 || !/^\d{4}$/.test(codigoOperador)) {
      setErrorAutenticacion('El código debe tener exactamente 4 dígitos numéricos');
      return;
    }

    setCargandoAutenticacion(true);
    setErrorAutenticacion('');

    try {
      const operadoresRef = collection(db, 'operadores');
      const q = query(operadoresRef, 
        where('codigo', '==', codigoOperador)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const operador = snapshot.docs[0].data();
        const operadorState = {
          id: snapshot.docs[0].id,
          nombre: operador.nombre,
          usuario: operador.usuario,
          codigo: operador.codigo
        };
        setOperadorAutenticado(operadorState);
        try { localStorage.setItem('operadorAutenticado', JSON.stringify(operadorState)); } catch {}
        setMostrarModalOperador(false);
        console.log('✅ Operador autenticado:', operador.nombre);
        
        // Cargar reporte diario del operador
        await cargarReporteDiario(operador.nombre);
      } else {
        setErrorAutenticacion('Código incorrecto');
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
          viajesCanceladosPorCliente: 0,
          viajesCanceladosPorConductor: 0,
          viajesSinUnidad: 0,
          viajesFinalizados: 0,
          vouchersGenerados: 0,
          viajesAutomaticos: 0,
          viajesManuales: 0,
          clientesNuevos: 0,
          ultimaActualizacion: new Date().toISOString()
        };
        await setDoc(reporteRef, reporteInicial);
        setReporteDiario(reporteInicial);
      }
    } catch (error) {
      console.error('❌ Error al cargar reporte diario:', error);
    }
  };

  // Función utilitaria: incrementar contador de clientes nuevos para el operador actual
  const incrementarClienteNuevo = async () => {
    try {
      if (!operadorAutenticado) return;
      const hoy = new Date();
      const fechaHoy = hoy.toLocaleDateString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }).replace(/\//g, '-');

      const reporteRef = doc(db, 'reportesDiarios', `${operadorAutenticado.nombre}_${fechaHoy}`);
      await updateDoc(reporteRef, {
        clientesNuevos: increment(1),
        ultimaActualizacion: new Date().toISOString()
      });

      if (operadorAutenticado.id) {
        const operadorRef = doc(db, 'operadores', operadorAutenticado.id);
        await updateDoc(operadorRef, { clientesNuevosRegistrados: increment(1) });
      }
    } catch (e) {
      console.error('Error incrementando clientes nuevos:', e);
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
        ultimaActualizacion: new Date().toISOString()
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

  // Función para cambiar de usuario
  const cambiarUsuario = () => {
    setMostrarModalOperador(true);
    setCodigoOperador('');
    setErrorAutenticacion('');
  };

  // Función para cerrar sesión de operador
  const cerrarSesionOperador = () => {
    setOperadorAutenticado(null);
    setMostrarModalOperador(false);
    setCodigoOperador('');
    setErrorAutenticacion('');
    setReporteDiario({
      viajesRegistrados: 0,
      viajesAsignados: 0,
      viajesCancelados: 0,
      viajesCanceladosPorCliente: 0,
      viajesCanceladosPorConductor: 0,
      viajesSinUnidad: 0,
      viajesAutomaticos: 0,
      viajesManuales: 0
    });
  };

  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [coordenadas, setCoordenadas] = useState('');
  const [direccion, setDireccion] = useState('');
  const [sector, setSector] = useState('');
  const [base, setBase] = useState('');
  const [busquedaPorIdCliente, setBusquedaPorIdCliente] = useState(false);
  const [telefonoCompletoCliente, setTelefonoCompletoCliente] = useState('');
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
  // Modal de Reserva (F7)
  const [modalReserva, setModalReserva] = useState({
    open: false,
    datosCliente: { telefono: '', nombre: '', direccion: '', coordenadas: '' },
    fechaHora: '',
    motivo: '',
    destino: ''
  });
  const [guardandoReserva, setGuardandoReserva] = useState(false);
       const [viajesAsignados, setViajesAsignados] = useState([]);
   const [cargandoViajes, setCargandoViajes] = useState(false);
   const [pedidosDisponibles, setPedidosDisponibles] = useState([]);
   // Estados para reservas pendientes
   const [reservasPendientes, setReservasPendientes] = useState([]);
   const [vistaActual, setVistaActual] = useState('pedidos'); // 'pedidos' o 'reservas'
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

  // Estados para reasignación de unidad
  const [nuevaUnidad, setNuevaUnidad] = useState('');
  const [tiempoNuevaUnidad, setTiempoNuevaUnidad] = useState('');
  const [mostrarReasignacion, setMostrarReasignacion] = useState(false);
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [mostrarUnidades, setMostrarUnidades] = useState(false);

  // Cerrar lista de unidades al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mostrarUnidades && !event.target.closest('.unidad-input-container')) {
        setMostrarUnidades(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mostrarUnidades]);

  // Estados para modal de edición de datos del cliente
  const [modalEditarCliente, setModalEditarCliente] = useState({
    open: false,
    pedido: null,
    nombreCliente: '',
    direccion: ''
  });

  // Estados para selector de direcciones del cliente
  const [direccionesCliente, setDireccionesCliente] = useState([]);
  const [mostrarSelectorDirecciones, setMostrarSelectorDirecciones] = useState(false);

  // Estado para manejar direcciones seleccionadas en pedidos disponibles
  const [direccionesSeleccionadasPedidos, setDireccionesSeleccionadasPedidos] = useState({});

  // Estado para mensaje del conductor
  const [mensajeConductor, setMensajeConductor] = useState('');

  // Estado para controlar múltiples inserciones
  const [insertandoRegistro, setInsertandoRegistro] = useState(false);

  // Estado para mostrar el texto de la selección
  const [textoSeleccion, setTextoSeleccion] = useState('Selección Manual');

  // Estados para los nuevos campos de empresa y modo de selección
  const [tipoEmpresa, setTipoEmpresa] = useState('Efectivo');
  const [modoSeleccionUI, setModoSeleccionUI] = useState('Manual');
  
  // Estado para autorización pre-generada (ya no se usa, se genera en tiempo real)
  const [autorizacionPreGenerada, setAutorizacionPreGenerada] = useState('');
  
  // Estado para mostrar la siguiente autorización
  const [siguienteAutorizacion, setSiguienteAutorizacion] = useState(null);

  // useEffect para actualizar la siguiente autorización cuando se seleccione una empresa
  useEffect(() => {
    const actualizarSiguienteAutorizacion = async () => {
      if (tipoEmpresa && tipoEmpresa !== 'Efectivo') {
        try {
          const siguiente = await obtenerSiguienteAutorizacionParaMostrar();
          setSiguienteAutorizacion(siguiente);
        } catch (error) {
          console.error('Error al obtener siguiente autorización:', error);
          setSiguienteAutorizacion(null);
        }
      } else {
        setSiguienteAutorizacion(null);
      }
    };

    actualizarSiguienteAutorizacion();
  }, [tipoEmpresa]);

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
        
        // Actualizar solo el texto mostrado y los nuevos campos
        setTextoSeleccion(nuevoEstado ? 'Selección Automática' : 'Selección Manual');
        setModoSeleccionUI(nuevoEstado ? 'Automática' : 'Manual');
        
        console.log(`✅ Estado de configuración cambiado de ${estadoActual ? 'Automático' : 'Manual'} a ${nuevoEstado ? 'Automático' : 'Manual'}`);
      } else {
        // Si el documento no existe, crearlo con estado manual (false)
        await setDoc(configRef, {
          estado: false,
          fechaActualizacion: new Date()
        });
        
        setTextoSeleccion('Selección Manual');
        setModoSeleccionUI('Manual');
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
        setModoSeleccionUI(estado ? 'Automática' : 'Manual');
        console.log(`📋 Estado cargado: ${estado ? 'Automático' : 'Manual'} - Texto: ${estado ? 'Selección Automática' : 'Selección Manual'}`);
      } else {
        // Si no existe el documento, crear con estado manual por defecto
        await setDoc(configRef, {
          estado: false,
          fechaActualizacion: new Date()
        });
        setTextoSeleccion('Selección Manual');
        setModoSeleccionUI('Manual');
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
      // Abrir modal de reserva con F7
      if (event.key === 'F7') {
        event.preventDefault();
        // Validar que exista un cliente buscado o datos mínimos cargados
        const telefonoValido = (telefono || '').trim().length >= 7;
        const nombreValido = (nombre || '').trim().length > 0;
        const direccionValida = (direccion || '').trim().length > 0;
        if (!telefonoValido || (!usuarioEncontrado && (!nombreValido || !direccionValida))) {
          setModal({ open: true, success: false, message: 'Primero busque un cliente por teléfono y cargue sus datos (nombre y dirección) para poder reservar.' });
          return;
        }

        // Prefijar fecha y hora actuales en formato datetime-local
        const ahora = new Date();
        const tzOffset = ahora.getTimezoneOffset();
        const localISOTime = new Date(ahora.getTime() - tzOffset * 60000).toISOString().slice(0, 16);

        setModalReserva({
          open: true,
          datosCliente: {
            telefono: telefono || '',
            nombre: nombre || usuarioEncontrado?.nombre || '',
            direccion: direccion || '',
            coordenadas: coordenadas || ''
          },
          fechaHora: localISOTime,
          motivo: '',
          destino: ''
        });
      }
      if (event.key === 'Escape') {
        setMostrarModal(false);
        setModalReserva(prev => ({ ...prev, open: false }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modoSeleccion, telefono, nombre, direccion, usuarioEncontrado, coordenadas, operadorAutenticado]); // Dependencias para valores recientes en F7

  // Guardar reserva en Firestore
  // Helper: formatear fecha/hora local dd/MM/yyyy HH:mm
  const formatearFechaHora = (fecha) => {
    try {
      const d = new Date(fecha);
      const pad = (n) => String(n).padStart(2, '0');
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      return `${day}/${month}/${year} ${hours}:${mins}`;
    } catch {
      return '';
    }
  };

  // Helper: POST x-www-form-urlencoded
  const postFormUrlEncoded = async (url, params) => {
    const body = new URLSearchParams(params).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    return res;
  };

  const guardarReserva = async () => {
    // Prevenir múltiples ejecuciones simultáneas
    if (guardandoReserva) {
      console.log('⚠️ Ya se está guardando una reserva, esperando...');
      return;
    }

    setGuardandoReserva(true);

    try {
      if (!modalReserva.fechaHora || !modalReserva.motivo.trim()) {
        setModal({ open: true, success: false, message: 'Complete fecha/hora y motivo de la reserva.' });
        setGuardandoReserva(false);
        return;
      }

      // Intentar obtener teléfono completo para WhatsApp si es celular
      let telefonoCompleto = modalReserva.datosCliente.telefono || '';
      const telRaw = (modalReserva.datosCliente.telefono || '').trim();
      if (telRaw.length >= 9 && telRaw.length <= 10) {
        try {
          const telefonoCompletoBusqueda = concatenarTelefonoWhatsApp(telRaw, 'Ecuador');
          let clienteRef = doc(db, 'clientestelefonos1', telefonoCompletoBusqueda);
          let clienteSnap = await getDoc(clienteRef);
          if (clienteSnap.exists()) {
            const pref = clienteSnap.data().prefijo || 'Ecuador';
            telefonoCompleto = concatenarTelefonoWhatsApp(telRaw, pref);
          } else {
            const ult9 = telRaw.slice(-9);
            clienteRef = doc(db, 'clientestelefonos1', ult9);
            clienteSnap = await getDoc(clienteRef);
            if (clienteSnap.exists()) {
              const pref = clienteSnap.data().prefijo || 'Ecuador';
              telefonoCompleto = concatenarTelefonoWhatsApp(telRaw, pref);
            }
          }
        } catch (e) {
          // fallback: dejar el número tal cual
        }
      }

      const fechaReserva = new Date(modalReserva.fechaHora);

      // Calcular autorización antes de crear el objeto
      let autorizacion = null;
      if (tipoEmpresa && tipoEmpresa !== 'Efectivo') {
        autorizacion = await obtenerSiguienteAutorizacion();
      }

      const reservaData = {
        telefono: modalReserva.datosCliente.telefono || '',
        telefonoCompleto: telefonoCompleto || modalReserva.datosCliente.telefono || '',
        nombreCliente: modalReserva.datosCliente.nombre || '',
        direccion: modalReserva.datosCliente.direccion || '',
        coordenadas: modalReserva.datosCliente.coordenadas || '',
        fechaHoraReserva: fechaReserva,
        motivo: modalReserva.motivo.trim(),
        destino: (modalReserva.destino || '').trim(),
        estado: 'pendiente',
        origen: 'central',
        createdAt: new Date(),
        // Información de empresa y autorización (si aplica)
        tipoEmpresa: tipoEmpresa || 'Efectivo',
        autorizacion: autorizacion,
        operador: operadorAutenticado ? {
          id: operadorAutenticado.id || '',
          nombre: operadorAutenticado.nombre || '',
          email: operadorAutenticado.email || ''
        } : { id: '', nombre: 'Sin operador', email: '' }
      };

      const docRef = await addDoc(collection(db, 'reservas'), reservaData);
      await updateDoc(docRef, { id: docRef.id });

      console.log('✅ Reserva guardada exitosamente con ID:', docRef.id);

      setModalReserva({
        open: false,
        datosCliente: { telefono: '', nombre: '', direccion: '', coordenadas: '' },
        fechaHora: '',
        motivo: '',
        destino: ''
      });

      // Resetear tipo de empresa a "Efectivo" después de guardar la reserva
      setTipoEmpresa('Efectivo');

      setModal({ open: true, success: true, message: 'Reserva guardada exitosamente.' });
    } catch (error) {
      console.error('❌ Error al guardar la reserva:', error);
      setModal({ open: true, success: false, message: 'Error al guardar la reserva.' });
    } finally {
      setGuardandoReserva(false);
    }
  };

  // Configurar listeners en tiempo real para las colecciones
  useEffect(() => {
    // Listener para pedidosDisponibles
    const qDisponibles = query(collection(db, 'pedidosDisponibles'));
    const unsubscribeDisponibles = onSnapshot(qDisponibles, (querySnapshot) => {
      console.log('🔄 Listener de pedidosDisponibles ejecutado');
      console.log('📊 Número de documentos:', querySnapshot.docs.length);
      
      const pedidos = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('📄 Documento encontrado:', doc.id, data);
        return {
          id: doc.id,
          ...data,
          coleccion: 'pedidosDisponibles'
        };
      });
      
      // Ordenar por fecha de creación más reciente primero
      pedidos.sort((a, b) => {
        if (a.fecha && b.fecha) {
          const fechaA = new Date(a.fecha);
          const fechaB = new Date(b.fecha);
          return fechaB - fechaA;
        }
        return 0;
      });
      
      console.log('✅ Pedidos procesados para mostrar:', pedidos.length);
      setPedidosDisponibles(pedidos);
      setCargandoViajes(false);
    }, (error) => {
      console.error('❌ Error en listener de pedidosDisponibles:', error);
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
      if (typeof unsubscribeDisponibles === 'function') {
      unsubscribeDisponibles();
      }
      if (typeof unsubscribeEnCurso === 'function') {
      unsubscribeEnCurso();
      }
    };
  }, []);

  // useEffect para establecer los pedidos disponibles directamente
  useEffect(() => {
    console.log('🔄 Estableciendo pedidos disponibles:', pedidosDisponibles.length);
    setViajesAsignados(pedidosDisponibles);
  }, [pedidosDisponibles]);

  // useEffect para cargar direcciones cuando se actualicen los viajes asignados
  useEffect(() => {
    if (viajesAsignados && viajesAsignados.length > 0) {
      console.log('🔄 Cargando direcciones para', viajesAsignados.length, 'pedidos');
      console.log('📊 Estado actual de direcciones:', direccionesSeleccionadasPedidos);
      viajesAsignados.forEach(viaje => {
        console.log('📱 Procesando pedido:', viaje.id, 'teléfono:', viaje.telefono);
        if (viaje.telefono && !direccionesSeleccionadasPedidos[viaje.id]) {
          console.log('🚀 Iniciando carga de direcciones para pedido:', viaje.id);
          cargarDireccionesClienteParaPedido(viaje.telefono, viaje.id);
        } else if (direccionesSeleccionadasPedidos[viaje.id]) {
          console.log('✅ Direcciones ya cargadas para pedido:', viaje.id, direccionesSeleccionadasPedidos[viaje.id]);
        } else {
          console.log('⚠️ No hay teléfono para pedido:', viaje.id);
        }
      });
    }
  }, [viajesAsignados]);

  const cargarViajesAsignados = async () => {
    console.log('🔄 Iniciando carga manual de pedidos disponibles...');
    setCargandoViajes(true);
    try {
      // Leer todos los pedidos disponibles
      const q = query(collection(db, 'pedidosDisponibles'));
      console.log('📡 Ejecutando consulta a pedidosDisponibles...');
      const querySnapshot = await getDocs(q);
      console.log('📊 Documentos encontrados:', querySnapshot.docs.length);
      
      const pedidos = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('📄 Documento cargado:', doc.id, data);
        return {
          id: doc.id,
          ...data
        };
      });
      
      // Ordenar por fecha de creación más reciente primero
      pedidos.sort((a, b) => {
        if (a.fecha && b.fecha) {
          const fechaA = new Date(a.fecha);
          const fechaB = new Date(b.fecha);
          return fechaB - fechaA;
        }
        return 0;
      });
      
      console.log('✅ Pedidos procesados para mostrar:', pedidos.length);
      setViajesAsignados(pedidos);
    } catch (error) {
      console.error('❌ Error al cargar pedidos:', error);
    } finally {
      setCargandoViajes(false);
    }
  };

  // Cargar reservas pendientes
  const cargarReservasPendientes = async () => {
    console.log('🔄 Iniciando carga de reservas pendientes...');
    setCargandoViajes(true);
    try {
      // Leer todas las reservas con estado 'pendiente'
      const q = query(
        collection(db, 'reservas'),
        where('estado', '==', 'pendiente')
      );
      console.log('📡 Ejecutando consulta a reservas...');
      const querySnapshot = await getDocs(q);
      console.log('📊 Reservas pendientes encontradas:', querySnapshot.docs.length);
      
      const reservas = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      });
      
      // Ordenar por fecha de reserva (fechaHoraReserva)
      reservas.sort((a, b) => {
        if (a.fechaHoraReserva && b.fechaHoraReserva) {
          const fechaA = a.fechaHoraReserva.toDate ? a.fechaHoraReserva.toDate() : new Date(a.fechaHoraReserva);
          const fechaB = b.fechaHoraReserva.toDate ? b.fechaHoraReserva.toDate() : new Date(b.fechaHoraReserva);
          return fechaA - fechaB; // Más próximas primero
        }
        return 0;
      });
      
      console.log('✅ Reservas pendientes procesadas:', reservas.length);
      setReservasPendientes(reservas);
    } catch (error) {
      console.error('❌ Error al cargar reservas pendientes:', error);
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

  // Función optimizada para buscar en clientes
  const buscarCliente = async (numeroTelefono) => {
    try {
      console.log('🔍 Iniciando búsqueda de cliente con teléfono:', numeroTelefono);
      
      // Normalizar el número de teléfono
      let telefonoBusqueda = numeroTelefono;
      
      // Si el número empieza con 0, reemplazar con 593
      if (telefonoBusqueda.startsWith('0')) {
        telefonoBusqueda = '593' + telefonoBusqueda.substring(1);
        console.log('🔄 Número normalizado con prefijo 593:', telefonoBusqueda);
      }
      
      // Buscar directamente por teléfono usando where clause
      const qTelefono = query(
        collection(db, 'clientes'),
        where('telefono', '==', telefonoBusqueda)
      );
      const snapshotTelefono = await getDocs(qTelefono);
      
      if (!snapshotTelefono.empty) {
        const clienteDoc = snapshotTelefono.docs[0];
        const clienteData = clienteDoc.data();
        console.log('✅ Cliente encontrado por teléfono:', clienteData);
        
        // Cargar la primera dirección del array (si existe)
        if (clienteData.direcciones && clienteData.direcciones.length > 0) {
          const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
          clienteData.direccion = direccionActiva.direccion;
          clienteData.coordenadas = direccionActiva.coordenadas;
          clienteData.sector = direccionActiva.sector;
          console.log('📍 Dirección encontrada:', direccionActiva);
        }
        
        return { encontrado: true, datos: clienteData, tipoCliente: 'cliente' };
      }
      
      // Si no se encuentra por teléfono, buscar por ID del documento
      const docRef = doc(db, 'clientes', telefonoBusqueda);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const clienteData = docSnap.data();
        console.log('✅ Cliente encontrado por ID:', clienteData);
        
        // Cargar la primera dirección del array (si existe)
        if (clienteData.direcciones && clienteData.direcciones.length > 0) {
          const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
          clienteData.direccion = direccionActiva.direccion;
          clienteData.coordenadas = direccionActiva.coordenadas;
          clienteData.sector = direccionActiva.sector;
          console.log('📍 Dirección encontrada:', direccionActiva);
        }
        
        return { encontrado: true, datos: clienteData, tipoCliente: 'cliente' };
      }
      
      // Si el número tiene 5 dígitos, buscar por id_cliente
      if (numeroTelefono.length === 5) {
        console.log('🔍 Buscando por id_cliente:', numeroTelefono);
        const qIdCliente = query(
          collection(db, 'clientes'),
          where('id_cliente', '==', parseInt(numeroTelefono))
        );
        const snapshotIdCliente = await getDocs(qIdCliente);
        
        if (!snapshotIdCliente.empty) {
          const clienteDoc = snapshotIdCliente.docs[0];
          const clienteData = clienteDoc.data();
          console.log('✅ Cliente encontrado por id_cliente:', clienteData);
          
          // Cargar la primera dirección del array (si existe)
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
            clienteData.direccion = direccionActiva.direccion;
            clienteData.coordenadas = direccionActiva.coordenadas;
            clienteData.sector = direccionActiva.sector;
            console.log('📍 Dirección encontrada:', direccionActiva);
          }
          
          return { encontrado: true, datos: clienteData, tipoCliente: 'cliente', busquedaPorId: true };
        }
      }
      
      console.log('❌ No se encontró cliente con teléfono:', telefonoBusqueda);
      return { encontrado: false, tipoCliente: 'cliente' };
    } catch (error) {
      console.error('Error en búsqueda de cliente:', error);
      return { encontrado: false, tipoCliente: 'cliente' };
    }
  };

  // Función específica para buscar en clientes con 7 dígitos usando ID del documento
  const buscarCliente7Digitos = async (numeroTelefono) => {
    try {
      console.log('🔍 Buscando en clientes con 7 dígitos (ID del documento):', numeroTelefono);
      
      // Buscar directamente por ID del documento en la colección clientes
      const docRef = doc(db, 'clientes', numeroTelefono);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const clienteData = docSnap.data();
        console.log('✅ Cliente encontrado por ID en clientes:', clienteData);
        
        // Cargar la primera dirección del array (si existe)
        if (clienteData.direcciones && clienteData.direcciones.length > 0) {
          const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
          clienteData.direccion = direccionActiva.direccion;
          clienteData.coordenadas = direccionActiva.coordenadas;
          clienteData.sector = direccionActiva.sector;
          console.log('📍 Dirección encontrada:', direccionActiva);
        }
        
        return { encontrado: true, datos: clienteData, tipoCliente: 'cliente 7 digitos' };
      }
      
      console.log('❌ No se encontró cliente en clientes con ID:', numeroTelefono);
      return { encontrado: false, tipoCliente: 'cliente 7 digitos' };
    } catch (error) {
      console.error('Error en búsqueda de clientes 7 dígitos:', error);
      return { encontrado: false, tipoCliente: 'cliente 7 digitos' };
    }
  };

  // Función optimizada para buscar en clientestelefonos1
  const buscarClienteTelefonos = async (numeroTelefono) => {
    try {
      console.log('🔍 Buscando en clientestelefonos1 con teléfono:', numeroTelefono);
      
      // Normalizar el número de teléfono
      let telefonoBusqueda = numeroTelefono;
      
      // Si el número empieza con 0, reemplazar con 593
      if (telefonoBusqueda.startsWith('0')) {
        telefonoBusqueda = '593' + telefonoBusqueda.substring(1);
        console.log('🔄 Número normalizado con prefijo 593:', telefonoBusqueda);
      }
      
      // Buscar directamente por teléfono usando where clause
      const qTelefono = query(
        collection(db, 'clientestelefonos1'),
        where('telefono', '==', telefonoBusqueda)
      );
      const snapshotTelefono = await getDocs(qTelefono);
      
      if (!snapshotTelefono.empty) {
        const clienteDoc = snapshotTelefono.docs[0];
        const clienteData = clienteDoc.data();
        console.log('✅ Cliente encontrado por teléfono:', clienteData);
        
        // Cargar la primera dirección del array (si existe)
        if (clienteData.direcciones && clienteData.direcciones.length > 0) {
          const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
          clienteData.direccion = direccionActiva.direccion;
          clienteData.coordenadas = direccionActiva.coordenadas;
          clienteData.sector = direccionActiva.sector;
          console.log('📍 Dirección encontrada:', direccionActiva);
        }
        
        return { encontrado: true, datos: clienteData, tipoCliente: 'cliente telefono' };
      }
      
      // Si no se encuentra por 'telefono', buscar por 'telefonoCompleto'
      const qTelefonoCompleto = query(
        collection(db, 'clientestelefonos1'),
        where('telefonoCompleto', '==', telefonoBusqueda)
      );
      const snapshotTelefonoCompleto = await getDocs(qTelefonoCompleto);
      
      if (!snapshotTelefonoCompleto.empty) {
        const clienteDoc = snapshotTelefonoCompleto.docs[0];
        const clienteData = clienteDoc.data();
        console.log('✅ Cliente encontrado por telefonoCompleto:', clienteData);
        
        // Cargar la primera dirección del array (si existe)
        if (clienteData.direcciones && clienteData.direcciones.length > 0) {
          const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
          clienteData.direccion = direccionActiva.direccion;
          clienteData.coordenadas = direccionActiva.coordenadas;
          clienteData.sector = direccionActiva.sector;
          console.log('📍 Dirección encontrada:', direccionActiva);
        }
        
        return { encontrado: true, datos: clienteData, tipoCliente: 'cliente telefono' };
      }
      
      // Si no se encuentra por teléfono, buscar por ID del documento
      const docRef = doc(db, 'clientestelefonos1', telefonoBusqueda);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const clienteData = docSnap.data();
        console.log('✅ Cliente encontrado por ID:', clienteData);
        
        // Cargar la primera dirección del array (si existe)
        if (clienteData.direcciones && clienteData.direcciones.length > 0) {
          const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
          clienteData.direccion = direccionActiva.direccion;
          clienteData.coordenadas = direccionActiva.coordenadas;
          clienteData.sector = direccionActiva.sector;
          console.log('📍 Dirección encontrada:', direccionActiva);
        }
        
        return { encontrado: true, datos: clienteData, tipoCliente: 'cliente telefono' };
      }
      
      // Si el número tiene 5 dígitos, buscar por id_cliente
      if (numeroTelefono.length === 5) {
        console.log('🔍 Buscando por id_cliente:', numeroTelefono);
        const qIdCliente = query(
          collection(db, 'clientestelefonos1'),
          where('id_cliente', '==', parseInt(numeroTelefono))
        );
        const snapshotIdCliente = await getDocs(qIdCliente);
        
        if (!snapshotIdCliente.empty) {
          const clienteDoc = snapshotIdCliente.docs[0];
          const clienteData = clienteDoc.data();
          console.log('✅ Cliente encontrado por id_cliente:', clienteData);
          
          // Cargar la primera dirección del array (si existe)
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            const direccionActiva = clienteData.direcciones.find(dir => dir.activa === true) || clienteData.direcciones[0];
            clienteData.direccion = direccionActiva.direccion;
            clienteData.coordenadas = direccionActiva.coordenadas;
            clienteData.sector = direccionActiva.sector;
            console.log('📍 Dirección encontrada:', direccionActiva);
          }
          
          return { encontrado: true, datos: clienteData, tipoCliente: 'cliente telefono', busquedaPorId: true };
        }
      }
      
      console.log('❌ No se encontró cliente en clientestelefonos1 con teléfono:', telefonoBusqueda);
      return { encontrado: false, tipoCliente: 'cliente telefono' };
    } catch (error) {
      console.error('Error en búsqueda de clientestelefonos1:', error);
      return { encontrado: false, tipoCliente: 'cliente telefono' };
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
      if (value.length < 5) {
        setUsuarioEncontrado(null);
        setNombre('');
        setDireccion('');
        setCoordenadas('');
        setSector('');
        setBusquedaPorIdCliente(false);
        setTelefonoCompletoCliente('');
        setMostrarModal(false);
      }
    }
  };
  // Función para actualizar el nombre del cliente en Firebase
  const actualizarNombreCliente = async () => {
    if (!nombre.trim() || !telefono.trim()) return;
    
    try {
      console.log('🔄 Actualizando nombre del cliente:', nombre.trim(), 'para teléfono:', telefono);
      
      // Normalizar el número de teléfono
      let telefonoBusqueda = telefono;
      
      // Si el número empieza con 0, reemplazar con 593
      if (telefonoBusqueda.startsWith('0')) {
        telefonoBusqueda = '593' + telefonoBusqueda.substring(1);
        console.log('🔄 Número normalizado para búsqueda:', telefonoBusqueda);
      }
      
      // Determinar en qué colección actualizar según la cantidad de dígitos
      if (telefono.length === 7) {
        // Actualizar en colección 'clientes'
        const qTelefono = query(
          collection(db, 'clientes'),
          where('telefono', '==', telefono)
        );
        const snapshot = await getDocs(qTelefono);
        
        if (!snapshot.empty) {
          const clienteDoc = snapshot.docs[0];
          await updateDoc(clienteDoc.ref, {
            nombre: nombre.trim(),
            fechaActualizacion: serverTimestamp()
          });
          console.log('✅ Nombre actualizado en colección clientes');
        }
      } else if (telefono.length > 9) {
        // Actualizar en colección 'clientestelefonos1' con número normalizado
        const qTelefono = query(
          collection(db, 'clientestelefonos1'),
          where('telefono', '==', telefonoBusqueda)
        );
        const snapshot = await getDocs(qTelefono);
        
        if (!snapshot.empty) {
          const clienteDoc = snapshot.docs[0];
          await updateDoc(clienteDoc.ref, {
            nombre: nombre.trim(),
            fechaActualizacion: serverTimestamp()
          });
          console.log('✅ Nombre actualizado en colección clientestelefonos1');
        } else {
          console.log('⚠️ No se encontró cliente en clientestelefonos1 con teléfono:', telefonoBusqueda);
        }
      } else {
        // Otros casos: buscar por ID del documento
        const clienteDocRef = doc(db, 'clientes', telefono);
        const clienteSnapshot = await getDoc(clienteDocRef);
        
        if (clienteSnapshot.exists()) {
          await updateDoc(clienteDocRef, {
            nombre: nombre.trim(),
            fechaActualizacion: serverTimestamp()
          });
          console.log('✅ Nombre actualizado en colección clientes por ID');
        }
      }
      
      console.log('✅ Nombre del cliente actualizado exitosamente');
    } catch (error) {
      console.error('❌ Error actualizando nombre del cliente:', error);
    }
  };

  // Función para manejar Enter en el campo nombre
  const handleNombreKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await actualizarNombreCliente();
    }
  };

  // Nueva función para manejar Enter en el campo teléfono
  const handleTelefonoKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // Solo buscar si el teléfono tiene al menos 5 dígitos (para id_cliente) o 7+ dígitos (para teléfono)
      if (telefono && (telefono.length === 5 || telefono.length >= 7)) {
        console.log('🔍 Buscando cliente con teléfono:', telefono);
        setBuscandoUsuario(true);
        
        let resultadoBusqueda = null;
        
        // Optimización: buscar según la cantidad de dígitos
        if (telefono.length === 7) {
          // Exactamente 7 dígitos: buscar solo en colección 'clientes'
          console.log('🔍 Búsqueda optimizada: 7 dígitos en colección clientes');
          resultadoBusqueda = await buscarCliente(telefono);
        } else if (telefono.length > 9) {
          // Más de 9 dígitos: buscar solo en colección 'clientestelefonos1'
          console.log('🔍 Búsqueda optimizada: >9 dígitos en colección clientestelefonos1');
          resultadoBusqueda = await buscarClienteTelefonos(telefono);
        } else {
          // Otros casos (5-9 dígitos): usar búsqueda combinada
          resultadoBusqueda = await buscarClienteTelefonos(telefono);
          if (!resultadoBusqueda || !resultadoBusqueda.encontrado) {
            resultadoBusqueda = await buscarCliente(telefono);
          }
        }
        
        console.log('📋 Resultado de búsqueda:', resultadoBusqueda);
        
        if (resultadoBusqueda && resultadoBusqueda.encontrado) {
          // Cliente encontrado, cargar datos automáticamente
          const clienteData = resultadoBusqueda.datos;
          console.log('📋 Datos completos del cliente encontrado:', clienteData);
          
          // Marcar si se encontró por ID de cliente o por 7 dígitos
          if (resultadoBusqueda.busquedaPorId || resultadoBusqueda.tipoCliente === 'cliente 7 digitos') {
            setBusquedaPorIdCliente(true);
            const telefonoCompletoDelCliente = clienteData.telefonoCompleto || clienteData.telefono;
            setTelefonoCompletoCliente(telefonoCompletoDelCliente);
            console.log('🆔 Cliente encontrado por ID o 7 dígitos, manteniendo código original:', telefono);
            console.log('📱 Teléfono completo del cliente:', telefonoCompletoDelCliente);
          } else {
            setBusquedaPorIdCliente(false);
            setTelefonoCompletoCliente('');
          }
          
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
          
          if (clienteData.sector) {
            setSector(clienteData.sector);
            console.log('✅ Sector cargado:', clienteData.sector);
          } else {
            console.log('⚠️ No se encontró sector para el cliente');
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
              setSector(primeraDireccion.sector || '');
              console.log('📍 Primera dirección seleccionada automáticamente:', primeraDireccion);
            }
            console.log('📍 Direcciones guardadas cargadas:', clienteData.direcciones.length);
          } else {
            setDireccionesGuardadas([]);
            setDireccionSeleccionada(null);
            console.log('⚠️ No hay direcciones guardadas para este cliente');
          }

          // Cargar direcciones del cliente para el selector
          await cargarDireccionesCliente(telefono);
          
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
          // Determinar automáticamente el tipo de cliente basándose en la cantidad de dígitos
          let tipoClienteAuto = 'cliente';
          let coleccionAuto = 'clientes';
          
          if (telefono.length <= 7) {
            tipoClienteAuto = 'cliente';
            coleccionAuto = 'clientes';
          } else if (telefono.length > 9) {
            tipoClienteAuto = 'cliente telefono';
            coleccionAuto = 'clientestelefonos1';
          } else {
            // Para 8-9 dígitos, usar la lógica anterior como fallback
            tipoClienteAuto = resultadoBusqueda ? resultadoBusqueda.tipoCliente : 'cliente';
            coleccionAuto = resultadoBusqueda ? resultadoBusqueda.coleccion : 'clientes';
          }
          
          setModalRegistroCliente({
            open: true,
            tipoCliente: tipoClienteAuto,
            coleccion: coleccionAuto,
            modoAplicacion: modoSeleccion === 'aplicacion',
            datosCliente: { 
              nombre: '', 
              direccion: '', 
              coordenadas: '', 
              sector: '',
              telefono: telefono
            }
          });
          console.log('📝 Modal de registro configurado:', {
            open: true,
            tipoCliente: tipoClienteAuto,
            coleccion: coleccionAuto,
            modoAplicacion: modoSeleccion === 'aplicacion'
          });
        }
      } else {
        console.log('📱 Teléfono no cumple criterios para búsqueda:', telefono);
      }
      
      // Finalizar búsqueda
      setBuscandoUsuario(false);
    }
  };

  // Función para cargar direcciones del cliente cuando se encuentra
  const cargarDireccionesCliente = async (telefono) => {
    try {
      console.log('🔍 Buscando cliente por últimos 7 dígitos del teléfono:', telefono);
      
      // Obtener los últimos 7 dígitos del teléfono
      const ultimos7Digitos = telefono.slice(-7);
      console.log('🔢 Últimos 7 dígitos:', ultimos7Digitos);
      
      // Buscar todos los clientes y filtrar por los últimos 7 dígitos
      const qClientes = query(collection(db, 'clientes'));
      const snapshot = await getDocs(qClientes);
      
      let clienteEncontrado = false;
      
      snapshot.docs.forEach(clienteDoc => {
        if (clienteEncontrado) return; // Si ya encontró uno, salir
        
        const clienteData = clienteDoc.data();
        const telefonoCliente = clienteData.telefono || '';
        const ultimos7Cliente = telefonoCliente.slice(-7);
        
        if (ultimos7Cliente === ultimos7Digitos) {
          console.log('✅ Cliente encontrado por últimos 7 dígitos:', clienteData);
        
          // Verificar si el cliente tiene direcciones en el array direccionesCliente
          if (clienteData.direccionesCliente && clienteData.direccionesCliente.length > 0) {
            setDireccionesCliente(clienteData.direccionesCliente);
            setMostrarSelectorDirecciones(true);
            console.log('📍 Direcciones del cliente cargadas:', clienteData.direccionesCliente);
            clienteEncontrado = true;
          } else if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            // Fallback: verificar también el campo direcciones
            setDireccionesCliente(clienteData.direcciones);
            setMostrarSelectorDirecciones(true);
            console.log('📍 Direcciones del cliente cargadas (fallback):', clienteData.direcciones);
            clienteEncontrado = true;
          }
        }
      });
      
      if (!clienteEncontrado) {
        setDireccionesCliente([]);
        setMostrarSelectorDirecciones(false);
        console.log('⚠️ No se encontró cliente con los últimos 7 dígitos');
      }
    } catch (error) {
      console.error('Error cargando direcciones del cliente:', error);
      setDireccionesCliente([]);
      setMostrarSelectorDirecciones(false);
    }
  };

  // Función optimizada para cargar direcciones de un cliente específico para pedidos disponibles
  const cargarDireccionesClienteParaPedido = async (telefono, pedidoId) => {
    try {
      console.log('🔍 Buscando direcciones para teléfono:', telefono, 'pedido:', pedidoId);
      
      let clienteEncontrado = false;
      
      // Optimización: buscar según la cantidad de dígitos
      if (telefono.length === 7) {
        // Exactamente 7 dígitos: buscar solo en colección 'clientes'
        console.log('🔍 Búsqueda optimizada: 7 dígitos en colección clientes');
        const qTelefono = query(
          collection(db, 'clientes'),
          where('telefono', '==', telefono)
        );
        const snapshotTelefono = await getDocs(qTelefono);
        
        if (!snapshotTelefono.empty) {
          const clienteData = snapshotTelefono.docs[0].data();
          console.log('✅ Cliente encontrado por teléfono:', clienteData);
          
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            setDireccionesSeleccionadasPedidos(prev => ({
              ...prev,
              [pedidoId]: {
                direcciones: clienteData.direcciones,
                seleccionada: clienteData.direcciones[0]
              }
            }));
            console.log('📍 Direcciones cargadas:', clienteData.direcciones);
            clienteEncontrado = true;
          }
        }
      } else if (telefono.length > 9) {
        // Más de 9 dígitos: buscar solo en colección 'clientestelefonos1'
        console.log('🔍 Búsqueda optimizada: >9 dígitos en colección clientestelefonos1');
        const qTelefono = query(
          collection(db, 'clientestelefonos1'),
          where('telefono', '==', telefono)
        );
        const snapshotTelefono = await getDocs(qTelefono);
        
        if (!snapshotTelefono.empty) {
          const clienteData = snapshotTelefono.docs[0].data();
          console.log('✅ Cliente encontrado por teléfono:', clienteData);
          
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            setDireccionesSeleccionadasPedidos(prev => ({
              ...prev,
              [pedidoId]: {
                direcciones: clienteData.direcciones,
                seleccionada: clienteData.direcciones[0]
              }
            }));
            console.log('📍 Direcciones cargadas:', clienteData.direcciones);
            clienteEncontrado = true;
          }
        }
      } else {
        // Otros casos: buscar por ID del documento directamente
        console.log('🔍 Búsqueda por ID del documento:', telefono);
        const clienteDocRef = doc(db, 'clientes', telefono);
        const clienteSnapshot = await getDoc(clienteDocRef);
        
        if (clienteSnapshot.exists()) {
          const clienteData = clienteSnapshot.data();
          console.log('✅ Cliente encontrado por ID del documento:', clienteData);
          
          if (clienteData.direcciones && clienteData.direcciones.length > 0) {
            setDireccionesSeleccionadasPedidos(prev => ({
              ...prev,
              [pedidoId]: {
                direcciones: clienteData.direcciones,
                seleccionada: clienteData.direcciones[0]
              }
            }));
            console.log('📍 Direcciones cargadas:', clienteData.direcciones);
            clienteEncontrado = true;
          }
        }
      }
      
      if (!clienteEncontrado) {
        console.log('❌ No se encontró cliente con ningún formato de teléfono');
        // Crear un array con la dirección actual del pedido como fallback
        const direccionActual = {
          direccion: 'Dirección actual',
          coordenadas: '',
          activa: true
        };
        
        setDireccionesSeleccionadasPedidos(prev => ({
          ...prev,
          [pedidoId]: {
            direcciones: [direccionActual],
            seleccionada: direccionActual
          }
        }));
      }
    } catch (error) {
      console.error('Error cargando direcciones del cliente para pedido:', error);
      // Fallback: crear un array con la dirección actual del pedido
      const direccionActual = {
        direccion: 'Dirección actual',
        coordenadas: '',
        activa: true
      };
      
      setDireccionesSeleccionadasPedidos(prev => ({
        ...prev,
        [pedidoId]: {
          direcciones: [direccionActual],
          seleccionada: direccionActual
        }
      }));
    }
  };

  // Función para actualizar la dirección seleccionada de un pedido
  const actualizarDireccionSeleccionada = async (pedidoId, nuevaDireccion) => {
    try {
      // Actualizar el estado local
      setDireccionesSeleccionadasPedidos(prev => ({
        ...prev,
        [pedidoId]: {
          ...prev[pedidoId],
          seleccionada: nuevaDireccion
        }
      }));

      // Actualizar en la base de datos
      const pedidoRef = doc(db, 'pedidosDisponibles', pedidoId);
      await updateDoc(pedidoRef, {
        direccion: nuevaDireccion.direccion,
        coordenadas: nuevaDireccion.coordenadas || '',
        actualizadoEn: serverTimestamp()
      });

      console.log('✅ Dirección actualizada para pedido:', pedidoId, nuevaDireccion);
    } catch (error) {
      console.error('Error actualizando dirección del pedido:', error);
    }
  };

  // Función para seleccionar una dirección del ListBox
  const seleccionarDireccion = (direccion) => {
    setDireccionSeleccionada(direccion);
    setDireccion(direccion.direccion);
    setCoordenadas(direccion.coordenadas || '');
    setMostrarSelectorDirecciones(false);
    console.log('📍 Dirección seleccionada:', direccion);
  };

  // Función para cerrar el selector de direcciones
  const cerrarSelectorDirecciones = () => {
    setMostrarSelectorDirecciones(false);
    setDireccionSeleccionada(null);
  };

  // Función para seleccionar una dirección del listado
  const seleccionarDireccionGuardada = (direccion) => {
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
        coleccionNombre = 'clientestelefonos1';
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
        coleccionNombre = 'clientestelefonos1';
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
      // Usar teléfono como ID para evitar duplicados y detectar existencia
      const userDocRef = doc(db, coleccionNombre, String(telefono));
      const userSnap = await getDoc(userDocRef);
      const yaExistia = userSnap.exists();
      await setDoc(userDocRef, nuevoUsuario, { merge: true });
      // Incrementar solo si no existía
      if (!yaExistia) {
        await incrementarClienteNuevo();
      }
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
    let tipoClienteFinal = tipoCliente; // Declarar fuera del try para usar en catch
    try {
      let coleccionNombre = '';
      const telefono = datosCliente.telefono || telefono; // Usar el teléfono del modal o el actual
      
      // Determinar la colección automáticamente basándose en la cantidad de dígitos
      if (telefono.length <= 7) {
        // 7 dígitos o menos: colección 'clientes' (números fijos)
        coleccionNombre = 'clientes';
        console.log('📞 Registrando en colección "clientes" (número fijo de 7 dígitos o menos)');
      } else if (telefono.length > 9) {
        // Más de 9 dígitos: colección 'clientestelefonos1' (números móviles)
        coleccionNombre = 'clientestelefonos1';
        console.log('📱 Registrando en colección "clientestelefonos1" (número móvil de más de 9 dígitos)');
      } else {
        // 8-9 dígitos: usar la lógica anterior como fallback
      if (tipoCliente === 'cliente') {
        coleccionNombre = 'clientes';
      } else if (tipoCliente === 'cliente telefono') {
          coleccionNombre = 'clientestelefonos1';
      } else if (tipoCliente === 'cliente fijo') {
        coleccionNombre = 'clientes fijos';
      } else {
          throw new Error('Tipo de cliente no válido para números de 8-9 dígitos');
        }
        console.log(`📞 Registrando en colección "${coleccionNombre}" (fallback para ${telefono.length} dígitos)`);
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
      
      // Determinar el tipo de cliente basándose en la colección seleccionada
      if (coleccionNombre === 'clientes') {
        tipoClienteFinal = 'cliente';
      } else if (coleccionNombre === 'clientestelefonos1') {
        tipoClienteFinal = 'cliente telefono';
        // Para celulares, usar el telefonoCompleto como ID (sin el cero inicial)
        telefonoId = concatenarTelefonoWhatsApp(telefono, datosCliente.prefijo || 'Ecuador');
        console.log('📱 Usando telefonoCompleto como ID:', telefonoId);
      }
      
      const clienteRef = doc(db, coleccionNombre, telefonoId);
      const clienteExistenteSnap = await getDoc(clienteRef);
      const yaExistia = clienteExistenteSnap.exists();
      await setDoc(clienteRef, nuevoCliente, { merge: true });
      // Incrementar contador de clientes nuevos solo si no existía antes
      if (!yaExistia) {
        await incrementarClienteNuevo();
      }
      
      console.log('📍 Cliente registrado con direcciones mapeadas:', nuevoCliente);
      
      // Actualizar los campos del formulario
      setNombre(datosCliente.nombre);
      setDireccion(datosCliente.direccion);
      if (datosCliente.coordenadas) {
        setCoordenadas(datosCliente.coordenadas);
      }
      
      // Si es un número de celular (10+ dígitos) y tiene dirección, guardar en historial
      if (telefono.length >= 10 && datosCliente.direccion && datosCliente.direccion.trim()) {
        console.log('📱 Guardando dirección en historial para número de celular:', telefono);
        await guardarEnHistorialCliente(telefono, datosCliente.direccion, datosCliente.coordenadas || '', 'manual');
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
        message: `${tipoClienteFinal} registrado exitosamente en la colección ${coleccionNombre}` 
      });
    } catch (error) {
      console.error('Error al registrar cliente:', error);
      setModal({ 
        open: true, 
        success: false, 
        message: `Error al registrar ${tipoClienteFinal}. Intente nuevamente.` 
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
        coleccionNombre = 'clientestelefonos1';
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

  // Función para verificar y registrar direcciones nuevas en el historial del cliente
  const verificarYRegistrarDireccionEnHistorial = async (telefono, direccion, coordenadas, sector) => {
    try {
      console.log('🔍 Verificando dirección en historial del cliente:', telefono, direccion);
      console.log('🔍 Parámetros recibidos:', { telefono, direccion, coordenadas, sector });
      
      // Buscar el cliente en clientestelefonos1 usando múltiples métodos
      let clienteDoc = null;
      let clienteData = null;
      let clienteRef = null;
      
      // Método 1: Buscar con el número tal como está
      let qTelefono = query(
        collection(db, 'clientestelefonos1'),
        where('telefono', '==', telefono)
      );
      let snapshotTelefono = await getDocs(qTelefono);
      
      console.log('📊 Búsqueda con número original:', telefono, '- Resultado:', snapshotTelefono.docs.length, 'documentos');
      
      if (snapshotTelefono.empty && telefono.startsWith('0')) {
        // Método 2: Si empieza con 0, buscar sin el 0
        const telefonoSinCero = telefono.substring(1);
        qTelefono = query(
          collection(db, 'clientestelefonos1'),
          where('telefono', '==', telefonoSinCero)
        );
        snapshotTelefono = await getDocs(qTelefono);
        console.log('📊 Búsqueda sin cero inicial:', telefonoSinCero, '- Resultado:', snapshotTelefono.docs.length, 'documentos');
      }
      
      if (snapshotTelefono.empty && telefono.length >= 10) {
        // Método 3: Si tiene 10+ dígitos, buscar con los últimos 9
        const ultimos9 = telefono.slice(-9);
        qTelefono = query(
          collection(db, 'clientestelefonos1'),
          where('telefono', '==', ultimos9)
        );
        snapshotTelefono = await getDocs(qTelefono);
        console.log('📊 Búsqueda con últimos 9 dígitos:', ultimos9, '- Resultado:', snapshotTelefono.docs.length, 'documentos');
      }
      
      if (!snapshotTelefono.empty) {
        clienteDoc = snapshotTelefono.docs[0];
        clienteData = clienteDoc.data();
        clienteRef = clienteDoc.ref;
        
        console.log('📱 Cliente encontrado:', clienteData.nombre);
        console.log('📱 ID del documento:', clienteDoc.id);
        console.log('📱 Teléfono del cliente:', clienteData.telefono);
        console.log('📱 Direcciones existentes:', clienteData.direcciones);
        
        // Obtener direcciones existentes
        const direccionesExistentes = clienteData.direcciones || [];
        console.log('📋 Número de direcciones existentes:', direccionesExistentes.length);
        
        // Verificar si la dirección ya existe
        const direccionExiste = direccionesExistentes.some(dir => 
          dir.direccion && dir.direccion.toLowerCase().trim() === direccion.toLowerCase().trim()
        );
        
        console.log('🔍 ¿Dirección ya existe?', direccionExiste);
        
        if (direccionExiste) {
          console.log('✅ Dirección ya existe en el historial del cliente');
          return { existe: true, mensaje: 'Dirección ya registrada en historial' };
        } else {
          // Agregar nueva dirección al historial
          const nuevaDireccion = {
            direccion: direccion,
            coordenadas: coordenadas || '',
            sector: sector || '',
            fechaRegistro: new Date(),
            activa: true,
            modoRegistro: 'manual'
          };
          
          console.log('📝 Nueva dirección a agregar:', nuevaDireccion);
          
          // Desactivar direcciones anteriores
          const direccionesActualizadas = direccionesExistentes.map(dir => ({
            ...dir,
            activa: false
          }));
          
          // Agregar la nueva dirección
          direccionesActualizadas.push(nuevaDireccion);
          
          console.log('📋 Direcciones actualizadas:', direccionesActualizadas);
          
          // Actualizar el cliente con las nuevas direcciones
          console.log('💾 Guardando direcciones en la base de datos...');
          await updateDoc(clienteRef, {
            direcciones: direccionesActualizadas
          });
          
          console.log('✅ Nueva dirección registrada en historial del cliente');
          return { existe: false, mensaje: 'Nueva dirección registrada en historial' };
        }
      } else {
        console.log('❌ Cliente no encontrado en clientestelefonos1');
        return { existe: false, mensaje: 'Cliente no encontrado' };
      }
    } catch (error) {
      console.error('❌ Error al verificar/registrar dirección:', error);
      console.error('❌ Detalles del error:', error.message);
      return { existe: false, mensaje: 'Error al procesar dirección' };
    }
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
    
    // Si el número ya tiene el prefijo del país, devolverlo tal como está
    if (telefonoLimpio.startsWith(codigoPais)) {
      console.log('📱 Número ya tiene prefijo completo:', telefonoLimpio);
      return telefonoLimpio;
    }
    
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
        coleccionNombre = 'clientestelefonos1';
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
    // Limpiar selector de direcciones del cliente
    setDireccionesCliente([]);
    setMostrarSelectorDirecciones(false);
  };

  // Función para convertir número a texto de base
  const convertirNumeroABase = (numero) => {
    if (numero === '0' || numero === 0) {
      return 'aire';
    }
    return `base ${numero}`;
  };

  // Función para convertir número a texto de base (para pedidos disponibles - sin "aire")
  const convertirNumeroABaseDisponible = (numero) => {
    if (numero === '' || numero === null || numero === undefined) {
      return ''; // Dejar vacío para texto libre
    }
    return numero; // Devolver el valor tal como está
  };

  // Nueva función para limpiar solo tiempo y unidad, manteniendo datos del cliente
  const limpiarTiempoYUnidad = () => {
    setBase(''); // Dejar base vacío para texto libre
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
    setBase(''); // Dejar base vacío para texto libre
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
    // Limpiar selector de direcciones del cliente
    setDireccionesCliente([]);
    setMostrarSelectorDirecciones(false);
    
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

       const fecha = new Date().toLocaleString('es-EC', {
         year: 'numeric',
         month: 'numeric',
         day: 'numeric',
         hour: 'numeric',
         minute: '2-digit',
         second: '2-digit',
         hour12: true
       }); // Fecha como cadena en formato "10/9/2025, 5:14:46 a. m."
       const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
       
      // Coordenadas FIJAS para pedidosDisponibles - SIEMPRE usar estas coordenadas
      const latitud = '-0.2298500';
      const longitud = '-78.5249500';
       
       // Determinar el teléfono completo para WhatsApp y obtener datos del cliente
       let telefonoCompleto = telefono || '';
       let telefonoParaPedido = telefono || ''; // Número que se usará en el campo telefono del pedido
       
       if (telefono && telefono.length >= 9 && telefono.length <= 10) {
         // Para celulares, SIEMPRE generar el número completo con código de país
         console.log('🔍 Procesando teléfono celular:', telefono);
         
         // Generar el número completo usando la función concatenarTelefonoWhatsApp
         telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
         telefonoParaPedido = telefonoCompleto; // Usar el número completo para el pedido
         
         console.log('📱 Número completo generado:', telefonoCompleto);
         console.log('📱 Número que se guardará en el pedido:', telefonoParaPedido);
         
         // Opcional: Buscar el cliente para obtener datos adicionales (pero no cambiar el teléfono)
         try {
           const qTelefono = query(
             collection(db, 'clientestelefonos1'),
             where('telefono', '==', telefono)
           );
           const snapshotTelefono = await getDocs(qTelefono);
           
           if (!snapshotTelefono.empty) {
             const clienteDoc = snapshotTelefono.docs[0];
             const clienteData = clienteDoc.data();
             console.log('📱 Cliente encontrado en clientestelefonos1:', clienteData);
             
             // Si el cliente tiene telefonoCompleto, usarlo en lugar del generado
             if (clienteData.telefonoCompleto && clienteData.telefonoCompleto.length > 10) {
               telefonoParaPedido = clienteData.telefonoCompleto;
               telefonoCompleto = clienteData.telefonoCompleto;
               console.log('📱 Usando telefonoCompleto del cliente:', telefonoParaPedido);
             }
           } else {
             console.log('📱 Cliente no encontrado, usando número generado');
           }
         } catch (error) {
           console.log('⚠️ Error al buscar cliente:', error);
         }
       }
       
       // Calcular autorización antes de crear el objeto
       let autorizacion = null;
       if (preRegistroVoucher?.activo) {
         autorizacion = preRegistroVoucher.numeroAutorizacion;
       } else if (tipoEmpresa !== 'Efectivo') {
         autorizacion = await obtenerSiguienteAutorizacion();
       }
       
       const pedidoData = {
         // Estructura basada en tu colección pedidosDisponibles
         clave: clave,
         codigo: nombre || '',
         nombreCliente: nombre || '',
         telefono: telefonoParaPedido || '', // Usar el número completo del cliente encontrado
         telefonoCompleto: busquedaPorIdCliente ? telefonoCompletoCliente : telefonoCompleto, // Usar teléfono completo del cliente si se buscó por ID
         direccion: direccion || '',
         base: convertirNumeroABaseDisponible(base), // Nuevo campo base
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
         puerto: '3019',
         randon: clave,
         rango: '0', // Rango siempre 0 para pedidos manuales
         viajes: 'Central', // Usar el valor del campo valor
         foto: '0',
         tarifaSeleccionada: true,
         operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
         // Campo de autorización (pre-generado opcionalmente desde el botón de voucher o automáticamente para empresas)
         autorizacion: autorizacion,
         modoSeleccion: modoSeleccionUI, // Nuevo campo para el modo de selección UI
         tipoEmpresa: tipoEmpresa // Nuevo campo para empresa/efectivo
       };

       // Verificar y registrar dirección en historial del cliente si es necesario
       if (telefono && direccion && telefono.length >= 9 && telefono.length <= 10) {
         console.log('🔍 VERIFICACIÓN DE DIRECCIÓN ACTIVADA - Tecla SUPRIMIR presionada');
         console.log('🔍 Datos del formulario:', { telefono, direccion, coordenadas, sector });
         const resultadoDireccion = await verificarYRegistrarDireccionEnHistorial(
           telefono, 
           direccion, 
           coordenadas, 
           sector || ''
         );
         console.log('📋 Resultado verificación dirección:', resultadoDireccion.mensaje);
       } else {
         console.log('⚠️ Verificación de dirección NO activada:', { 
           telefono: telefono, 
           direccion: direccion, 
           telefonoLength: telefono?.length 
         });
       }

       // Guardar en la colección "pedidosDisponibles"
       console.log('💾 Guardando pedido en pedidosDisponibles:', pedidoData);
       console.log('📱 Teléfono que se está guardando:', pedidoData.telefono);
       console.log('📱 TelefonoCompleto que se está guardando:', pedidoData.telefonoCompleto);
       const docRef = await addDoc(collection(db, 'pedidosDisponibles'), pedidoData);
       console.log('✅ Pedido guardado con ID:', docRef.id);
       
       // Actualizar el documento con su propio ID
       await updateDoc(docRef, { id: docRef.id });
      
      // Si se usó un número de autorización pre-generado, desactivarlo para evitar reutilización accidental
      try {
        if (preRegistroVoucher?.activo) {
          setPreRegistroVoucher({ numeroAutorizacion: null, activo: false });
        }
      } catch (error) {
        console.error('❌ Error al manejar autorización:', error);
      }
       
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
       // Actualizar contador de viajes registrados
       await actualizarContadorReporte('viajesRegistrados');
       // Actualizar contador de viajes manuales
       await actualizarContadorReporte('viajesManuales');
       
       // Resetear empresa a "Efectivo" después de enviar exitosamente
       if (tipoEmpresa !== 'Efectivo') {
         setTipoEmpresa('Efectivo');
       }
     } catch (error) {
       console.error('❌ Error al registrar el pedido:', error);
       console.error('❌ Detalles del error:', error.message);
       console.error('❌ Stack trace:', error.stack);
       setModal({ open: true, success: false, message: `Error al registrar el pedido: ${error.message}` });
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
      // Validar estatus del conductor (inactivo => bloquear asignación)
      try {
        const estatusValor = conductorData && 'estatus' in conductorData ? conductorData.estatus : true;
        const estatusBool = typeof estatusValor === 'string' ? estatusValor.toLowerCase() !== 'false' : Boolean(estatusValor);
        if (!estatusBool) {
          setModal({ open: true, success: false, message: `La unidad ${unidad} está suspendida/inactiva. No se puede asignar.` });
          setInsertandoRegistro(false);
          return;
        }
      } catch (e) {
        console.warn('No se pudo validar estatus del conductor, continuando por defecto.', e);
      }
      
  // Generar ID único para asignación manual
       const idConductorManual = `conductor_${Date.now()}_${Math.random().toString(36).substring(2, 8)}@manual.com`;
       
       // Obtener el token del conductor (si existe)
       const tokenConductor = conductorData.token || conductorData.fcmToken || conductorData.deviceToken || '';
       const tokenValido = validarTokenConductor(tokenConductor);
       
       // Coordenadas por defecto SIEMPRE para pedidos disponibles
       const latitud = '-0.2298500';
       const longitud = '-78.5249500';
       
       // Asegurar que latitud y longitud no sean undefined
       const latitudFinal = latitud || '-0.2298500';
       const longitudFinal = longitud || '-78.5249500';
       
       const fecha = new Date(); // Timestamp
       const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
       
       // Determinar el teléfono completo para WhatsApp y obtener datos del cliente
       let telefonoCompleto = telefono || '';
       let telefonoParaPedido = telefono || ''; // Número que se usará en el campo telefono del pedido
       
       if (telefono && telefono.length >= 9 && telefono.length <= 10) {
         // Para celulares, SIEMPRE generar el número completo con código de país
         console.log('🔍 Procesando teléfono celular (asignación directa):', telefono);
         
         // Generar el número completo usando la función concatenarTelefonoWhatsApp
         telefonoCompleto = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
         telefonoParaPedido = telefonoCompleto; // Usar el número completo para el pedido
         
         console.log('📱 Número completo generado (asignación directa):', telefonoCompleto);
         console.log('📱 Número que se guardará en el pedido:', telefonoParaPedido);
         
         // Opcional: Buscar el cliente para obtener datos adicionales (pero no cambiar el teléfono)
         try {
           const qTelefono = query(
             collection(db, 'clientestelefonos1'),
             where('telefono', '==', telefono)
           );
           const snapshotTelefono = await getDocs(qTelefono);
           
           if (!snapshotTelefono.empty) {
             const clienteDoc = snapshotTelefono.docs[0];
             const clienteData = clienteDoc.data();
             console.log('📱 Cliente encontrado en clientestelefonos1 (asignación directa):', clienteData);
             
             // Si el cliente tiene telefonoCompleto, usarlo en lugar del generado
             if (clienteData.telefonoCompleto && clienteData.telefonoCompleto.length > 10) {
               telefonoParaPedido = clienteData.telefonoCompleto;
               telefonoCompleto = clienteData.telefonoCompleto;
               console.log('📱 Usando telefonoCompleto del cliente (asignación directa):', telefonoParaPedido);
             }
           } else {
             console.log('📱 Cliente no encontrado, usando número generado (asignación directa)');
           }
         } catch (error) {
           console.log('⚠️ Error al buscar cliente (asignación directa):', error);
         }
       }
       
       // Calcular autorización antes de crear el objeto
       let autorizacion = null;
       if (preRegistroVoucher?.activo) {
         autorizacion = preRegistroVoucher.numeroAutorizacion;
       } else if (tipoEmpresa !== 'Efectivo') {
         autorizacion = await obtenerSiguienteAutorizacion();
       }
       
       const pedidoEnCursoData = {
         // Estructura para pedidoEnCurso
         clave: clave,
         codigo: nombre || '',
         nombreCliente: nombre || '',
         telefono: telefonoParaPedido || '', // Usar el número completo del cliente encontrado
         telefonoCompleto: busquedaPorIdCliente ? telefonoCompletoCliente : telefonoCompleto, // Usar teléfono completo del cliente si se buscó por ID
         direccion: direccion || '',
         base: convertirNumeroABase(base || '0'), // Nuevo campo base
         destino: '', // Destino por defecto
         fecha: fecha,
         createdAt: new Date(),
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
         latitud: latitudFinal,
         longitud: longitudFinal,
         latitudDestino: '',
         longitudDestino: '',
         sector: direccion || '',
         tipoPedido: 'Manual',
         valor: '',
         central: false,
         coorporativo: false,
         llegue: false,
         puerto: '',
         randon: clave,
         rango: coordenadas ? '1' : '0', // Rango 0 si no hay coordenadas
         viajes: '', // Se actualizará con el valor del campo valor
         tarifaSeleccionada: true,
         modoSeleccion: 'manual',
                 modoAsignacion: 'manual', // Campo adicional para indicar asignación manual
        tipoEmpresa: tipoEmpresa, // Nuevo campo para empresa/efectivo
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        // Campo de autorización (pre-generado opcionalmente desde el botón de voucher o automáticamente para empresas)
        autorizacion: autorizacion
       };

       // Verificar y registrar dirección en historial del cliente si es necesario
       if (telefono && direccion && telefono.length >= 9 && telefono.length <= 10) {
         console.log('🔍 Verificando dirección en historial del cliente (asignación directa)...');
         const resultadoDireccion = await verificarYRegistrarDireccionEnHistorial(
           telefono, 
           direccion, 
           coordenadas, 
           sector || ''
         );
         console.log('📋 Resultado verificación dirección:', resultadoDireccion.mensaje);
       }

       // Guardar directamente en la colección "pedidoEnCurso"
       console.log('💾 Guardando pedido en pedidoEnCurso...');
       const docRef = await addDoc(collection(db, 'pedidoEnCurso'), pedidoEnCursoData);
       
       // Actualizar el documento con su propio ID
       await updateDoc(docRef, { id: docRef.id });
       console.log('✅ Pedido guardado con ID:', docRef.id);

       // Si se usó un número de autorización pre-generado, desactivarlo para evitar reutilización accidental
       if (preRegistroVoucher?.activo) {
         setPreRegistroVoucher({ numeroAutorizacion: null, activo: false });
       }

       // Finalizar inmediatamente después de la inserción principal
       setInsertandoRegistro(false);
       
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar formulario completo y enfocar teléfono
       limpiarFormularioCompleto();
       
       // Registro silencioso - sin mostrar alert de éxito
       console.log(`✅ Pedido registrado silenciosamente en "En Curso" - Conductor: ${conductorData.nombre}, Unidad: ${unidad}`);
       
       // Crear duplicado en la colección "NotificaciOnenCurso" para sistema de notificaciones (asíncrono)
       const notificacionEnCursoData = {
         ...pedidoEnCursoData,
         id: docRef.id,
         fechaNotificacion: new Date(),
         estadoNotificacion: 'pendiente'
       };
       
       // Ejecutar notificación en paralelo sin bloquear la respuesta
       addDoc(collection(db, 'NotificaciOnenCurso'), notificacionEnCursoData)
         .then(() => console.log('✅ Notificación en curso creada'))
         .catch(error => console.error('❌ Error al crear notificación:', error));
       
       // Guardar en historial del cliente si hay dirección (asíncrono)
       if (telefono && direccion) {
         guardarEnHistorialCliente(telefono, direccion, coordenadas, 'manual')
           .then(() => console.log('✅ Historial del cliente actualizado'))
           .catch(error => console.error('❌ Error al actualizar historial:', error));
       }

       // Registrar automáticamente en la colección de pedidos manuales (asíncrono)
       const pedidoManualData = {
         ...pedidoEnCursoData,
         idOriginal: docRef.id,
         fechaRegistro: new Date(),
         tipo: 'manual',
         estadoRegistro: 'Registrado',
         modoRegistro: 'manual'
       };

       addDoc(collection(db, 'pedidosManuales'), pedidoManualData)
         .then(() => console.log('✅ Pedido manual registrado en colección separada'))
         .catch(error => console.error('❌ Error al registrar pedido manual:', error));
       
       // Los listeners en tiempo real actualizarán automáticamente las tablas
       
       // Actualizar contadores en paralelo sin bloquear la respuesta
       Promise.all([
         actualizarContadorReporte('viajesRegistrados'),
         actualizarContadorReporte('viajesManuales')
       ]).then(() => console.log('✅ Contadores actualizados'))
         .catch(error => console.error('❌ Error al actualizar contadores:', error));
       
       // Resetear empresa a "Efectivo" después de enviar exitosamente
       if (tipoEmpresa !== 'Efectivo') {
         setTipoEmpresa('Efectivo');
       }
    } catch (error) {
      console.error('❌ Error al registrar el viaje:', error);
      console.error('❌ Detalles del error:', error.message);
      console.error('❌ Stack trace:', error.stack);
      setModal({ open: true, success: false, message: `Error al registrar el pedido en curso: ${error.message}` });
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
    // Limpiar el mensaje cuando se cierra el modal
    setMensajeConductor('');
  };

  // Función para abrir modal de edición de datos del cliente
  const abrirModalEditarCliente = (pedido) => {
    setModalEditarCliente({
      open: true,
      pedido: pedido,
      nombreCliente: pedido.nombreCliente || pedido.codigo || '',
      direccion: pedido.direccion || ''
    });
  };

  // Función para cerrar modal de edición de datos del cliente
  const cerrarModalEditarCliente = () => {
    setModalEditarCliente({
      open: false,
      pedido: null,
      nombreCliente: '',
      direccion: ''
    });
  };

  // Función para actualizar datos del cliente
  const actualizarDatosCliente = async () => {
    if (!modalEditarCliente.pedido) return;

    try {
      const pedidoRef = doc(db, 'pedidosDisponibles', modalEditarCliente.pedido.id);
      
      const datosActualizados = {
        nombreCliente: modalEditarCliente.nombreCliente.trim(),
        direccion: modalEditarCliente.direccion.trim(),
        viajes: modalEditarCliente.pedido.valor || '', // Actualizar viajes con el valor del campo valor
        actualizadoEn: serverTimestamp()
      };

      await updateDoc(pedidoRef, datosActualizados);
      
      // Actualizar el estado local
      setViajesAsignados(prev => 
        prev.map(viaje => 
          viaje.id === modalEditarCliente.pedido.id 
            ? { ...viaje, ...datosActualizados }
            : viaje
        )
      );

      setModal({ 
        open: true, 
        success: true, 
        message: 'Datos del cliente actualizados correctamente.' 
      });
      
      cerrarModalEditarCliente();
    } catch (error) {
      console.error('Error actualizando datos del cliente:', error);
      setModal({ 
        open: true, 
        success: false, 
        message: 'Error al actualizar los datos del cliente.' 
      });
    }
  };

  // Función para sincronizar campo viajes con valor en todos los pedidos
  const sincronizarCamposViajes = async () => {
    try {
      console.log('🔄 Iniciando sincronización de campos viajes...');
      
      const colecciones = ['pedidosDisponibles', 'pedidosDisponibles', 'pedidoEnCurso'];
      let totalActualizados = 0;

      for (const coleccion of colecciones) {
        console.log(`📋 Procesando colección: ${coleccion}`);
        
        // Obtener todos los documentos de la colección
        const querySnapshot = await getDocs(collection(db, coleccion));
        
        for (const docSnapshot of querySnapshot.docs) {
          const data = docSnapshot.data();
          
          // Verificar si el campo viajes está vacío pero valor tiene contenido
          if ((!data.viajes || data.viajes === '') && data.valor && data.valor !== '') {
            console.log(`🔧 Actualizando documento ${docSnapshot.id}: viajes="${data.viajes}" -> valor="${data.valor}"`);
            
            // Actualizar el documento
            await updateDoc(doc(db, coleccion, docSnapshot.id), {
              viajes: data.valor,
              actualizadoEn: serverTimestamp()
            });
            
            totalActualizados++;
          }
        }
      }

      console.log(`✅ Sincronización completada. ${totalActualizados} documentos actualizados.`);
      
      setModal({ 
        open: true, 
        success: true, 
        message: `Sincronización completada. ${totalActualizados} pedidos actualizados.` 
      });
      
    } catch (error) {
      console.error('❌ Error en sincronización:', error);
      setModal({ 
        open: true, 
        success: false, 
        message: 'Error durante la sincronización de campos.' 
      });
    }
  };

  // Función para enviar mensaje al conductor
  const enviarMensajeConductor = async () => {
    if (!modalAccionesPedido.pedido || !mensajeConductor.trim()) {
      setModal({ open: true, success: false, message: 'Por favor escriba un mensaje antes de enviarlo.' });
      return;
    }

    try {
      const pedido = modalAccionesPedido.pedido;
      
      // Crear el mensaje en la colección mensajesConductor
      await addDoc(collection(db, 'mensajesConductor'), {
        unidad: pedido.numeroUnidad || pedido.unidad || 'Sin unidad',
        conductor: pedido.nombre || 'Sin conductor',
        telefonoConductor: pedido.telefono || pedido.telefonoCompleto || 'Sin teléfono',
        cliente: pedido.nombreCliente || pedido.codigo || 'Sin cliente',
        mensaje: mensajeConductor.trim(),
        fecha: serverTimestamp(),
        leido: false,
        pedidoId: pedido.id || 'Sin ID',
        origen: 'modal-acciones'
      });

      setModal({ open: true, success: true, message: 'Mensaje enviado exitosamente al conductor.' });
      setMensajeConductor(''); // Limpiar el campo de mensaje
      
    } catch (error) {
      console.error('Error al enviar mensaje al conductor:', error);
      setModal({ open: true, success: false, message: 'Error al enviar el mensaje: ' + error.message });
    }
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
        fechaCreacion: fechaActual,
        motivoCancelacion: 'Cancelado por el cliente',
        fechaRegistroCancelacion: fechaActual,
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        docIdOriginal: modalAccionesPedido.pedido.id
      };

      // Guardar en pedidosarchivados
      await setDoc(doc(db, 'pedidosarchivados', modalAccionesPedido.pedido.id), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido cancelado por cliente, guardado en pedidosarchivados y eliminado de la colección original');
      
      // Actualizar contadores específicos
      await actualizarContadorReporte('viajesCancelados');
      await actualizarContadorReporte('viajesCanceladosPorCliente');
      
      cerrarModalAccionesPedido();
    } catch (error) {
      console.error('❌ Error al cancelar pedido:', error);
      setModal({ open: true, success: false, message: 'Error al cancelar el pedido.' });
    }
  };

  // Función para cargar unidades disponibles
  const cargarUnidadesDisponibles = async () => {
    try {
      const conductoresRef = collection(db, 'conductores');
      const q = query(conductoresRef, where('estatus', '==', true));
      const querySnapshot = await getDocs(q);
      
      const unidades = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          numero: data.numeroUnidad || data.unidad || data.numero || data.id,
          nombre: data.nombre || 'Sin nombre',
          telefono: data.telefono || 'Sin teléfono',
          placa: data.placa || 'Sin placa'
        };
      }).filter(unidad => unidad.numero); // Filtrar unidades que tengan número
      
      setUnidadesDisponibles(unidades);
    } catch (error) {
      console.error('Error al cargar unidades:', error);
    }
  };

  // Función para reasignar unidad
  const reasignarUnidad = async () => {
    if (!modalAccionesPedido.pedido || !nuevaUnidad.trim()) {
      setModal({ open: true, success: false, message: 'Por favor ingrese la nueva unidad para reasignar.' });
      return;
    }

    try {
      const pedidoOriginal = modalAccionesPedido.pedido;
      
      // Buscar conductor por unidad - intentar diferentes campos
      const conductoresRef = collection(db, 'conductores');
      let conductorData = null;
      
      // Intentar buscar por diferentes campos de unidad
      const camposUnidad = ['numeroUnidad', 'unidad', 'numero', 'id'];
      
      for (const campo of camposUnidad) {
        const q = query(conductoresRef, where(campo, '==', nuevaUnidad));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          conductorData = querySnapshot.docs[0].data();
          console.log(`✅ Conductor encontrado por campo '${campo}':`, conductorData);
          break;
        }
      }
      
      // Si no se encontró por igualdad exacta, intentar buscar por string que contenga la unidad
      if (!conductorData) {
        const q = query(conductoresRef);
        const allConductoresSnapshot = await getDocs(q);
        
        for (const docSnapshot of allConductoresSnapshot.docs) {
          const data = docSnapshot.data();
          // Buscar en todos los campos posibles
          for (const campo of camposUnidad) {
            if (data[campo] && String(data[campo]).includes(nuevaUnidad)) {
              conductorData = data;
              console.log(`✅ Conductor encontrado por coincidencia parcial en campo '${campo}':`, conductorData);
              break;
            }
          }
          if (conductorData) break;
        }
      }
      
      if (!conductorData) {
        setModal({ open: true, success: false, message: `No se encontró conductor para la unidad ${nuevaUnidad}. Verifique que la unidad existe en el sistema.` });
        return;
      }
      
      // Verificar si la unidad está activa
      if (!conductorData.estatus) {
        setModal({ open: true, success: false, message: `La unidad ${nuevaUnidad} está inactiva.` });
        return;
      }

      // Generar nuevo ID único para el conductor manual
      const idConductorManual = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Crear nuevo documento en pedidoEnCurso con la nueva unidad
      const nuevoPedidoEnCursoData = {
        ...pedidoOriginal,
        // Datos de la nueva unidad
        numeroUnidad: nuevaUnidad,
        unidad: nuevaUnidad,
        // MANTENER el tiempo original del documento
        tiempo: pedidoOriginal.tiempo || pedidoOriginal.minutos || '5',
        minutos: pedidoOriginal.minutos || parseInt(pedidoOriginal.tiempo) || 5,
        // Datos del nuevo conductor
        idConductor: idConductorManual,
        correo: conductorData.correo || conductorData.id || '',
        nombre: conductorData.nombre || '',
        nombreConductor: conductorData.nombre || '',
        placa: conductorData.placa || '',
        color: conductorData.color || '',
        telefonoConductor: conductorData.telefono || '',
        foto: conductorData.foto || '',
        tokenConductor: conductorData.token || '',
        // MANTENER el puerto original del documento
        puerto: pedidoOriginal.puerto || '3005',
        // Actualizar fecha de reasignación
        fechaReasignacion: new Date(),
        fecha: pedidoOriginal.fecha || new Date(), // Mantener fecha original si existe
        createdAt: new Date(),
        // Mantener otros datos del pedido original
        estado: 'Aceptado',
        pedido: 'Aceptado',
        modoAsignacion: 'reasignacion',
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador'
      };

      // Guardar nuevo documento en pedidoEnCurso
      const nuevoDocRef = await addDoc(collection(db, 'pedidoEnCurso'), nuevoPedidoEnCursoData);
      await updateDoc(nuevoDocRef, { id: nuevoDocRef.id });

      // Crear duplicado en NotificaciOnenCurso
      const notificacionEnCursoData = {
        ...nuevoPedidoEnCursoData,
        id: nuevoDocRef.id,
        fechaNotificacion: new Date(),
        estadoNotificacion: 'pendiente',
        motivoReasignacion: `Reasignado desde unidad ${pedidoOriginal.numeroUnidad || pedidoOriginal.unidad}`
      };
      
      await addDoc(collection(db, 'NotificaciOnenCurso'), notificacionEnCursoData);

      // Eliminar el documento original
      const pedidoOriginalRef = doc(db, modalAccionesPedido.coleccion, pedidoOriginal.id);
      await deleteDoc(pedidoOriginalRef);

      // Limpiar formulario y cerrar modal
      setNuevaUnidad('');
      setMostrarReasignacion(false);
      setMostrarUnidades(false);
      setModalAccionesPedido({ open: false, pedido: null, coleccion: '' });
      
      setModal({ open: true, success: true, message: `Pedido reasignado exitosamente a la unidad ${nuevaUnidad}.` });

    } catch (error) {
      console.error('Error al reasignar unidad:', error);
      setModal({ open: true, success: false, message: 'Error al reasignar el pedido.' });
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
        fechaCreacion: fechaActual,
        motivoCancelacion: 'Cancelado por la unidad',
        fechaRegistroCancelacion: fechaActual,
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        docIdOriginal: modalAccionesPedido.pedido.id
      };

      // Guardar en pedidosarchivados
      await setDoc(doc(db, 'pedidosarchivados', modalAccionesPedido.pedido.id), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido cancelado por unidad, guardado en pedidosarchivados y eliminado de la colección original');
      
      // Actualizar contadores específicos
      await actualizarContadorReporte('viajesCancelados');
      await actualizarContadorReporte('viajesCanceladosPorConductor');
      
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
      fechaHoraInicio: '',
      fechaHoraFinal: '',
      nombreCliente: '',
      telefono: '',
      direccion: '',
      destino: '',
      valor: '',
      motivo: '',
      informacionViaje: '',
      numeroUnidad: '',
      empresa: '',
      tipoVoucher: 'electronico', // 'electronico' o 'fisico'
      numeroVoucherFisico: '' // Solo para vouchers físicos
    }
  });

  // Estado para pre-registro de voucher
  const [preRegistroVoucher, setPreRegistroVoucher] = useState({
    numeroAutorizacion: null,
    activo: false
  });

  // Abrir el sidebar cuando se cambia de sección (excepto cuando el modal está abierto)
  useEffect(() => {
    if (setIsCollapsed && !modalVoucher.open) {
      setIsCollapsed(false);
    }
  }, [setIsCollapsed, modalVoucher.open]);

  // Lista de empresas para el voucher
  const empresasVoucher = [
    'Acosaustro',
    'Larrea y Ortiz',
    'Aekansa',
    'Equindeca',
    'U. Salesiana',
    'Ecuador tax',
    'U. Laica',
    'Godfilms',
    'Odonto',
    'Alianza Francesa',
    'fundacion de damas',
    'El juri',
    'Godcorp',
    'Expoplaza',
    'PSI',
    'Amgrucia',
    'Prohorizon',
    'Sonkir',
    'Mediken',
    'Xerticaec',
    'Citikold',
    'Medystia',
    'Sinergia',
    'Vector global',
    'ORODELTI',
    'Expoguayaquil',
    'Canodros',
    'TRANSFERENCIA',
    'Rocnarf',
    'Reysac',
    'Efectivo',
    'taxiMEDIKEN',
    'INSICHTBUILDING S.A',
    'Aduanatax',
    'ACOSAUSTRO',
    'TAXI JELUO S.A',
    'EFC',
    'Valoratec',
    'SOLARIS',
    'QFCORP'
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
      
      // Resetear empresa a "Efectivo" después de pre-registrar voucher exitosamente
      if (tipoEmpresa !== 'Efectivo') {
        setTipoEmpresa('Efectivo');
      }
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
      
      // Usar la autorización existente del pedido o generar una nueva si no existe
      if (!pedido.autorizacion) {
        await obtenerSiguienteNumeroAutorizacion();
      }
      
      // Preparar datos del voucher
      const fechaActual = new Date();
      // Convertir a formato datetime-local (YYYY-MM-DDTHH:MM)
      const fechaDatetimeLocal = fechaActual.toISOString().slice(0, 16);
      
      const voucherData = {
        fechaHoraInicio: fechaDatetimeLocal,
        fechaHoraFinal: fechaDatetimeLocal, // Inicializa con la misma fecha, pero editable
        nombreCliente: pedido.nombreCliente || pedido.codigo || 'N/A',
        telefono: pedido.telefono || 'N/A',
        direccion: pedido.direccion || 'N/A',
        destino: '', // Campo vacío para que el usuario lo digite (obligatorio)
        valor: '', // Valor en vacío por defecto
        motivo: '',
        numeroUnidad: pedido.unidad || '', // No editable
        empresa: pedido.tipoEmpresa || '', // Cargar automáticamente la empresa del pedido
        tipoVoucher: 'electronico', // Por defecto electrónico
        numeroVoucherFisico: '', // Solo para vouchers físicos
        numeroAutorizacion: pedido.autorizacion || siguienteNumeroAutorizacion // Incluir la autorización del pedido
      };

      setModalVoucher({
        open: true,
        voucher: voucherData
      });

      // Cerrar el sidebar cuando se abre el modal
      if (setIsCollapsed) {
        setIsCollapsed(true);
      }

      // NO cerrar el modal de acciones del pedido aquí, se cerrará después de generar el voucher
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
        fechaHoraInicio: '',
        fechaHoraFinal: '',
        nombreCliente: '',
        telefono: '',
        direccion: '',
        destino: '',
        valor: '',
        motivo: '',
        numeroUnidad: '',
        empresa: '',
        tipoVoucher: 'electronico',
        numeroVoucherFisico: ''
      }
    });
    
    // Limpiar pre-registro cuando se cierra el modal
    setPreRegistroVoucher({
      numeroAutorizacion: null,
      activo: false
    });

    // Mantener el sidebar cerrado cuando se cierra el modal
    if (setIsCollapsed) {
      setIsCollapsed(true);
    }
  };

  // Función para guardar voucher desde pedido existente
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
        estado: 'Activo',
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador'
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
        colorFondo: '#fef3c7', // Color de fondo amarillo para vouchers
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador'
      };

      // Crear la ruta: todosLosViajes/DD-MM-YYYY/viajes/ID
      const rutaTodosLosViajes = `todosLosViajes/${fechaFormateada}/viajes/${modalAccionesPedido.pedido.id}`;
      await setDoc(doc(db, rutaTodosLosViajes), viajeVoucherFinalizadoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log(`✅ Voucher generado y guardado en todosLosViajes: ${rutaTodosLosViajes}`);
      console.log('✅ Voucher guardado en voucherCorporativos con número:', numeroAutorizacion);
      
      setModal({ open: true, success: true, message: `Voucher generado exitosamente. Número de autorización: ${numeroAutorizacion}` });
      
      cerrarModalVoucher();
    } catch (error) {
      console.error('❌ Error al generar voucher:', error);
      setModal({ open: true, success: false, message: 'Error al generar el voucher.' });
    }
  };

  // Función para guardar voucher corporativo desde el modal
  const guardarVoucherCorporativo = async () => {
    try {
      // Guardar información del pedido al inicio para evitar que se pierda
      const pedidoInfo = modalAccionesPedido.pedido;
      const coleccionInfo = modalAccionesPedido.coleccion;
      
      console.log('🔍 Información del pedido al inicio:', pedidoInfo);
      console.log('🔍 Colección del pedido al inicio:', coleccionInfo);

      // Validar campos requeridos
      if (!modalVoucher.voucher.nombreCliente || !modalVoucher.voucher.destino || !modalVoucher.voucher.empresa) {
        setModal({ open: true, success: false, message: 'Por favor complete todos los campos requeridos (Nombre del Cliente, Destino y Empresa).' });
        return;
      }

      // Validar número de voucher físico si es necesario
      if (modalVoucher.voucher.tipoVoucher === 'fisico' && !modalVoucher.voucher.numeroVoucherFisico.trim()) {
        setModal({ open: true, success: false, message: 'Por favor ingrese el número de voucher físico.' });
        return;
      }

      // Usar la autorización del voucher, del pedido, o la calculada previamente
      const numeroAutorizacion = modalVoucher.voucher?.numeroAutorizacion || pedidoInfo?.autorizacion || siguienteNumeroAutorizacion;
      console.log('Usando número de autorización:', numeroAutorizacion);

      // Crear el voucher corporativo
      const voucherData = {
        ...modalVoucher.voucher,
        numeroAutorizacion: numeroAutorizacion,
        fechaCreacion: new Date(),
        estado: 'Activo',
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        pedidoId: modalAccionesPedido.pedido?.id || 'N/A'
      };

      // Guardar en voucherCorporativos
      await addDoc(collection(db, 'voucherCorporativos'), voucherData);

      console.log('✅ Voucher corporativo guardado con número:', numeroAutorizacion);
      
      // Si hay un pedido asociado, moverlo a todosLosViajes y eliminarlo de la colección original
      if (pedidoInfo) {
        try {
          console.log('🔄 Procesando pedido para voucher:', pedidoInfo.id);
          console.log('📁 Colección del pedido:', coleccionInfo);
          
          const pedidoRef = doc(db, coleccionInfo, pedidoInfo.id);
          
          // Crear datos del viaje finalizado
          const fechaActual = new Date();
          const fechaFormateada = fechaActual.toLocaleDateString('es-EC', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }).replace(/\//g, '-');

          const viajeFinalizadoData = {
            ...pedidoInfo,
            estado: 'Finalizado con Voucher',
            fechaFinalizacion: fechaActual,
            fechaRegistroFinalizacion: fechaActual,
            fechaCreacion: fechaActual,
            motivoFinalizacion: 'Voucher corporativo generado',
            numeroAutorizacionVoucher: numeroAutorizacion,
            voucherData: {
              numeroAutorizacion: numeroAutorizacion,
              fechaCreacion: fechaActual,
              estado: 'Activo'
            },
            esVoucher: true,
            colorFondo: '#fef3c7', // Color de fondo amarillo para vouchers
            operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
            docIdOriginal: pedidoInfo.id
          };

          // Guardar en pedidosarchivados
          await setDoc(doc(db, 'pedidosarchivados', pedidoInfo.id), viajeFinalizadoData);
          console.log('✅ Pedido guardado en pedidosarchivados:', pedidoInfo.id);

          // Eliminar de la colección original (pedidoEnCurso o pedidosDisponibles)
          console.log('🗑️ Eliminando pedido de:', coleccionInfo, 'ID:', pedidoInfo.id);
          await deleteDoc(pedidoRef);
          console.log('✅ Pedido eliminado exitosamente de:', coleccionInfo);

          // Cerrar el modal de acciones del pedido después de eliminar
          setModalAccionesPedido({ open: false, pedido: null, coleccion: null });

        } catch (error) {
          console.error('❌ Error al procesar el pedido:', error);
          console.error('❌ Detalles del error:', error.message);
        }
      } else {
        console.log('⚠️ No hay pedido asociado para procesar');
      }
      
      // Actualizar el siguiente número de autorización solo si se generó una nueva
      if (!pedidoInfo?.autorizacion) {
        setSiguienteNumeroAutorizacion(numeroAutorizacion + 1);
      }
      
      setModal({ 
        open: true, 
        success: true, 
        message: `Voucher corporativo generado exitosamente. Número de autorización: ${numeroAutorizacion}` 
      });
      
      cerrarModalVoucher();
    } catch (error) {
      console.error('❌ Error al generar voucher corporativo:', error);
      setModal({ open: true, success: false, message: 'Error al generar el voucher corporativo.' });
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

  // Función directa para cancelar pedido sin asignar
  const cancelarPedidoDirecto = async (pedido, coleccion) => {
    try {
      const pedidoRef = doc(db, coleccion, pedido.id);
      
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
        ...pedido,
        estado: 'Cancelado por Cliente Sin Asignar',
        fechaCancelacion: fechaActual,
        fechaCreacion: fechaActual,
        motivoCancelacion: 'Cancelado por el cliente sin asignar unidad',
        fechaRegistroCancelacion: fechaActual,
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        docIdOriginal: pedido.id
      };

      // Guardar en pedidosarchivados
      await setDoc(doc(db, 'pedidosarchivados', pedido.id), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido cancelado sin asignar, guardado en pedidosarchivados');
      
      // Actualizar contadores específicos
      await actualizarContadorReporte('viajesCancelados');
      await actualizarContadorReporte('viajesCanceladosPorCliente');
      await actualizarContadorReporte('viajesSinUnidad');
      
      // Mostrar mensaje de éxito
      setModal({ open: true, success: true, message: 'Pedido cancelado exitosamente' });
      
    } catch (error) {
      console.error('❌ Error al cancelar pedido:', error);
      setModal({ open: true, success: false, message: 'Error al cancelar el pedido' });
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
        fechaCreacion: fechaActual,
        motivoCancelacion: 'Cancelado por el cliente sin asignar unidad',
        fechaRegistroCancelacion: fechaActual,
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        docIdOriginal: modalAccionesPedido.pedido.id
      };

      // Guardar en pedidosarchivados
      await setDoc(doc(db, 'pedidosarchivados', modalAccionesPedido.pedido.id), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido cancelado sin asignar, guardado en pedidosarchivados y eliminado de la colección original');
      
      // Actualizar contadores específicos
      await actualizarContadorReporte('viajesCancelados');
      await actualizarContadorReporte('viajesCanceladosPorCliente');
      await actualizarContadorReporte('viajesSinUnidad');
      
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
        fechaCreacion: fechaActual,
        motivoCancelacion: 'No hubo unidad disponible para asignar',
        fechaRegistroCancelacion: fechaActual,
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        docIdOriginal: modalAccionesPedido.pedido.id
      };

      // Guardar en pedidosarchivados
      await setDoc(doc(db, 'pedidosarchivados', modalAccionesPedido.pedido.id), viajeCanceladoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log('✅ Pedido marcado como no hubo unidad disponible, guardado en pedidosarchivados y eliminado de la colección original');
      
      // Actualizar contadores específicos
      await actualizarContadorReporte('viajesCancelados');
      await actualizarContadorReporte('viajesSinUnidad');
      
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

  // Generar autorización para pedido en 'pedidoEnCurso'
  const generarAutorizacionParaPedidoEnCurso = async () => {
    try {
      if (!modalAccionesPedido.pedido || modalAccionesPedido.coleccion !== 'pedidoEnCurso') return;
      const pedido = modalAccionesPedido.pedido;
      if (pedido.autorizacion) {
        setModal({ open: true, success: false, message: `Este pedido ya tiene autorización: ${pedido.autorizacion}` });
        return;
      }

      // Obtener el siguiente número de autorización usando autorizacionSecuencia
      const numeroAutorizacion = await obtenerSiguienteAutorizacion();

      // La función obtenerSiguienteAutorizacion ya registra en voucherCorporativos
      // Solo necesitamos actualizar el pedido con la autorización

      // Actualizar el pedido en curso
      const pedidoRef = doc(db, 'pedidoEnCurso', pedido.id);
      await updateDoc(pedidoRef, { autorizacion: numeroAutorizacion });

      setModal({ open: true, success: true, message: `Autorización generada: ${numeroAutorizacion}` });
      setModalAccionesPedido(prev => ({
        ...prev,
        pedido: { ...prev.pedido, autorizacion: numeroAutorizacion }
      }));
    } catch (error) {
      console.error('Error al generar autorización (en curso):', error);
      setModal({ open: true, success: false, message: 'No se pudo generar la autorización.' });
    }
  };

  // Generar autorización para pedido en 'pedidosDisponibles'
  const generarAutorizacionParaPedidoDisponible = async () => {
    try {
      if (!modalAccionesPedido.pedido || modalAccionesPedido.coleccion !== 'pedidosDisponibles') return;
      const pedido = modalAccionesPedido.pedido;
      // Evitar duplicados si ya existe
      if (pedido.autorizacion) {
        setModal({ open: true, success: false, message: `Este pedido ya tiene autorización: ${pedido.autorizacion}` });
        return;
      }

      // Obtener el siguiente número de autorización usando autorizacionSecuencia
      const numeroAutorizacion = await obtenerSiguienteAutorizacion();

      // Guardar en el pedido disponible
      const pedidoRef = doc(db, 'pedidosDisponibles', pedido.id);
      await updateDoc(pedidoRef, { autorizacion: numeroAutorizacion });

      // Feedback y refresco local del modal
      setModal({ open: true, success: true, message: `Autorización generada: ${numeroAutorizacion}` });
      setModalAccionesPedido(prev => ({
        ...prev,
        pedido: { ...prev.pedido, autorizacion: numeroAutorizacion }
      }));
    } catch (error) {
      console.error('Error al generar autorización:', error);
      setModal({ open: true, success: false, message: 'No se pudo generar la autorización.' });
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
          fechaCreacion: fechaActual,
          motivoFinalizacion: nuevoEstado === 'Cancelado' ? 'Pedido cancelado' : 
                             nuevoEstado === 'Rechazado' ? 'Pedido rechazado' : 
                             'Pedido finalizado',
          fechaRegistroFinalizacion: fechaActual,
          docIdOriginal: modalAccionesPedido.pedido.id
        };

        // Guardar en pedidosarchivados
        await setDoc(doc(db, 'pedidosarchivados', modalAccionesPedido.pedido.id), viajeData);

        // Eliminar el documento original de la colección
        await deleteDoc(pedidoRef);

        console.log(`✅ Pedido ${nuevoEstado.toLowerCase()}, guardado en pedidosarchivados y eliminado de la colección original`);
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
        fechaCreacion: fechaActual,
        motivoFinalizacion: 'Pedido completado exitosamente',
        esViajeFinalizado: true,
        colorFondo: '#dbeafe', // Color de fondo azul claro para viajes finalizados
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        docIdOriginal: modalAccionesPedido.pedido.id
      };

      // Guardar en pedidosarchivados
      await setDoc(doc(db, 'pedidosarchivados', modalAccionesPedido.pedido.id), viajeFinalizadoData);

      // Eliminar el documento original de la colección
      await deleteDoc(pedidoRef);

      console.log(`✅ Pedido finalizado y guardado en pedidosarchivados: ${modalAccionesPedido.pedido.id}`);
      
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
    setBaseEdit(viaje.base || '');
  };

   // Función para cancelar edición
     const cancelarEdicionViaje = () => {
    setEditandoViaje(null);
    setTiempoEdit('');
    setUnidadEdit('');
    setBaseEdit('');
  };

   // Función para mover pedido de disponibles a en curso
   // Incluye el token del conductor para notificaciones push cuando se asigna manualmente
   const guardarEdicionViaje = async (viajeId) => {
     // Si estamos en vista de reservas, activar la reserva automáticamente
     if (vistaActual === 'reservas') {
       if (!unidadEdit.trim()) {
         setModal({ open: true, success: false, message: 'Por favor, ingrese el número de unidad.' });
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
           return;
         }

         // Obtener datos del conductor
         const conductorData = conductoresSnapshot.docs[0].data();
         
         // Validar estatus del conductor
         try {
           const estatusValor = conductorData && 'estatus' in conductorData ? conductorData.estatus : true;
           const estatusBool = typeof estatusValor === 'string' ? estatusValor.toLowerCase() !== 'false' : Boolean(estatusValor);
           if (!estatusBool) {
             setModal({ open: true, success: false, message: `La unidad ${unidadEdit} está suspendida/inactiva. No se puede asignar.` });
             return;
           }
         } catch (e) {
           console.warn('No se pudo validar estatus del conductor, continuando por defecto.', e);
         }

         // Primero actualizar la reserva con el número de unidad
         const reservaRef = doc(db, 'reservas', viajeId);
         await updateDoc(reservaRef, {
           numeroUnidad: unidadEdit.trim(),
           unidad: unidadEdit.trim(),
           nombreConductor: conductorData.nombre || '',
           telefonoConductor: conductorData.telefono || '',
           actualizadoEn: new Date()
         });

         console.log('✅ Unidad asignada a la reserva:', viajeId);
         
         // Limpiar estado de edición
         cancelarEdicionViaje();
         
         // Obtener la reserva actualizada y activarla automáticamente
         const reservaSnap = await getDoc(reservaRef);
         if (reservaSnap.exists()) {
           const reservaData = { id: reservaSnap.id, ...reservaSnap.data() };
           
           // Activar la reserva automáticamente (convertirla en pedido en curso)
           await activarReservaDirecto(reservaData, conductorData);
         }
         
         return;
       } catch (error) {
         console.error('❌ Error al asignar unidad a la reserva:', error);
         setModal({ open: true, success: false, message: 'Error al asignar la unidad.' });
         return;
       }
     }

     // Flujo normal para pedidos disponibles
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
       // Validar estatus del conductor (inactivo => bloquear asignación)
       try {
         const estatusValor = conductorData && 'estatus' in conductorData ? conductorData.estatus : true;
         const estatusBool = typeof estatusValor === 'string' ? estatusValor.toLowerCase() !== 'false' : Boolean(estatusValor);
         if (!estatusBool) {
           setModal({ open: true, success: false, message: `La unidad ${unidadEdit} está suspendida/inactiva. No se puede asignar.` });
           return;
         }
       } catch (e) {
         console.warn('No se pudo validar estatus del conductor en edición, continuando por defecto.', e);
       }

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
         createdAt: new Date(),
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
         modoAsignacion: 'manual', // Campo adicional para indicar asignación manual
         tipoEmpresa: tipoEmpresa, // Nuevo campo para empresa/efectivo
         operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
         puerto: pedidoOriginal.puerto || '3005' // Preservar el puerto original del pedido
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

  // Función auxiliar para activar reserva con datos del conductor ya obtenidos
  const activarReservaDirecto = async (reserva, conductorData) => {
    try {
      // Generar ID único para asignación manual
      const idConductorManual = `conductor_${Date.now()}_${Math.random().toString(36).substring(2, 8)}@manual.com`;
      
      // Obtener fecha de la reserva
      const fechaReserva = reserva.fechaHoraReserva && reserva.fechaHoraReserva.toDate 
        ? reserva.fechaHoraReserva.toDate() 
        : reserva.fechaHoraReserva 
          ? new Date(reserva.fechaHoraReserva) 
          : new Date();

      // Crear el pedido en curso con todos los datos de la reserva
      const pedidoEnCursoData = {
        // Datos de la reserva
        telefono: reserva.telefono || '',
        telefonoCompleto: reserva.telefonoCompleto || reserva.telefono || '',
        nombreCliente: reserva.nombreCliente || '',
        codigo: reserva.nombreCliente || '',
        direccion: reserva.direccion || '',
        coordenadas: reserva.coordenadas || '',
        destino: reserva.destino || 'QUITO-ECUADOR',
        
        // Datos de asignación
        numeroUnidad: reserva.numeroUnidad,
        unidad: reserva.numeroUnidad,
        base: 'Reserva',
        tiempo: '0',
        minutos: 0,
        
        // Estado
        estado: 'Aceptado',
        pedido: 'Aceptado',
        
        // Fecha - usar la fecha actual como fecha de activación
        fecha: new Date(),
        createdAt: new Date(),
        fechaReservaOriginal: fechaReserva, // Guardar la fecha original de la reserva
        
        // Datos del conductor
        idConductor: idConductorManual,
        correo: conductorData.correo || conductorData.id || '',
        nombre: conductorData.nombre || '',
        nombreConductor: conductorData.nombre || '',
        placa: conductorData.placa || '',
        color: conductorData.color || '',
        telefonoConductor: conductorData.telefono || '',
        foto: conductorData.foto || '',
        tokenConductor: conductorData.fcmToken || conductorData.token || conductorData.notificationToken || '',
        
        // Datos adicionales
        distancia: '0.00 Mts',
        latitudConductor: '',
        longitudConductor: '',
        tarifaSeleccionada: true,
        modoAsignacion: 'reserva', // Indicar que viene de una reserva
        tipoPedido: 'Reserva',
        tipoEmpresa: reserva.tipoEmpresa || 'Efectivo',
        autorizacion: reserva.autorizacion || null,
        operadora: operadorAutenticado ? operadorAutenticado.nombre : reserva.operador?.nombre || 'Sin operador',
        puerto: '3019',
        
        // Coordenadas
        latitud: reserva.coordenadas ? reserva.coordenadas.split(',')[0] : '-0.2298500',
        longitud: reserva.coordenadas ? reserva.coordenadas.split(',')[1] : '-78.5249500',
        latitudDestino: '',
        longitudDestino: '',
        
        // Otros campos estándar
        sector: reserva.direccion || '',
        valor: '',
        central: true,
        coorporativo: false,
        llegue: false,
        randon: Math.random().toString(36).substring(2, 8).toUpperCase(),
        rango: '0',
        viajes: '',
        foto: '0',
        clave: Math.random().toString(36).substring(2, 8).toUpperCase(),
        
        // Información de la reserva original
        motivoReserva: reserva.motivo || '',
        esReservaActivada: true
      };

      // Agregar a pedidoEnCurso
      const docRef = await addDoc(collection(db, 'pedidoEnCurso'), pedidoEnCursoData);
      await updateDoc(docRef, { id: docRef.id });

      // Crear duplicado en NotificaciOnenCurso
      const notificacionEnCursoData = {
        ...pedidoEnCursoData,
        id: docRef.id,
        fechaNotificacion: new Date()
      };
      await setDoc(doc(db, 'NotificaciOnenCurso', docRef.id), notificacionEnCursoData);

      // Actualizar el estado de la reserva a 'activada' o eliminarla
      const reservaRef = doc(db, 'reservas', reserva.id);
      await updateDoc(reservaRef, {
        estado: 'activada',
        fechaActivacion: new Date(),
        idPedidoEnCurso: docRef.id
      });

      console.log('✅ Reserva activada y convertida en pedido en curso:', docRef.id);
      
      // Actualizar contador de viajes asignados
      await actualizarContadorReporte('viajesAsignados');
      
      setModal({ open: true, success: true, message: 'Reserva activada y convertida en pedido en curso exitosamente.' });
      
      // Recargar reservas pendientes
      cargarReservasPendientes();
      
    } catch (error) {
      console.error('❌ Error al activar la reserva:', error);
      setModal({ open: true, success: false, message: 'Error al activar la reserva.' });
    }
  };

  // Función para activar reserva desde el botón (busca el conductor primero)
  const activarReserva = async (reserva) => {
    try {
      // Verificar que la reserva tenga una unidad asignada
      if (!reserva.numeroUnidad) {
        setModal({ open: true, success: false, message: 'Por favor, asigne una unidad antes de activar la reserva.' });
        return;
      }

      // Buscar datos del conductor por número de unidad
      const conductoresQuery = query(
        collection(db, 'conductores'),
        where("unidad", "==", reserva.numeroUnidad.trim())
      );
      
      const conductoresSnapshot = await getDocs(conductoresQuery);
      
      if (conductoresSnapshot.empty) {
        setModal({ open: true, success: false, message: `No se encontró un conductor con la unidad ${reserva.numeroUnidad}.` });
        return;
      }

      const conductorData = conductoresSnapshot.docs[0].data();

      // Validar estatus del conductor
      try {
        const estatusValor = conductorData && 'estatus' in conductorData ? conductorData.estatus : true;
        const estatusBool = typeof estatusValor === 'string' ? estatusValor.toLowerCase() !== 'false' : Boolean(estatusValor);
        if (!estatusBool) {
          setModal({ open: true, success: false, message: `La unidad ${reserva.numeroUnidad} está suspendida/inactiva. No se puede asignar.` });
          return;
        }
      } catch (e) {
        console.warn('No se pudo validar estatus del conductor, continuando por defecto.', e);
      }

      // Activar la reserva usando la función directa
      await activarReservaDirecto(reserva, conductorData);
      
    } catch (error) {
      console.error('❌ Error al activar la reserva:', error);
      setModal({ open: true, success: false, message: 'Error al activar la reserva.' });
    }
  };

  // Función para cancelar una reserva
  const cancelarReserva = async (reserva) => {
    try {
      // eslint-disable-next-line no-restricted-globals
      const confirmar = confirm('¿Está seguro de que desea cancelar esta reserva?');
      if (!confirmar) return;

      const reservaRef = doc(db, 'reservas', reserva.id);
      await updateDoc(reservaRef, {
        estado: 'cancelada',
        fechaCancelacion: new Date(),
        canceladoPor: operadorAutenticado ? operadorAutenticado.nombre : 'Sistema'
      });

      console.log('✅ Reserva cancelada:', reserva.id);
      setModal({ open: true, success: true, message: 'Reserva cancelada exitosamente.' });
      
      // Recargar reservas pendientes
      cargarReservasPendientes();
      
    } catch (error) {
      console.error('❌ Error al cancelar la reserva:', error);
      setModal({ open: true, success: false, message: 'Error al cancelar la reserva.' });
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

       // Coordenadas por defecto SIEMPRE para pedidos disponibles
       const latitud = '-0.2298500';
       const longitud = '-78.5249500';
      
      const fecha = new Date(); // Timestamp
      const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Determinar el teléfono completo para WhatsApp
      let telefonoCompleto = telefono || '';
      if (telefono && telefono.length >= 9 && telefono.length <= 10) {
        // Para celulares, buscar el cliente y obtener su prefijo
        try {
          // Intentar primero con telefonoCompleto (Ecuador por defecto)
          const telefonoCompletoBusqueda = concatenarTelefonoWhatsApp(telefono, 'Ecuador');
          let clienteRef = doc(db, 'clientestelefonos1', telefonoCompletoBusqueda);
          let clienteSnapshot = await getDoc(clienteRef);
          
          if (clienteSnapshot.exists()) {
            const clienteData = clienteSnapshot.data();
            telefonoCompleto = concatenarTelefonoWhatsApp(telefono, clienteData.prefijo || 'Ecuador');
            console.log('📱 Teléfono completo para WhatsApp:', telefonoCompleto);
          } else {
            // Si no se encuentra, intentar con los últimos 9 dígitos (método anterior)
            const telefonoBusqueda = telefono.slice(-9);
            clienteRef = doc(db, 'clientestelefonos1', telefonoBusqueda);
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
        telefono: telefono || '', // Usar siempre el número tal como está en el campo
        telefonoCompleto: busquedaPorIdCliente ? telefonoCompletoCliente : telefonoCompleto, // Usar teléfono completo del cliente si se buscó por ID
        direccion: direccion || '',
        base: convertirNumeroABaseDisponible(base || '0'), // Nuevo campo base
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
        tipoPedido: modoSeleccionUI === 'Manual' ? 'Manual' : 'Automático',
        valor: '',
        central: false,
        coorporativo: false,
        llegue: false,
        puerto: '3019',
        randon: clave,
        rango: modoSeleccionUI === 'Manual' ? '0' : (coordenadas ? '1' : '0'), // Rango 0 si es manual, 1 si hay coordenadas en aplicación
        viajes: '', // Se actualizará con el valor del campo valor
        foto: '0',
        tarifaSeleccionada: true,
        
        // Identificación del modo
        modoSeleccion: modoSeleccionUI.toLowerCase(), // Convertir a minúscula para compatibilidad
        tipoEmpresa: tipoEmpresa, // Nuevo campo para empresa/efectivo
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador'
      };

      // Inserción directa en la colección "pedidosDisponibles"
      const docRef = await addDoc(collection(db, 'pedidosDisponibles'), pedidoData);
      
      // Actualizar el documento con su propio ID
      await updateDoc(docRef, { id: docRef.id });
      
      // Verificar y registrar dirección en historial del cliente si es necesario
      if (telefono && direccion && telefono.length >= 9 && telefono.length <= 10) {
        console.log('🔍 Verificando dirección en historial del cliente (aplicación)...');
        const resultadoDireccion = await verificarYRegistrarDireccionEnHistorial(
          telefono, 
          direccion, 
          coordenadas, 
          sector || ''
        );
        console.log('📋 Resultado verificación dirección:', resultadoDireccion.mensaje);
      }

      // Guardar en historial del cliente si hay dirección
      if (telefono && direccion) {
        await guardarEnHistorialCliente(telefono, direccion, coordenadas, 'aplicacion');
      }
      
      // Los listeners en tiempo real actualizarán automáticamente las tablas
      
       // Ocultar el mapa después del registro exitoso
       setMapaVisible(false);
       
       // Limpiar formulario completo y enfocar teléfono
       limpiarFormularioCompleto();
       
       // Actualizar contador de viajes registrados
       await actualizarContadorReporte('viajesRegistrados');
       // Actualizar contador de viajes manuales
       await actualizarContadorReporte('viajesManuales');
       
       // Resetear empresa a "Efectivo" después de enviar exitosamente
       if (tipoEmpresa !== 'Efectivo') {
         setTipoEmpresa('Efectivo');
       }

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
      } else if (telefono.length >= 10) {
        coleccionNombre = 'clientestelefonos1';
      } else {
        console.log('❌ Tipo de teléfono no válido para guardar historial');
        return false;
      }

      // Buscar el cliente en la colección correspondiente
      let telefonoId = telefono;
      let clienteRef;
      let clienteSnapshot;

      if (telefono.length >= 10) {
        // Para celulares (10+ dígitos), usar el teléfono completo como ID
        telefonoId = telefono;
        console.log('📱 Buscando cliente con teléfono completo:', telefonoId);
          clienteRef = doc(db, coleccionNombre, telefonoId);
          clienteSnapshot = await getDoc(clienteRef);
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
        // Primero, desactivar todas las direcciones existentes
        direccionesActuales.forEach(dir => {
          dir.activa = false;
        });

        const nuevaDireccionData = {
            direccion: direccion,
          coordenadas: coordenadasNormalizadas,
          fechaRegistro: new Date(),
          activa: true, // La nueva dirección queda como principal
          modoRegistro: modoRegistro,
          sector: '' // Se puede agregar sector si está disponible
        };

        direccionesActuales.push(nuevaDireccionData);
        console.log('📍 Nueva dirección agregada al historial como principal:', nuevaDireccionData);

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
        coleccionNombre = 'clientestelefonos1';
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
            🔄 Cambiar Operador
          </h2>
          
          <p style={{
            color: '#6b7280',
            marginBottom: '25px',
            fontSize: '14px'
          }}>
            Ingrese el código del operador para cambiar de usuario
          </p>

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
            autoFocus
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
       boxSizing: 'border-box',
       position: 'sticky',
       top: 0,
       zIndex: 1000,
       backgroundColor: '#f3f4f6'
     }}>
      


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
          
          {/* Contador de dígitos del teléfono */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '50px',
            height: '48px',
            backgroundColor: telefono.length === 0 ? '#f3f4f6' :
                           telefono.length <= 7 ? '#fbbf24' :
                           telefono.length >= 10 ? '#34d399' : '#fbbf24',
            border: `3px solid ${telefono.length === 0 ? '#9ca3af' :
                               telefono.length <= 7 ? '#d97706' :
                               telefono.length >= 10 ? '#059669' : '#d97706'}`,
            borderRadius: 6,
            fontSize: '18px',
            fontWeight: '900',
            color: telefono.length === 0 ? '#4b5563' :
                   telefono.length <= 7 ? '#92400e' :
                   telefono.length >= 10 ? '#064e3b' : '#92400e',
            transition: 'all 0.3s ease',
            boxShadow: telefono.length > 0 ? '0 4px 8px rgba(0,0,0,0.15)' : 'none',
            textShadow: telefono.length > 0 ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
          }}>
            {telefono.length}
          </div>
          
          <div style={{
            display: 'flex',
            gap: '10px',
            flex: '1 1 200px',
            minWidth: '360px'
          }}>
            <select 
              value={tipoEmpresa}
              onChange={(e) => setTipoEmpresa(e.target.value)}
              style={{
                padding: '12px 16px',
                border: '2px solid #666',
                borderRadius: 4,
                fontSize: '18px',
                fontWeight: 'bold',
                flex: '1'
              }}
            >
              <option value="Efectivo">💵 Efectivo</option>
            </select>
            
            <select 
              value={modoSeleccionUI}
              onChange={(e) => {
                const nuevoModo = e.target.value;
                setModoSeleccionUI(nuevoModo);
                
                // Mantener compatibilidad con el sistema existente
                const textoCompleto = nuevoModo === 'Automática' ? 'Selección Automática' : 'Selección Manual';
                setTextoSeleccion(textoCompleto);
                
                // Actualizar la colección de configuración
                const nuevoEstado = nuevoModo === 'Automática';
                actualizarConfiguracion(nuevoEstado);
              }}
              style={{
                padding: '12px 16px',
                border: '2px solid #666',
                borderRadius: 4,
                fontSize: '18px',
                fontWeight: 'bold',
                flex: '1'
              }}
            >
              <option value="Manual">🔧 Manual</option>
              <option value="Automática">⚡ Automática</option>
            </select>
          </div>
        </div>

        {/* Indicador de tipo de empresa */}
        {tipoEmpresa !== 'Efectivo' && (
          <div style={{
            padding: '10px 15px',
            marginBottom: '15px',
            backgroundColor: '#e8f5e8',
            border: '2px solid #4caf50',
            borderRadius: 6,
            color: '#2e7d32',
            fontSize: '16px',
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            🏢 Empresa: <span style={{ color: '#1976d2' }}>{tipoEmpresa}</span>
            {siguienteAutorizacion && (
              <div style={{ marginTop: '5px', fontSize: '14px' }}>
                🔑 Siguiente autorización: <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>{siguienteAutorizacion}</span>
              </div>
            )}
          </div>
        )}

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
            onKeyDown={handleNombreKeyDown}
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
              display: 'none', // Ocultar el botón
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
          <div style={{ flex: '1 1 300px', minWidth: '250px', position: 'relative' }}>
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
                width: '100%',
                boxSizing: 'border-box'
              }}
            />
            
            {/* Botón para mostrar selector de direcciones */}
            {direccionesCliente.length > 0 && (
              <button
                type="button"
                onClick={() => setMostrarSelectorDirecciones(!mostrarSelectorDirecciones)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Seleccionar dirección guardada"
              >
                📍 {direccionesCliente.length}
              </button>
            )}
          </div>

          {/* ListBox de direcciones del cliente */}
          {mostrarSelectorDirecciones && direccionesCliente.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: 'white',
              border: '2px solid #3b82f6',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              maxHeight: '200px',
              overflowY: 'auto',
              marginTop: '4px'
            }}>
              <div style={{
                padding: '8px 12px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                fontWeight: 'bold',
                fontSize: '12px',
                color: '#374151',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>📍 Direcciones guardadas ({direccionesCliente.length})</span>
                <button
                  onClick={cerrarSelectorDirecciones}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '0'
                  }}
                >
                  ✖️
                </button>
              </div>
              
              {direccionesCliente.map((direccion, index) => (
                <div
                  key={index}
                  onClick={() => seleccionarDireccion(direccion)}
                  style={{
                    padding: '12px',
                    borderBottom: index < direccionesCliente.length - 1 ? '1px solid #e2e8f0' : 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    background: direccionSeleccionada === direccion ? '#f0f9ff' : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (direccionSeleccionada !== direccion) {
                      e.target.style.background = '#f8fafc';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (direccionSeleccionada !== direccion) {
                      e.target.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{
                    fontWeight: 'bold',
                    color: '#1f2937',
                    fontSize: '14px',
                    marginBottom: '4px'
                  }}>
                    {direccion.direccion}
                  </div>
                  {direccion.coordenadas && (
                    <div style={{
                      color: '#6b7280',
                      fontSize: '12px'
                    }}>
                      📍 {direccion.coordenadas}
                    </div>
                  )}
                  {direccionSeleccionada === direccion && (
                    <div style={{
                      color: '#3b82f6',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginTop: '4px'
                    }}>
                      ✓ Seleccionada
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
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
          
               <input
                 ref={baseInputRef}
                 type="text"
                 placeholder="Base"
                 value={base}
                 onChange={(e) => {
                   const valor = e.target.value;
                   console.log('🔍 Campo Base - Valor:', valor, 'Longitud:', valor.length);
                   
                   // Permitir números del 01-13 con formato de dos dígitos
                   // Validar que esté vacío, sea un solo dígito del 0-9, o sea 01-13 con dos dígitos
                   if (valor === '' || 
                       valor === '01' || valor === '02' || valor === '03' || valor === '04' || valor === '05' || 
                       valor === '06' || valor === '07' || valor === '08' || valor === '09' || 
                       valor === '10' || valor === '11' || valor === '12' || valor === '13' ||
                       // Permitir escritura progresiva (0, 1, 2, etc.)
                       valor === '0' || valor === '1' || valor === '2' || valor === '3' || valor === '4' || 
                       valor === '5' || valor === '6' || valor === '7' || valor === '8' || valor === '9') {
                     setBase(valor);
                     
                     // Si se completan 2 dígitos, saltar al campo tiempo
                     if (valor.length === 2) {
                       console.log('🚀 Base: Saltando al campo tiempo en 50ms');
                       setTimeout(() => {
                         if (tiempoInputRef.current) {
                           tiempoInputRef.current.focus();
                           console.log('✅ Base: Enfocado campo tiempo');
                         } else {
                           console.log('❌ Base: tiempoInputRef.current es null');
                         }
                       }, 50);
                     }
                   } else {
                     console.log('❌ Base: Valor no válido (solo números del 1-13):', valor);
                   }
                 }}
                 onKeyDown={(e) => {
                   // Navegación con flechas del teclado
                   if (e.key === 'ArrowRight' || e.key === 'Tab') {
                     e.preventDefault();
                     if (tiempoInputRef.current) {
                       tiempoInputRef.current.focus();
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
                   console.log('🔍 Campo Tiempo - Valor:', valor, 'Longitud:', valor.length);
                   // Solo permitir números y máximo 2 dígitos
                   if (/^\d{0,2}$/.test(valor)) {
                     setTiempo(valor);
                     // Si se completaron 2 dígitos, saltar al campo unidad
                     if (valor.length === 2) {
                       console.log('🚀 Tiempo: Saltando al campo unidad en 50ms');
                       setTimeout(() => {
                         if (unidadInputRef.current) {
                           unidadInputRef.current.focus();
                           console.log('✅ Tiempo: Enfocado campo unidad');
                         } else {
                           console.log('❌ Tiempo: unidadInputRef.current es null');
                         }
                       }, 50);
                     }
                   } else {
                     console.log('❌ Tiempo: Valor no válido (solo números):', valor);
                   }
                 }}
                 onKeyDown={(e) => {
                   // Navegación con flechas del teclado
                   if (e.key === 'ArrowLeft') {
                     e.preventDefault();
                     if (baseInputRef.current) {
                       baseInputRef.current.focus();
                     }
                   } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
                     e.preventDefault();
                     if (unidadInputRef.current) {
                       unidadInputRef.current.focus();
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
                  onChange={(e) => {
                    const valor = e.target.value;
                    setUnidad(valor);
                    // Solo actualizar el valor, no ejecutar automáticamente
                  }}
                  onKeyDown={(e) => {
                    // Navegación con flechas del teclado
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      if (tiempoInputRef.current) {
                        tiempoInputRef.current.focus();
                      }
                    }
                    // Enter para ejecutar acción
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
          mapaVisible={mapaVisible}
          setMapaVisible={setMapaVisible}
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
            {vistaActual === 'pedidos' ? '🚗 Pedidos Disponibles' : '📅 Reservas Pendientes'}
            <span style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 'normal'
            }}>
              {vistaActual === 'pedidos' ? `${viajesAsignados.length} disponibles` : `${reservasPendientes.length} reservas`}
            </span>
          </h3>
          
          <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              if (vistaActual === 'pedidos') {
                console.log('📅 Cambiando a vista de reservas');
                setVistaActual('reservas');
                cargarReservasPendientes();
              } else {
                console.log('🚗 Cambiando a vista de pedidos');
                setVistaActual('pedidos');
                cargarViajesAsignados();
              }
            }}
            style={{
              background: vistaActual === 'reservas' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: vistaActual === 'reservas' ? '#667eea' : 'white',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.3s'
            }}
          >
            {vistaActual === 'pedidos' ? '📅 Ver Reservas' : '🚗 Ver Pedidos'}
          </button>
          
          <button
            onClick={() => {
              console.log('🔄 Botón actualizar presionado');
              if (vistaActual === 'pedidos') {
                cargarViajesAsignados();
              } else {
                cargarReservasPendientes();
              }
            }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            🔄 Actualizar
          </button>
          
          <button
            onClick={() => {
              console.log('🔄 Botón sincronizar presionado');
              sincronizarCamposViajes();
            }}
            style={{
              background: 'rgba(255,165,0,0.8)', // Color naranja para diferenciarlo
              border: '1px solid rgba(255,165,0,0.5)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            🔄 Sincronizar Viajes
          </button>
          </div>
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
        ) : (vistaActual === 'pedidos' && viajesAsignados.length === 0) || (vistaActual === 'reservas' && reservasPendientes.length === 0) ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>
              {vistaActual === 'pedidos' ? '📋' : '📅'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
              {vistaActual === 'pedidos' ? 'No hay pedidos disponibles' : 'No hay reservas pendientes'}
            </div>
            <div style={{ fontSize: 14, marginBottom: 10 }}>
              {vistaActual === 'pedidos' 
                ? 'Los pedidos aparecerán aquí cuando se registren desde el formulario'
                : 'Las reservas aparecerán aquí cuando se creen desde el formulario'}
            </div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>
              Colección: {vistaActual === 'pedidos' ? 'pedidosDisponibles' : 'reservas'}
            </div>
            <button
              onClick={() => {
                console.log('🔍 Verificando conexión a Firestore...');
                if (vistaActual === 'pedidos') {
                  cargarViajesAsignados();
                } else {
                  cargarReservasPendientes();
                }
              }}
              style={{
                background: '#667eea',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              🔍 Verificar Conexión
            </button>
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
                     padding: '12px 8px',
                     textAlign: 'center',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap',
                     width: '80px'
                   }}>
                     🕐 Hora
                   </th>
                   <th style={{
                     padding: '12px 8px',
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap',
                     width: '120px'
                   }}>
                     📞 Teléfono
                   </th>
                   <th style={{
                     padding: '12px 6px',
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap',
                     width: '140px'
                   }}>
                     👤 Cliente
                   </th>
                   <th style={{
                     padding: '12px 6px',
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap',
                     width: '80px'
                   }}>
                     🎯 Destino
                   </th>
                   <th style={{
                     padding: '12px 12px',
                     textAlign: 'left',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap',
                     minWidth: '400px'
                   }}>
                     📍 Dirección
                   </th>
                  <th style={{
                    padding: '12px 4px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap',
                    width: '80px'
                  }}>
                    {vistaActual === 'reservas' ? '📅 Fecha' : '🏢 Base'}
                  </th>
                  <th style={{
                    padding: '12px 4px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap',
                    width: '90px'
                  }}>
                    {vistaActual === 'reservas' ? '🕐 Hora' : '⏱️ Tiempo'}
                  </th>
                   <th style={{
                     padding: '12px 4px',
                     textAlign: 'center',
                     fontWeight: 'bold',
                     color: '#374151',
                     borderBottom: '2px solid #e5e7eb',
                     whiteSpace: 'nowrap',
                     width: '80px'
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
                {(vistaActual === 'pedidos' ? viajesAsignados : reservasPendientes).map((viaje, index) => {
                  // Determinar el tipo de pedido basado en sus características
                  const tieneDireccionesCliente = viaje.direccionesCliente && Array.isArray(viaje.direccionesCliente) && viaje.direccionesCliente.length > 0;
                  const tieneTipoPedido = viaje.tipoPedido && viaje.tipoPedido !== '';
                  
                  // Determinar el tipo de pedido
                  let tipoPedido = 'basico'; // Por defecto
                  if (tieneDireccionesCliente) {
                    tipoPedido = 'conDirecciones';
                  } else if (tieneTipoPedido) {
                    tipoPedido = 'conTipoPedido';
                  } else {
                    tipoPedido = 'basico'; // Sin direccionesCliente ni tipoPedido
                  }
                  
                  // Colores de fondo basados en el tipo de pedido - MÁS INTENSOS
                  let colorFondoBase, colorFondoHover, colorBorde;
                  
                  if (tipoPedido === 'conDirecciones') {
                    // Verde para pedidos con direccionesCliente
                    colorFondoBase = '#dcfce7';
                    colorFondoHover = '#bbf7d0';
                    colorBorde = '#86efac';
                  } else if (tipoPedido === 'conTipoPedido') {
                    // Rojo para pedidos con tipoPedido
                    colorFondoBase = '#fee2e2';
                    colorFondoHover = '#fecaca';
                    colorBorde = '#f87171';
                  } else {
                    // Amarillo para pedidos básicos (sin direccionesCliente ni tipoPedido)
                    colorFondoBase = '#fef3c7';
                    colorFondoHover = '#fde68a';
                    colorBorde = '#f59e0b';
                  }
                  
                  return (
                    <tr
                      key={viaje.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        borderLeft: `4px solid ${colorBorde}`,
                        background: colorFondoBase,
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colorFondoHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = colorFondoBase;
                      }}
                    >
                     <td style={{
                       padding: '12px 8px',
                       textAlign: 'center',
                       fontWeight: 'bold',
                       color: '#1f2937',
                       width: '80px',
                       fontSize: '12px'
                     }}>
                       {(() => {
                         try {
                           // Para reservas, usar fechaHoraReserva. Para pedidos, los campos habituales
                           const fechaField = vistaActual === 'reservas' 
                             ? viaje.fechaHoraReserva 
                             : (viaje.fecha || viaje.createdAt || viaje.fechaCreacion || viaje.timestamp);
                           
                           if (fechaField) {
                             let fecha;
                             
                             // Si es un timestamp de Firestore (tiene método toDate)
                             if (fechaField.toDate && typeof fechaField.toDate === 'function') {
                               fecha = fechaField.toDate();
                             }
                             // Si es un string, intentar parsearlo
                             else if (typeof fechaField === 'string') {
                               // Formato 1: "20/9/2025, 11:13:30 p. m."
                               // Formato 2: "20 de septiembre de 2025, 10:51:41 p.m. UTC-5"
                               if (fechaField.includes(',')) {
                                 // Intentar parsear el string de fecha
                                 fecha = new Date(fechaField);
                                 
                                 // Si no se pudo parsear correctamente, intentar extraer la hora manualmente
                                 if (isNaN(fecha.getTime())) {
                                   const match = fechaField.match(/(\d{1,2}):(\d{2}):(\d{2})/);
                                   if (match) {
                                     const [, hora, minutos] = match;
                                     const horaNum = parseInt(hora);
                                     const minutosNum = parseInt(minutos);
                                     
                                     // Crear fecha actual pero con la hora extraída
                                     const fechaActual = new Date();
                                     fechaActual.setHours(horaNum, minutosNum, 0, 0);
                                     fecha = fechaActual;
                                   }
                                 }
                               } else {
                                 // Si no tiene coma, intentar parsear como timestamp
                                 fecha = new Date(fechaField);
                               }
                             }
                             // Si es un objeto Date o timestamp numérico
                             else {
                               fecha = new Date(fechaField);
                             }
                             
                             if (!isNaN(fecha.getTime())) {
                               return fecha.toLocaleTimeString('es-ES', {
                                 hour: '2-digit',
                                 minute: '2-digit',
                                 hour12: true
                               });
                             }
                           }
                           
                           // Si no hay campo de fecha, mostrar guión
                           return '-';
                         } catch (error) {
                           console.log('Error parsing fecha pedidosDisponibles:', viaje, error);
                           return '-';
                         }
                       })()}
                     </td>
                     <td style={{
                       padding: '12px 8px',
                       fontWeight: 'bold',
                       color: '#1f2937',
                       width: '120px'
                     }}>
                       {viaje.telefonoCompleto || viaje.telefono || '-'}
                     </td>
                     <td style={{
                       padding: '12px 6px',
                       color: '#374151',
                       position: 'relative',
                       width: '140px'
                     }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <span>{viaje.nombreCliente || viaje.codigo || '-'}</span>
                           {viaje.coleccion && (
                             <span style={{
                               fontSize: '10px',
                               color: viaje.coleccion === 'pedidosDisponibles' ? '#10b981' : '#6b7280',
                               fontWeight: 'bold'
                             }}>
                               {viaje.coleccion === 'pedidosDisponibles' ? '📊 DB1' : '📋 DB0'}
                             </span>
                           )}
                         </div>
                         {(!viaje.nombreCliente || viaje.nombreCliente === 'Desconocido' || !viaje.direccion || viaje.direccion === 'No especificada') && (
                           <button
                             onClick={() => abrirModalEditarCliente(viaje)}
                             style={{
                               background: '#3b82f6',
                               color: 'white',
                               border: 'none',
                               borderRadius: '4px',
                               padding: '4px 8px',
                               fontSize: '10px',
                               cursor: 'pointer',
                               display: 'flex',
                               alignItems: 'center',
                               gap: '4px'
                             }}
                             title="Editar datos del cliente"
                           >
                             ✏️
                           </button>
                         )}
                       </div>
                     </td>
                     <td style={{
                       padding: '12px 6px',
                       color: '#374151',
                       width: '80px',
                       overflow: 'hidden',
                       textOverflow: 'ellipsis',
                       whiteSpace: 'nowrap'
                     }}>
                       {(viaje.destino || '-').length > 10 ? `${(viaje.destino || '-').substring(0, 10)}...` : (viaje.destino || '-')}
                     </td>
                     <td style={{
                       padding: '12px 12px',
                       color: '#374151',
                       minWidth: '400px',
                       maxWidth: '500px'
                     }}>
                       {(() => {
                         // Obtener direcciones reales del pedido y del cliente
                         const direccionesReales = [];
                         
                         // 1. Agregar la dirección actual del pedido si existe
                         if (viaje.direccion && viaje.direccion.trim() !== '') {
                           direccionesReales.push({
                             direccion: viaje.direccion,
                             coordenadas: viaje.coordenadas || '',
                             tipo: 'actual'
                           });
                         }
                         
                         // 2. Agregar direcciones del array direccionesCliente del pedido si existe
                         if (viaje.direccionesCliente && Array.isArray(viaje.direccionesCliente)) {
                           viaje.direccionesCliente.forEach(dir => {
                             if (dir.direccion && dir.direccion.trim() !== '' && dir.direccion !== viaje.direccion) {
                               direccionesReales.push({
                                 direccion: dir.direccion,
                                 coordenadas: dir.coordenadas || '',
                                 tipo: 'cliente'
                               });
                             }
                           });
                         }
                         
                         // 3. Agregar direcciones cargadas del cliente si existen
                         const direccionesPedido = direccionesSeleccionadasPedidos[viaje.id];
                         if (direccionesPedido && direccionesPedido.direcciones && Array.isArray(direccionesPedido.direcciones)) {
                           direccionesPedido.direcciones.forEach(dir => {
                             if (dir.direccion && dir.direccion.trim() !== '' && dir.direccion !== viaje.direccion) {
                               // Verificar que no esté ya agregada
                               const yaExiste = direccionesReales.some(d => d.direccion === dir.direccion);
                               if (!yaExiste) {
                                 direccionesReales.push({
                                   direccion: dir.direccion,
                                   coordenadas: dir.coordenadas || '',
                                   tipo: 'cliente'
                                 });
                               }
                             }
                           });
                         }
                         
                         // 4. Si no hay direcciones reales, mostrar solo la actual o "Sin dirección"
                         if (direccionesReales.length === 0) {
                           direccionesReales.push({
                             direccion: viaje.direccion || 'Sin dirección',
                             coordenadas: viaje.coordenadas || '',
                             tipo: 'actual'
                           });
                         }
                         
                         return (
                           <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                             <select
                               value={viaje.direccion || ''}
                               onChange={(e) => {
                                 const direccionSeleccionada = direccionesReales.find(
                                   dir => dir.direccion === e.target.value
                                 );
                                 if (direccionSeleccionada) {
                                   // Determinar la colección correcta según el origen del pedido
                                   const coleccionNombre = viaje.coleccion || 'pedidosDisponibles';
                                   const pedidoRef = doc(db, coleccionNombre, viaje.id);
                                   updateDoc(pedidoRef, {
                                     direccion: direccionSeleccionada.direccion,
                                     coordenadas: direccionSeleccionada.coordenadas || '',
                                     actualizadoEn: serverTimestamp()
                                   });
                                   console.log('✅ Dirección actualizada en:', coleccionNombre, viaje.id);
                                 }
                               }}
                               style={{
                                 flex: 1,
                                 padding: '6px 8px',
                                 border: '1px solid #d1d5db',
                                 borderRadius: '4px',
                                 fontSize: '12px',
                                 backgroundColor: '#fff',
                                 color: '#374151',
                                 cursor: 'pointer'
                               }}
                             >
                               {direccionesReales.map((dir, idx) => (
                                 <option key={idx} value={dir.direccion}>
                                   {dir.tipo === 'actual' ? `📍 ${dir.direccion}` : `🏠 ${dir.direccion}`}
                                 </option>
                               ))}
                             </select>
                             <button
                               onClick={() => {
                                 // Mostrar input personalizado
                                 // eslint-disable-next-line no-restricted-globals
                                 const nuevaDireccion = prompt('Ingrese nueva dirección:');
                                 if (nuevaDireccion) {
                                   // Determinar la colección correcta según el origen del pedido
                                   const coleccionNombre = viaje.coleccion || 'pedidosDisponibles';
                                   const pedidoRef = doc(db, coleccionNombre, viaje.id);
                                   updateDoc(pedidoRef, {
                                     direccion: nuevaDireccion,
                                     actualizadoEn: serverTimestamp()
                                   });
                                   console.log('✅ Nueva dirección agregada en:', coleccionNombre, viaje.id);
                                 }
                               }}
                               style={{
                                 background: '#10b981',
                                 color: 'white',
                                 border: 'none',
                                 borderRadius: '4px',
                                 padding: '4px 6px',
                                 fontSize: '10px',
                                 cursor: 'pointer'
                               }}
                               title="Agregar dirección personalizada"
                             >
                               ➕
                             </button>
                             <button
                               onClick={async () => {
                                 const direccionActual = viaje.direccion;
                                 // eslint-disable-next-line no-restricted-globals
                                 const confirmar = confirm(`¿Está seguro de que desea eliminar la dirección "${direccionActual}" del cliente?`);
                                 if (confirmar) {
                                   try {
                                     // 1. Buscar el cliente por teléfono
                                     const q = query(collection(db, 'clientes'), where("telefono", "==", viaje.telefono));
                                     const snapshot = await getDocs(q);
                                     
                                     if (!snapshot.empty) {
                                       const clienteDoc = snapshot.docs[0];
                                       const clienteData = clienteDoc.data();
                                       
                                       // 2. Filtrar la dirección del array direccionesCliente
                                       if (clienteData.direccionesCliente && clienteData.direccionesCliente.length > 0) {
                                         const direccionesActualizadas = clienteData.direccionesCliente.filter(
                                           dir => dir.direccion !== direccionActual
                                         );
                                         
                                         // 3. Actualizar el documento del cliente
                                         await updateDoc(clienteDoc.ref, {
                                           direccionesCliente: direccionesActualizadas
                                         });
                                         
                                         console.log('📍 Dirección eliminada del cliente:', direccionActual);
                                       }
                                     }
                                     
                                     // 4. Limpiar la dirección del pedido
                                     const coleccionNombre = viaje.coleccion || 'pedidosDisponibles';
                                     const pedidoRef = doc(db, coleccionNombre, viaje.id);
                                     await updateDoc(pedidoRef, {
                                       direccion: '',
                                       coordenadas: '',
                                       actualizadoEn: serverTimestamp()
                                     });
                                     console.log('✅ Dirección eliminada del pedido en:', coleccionNombre, viaje.id);
                                     
                                     // eslint-disable-next-line no-restricted-globals
                                     alert('Dirección eliminada correctamente del cliente y del pedido.');
                                   } catch (error) {
                                     console.error('Error eliminando dirección:', error);
                                     // eslint-disable-next-line no-restricted-globals
                                     alert('Error al eliminar la dirección.');
                                   }
                                 }
                               }}
                               style={{
                                 background: '#ef4444',
                                 color: 'white',
                                 border: 'none',
                                 borderRadius: '4px',
                                 padding: '4px 6px',
                                 fontSize: '10px',
                                 cursor: 'pointer'
                               }}
                               title="Eliminar dirección del cliente y pedido"
                             >
                               🗑️
                             </button>
                           </div>
                         );
                       })()}
                     </td>
                     <td style={{
                       padding: '12px 4px',
                       textAlign: 'center',
                       fontWeight: 'bold',
                       color: '#7c3aed',
                       width: '80px'
                     }}>
                       {vistaActual === 'reservas' ? (
                         <div style={{ fontSize: 11, color: '#374151' }}>
                           {(() => {
                             try {
                               if (viaje.fechaHoraReserva) {
                                 const fecha = viaje.fechaHoraReserva.toDate 
                                   ? viaje.fechaHoraReserva.toDate() 
                                   : new Date(viaje.fechaHoraReserva);
                                 return fecha.toLocaleDateString('es-ES', {
                                   day: '2-digit',
                                   month: '2-digit',
                                   year: 'numeric'
                                 });
                               }
                               return '-';
                             } catch (e) {
                               return '-';
                             }
                           })()}
                         </div>
                       ) : (
                         <input
                           type="text"
                           value={editandoViaje === viaje.id ? baseEdit : (viaje.base || '')}
                           onChange={(e) => {
                             const valor = e.target.value;
                             // Permitir cualquier texto para base (sin restricciones)
                             if (editandoViaje !== viaje.id) {
                               iniciarEdicionViaje(viaje);
                             }
                             setBaseEdit(valor);
                           }}
                           style={{
                             width: '60px',
                             padding: '4px 6px',
                             border: '1px solid #ccc',
                             borderRadius: 4,
                             textAlign: 'center',
                             fontSize: 12,
                             fontWeight: 'bold',
                             backgroundColor: 'white'
                           }}
                           placeholder="Base"
                         />
                       )}
                     </td>
                     <td style={{
                       padding: '12px 4px',
                       textAlign: 'center',
                       fontWeight: 'bold',
                       color: '#059669',
                       width: '90px'
                     }}>
                       {vistaActual === 'reservas' ? (
                         <div style={{ fontSize: 11, color: '#374151' }}>
                           {(() => {
                             try {
                               if (viaje.fechaHoraReserva) {
                                 const fecha = viaje.fechaHoraReserva.toDate 
                                   ? viaje.fechaHoraReserva.toDate() 
                                   : new Date(viaje.fechaHoraReserva);
                                 return fecha.toLocaleTimeString('es-ES', {
                                   hour: '2-digit',
                                   minute: '2-digit',
                                   hour12: true
                                 });
                               }
                               return '-';
                             } catch (e) {
                               return '-';
                             }
                           })()}
                         </div>
                       ) : (
                         !viaje.tiempo ? (
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
                               width: '70px',
                               padding: '4px 6px',
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
                         )
                       )}
                     </td>
                     <td style={{
                       padding: '12px 4px',
                       textAlign: 'center',
                       fontWeight: 'bold',
                       color: '#dc2626',
                       fontSize: 16,
                       width: '80px'
                     }}>
                       {vistaActual === 'reservas' ? (
                         <input
                           type="text"
                           value={editandoViaje === viaje.id ? unidadEdit : (viaje.numeroUnidad || '')}
                           onChange={(e) => {
                             if (editandoViaje !== viaje.id) {
                               iniciarEdicionViaje(viaje);
                             }
                             setUnidadEdit(e.target.value);
                           }}
                           maxLength="3"
                           style={{
                             width: '60px',
                             padding: '4px 6px',
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
                               e.stopPropagation();
                               if (unidadEdit.trim()) {
                                 // Guardar unidad para la reserva
                                 guardarEdicionViaje(viaje.id);
                               }
                             }
                           }}
                         />
                       ) : (
                         !viaje.numeroUnidad ? (
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
                               padding: '4px 6px',
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
                         )
                       )}
                     </td>


                     <td style={{
                       padding: '12px 16px',
                       textAlign: 'center'
                     }}>
                       {vistaActual === 'reservas' ? (
                         <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                           <button
                             onClick={() => activarReserva(viaje)}
                             style={{
                               padding: '4px 8px',
                               borderRadius: 6,
                               border: 'none',
                               fontSize: 11,
                               fontWeight: 'bold',
                               cursor: 'pointer',
                               background: '#10b981',
                               color: 'white'
                             }}
                             title="Activar reserva y convertir en pedido en curso"
                           >
                             ✓
                           </button>
                           <button
                             onClick={() => cancelarReserva(viaje)}
                             style={{
                               padding: '4px 8px',
                               borderRadius: 6,
                               border: 'none',
                               fontSize: 11,
                               fontWeight: 'bold',
                               cursor: 'pointer',
                               background: '#ef4444',
                               color: 'white'
                             }}
                             title="Cancelar reserva"
                           >
                             ✕
                           </button>
                         </div>
                       ) : (
                         (viaje.tiempo && viaje.numeroUnidad) ? (
                           <button
                             onClick={() => abrirModalAccionesPedido(viaje, viaje.coleccion || 'pedidosDisponibles')}
                             style={{
                               padding: '4px 12px',
                               borderRadius: 20,
                               border: 'none',
                               fontSize: 12,
                               fontWeight: 'bold',
                               cursor: 'pointer',
                               background: '#10b981',
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
                             Asignado
                           </button>
                         ) : (
                           <button
                             onClick={() => cancelarPedidoDirecto(viaje, viaje.coleccion || 'pedidosDisponibles')}
                             style={{
                               padding: '4px 12px',
                               borderRadius: 20,
                               border: 'none',
                               fontSize: 12,
                               fontWeight: 'bold',
                               cursor: 'pointer',
                               background: tipoPedido === 'conDirecciones' ? '#16a34a' : 
                                          tipoPedido === 'conTipoPedido' ? '#dc2626' : 
                                          '#d97706',
                               color: 'white',
                               transition: 'all 0.2s ease'
                             }}
                             onMouseEnter={(e) => {
                               e.target.style.transform = 'scale(1.05)';
                               e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                               e.target.style.background = tipoPedido === 'conDirecciones' ? '#15803d' : 
                                                          tipoPedido === 'conTipoPedido' ? '#b91c1c' : 
                                                          '#b45309';
                             }}
                             onMouseLeave={(e) => {
                               e.target.style.transform = 'scale(1)';
                               e.target.style.boxShadow = 'none';
                               e.target.style.background = tipoPedido === 'conDirecciones' ? '#16a34a' : 
                                                          tipoPedido === 'conTipoPedido' ? '#dc2626' : 
                                                          '#d97706';
                             }}
                           >
                             Cancelar
                           </button>
                         )
                       )}
                     </td>
                   </tr>
                  );
                })}
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
                    whiteSpace: 'nowrap',
                    width: '80px'
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
                  
                  // Determinar el tipo de pedido basado en sus características (igual que en pedidos disponibles)
                  const tieneDireccionesCliente = pedido.direccionesCliente && Array.isArray(pedido.direccionesCliente) && pedido.direccionesCliente.length > 0;
                  const tieneTipoPedido = pedido.tipoPedido && pedido.tipoPedido !== '';
                  
                  // Determinar el tipo de pedido
                  let tipoPedido = 'basico'; // Por defecto
                  if (tieneDireccionesCliente) {
                    tipoPedido = 'conDirecciones';
                  } else if (tieneTipoPedido) {
                    tipoPedido = 'conTipoPedido';
                  } else {
                    tipoPedido = 'basico'; // Sin direccionesCliente ni tipoPedido
                  }
                  
                  // Colores de fondo basados en el tipo de pedido - MÁS INTENSOS
                  let colorFondoBase, colorFondoHover, colorBorde;
                  
                  if (tipoPedido === 'conDirecciones') {
                    // Verde para pedidos con direccionesCliente
                    colorFondoBase = '#dcfce7';
                    colorFondoHover = '#bbf7d0';
                    colorBorde = '#86efac';
                  } else if (tipoPedido === 'conTipoPedido') {
                    // Rojo para pedidos con tipoPedido
                    colorFondoBase = '#fee2e2';
                    colorFondoHover = '#fecaca';
                    colorBorde = '#f87171';
                  } else {
                    // Amarillo para pedidos básicos (sin direccionesCliente ni tipoPedido)
                    colorFondoBase = '#fef3c7';
                    colorFondoHover = '#fde68a';
                    colorBorde = '#f59e0b';
                  }
                  
                  // Si es pedido iniciado, usar colores especiales
                  if (esPedidoIniciado) {
                    colorFondoBase = '#fef3c7';
                    colorFondoHover = '#fde68a';
                    colorBorde = '#f59e0b';
                  }
                  
                  return (
                    <tr
                      key={pedido.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        borderLeft: `4px solid ${colorBorde}`,
                        background: colorFondoBase,
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colorFondoHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = colorFondoBase;
                      }}
                    >
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#1f2937',
                      width: '80px',
                      fontSize: '12px'
                    }}>
                      {(() => {
                        try {
                          // Buscar diferentes campos de fecha que puedan existir
                          const fechaField = pedido.fecha || pedido.createdAt || pedido.fechaCreacion || pedido.timestamp || pedido.fechaHoraReserva;
                          
                          if (fechaField) {
                            let fecha;
                            
                            // Si es un timestamp de Firestore (tiene método toDate)
                            if (fechaField.toDate && typeof fechaField.toDate === 'function') {
                              fecha = fechaField.toDate();
                            }
                            // Si es un string, intentar parsearlo
                            else if (typeof fechaField === 'string') {
                              // Formato 1: "20/9/2025, 11:13:30 p. m."
                              // Formato 2: "20 de septiembre de 2025, 10:51:41 p.m. UTC-5"
                              if (fechaField.includes(',')) {
                                // Intentar parsear el string de fecha
                                fecha = new Date(fechaField);
                                
                                // Si no se pudo parsear correctamente, intentar extraer la hora manualmente
                                if (isNaN(fecha.getTime())) {
                                  const match = fechaField.match(/(\d{1,2}):(\d{2}):(\d{2})/);
                                  if (match) {
                                    const [, hora, minutos] = match;
                                    const horaNum = parseInt(hora);
                                    const minutosNum = parseInt(minutos);
                                    
                                    // Crear fecha actual pero con la hora extraída
                                    const fechaActual = new Date();
                                    fechaActual.setHours(horaNum, minutosNum, 0, 0);
                                    fecha = fechaActual;
                                  }
                                }
                              } else {
                                // Si no tiene coma, intentar parsear como timestamp
                                fecha = new Date(fechaField);
                              }
                            }
                            // Si es un objeto Date o timestamp numérico
                            else {
                              fecha = new Date(fechaField);
                            }
                            
                            if (!isNaN(fecha.getTime())) {
                              return fecha.toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              });
                            }
                          }
                          
                          // Si no hay campo de fecha, mostrar guión
                          return '-';
                        } catch (error) {
                          console.log('Error parsing fecha pedidosEnCurso:', pedido, error);
                          return '-';
                        }
                      })()}
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
                    mapaVisible={true}
                    setMapaVisible={() => {}}
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

      {/* Modal de Reserva (F7) */}
      {modalReserva.open && (
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
            padding: '28px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '540px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#111827', fontSize: 20, fontWeight: 700 }}>
              📅 Crear Reserva
            </h3>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>👤 Cliente</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Nombre</div>
                  <input type="text" readOnly value={modalReserva.datosCliente.nombre}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Teléfono</div>
                  <input type="text" readOnly value={modalReserva.datosCliente.telefono}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Dirección</div>
                  <input type="text" readOnly value={modalReserva.datosCliente.direccion}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Fecha y Hora de la Reserva</div>
                <input
                  type="datetime-local"
                  value={modalReserva.fechaHora}
                  onChange={(e) => setModalReserva(prev => ({ ...prev, fechaHora: e.target.value }))}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Destino</div>
                <input
                  type="text"
                  placeholder="Ej. Aeropuerto, Centro Comercial, Dirección específica..."
                  value={modalReserva.destino}
                  onChange={(e) => setModalReserva(prev => ({ ...prev, destino: e.target.value }))}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Motivo</div>
                <textarea
                  rows="3"
                  value={modalReserva.motivo}
                  onChange={(e) => setModalReserva(prev => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ej. Traslado al aeropuerto, cliente solicita unidad a primera hora..."
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6, resize: 'vertical' }}
                />
              </div>

              {/* Mostrar información de empresa y autorización si no es Efectivo */}
              {tipoEmpresa && tipoEmpresa !== 'Efectivo' && (
                <div style={{ 
                  background: '#eff6ff', 
                  border: '1px solid #3b82f6', 
                  borderRadius: 8, 
                  padding: 12,
                  marginTop: 8
                }}>
                  <div style={{ fontSize: 14, color: '#1e40af', fontWeight: 600, marginBottom: 8 }}>
                    🏢 Información de Empresa
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Empresa</div>
                      <input
                        type="text"
                        value={tipoEmpresa}
                        readOnly
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          background: '#f8fafc',
                          color: '#374151',
                          fontWeight: 500
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={guardarReserva}
                disabled={guardandoReserva}
                style={{ 
                  padding: '10px 18px', 
                  border: 'none', 
                  borderRadius: 8, 
                  background: guardandoReserva ? '#9ca3af' : '#10b981', 
                  color: 'white', 
                  fontWeight: 700, 
                  cursor: guardandoReserva ? 'not-allowed' : 'pointer',
                  opacity: guardandoReserva ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
              >
                {guardandoReserva ? '⏳ Guardando...' : '💾 Guardar Reserva'}
              </button>
              <button
                onClick={() => setModalReserva(prev => ({ ...prev, open: false }))}
                disabled={guardandoReserva}
                style={{ 
                  padding: '10px 18px', 
                  border: '1px solid #6b7280', 
                  borderRadius: 8, 
                  background: 'transparent', 
                  color: '#374151', 
                  fontWeight: 700, 
                  cursor: guardandoReserva ? 'not-allowed' : 'pointer',
                  opacity: guardandoReserva ? 0.6 : 1
                }}
              >
                ❌ Cancelar
              </button>
            </div>
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

            {/* Sección para enviar mensaje al conductor */}
            <div style={{
              marginBottom: '20px',
              padding: '15px',
              background: '#f0f9ff',
              borderRadius: '8px',
              border: '1px solid #e0f2fe'
            }}>
              <h4 style={{
                margin: '0 0 10px 0',
                color: '#0f172a',
                fontSize: '14px',
                fontWeight: 'bold',
                textAlign: 'left'
              }}>
                ✉️ Enviar Mensaje Adicional al Conductor
              </h4>
              
              {modalAccionesPedido.pedido?.numeroUnidad && (
                <p style={{
                  margin: '0 0 10px 0',
                  color: '#64748b',
                  fontSize: '12px',
                  textAlign: 'left'
                }}>
                  🚗 Unidad: {modalAccionesPedido.pedido.numeroUnidad || modalAccionesPedido.pedido.unidad || 'Sin asignar'}
                  {modalAccionesPedido.pedido?.telefono && (
                    <span> | 📞 Tel: {modalAccionesPedido.pedido.telefono}</span>
                  )}
                </p>
              )}
              
              <textarea
                value={mensajeConductor}
                onChange={(e) => setMensajeConductor(e.target.value)}
                placeholder="Escriba un mensaje adicional para el conductor..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '10px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  marginBottom: '10px',
                  boxSizing: 'border-box'
                }}
              />
              
              <button
                onClick={enviarMensajeConductor}
                disabled={!mensajeConductor.trim()}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: mensajeConductor.trim() ? '#059669' : '#9ca3af',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: mensajeConductor.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (mensajeConductor.trim()) e.target.style.backgroundColor = '#047857';
                }}
                onMouseLeave={(e) => {
                  if (mensajeConductor.trim()) e.target.style.backgroundColor = '#059669';
                }}
              >
                📤 Enviar Mensaje
              </button>
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
                onClick={() => {
                  setMostrarReasignacion(!mostrarReasignacion);
                  if (!mostrarReasignacion) {
                    cargarUnidadesDisponibles();
                  }
                }}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#d97706';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#f59e0b';
                }}
              >
                🔄 Reasignar a Otra Unidad
              </button>

              {/* Sección de reasignación */}
              {mostrarReasignacion && (
                <div style={{
                  marginTop: '15px',
                  padding: '15px',
                  background: '#fef3c7',
                  borderRadius: '8px',
                  border: '1px solid #f59e0b'
                }}>
                  <h4 style={{
                    margin: '0 0 10px 0',
                    color: '#92400e',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textAlign: 'left'
                  }}>
                    🔄 Reasignar Pedido
                  </h4>
                  <p style={{
                    margin: '0 0 10px 0',
                    color: '#92400e',
                    fontSize: '12px',
                    textAlign: 'left'
                  }}>
                    Unidad actual: {modalAccionesPedido.pedido?.numeroUnidad || modalAccionesPedido.pedido?.unidad || 'Sin asignar'}
                  </p>
                  
                  <div style={{ marginBottom: '10px', position: 'relative' }}>
                    <div className="unidad-input-container" style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Nueva unidad"
                        value={nuevaUnidad}
                        onChange={(e) => {
                          setNuevaUnidad(e.target.value);
                          setMostrarUnidades(e.target.value.length > 0);
                        }}
                        onFocus={() => setMostrarUnidades(true)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                      
                      {/* Lista de unidades disponibles */}
                      {mostrarUnidades && unidadesDisponibles.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          maxHeight: '150px',
                          overflowY: 'auto',
                          zIndex: 1000,
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                        }}>
                          {unidadesDisponibles
                            .filter(unidad => 
                              String(unidad.numero).toLowerCase().includes(nuevaUnidad.toLowerCase()) ||
                              unidad.nombre.toLowerCase().includes(nuevaUnidad.toLowerCase())
                            )
                            .slice(0, 10)
                            .map((unidad, index) => (
                              <div
                                key={index}
                                onClick={() => {
                                  setNuevaUnidad(String(unidad.numero));
                                  setMostrarUnidades(false);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #f3f4f6',
                                  fontSize: '12px'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                              >
                                <div style={{ fontWeight: 'bold' }}>Unidad: {unidad.numero}</div>
                                <div style={{ color: '#6b7280' }}>
                                  {unidad.nombre} | {unidad.placa}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Información sobre tiempo y puerto que se mantienen */}
                  <div style={{
                    marginBottom: '10px',
                    padding: '8px 12px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '6px',
                    border: '1px solid #e0f2fe'
                  }}>
                    <p style={{
                      margin: '0',
                      color: '#0369a1',
                      fontSize: '12px',
                      textAlign: 'left'
                    }}>
                      📋 Se mantendrán: Tiempo: {modalAccionesPedido.pedido?.tiempo || modalAccionesPedido.pedido?.minutos || '5'} min | Puerto: {modalAccionesPedido.pedido?.puerto || '3005'}
                    </p>
                  </div>
                  
                  {/* Información de unidades disponibles */}
                  {unidadesDisponibles.length > 0 && (
                    <p style={{
                      margin: '0 0 10px 0',
                      color: '#92400e',
                      fontSize: '11px',
                      textAlign: 'left'
                    }}>
                      💡 {unidadesDisponibles.length} unidades disponibles. Escriba para filtrar.
                    </p>
                  )}
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={reasignarUnidad}
                      disabled={!nuevaUnidad.trim()}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: nuevaUnidad.trim() ? '#10b981' : '#9ca3af',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        cursor: nuevaUnidad.trim() ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s'
                      }}
                    >
                      ✅ Confirmar Reasignación
                    </button>
                    <button
                      onClick={() => {
                        setMostrarReasignacion(false);
                        setNuevaUnidad('');
                        setMostrarUnidades(false);
                      }}
                      style={{
                        padding: '10px 16px',
                        border: '1px solid #6b7280',
                        borderRadius: '6px',
                        backgroundColor: 'transparent',
                        color: '#374151',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      ❌ Cancelar
                    </button>
                  </div>
                </div>
              )}


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
                  {/* Mostrar autorización actual si existe */}
                  {modalAccionesPedido.pedido?.autorizacion && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: '#eef2ff',
                      color: '#3730a3',
                      fontWeight: 700,
                      textAlign: 'center'
                    }}>
                      🔐 Autorización: {modalAccionesPedido.pedido.autorizacion}
                    </div>
                  )}

                  <button
                    onClick={generarAutorizacionParaPedidoDisponible}
                    disabled={Boolean(modalAccionesPedido.pedido?.autorizacion)}
                    style={{
                      padding: '12px 20px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: Boolean(modalAccionesPedido.pedido?.autorizacion) ? '#9ca3af' : '#2563eb',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: Boolean(modalAccionesPedido.pedido?.autorizacion) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!modalAccionesPedido.pedido?.autorizacion) e.target.style.backgroundColor = '#1d4ed8';
                    }}
                    onMouseLeave={(e) => {
                      if (!modalAccionesPedido.pedido?.autorizacion) e.target.style.backgroundColor = '#2563eb';
                    }}
                  >
                    🔐 Generar Autorización
                  </button>

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

      {/* Modal de edición de datos del cliente */}
      {modalEditarCliente.open && (
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
              ✏️ Editar Datos del Cliente
            </h3>
            
            <div style={{
              marginBottom: '20px',
              padding: '15px',
              background: '#f8fafc',
              borderRadius: '8px',
              textAlign: 'left'
            }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#374151' }}>
                📞 Teléfono: {modalEditarCliente.pedido?.telefono || 'N/A'}
              </p>
              <p style={{ margin: '0', color: '#6b7280' }}>
                🏷️ Tipo: {modalEditarCliente.pedido?.tipopedido === 'Automático' ? 'Aplicación' : 'Manual'}
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: 'bold',
                color: '#374151',
                textAlign: 'left'
              }}>
                👤 Nombre del Cliente
              </label>
              <input
                type="text"
                value={modalEditarCliente.nombreCliente}
                onChange={(e) => setModalEditarCliente(prev => ({
                  ...prev,
                  nombreCliente: e.target.value
                }))}
                placeholder="Ingrese el nombre del cliente"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: 'bold',
                color: '#374151',
                textAlign: 'left'
              }}>
                📍 Dirección
              </label>
              <textarea
                value={modalEditarCliente.direccion}
                onChange={(e) => setModalEditarCliente(prev => ({
                  ...prev,
                  direccion: e.target.value
                }))}
                placeholder="Ingrese la dirección del cliente"
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={actualizarDatosCliente}
                style={{
                  padding: '12px 24px',
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
                💾 Guardar Cambios
              </button>

              <button
                onClick={cerrarModalEditarCliente}
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
                ✖️ Cancelar
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
            
            {/* Información del operador y número de autorización */}
            <div style={{
              background: '#f3f4f6',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '5px',
                    fontWeight: 'bold',
                    color: '#374151',
                    fontSize: '12px',
                    textAlign: 'center'
                  }}>
                    🔢 N° Autorización
                  </label>
                  <div style={{
                    padding: '8px 12px',
                    background: '#3b82f6',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textAlign: 'center'
                  }}>
                    {modalVoucher.voucher?.numeroAutorizacion || modalAccionesPedido.pedido?.autorizacion || siguienteNumeroAutorizacion}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Selector de tipo de voucher */}
            <div style={{
              background: '#f8fafc',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #e2e8f0'
            }}>
              <label style={{
                display: 'block',
                marginBottom: '10px',
                fontWeight: 'bold',
                color: '#374151',
                fontSize: '14px'
              }}>
                📋 Tipo de Voucher
              </label>
              <div style={{
                display: 'flex',
                gap: '15px'
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: modalVoucher.voucher.tipoVoucher === 'electronico' ? '#dbeafe' : 'transparent',
                  border: modalVoucher.voucher.tipoVoucher === 'electronico' ? '2px solid #3b82f6' : '2px solid #d1d5db'
                }}>
                  <input
                    type="radio"
                    name="tipoVoucher"
                    value="electronico"
                    checked={modalVoucher.voucher.tipoVoucher === 'electronico'}
                    onChange={(e) => setModalVoucher(prev => ({
                      ...prev,
                      voucher: { ...prev.voucher, tipoVoucher: e.target.value }
                    }))}
                    style={{ margin: 0 }}
                  />
                  <span style={{ fontWeight: '500' }}>💻 Voucher Electrónico</span>
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: modalVoucher.voucher.tipoVoucher === 'fisico' ? '#fef3c7' : 'transparent',
                  border: modalVoucher.voucher.tipoVoucher === 'fisico' ? '2px solid #f59e0b' : '2px solid #d1d5db'
                }}>
                  <input
                    type="radio"
                    name="tipoVoucher"
                    value="fisico"
                    checked={modalVoucher.voucher.tipoVoucher === 'fisico'}
                    onChange={(e) => setModalVoucher(prev => ({
                      ...prev,
                      voucher: { ...prev.voucher, tipoVoucher: e.target.value }
                    }))}
                    style={{ margin: 0 }}
                  />
                  <span style={{ fontWeight: '500' }}>📄 Voucher Físico</span>
                </label>
              </div>
            </div>
            
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
                  📅 Fecha y Hora de Inicio
                </label>
                <input
                  type="datetime-local"
                  value={modalVoucher.voucher.fechaHoraInicio}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, fechaHoraInicio: e.target.value }
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
                  📅 Fecha y Hora Final
                </label>
                <input
                  type="datetime-local"
                  value={modalVoucher.voucher.fechaHoraFinal}
                  onChange={(e) => setModalVoucher(prev => ({
                    ...prev,
                    voucher: { ...prev.voucher, fechaHoraFinal: e.target.value }
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
                  👤 Nombre del Cliente <span style={{ color: '#ef4444' }}>*</span>
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
                  placeholder="Ingrese el nombre del cliente"
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
                  placeholder="Ingrese el valor"
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
                  readOnly
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#f9fafb',
                    color: '#6b7280',
                    cursor: 'not-allowed'
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
                  🏢 Empresa <span style={{ color: '#ef4444' }}>*</span>
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
                    backgroundColor: 'white',
                    cursor: 'pointer'
                  }}
                  required
                  autoComplete="off"
                >
                  <option value="">Seleccione una empresa</option>
                  {empresasVoucher.map((empresa, index) => (
                    <option key={index} value={empresa}>
                      {empresa}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campo condicional para número de voucher físico */}
              {modalVoucher.voucher.tipoVoucher === 'fisico' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '5px',
                    fontWeight: 'bold',
                    color: '#374151'
                  }}>
                    🔢 Número de Voucher Físico <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={modalVoucher.voucher.numeroVoucherFisico}
                    onChange={(e) => setModalVoucher(prev => ({
                      ...prev,
                      voucher: { ...prev.voucher, numeroVoucherFisico: e.target.value }
                    }))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                    placeholder="Ingrese el número del voucher físico"
                    autoComplete="off"
                  />
                </div>
              )}

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
                  autoComplete="off"
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  🎯 Destino <span style={{ color: '#ef4444' }}>*</span>
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
                  placeholder="Ingrese el destino (campo obligatorio)"
                  required
                  autoComplete="off"
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
                  autoComplete="off"
                />
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'center'
            }}>
              <button
                onClick={guardarVoucherCorporativo}
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
function ReservasContent({ operadorAutenticado }) {
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [unidadAsignar, setUnidadAsignar] = useState({}); // {reservaId: valor}
  const [mostrarAsignadas, setMostrarAsignadas] = useState(false); // filtro: false = no asignadas (por defecto), true = asignadas

  useEffect(() => {
    const q = query(collection(db, 'reservas'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReservas(arr);
      setCargando(false);
    }, (e) => {
      console.error('Error cargando reservas:', e);
      setCargando(false);
    });
    return () => unsub();
  }, []);

  const validarTokenConductor = (token) => token && String(token).trim().length >= 100;

  const asignarUnidad = async (reserva) => {
    try {
      const unidad = (unidadAsignar[reserva.id] || '').trim();
      if (!unidad) return;

      // Buscar conductor por unidad
      const conductoresQuery = query(collection(db, 'conductores'), where('unidad', '==', unidad));
      const conductoresSnapshot = await getDocs(conductoresQuery);
      if (conductoresSnapshot.empty) {
        alert(`No se encontró un conductor con la unidad ${unidad}.`);
        return;
      }
      const conductorData = conductoresSnapshot.docs[0].data();

      // Validar estatus
      const estatusValor = conductorData && 'estatus' in conductorData ? conductorData.estatus : true;
      const estatusBool = typeof estatusValor === 'string' ? estatusValor.toLowerCase() !== 'false' : Boolean(estatusValor);
      if (!estatusBool) {
        alert(`La unidad ${unidad} está suspendida/inactiva. No se puede asignar.`);
        return;
      }

      // Preparar documento para pedidoEnCurso - SIEMPRE usar coordenadas fijas
      const latitud = '-0.2298500';
      const longitud = '-78.5249500';
      const fecha = reserva.fechaHoraReserva || new Date(); // Usar la fecha de la reserva original
      const clave = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Calcular autorización antes de crear el objeto
      let autorizacion = reserva.autorizacion || null;
      if (!autorizacion && reserva.tipoEmpresa && reserva.tipoEmpresa !== 'Efectivo') {
        autorizacion = await obtenerSiguienteAutorizacion();
      }

      const pedidoEnCursoData = {
        clave,
        codigo: reserva.nombreCliente || '',
        nombreCliente: reserva.nombreCliente || '',
        telefono: reserva.telefonoCompleto || reserva.telefono || '',
        telefonoCompleto: reserva.telefonoCompleto || '',
        direccion: reserva.direccion || '',
        base: 'aire',
        destino: reserva.destino || '',
        fecha,
        estado: 'Aceptado',
        pedido: 'Aceptado',
        idConductor: `conductor_${Date.now()}_${Math.random().toString(36).substring(2, 8)}@manual.com`,
        correo: conductorData.correo || conductorData.id || '',
        nombre: conductorData.nombre || '',
        nombreConductor: conductorData.nombre || '',
        placa: conductorData.placa || '',
        color: conductorData.color || '',
        telefonoConductor: conductorData.telefono || '',
        foto: conductorData.foto || '',
        tokenConductor: conductorData.token || '',
        tiempo: '0',
        numeroUnidad: unidad,
        unidad: unidad,
        minutos: 0,
        distancia: '0.00 Mts',
        latitudConductor: '',
        longitudConductor: '',
        latitud,
        longitud,
        latitudDestino: '',
        longitudDestino: '',
        sector: reserva.direccion || '',
        tipoPedido: 'Manual',
        valor: '',
        central: false,
        coorporativo: false,
        llegue: false,
        puerto: '3005',
        randon: clave,
        rango: reserva.coordenadas ? '1' : '0',
        viajes: '', // Se actualizará con el valor del campo valor
        tarifaSeleccionada: true,
        modoSeleccion: 'manual',
        modoAsignacion: 'manual',
        operadora: operadorAutenticado ? operadorAutenticado.nombre : 'Sin operador',
        origenReserva: true,
        reservaId: reserva.id,
        motivoReserva: reserva.motivo || '', // Preservar el motivo de la reserva
        fechaHoraReserva: reserva.fechaHoraReserva, // Preservar la fecha/hora original de la reserva
        // Información de empresa y autorización preservada de la reserva
        tipoEmpresa: reserva.tipoEmpresa || 'Efectivo',
        autorizacion: autorizacion,
      };

      const docRef = await addDoc(collection(db, 'pedidoEnCurso'), pedidoEnCursoData);
      await updateDoc(docRef, { id: docRef.id });

      // Duplicado en NotificaciOnenCurso
      try {
        await addDoc(collection(db, 'NotificaciOnenCurso'), {
          ...pedidoEnCursoData,
          id: docRef.id,
          fechaNotificacion: new Date(),
          estadoNotificacion: 'pendiente'
        });
      } catch {}

      // No borrar los datos de la reserva; opcionalmente marcar asignada
      try {
        await updateDoc(doc(db, 'reservas', reserva.id), {
          estado: 'asignada',
          unidadAsignada: unidad,
          fechaAsignacion: new Date()
        });
      } catch {}

      alert(`Reserva movida a En Curso con la unidad ${unidad}.`);
    } catch (error) {
      console.error('Error al asignar unidad a reserva:', error);
      alert('Error al asignar unidad a la reserva.');
    }
  };

  const formatearFecha = (date) => {
    try {
      const d = new Date(date?.seconds ? date.seconds * 1000 : date);
      return d.toLocaleString('es-EC');
    } catch {
      return '';
    }
  };

  // Derivados para filtro y conteos
  const toDate = (v) => {
    try {
      return new Date(v?.seconds ? v.seconds * 1000 : v);
    } catch {
      return null;
    }
  };
  const ahora = new Date();
  const reservasAsignadas = reservas.filter(r => String(r?.estado || '').toLowerCase() === 'asignada');
  const reservasAsignadasFuturas = reservasAsignadas.filter(r => {
    const d = toDate(r.fechaHoraReserva);
    return d && d >= ahora;
  });
  const reservasNoAsignadas = reservas.filter(r => String(r?.estado || '').toLowerCase() !== 'asignada');
  const listaMostrada = mostrarAsignadas ? reservasAsignadasFuturas : reservasNoAsignadas;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: '0 0 16px 0' }}>📅 Reservas</h2>

      {/* Controles de filtro */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
  <button
          onClick={() => setMostrarAsignadas(false)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            cursor: 'pointer',
            fontWeight: 700,
            background: !mostrarAsignadas ? '#3b82f6' : 'white',
            color: !mostrarAsignadas ? 'white' : '#111827'
          }}
        >
          No asignadas ({reservasNoAsignadas.length})
        </button>
        <button
          onClick={() => setMostrarAsignadas(true)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            cursor: 'pointer',
            fontWeight: 700,
            background: mostrarAsignadas ? '#3b82f6' : 'white',
            color: mostrarAsignadas ? 'white' : '#111827'
          }}
        >
          Asignadas ({reservasAsignadasFuturas.length})
        </button>
      </div>

      <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Cargando reservas...</div>
    ) : listaMostrada.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
      {mostrarAsignadas ? 'No hay reservas asignadas futuras.' : 'No hay reservas no asignadas.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: 12, textAlign: 'left' }}>Cliente</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Dirección</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Destino</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Fecha/Hora</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Motivo</th>
                  <th style={{ padding: 12, textAlign: 'center' }}>Unidad</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Estado</th>
                  <th style={{ padding: 12, textAlign: 'center' }}>Asignar Unidad</th>
                </tr>
              </thead>
              <tbody>
                {listaMostrada.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600 }}>{r.nombreCliente}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{r.telefono}</div>
                    </td>
                    <td style={{ padding: 12 }}>{r.direccion}</td>
                    <td style={{ padding: 12 }}>{r.destino || '-'}</td>
                    <td style={{ padding: 12 }}>{formatearFecha(r.fechaHoraReserva)}</td>
                    <td style={{ padding: 12 }}>{r.motivo}</td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      {String(r?.estado || '').toLowerCase() === 'asignada' && r.unidadAsignada ? (
                        <span style={{ padding: '4px 8px', borderRadius: 4, background: '#eef2ff', color: '#3730a3', fontSize: 12, fontWeight: 700 }}>{r.unidadAsignada}</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '4px 8px', borderRadius: 4, background: '#e5f9f1', color: '#059669', fontSize: 12, fontWeight: 600 }}>{r.estado}</span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      {String(r?.estado || '').toLowerCase() === 'asignada' ? (
                        <div style={{
                          display: 'inline-block',
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: '#f3f4f6',
                          color: '#111827',
                          fontWeight: 700
                        }}>
                          Unidad {r.unidadAsignada || '-'}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <input
                            type="text"
                            placeholder="Unidad"
                            value={unidadAsignar[r.id] || ''}
                            onChange={(e) => setUnidadAsignar(prev => ({ ...prev, [r.id]: e.target.value }))}
                            disabled={mostrarAsignadas}
                            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, width: 90, background: mostrarAsignadas ? '#f3f4f6' : 'white' }}
                          />
                          <button
                            onClick={() => asignarUnidad(r)}
                            disabled={mostrarAsignadas}
                            style={{ padding: '8px 12px', background: mostrarAsignadas ? '#9ca3af' : '#10b981', color: 'white', border: 'none', borderRadius: 6, cursor: mostrarAsignadas ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                          >
                            Asignar
                          </button>
                        </div>
                      )}
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
function ConductoresContent() {
  const [conductores, setConductores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editIndex, setEditIndex] = useState(null);
  const [editData, setEditData] = useState({});
  const [viewMode, setViewMode] = useState('cards'); // 'cards' o 'table'
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBy, setSearchBy] = useState('nombre'); // 'nombre' o 'unidad'
  const [activandoTaximetro, setActivandoTaximetro] = useState(false);
  const fileInputRef = useRef(null);
  const mostrarBtnTaximetroTodosDevLocal =
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Modal para cambio de estatus con motivo (Conductores)
  const [modalCambioEstatus, setModalCambioEstatus] = useState({
    open: false,
    conductor: null,
    nuevoEstatus: null,
  motivo: '',
  suspensionHasta: ''
  });

  const abrirModalCambioEstatus = (conductor) => {
    setModalCambioEstatus({
      open: true,
      conductor,
      nuevoEstatus: !conductor.estatus,
      motivo: '',
      suspensionHasta: ''
    });
  };

  const cerrarModalCambioEstatus = () => {
    setModalCambioEstatus({ open: false, conductor: null, nuevoEstatus: null, motivo: '', suspensionHasta: '' });
  };

  const confirmarCambioEstatus = async () => {
    if (!modalCambioEstatus.conductor) return;
    const { conductor, nuevoEstatus, motivo, suspensionHasta } = modalCambioEstatus;
    if (!motivo || motivo.trim().length < 3) {
      alert('Por favor, ingresa un motivo (mínimo 3 caracteres).');
      return;
    }
    // Si es suspensión, validar fecha/hora hasta
    let suspensionHastaDate = null;
    if (nuevoEstatus === false) {
      if (!suspensionHasta) {
        alert('Por favor, indica la fecha y hora hasta cuándo estará suspendida la unidad.');
        return;
      }
      const parsed = new Date(suspensionHasta);
      if (isNaN(parsed.getTime())) {
        alert('La fecha/hora ingresada no es válida.');
        return;
      }
      suspensionHastaDate = parsed;
    }

    try {
      // Actualizar en Firestore
      const conductorRef = doc(db, 'conductores', conductor.id);
      await updateDoc(conductorRef, {
        estatus: nuevoEstatus,
        motivoCambioEstatus: motivo.trim(),
        fechaCambioEstatus: new Date(),
        suspensionHasta: nuevoEstatus ? null : suspensionHastaDate
      });

      // Registrar evento en colección de auditoría: StatusUnidades (sin espacios)
      try {
        let changedBy = null;
        let operadorNombre = null;
        try {
          const { auth } = await import('../firebaseConfig');
          changedBy = auth?.currentUser?.email || null;
        } catch {}
        try {
          const almacenado = localStorage.getItem('operadorAutenticado');
          if (almacenado) {
            const op = JSON.parse(almacenado);
            operadorNombre = op?.nombre || null;
          }
        } catch {}

        const accion = nuevoEstatus ? 'Activación' : 'Suspensión';
        const registro = {
          conductorId: conductor.id,
          unidad: conductor.unidad || conductor.numeroUnidad || null,
          nombre: conductor.nombre || '',
          placa: conductor.placa || '',
          color: conductor.color || '',
          estado: nuevoEstatus ? 'Activo' : 'Inactivo',
          estatus: Boolean(nuevoEstatus),
          motivo: motivo.trim(),
          accion,
          fecha: new Date(),
          suspensionHasta: suspensionHastaDate || null,
          changedBy,
          operadorNombre
        };
        await addDoc(collection(db, 'StatusUnidades'), registro);
      } catch (eLog) {
        console.warn('No se pudo registrar cambio en StatusUnidades:', eLog);
      }

      // Actualizar estado local
      setConductores(prev => prev.map(c => c.id === conductor.id ? { ...c, estatus: nuevoEstatus } : c));

      // Enviar notificación a API externa (no bloqueante)
      try {
        const apiUrl = process.env.REACT_APP_ESTATUS_API_URL || 'http://147.93.130.33:3019/app1/send/message';
        const groupTo = process.env.REACT_APP_GROUP_TO_ID || '120363343871245265';
        const accion = nuevoEstatus ? 'Activación' : 'Suspensión';
        // Obtener operador autenticado (nombre desde localStorage o email desde auth)
        let operadorStr = '';
        try {
          const almacenado = localStorage.getItem('operadorAutenticado');
          if (almacenado) {
            const op = JSON.parse(almacenado);
            if (op?.nombre) operadorStr = op.nombre;
          }
        } catch {}
        if (!operadorStr) {
          try {
            const { auth } = await import('../firebaseConfig');
            operadorStr = auth?.currentUser?.email || '';
          } catch {}
        }
        const operadorTexto = operadorStr ? ` por ${operadorStr}` : '';

        let hastaTexto = '';
        if (!nuevoEstatus && suspensionHastaDate instanceof Date) {
          const dd = String(suspensionHastaDate.getDate()).padStart(2, '0');
          const mm = String(suspensionHastaDate.getMonth() + 1).padStart(2, '0');
          const yyyy = suspensionHastaDate.getFullYear();
          const hh = String(suspensionHastaDate.getHours()).padStart(2, '0');
          const min = String(suspensionHastaDate.getMinutes()).padStart(2, '0');
          // Fecha y hora por separado en el mensaje
          hastaTexto = ` Hasta: Fecha ${dd}-${mm}-${yyyy}. Hora ${hh}:${min}`;
        }

        const mensaje = `Unidad ${conductor.unidad || conductor.numeroUnidad || ''} - ${conductor.nombre || ''}: ${accion}${operadorTexto}. Motivo: ${motivo.trim()}.${hastaTexto}`;

        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ to: groupTo, message: mensaje }).toString()
        });
      } catch (errApi) {
        console.warn('No se pudo enviar el mensaje a la API externa:', errApi);
      }

      cerrarModalCambioEstatus();
      alert(`✅ Estatus ${nuevoEstatus ? 'activado' : 'suspendido'} correctamente`);
    } catch (error) {
      console.error('❌ Error al cambiar estatus:', error);
      alert('❌ Error al cambiar el estatus del conductor');
    }
  };

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
    setEditData({ ...conductor, btn_taximetro: conductor.btn_taximetro ?? true });
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
    const { name, type, value, checked } = e.target;
    const nextValue = type === 'checkbox' ? checked : value;
    setEditData(prev => ({ ...prev, [name]: nextValue }));
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

      // Default: btn_taximetro activo si no existe (y normalizar a boolean)
      if (datosParaGuardar.btn_taximetro === undefined || datosParaGuardar.btn_taximetro === null) {
        datosParaGuardar.btn_taximetro = true;
      } else if (typeof datosParaGuardar.btn_taximetro === 'string') {
        datosParaGuardar.btn_taximetro = datosParaGuardar.btn_taximetro.toLowerCase() === 'true';
      } else {
        datosParaGuardar.btn_taximetro = Boolean(datosParaGuardar.btn_taximetro);
      }
      
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

  const activarBtnTaximetroParaTodos = async () => {
    const ok = window.confirm('¿Activar "btn_taximetro" (Taxímetro) para TODOS los conductores?');
    if (!ok) return;

    setActivandoTaximetro(true);
    try {
      const snapshot = await getDocs(collection(db, 'conductores'));
      const docs = snapshot.docs;
      const docsAActualizar = docs.filter(d => d.data()?.btn_taximetro !== true);

      if (docsAActualizar.length === 0) {
        alert('✅ Ya está activado el Taxímetro (btn_taximetro) para todos.');
        return;
      }

      await Promise.all(docsAActualizar.map(d => updateDoc(d.ref, { btn_taximetro: true })));
      setConductores(prev => prev.map(c => ({ ...c, btn_taximetro: true })));

      alert(`✅ Taxímetro activado en ${docsAActualizar.length} conductores.`);
    } catch (error) {
      console.error('❌ Error al activar btn_taximetro para todos:', error);
      alert('❌ No se pudo activar el Taxímetro (btn_taximetro) para todos.');
    } finally {
      setActivandoTaximetro(false);
      try {
        fetchConductores();
      } catch {}
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
          {mostrarBtnTaximetroTodosDevLocal && (
            <button
              onClick={activarBtnTaximetroParaTodos}
              disabled={activandoTaximetro}
              style={{
                background: activandoTaximetro ? '#9ca3af' : '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '8px 12px',
                cursor: activandoTaximetro ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: 12
              }}
              title='[DEV LOCAL] Activar "btn_taximetro" para todos los conductores'
            >
              {activandoTaximetro ? '⏳ Activando...' : '⏱️ Taxímetro (todos)'}
            </button>
          )}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ minWidth: 90, textAlign: 'right' }}>Taxímetro:</strong>
                  {editIndex === conductor.id ? (
                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 'bold', color: '#374151' }}>
                      <input
                        type="checkbox"
                        name="btn_taximetro"
                        checked={Boolean(editData.btn_taximetro ?? true)}
                        onChange={handleChange}
                      />
                      {Boolean(editData.btn_taximetro ?? true) ? 'Activo' : 'Inactivo'}
                    </label>
                  ) : (
                    <span style={{ flex: 1 }}>{(conductor.btn_taximetro ?? true) ? 'Activo' : 'Inactivo'}</span>
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
                      onClick={() => abrirModalCambioEstatus(conductor)}
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
                      onClick={() => abrirModalCambioEstatus(conductor)}
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
                    ⏱️ Taxímetro
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
                      padding: '12px',
                      color: '#374151'
                    }}>
                      {editIndex === conductor.id ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' }}>
                          <input
                            type="checkbox"
                            name="btn_taximetro"
                            checked={Boolean(editData.btn_taximetro ?? true)}
                            onChange={handleChange}
                          />
                          {(Boolean(editData.btn_taximetro ?? true)) ? 'Sí' : 'No'}
                        </label>
                      ) : (
                        (conductor.btn_taximetro ?? true) ? 'Sí' : 'No'
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
                        {editIndex === conductor.id ? (
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
                              onClick={() => abrirModalCambioEstatus(conductor)}
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

      {/* Modal para confirmar cambio de estatus con motivo */}
      {modalCambioEstatus.open && (
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
            padding: 24,
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            width: '520px',
            maxWidth: '90vw'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 20, color: '#111827' }}>
              Cambiar estado de la unidad
            </h3>
            <p style={{ marginTop: 0, marginBottom: 16, color: '#374151' }}>
              {`Vas a ${modalCambioEstatus.nuevoEstatus ? 'activar' : 'suspender'} `}
              <strong>
                {modalCambioEstatus.conductor?.unidad ? `Unidad ${modalCambioEstatus.conductor.unidad}` : 'la unidad'}
              </strong>
              {modalCambioEstatus.conductor?.nombre ? ` (${modalCambioEstatus.conductor.nombre})` : ''}.
            </p>
            <label style={{ display: 'block', fontWeight: 'bold', color: '#374151', marginBottom: 6 }}>
              📝 Motivo
            </label>
            <textarea
              value={modalCambioEstatus.motivo}
              onChange={(e) => setModalCambioEstatus(prev => ({ ...prev, motivo: e.target.value }))}
              rows={3}
              placeholder={`Describe el motivo de la ${modalCambioEstatus.nuevoEstatus ? 'activación' : 'suspensión'} (mínimo 3 caracteres)`}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                resize: 'vertical',
                marginBottom: 16
              }}
            />
            {!modalCambioEstatus.nuevoEstatus && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 'bold', color: '#374151', marginBottom: 6 }}>
                  ⏰ Suspender hasta
                </label>
                <input
                  type="datetime-local"
                  value={modalCambioEstatus.suspensionHasta}
                  onChange={(e) => setModalCambioEstatus(prev => ({ ...prev, suspensionHasta: e.target.value }))}
                  style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
                />
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                  Indica fecha y hora límite de la suspensión. La unidad permanecerá inactiva hasta ese momento.
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={confirmarCambioEstatus}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  borderRadius: 8,
                  backgroundColor: modalCambioEstatus.nuevoEstatus ? '#10b981' : '#ef4444',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {modalCambioEstatus.nuevoEstatus ? '✅ Activar' : '⛔ Suspender'}
              </button>
              <button
                onClick={cerrarModalCambioEstatus}
                style={{
                  padding: '10px 18px',
                  border: '2px solid #6b7280',
                  borderRadius: 8,
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  fontSize: 14,
                  fontWeight: 'bold',
                  cursor: 'pointer'
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

  // Función para calcular resumen de estados (agrupado)
  const calcularResumenEstados = (viajes) => {
    let completados = 0;
    let cancelados = 0;

    viajes.forEach(viaje => {
      const estadoRaw = (viaje.estado || viaje.pedido || '').toString().toLowerCase();
      const tipoRaw = (viaje.tipoPedido || viaje.tipopedido || viaje.tipoViaje || '').toString().toLowerCase();

      const esAceptado = estadoRaw.includes('aceptado') || estadoRaw.includes('finalizado');
      const esAutomatico = tipoRaw.includes('auto');
      const esCanceladoCliente = estadoRaw.includes('cancelado por cliente');
      const esSinAsignar = estadoRaw.includes('sin asignar');
      const esNoHuboUnidad = estadoRaw.includes('no hubo unidad');

      if (esAceptado || esAutomatico) {
        completados += 1;
      }

      if (esCanceladoCliente || esSinAsignar || esNoHuboUnidad) {
        cancelados += 1;
      }
    });

    return {
      'Viajes Completados': completados,
      'Cancelados': cancelados
    };
  };

  // Función para calcular resumen de tipos de viaje (solo Manual/Automático)
  const calcularResumenTipos = (viajes) => {
    const resumen = { 'Manual': 0, 'Automático': 0 };
    viajes.forEach(viaje => {
      const tipoRaw = (viaje.tipoPedido || viaje.tipopedido || viaje.tipoViaje || 'sin tipo').toString().toLowerCase();
      if (tipoRaw.includes('auto')) {
        resumen['Automático'] += 1;
      } else {
        // Todo lo demás, incluyendo "sin tipo", se considera Manual
        resumen['Manual'] += 1;
      }
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
  // Contadores para badges del encabezado
  const completadosCount = (resumenEstados && resumenEstados['Viajes Completados']) ? resumenEstados['Viajes Completados'] : 0;
  const canceladosCount = (resumenEstados && resumenEstados['Cancelados']) ? resumenEstados['Cancelados'] : 0;
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '6px 0 10px 0', alignItems: 'center' }}>
          <span style={{
            background: canceladosCount > 0 ? '#ef4444' : '#2563eb',
            color: 'white',
            borderRadius: '9999px',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            Total: {viajes.length}
          </span>
          <span style={{
            background: '#10b981',
            color: 'white',
            borderRadius: '9999px',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            Completados: {completadosCount}
          </span>
          <span style={{
            background: '#ef4444',
            color: 'white',
            borderRadius: '9999px',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            Cancelados: {canceladosCount}
          </span>
        </div>
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

          {/* Exportar a Excel (Reporte de Viajes) */}
          <button
            onClick={() => {
              try {
                const headers = [
                  'Fecha',
                  'Teléfono',
                  'Dirección',
                  'Sector',
                  'Nombre',
                  'Cliente',
                  'Tipo Pedido',
                  'Unidad',
                  'Valor',
                  'Rating',
                  'Comentario',
                  'Estado'
                ];

                const rows = viajes.map((viaje) => {
                  const estadoTexto = ((viaje.estado || viaje.pedido || '') + '').toLowerCase();
                  const esSinUnidad = /sin asignar|no hubo unidad/.test(estadoTexto);
                  const telefono = viaje.telefono || viaje.telefonoCompleto || '';
                  const direccion = viaje.direccion || '';
                  const sector = viaje.sector || viaje.direccion || '';
                  const nombre = viaje.nombre || '';
                  const nombreCliente = viaje.nombreCliente || viaje.codigo || '';
                  const tipoPedido = viaje.tipoPedido || viaje.tipopedido || viaje.tipoViaje || '';
                  const unidad = esSinUnidad ? '0' : (viaje.numeroUnidad || viaje.unidad || viaje.viajes || '');
                  const valorMostrar = (viaje.valor || viaje.montoTotalCalculado) ? (Number(viaje.valor || viaje.montoTotalCalculado) || 0).toFixed(2) : '0.00';
                  const fechaMostrar = (() => {
                    const fm = formatearFechaMostrar(viaje.fecha);
                    return (fm === 'N/A' && typeof viaje.fecha === 'string') ? viaje.fecha : fm;
                  })();

                  const ratingRaw = (viaje?.rating ?? viaje?.calificacion ?? viaje?.puntuacion ?? viaje?.valoracion ?? viaje?.evaluacion ?? (viaje?.feedback && (viaje.feedback.rating ?? viaje.feedback.calificacion ?? viaje.feedback.puntuacion)));
                  const ratingNum = Number(ratingRaw);
                  const ratingOut = !isNaN(ratingNum) && ratingNum > 0 ? `${Math.max(1, Math.min(5, Math.round(ratingNum)))}` : '';
                  const comentarioOut = (viaje?.comment ?? viaje?.comentario ?? viaje?.comentarios ?? viaje?.observacion ?? viaje?.observaciones ?? (viaje?.feedback && (viaje.feedback.comment ?? viaje.feedback.comentario ?? viaje.feedback.observacion))) || '';
                  const estadoOut = (viaje.estado || viaje.pedido || '') + '';

                  return [
                    fechaMostrar,
                    telefono,
                    direccion,
                    sector,
                    nombre,
                    nombreCliente,
                    tipoPedido,
                    unidad,
                    `$${valorMostrar}`,
                    ratingOut,
                    comentarioOut,
                    estadoOut
                  ];
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws['!cols'] = [
                  { wch: 20 }, // Fecha
                  { wch: 16 }, // Teléfono
                  { wch: 35 }, // Dirección
                  { wch: 25 }, // Sector
                  { wch: 20 }, // Nombre
                  { wch: 20 }, // Cliente
                  { wch: 14 }, // Tipo Pedido
                  { wch: 8 },  // Unidad
                  { wch: 10 }, // Valor
                  { wch: 8 },  // Rating
                  { wch: 40 }, // Comentario
                  { wch: 14 }  // Estado
                ];
                XLSX.utils.book_append_sheet(wb, ws, 'Viajes');
                const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.href = url;
                const hoyISO = new Date().toISOString().split('T')[0];
                link.download = `reporte_viajes_${hoyISO}.xlsx`;
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                  if (link.parentNode) link.parentNode.removeChild(link);
                  try { URL.revokeObjectURL(url); } catch {}
                }, 0);
              } catch (err) {
                console.error('Error al exportar Excel:', err);
                alert('No se pudo exportar el Excel.');
              }
            }}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.target.style.background = '#059669'}
            onMouseLeave={(e) => e.target.style.background = '#10b981'}
          >
            📥 Exportar Excel
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
                      {[
                        '📅 Fecha',
                        '📱 Teléfono',
                        '📍 Dirección',
                        '👨‍💼 Nombre',
                        '👤 Cliente',
                        '�‍💼 Operador',
                        '�🚖 Tipo Pedido',
                        '🔢 Unidad',
                        '🏷️ Estado',
                        '⭐ Rating',
                        '💬 Comentario'
                      ].map((titulo) => (
                        <th key={titulo} style={{
                          padding: '15px 12px',
                          textAlign: 'left',
                          fontWeight: 'bold',
                          color: '#374151',
                          borderBottom: '1px solid #e5e7eb'
                        }}>
                          {titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {viajes.map((viaje) => {
                      const estadoInfo = obtenerEstadoConColor(viaje.estado || viaje.pedido);
                      const estadoTexto = ((viaje.estado || viaje.pedido || '') + '').toLowerCase();
                      const esSinUnidad = /sin asignar|no hubo unidad/.test(estadoTexto);
                      // Derivados con tolerancia a variantes de nombres de campo
                      const telefono = viaje.telefono || viaje.telefonoCompleto || 'N/A';
                      const direccion = viaje.direccion || 'N/A';
                      // const sector = viaje.sector || viaje.direccion || 'N/A'; // Eliminado de la tabla
                      const nombre = viaje.nombre || 'N/A';
                      const nombreCliente = viaje.nombreCliente || viaje.codigo || 'N/A';
                      const tipoPedido = viaje.tipoPedido || viaje.tipopedido || viaje.tipoViaje || 'Sin Tipo';
                      const unidad = esSinUnidad ? '0' : (viaje.numeroUnidad || viaje.unidad || viaje.viajes || 'N/A');
                      // const valorMostrar = formatearValor(viaje.valor || viaje.montoTotalCalculado || 0); // Eliminado de la tabla
                      // Feedback
                      const ratingRaw = (viaje?.rating ?? viaje?.calificacion ?? viaje?.puntuacion ?? viaje?.valoracion ?? viaje?.evaluacion ?? (viaje?.feedback && (viaje.feedback.rating ?? viaje.feedback.calificacion ?? viaje.feedback.puntuacion)));
                      const ratingNum = Number(ratingRaw);
                      const ratingOut = !isNaN(ratingNum) && ratingNum > 0 ? '★'.repeat(Math.max(1, Math.min(5, Math.round(ratingNum)))) : (typeof ratingRaw === 'string' ? ratingRaw : '');
                      const comentarioOut = (viaje?.comment ?? viaje?.comentario ?? viaje?.comentarios ?? viaje?.observacion ?? viaje?.observaciones ?? (viaje?.feedback && (viaje.feedback.comment ?? viaje.feedback.comentario ?? viaje.feedback.observacion))) || '';
                      // Operador/operadora
                      const operadorOut = (viaje?.operador && (viaje.operador.nombre || viaje.operador.name)) || viaje?.operadora || viaje?.operador || viaje?.operator || viaje?.atendidoPor || '';
                      const fechaMostrada = (() => {
                        const fm = formatearFechaMostrar(viaje.fecha);
                        return (fm === 'N/A' && typeof viaje.fecha === 'string') ? viaje.fecha : fm;
                      })();

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
                          <td style={{ padding: '12px', color: '#6b7280', fontSize: '13px' }}>{fechaMostrada}</td>
                          <td style={{ padding: '12px', color: '#374151', fontFamily: 'monospace' }}>{telefono}</td>
                          <td style={{ padding: '12px', color: '#374151', maxWidth: '240px', wordWrap: 'break-word' }}>{direccion}</td>
                          {/* Sector eliminado */}
                          <td style={{ padding: '12px', color: '#374151' }}>{nombre}</td>
                          <td style={{ padding: '12px', color: '#1f2937', fontWeight: 500 }}>{nombreCliente}</td>
                          <td style={{ padding: '12px', color: '#374151' }}>{operadorOut || '—'}</td>
                          <td style={{ padding: '12px', color: '#374151' }}>{tipoPedido}</td>
                          <td style={{ padding: '12px', color: '#374151' }}>{unidad}</td>
                          <td style={{ padding: '12px' }}>
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
                          <td style={{ padding: '12px', color: '#374151' }}>{ratingOut || '—'}</td>
                          <td style={{ padding: '12px', color: '#374151', maxWidth: '260px', wordWrap: 'break-word' }}>{(comentarioOut && `${comentarioOut}`.trim()) ? `${comentarioOut}` : '—'}</td>
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

// Gestión de Operadores
function OperadoresContent() {
  const [operadores, setOperadores] = useState([]);
  const [cargandoOperadores, setCargandoOperadores] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoOperador, setNuevoOperador] = useState({ nombre: '', usuario: '', codigo: '' });
  const [errorFormulario, setErrorFormulario] = useState('');

  // Cargar operadores
  const cargarOperadores = async () => {
    setCargandoOperadores(true);
    try {
      const operadoresRef = collection(db, 'operadores');
      const snapshot = await getDocs(operadoresRef);
      const operadoresData = snapshot.docs.map(docu => ({ id: docu.id, ...docu.data() }));
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
      // Verificar usuario único
      const operadoresRef = collection(db, 'operadores');
      const qUsuario = query(operadoresRef, where('usuario', '==', nuevoOperador.usuario));
      const snapUsuario = await getDocs(qUsuario);
      if (!snapUsuario.empty) {
        setErrorFormulario('El usuario ya existe');
        return;
      }
      // Verificar código único
      const qCodigo = query(operadoresRef, where('codigo', '==', nuevoOperador.codigo));
      const snapCodigo = await getDocs(qCodigo);
      if (!snapCodigo.empty) {
        setErrorFormulario('El código ya existe');
        return;
      }
      // Crear
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
      await cargarOperadores();
      alert('✅ Operador creado exitosamente');
    } catch (error) {
      console.error('❌ Error al crear operador:', error);
      setErrorFormulario('Error al crear el operador');
    }
  };

  // Eliminar operador
  const eliminarOperador = async (operadorId) => {
    if (window.confirm('¿Está seguro de que desea eliminar este operador?')) {
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

function VouchersContent({ operadorAutenticado }) {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    empresa: '',
    fechaInicio: '',
    fechaFin: '',
    numeroAutorizacion: ''
  });
  const [voucherSeleccionado, setVoucherSeleccionado] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [siguienteNumeroAutorizacion, setSiguienteNumeroAutorizacion] = useState(40000);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [voucherEditado, setVoucherEditado] = useState({});

  // Cargar vouchers
  const cargarVouchers = async () => {
    try {
      setLoading(true);
      const vouchersRef = collection(db, 'voucherCorporativos');
      // Solo traer vouchers con estado "Activo" (completos)
      const q = query(vouchersRef, where('estado', '==', 'Activo'));
      const querySnapshot = await getDocs(q);
      
      const vouchersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar por fecha de creación en el cliente
      vouchersData.sort((a, b) => {
        const fechaA = a.fechaCreacion?.toDate ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion);
        const fechaB = b.fechaCreacion?.toDate ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion);
        return fechaB - fechaA; // Orden descendente
      });
      
      console.log('✅ Vouchers cargados:', vouchersData.length, 'vouchers con estado Activo');
      setVouchers(vouchersData);
    } catch (error) {
      console.error('Error al cargar vouchers:', error);
    } finally {
      setLoading(false);
    }
  };

  // Aplicar filtros
  const aplicarFiltros = () => {
    console.log('🔍 Aplicando filtros a vouchers:', {
      totalVouchers: vouchers.length,
      filtros: filtros,
      vouchers: vouchers.map(v => ({ id: v.id, numeroAutorizacion: v.numeroAutorizacion, estado: v.estado, empresa: v.empresa }))
    });
    
    const resultado = vouchers.filter(voucher => {
      const cumpleEmpresa = !filtros.empresa || 
        voucher.empresa?.toLowerCase().includes(filtros.empresa.toLowerCase());
      
      const cumpleNumeroAutorizacion = !filtros.numeroAutorizacion || 
        voucher.numeroAutorizacion?.toString().includes(filtros.numeroAutorizacion);
      
      let cumpleFecha = true;
      if (filtros.fechaInicio && voucher.fechaCreacion) {
        const fechaVoucher = voucher.fechaCreacion.toDate ? 
          voucher.fechaCreacion.toDate() : new Date(voucher.fechaCreacion);
        const fechaInicio = new Date(filtros.fechaInicio);
        cumpleFecha = fechaVoucher >= fechaInicio;
      }
      
      if (filtros.fechaFin && voucher.fechaCreacion) {
        const fechaVoucher = voucher.fechaCreacion.toDate ? 
          voucher.fechaCreacion.toDate() : new Date(voucher.fechaCreacion);
        const fechaFin = new Date(filtros.fechaFin);
        cumpleFecha = cumpleFecha && fechaVoucher <= fechaFin;
      }
      
      const cumple = cumpleEmpresa && cumpleNumeroAutorizacion && cumpleFecha;
      console.log(`🔍 Voucher ${voucher.numeroAutorizacion}:`, {
        cumpleEmpresa,
        cumpleNumeroAutorizacion,
        cumpleFecha,
        cumple
      });
      
      return cumple;
    });
    
    console.log('🔍 Resultado filtros:', resultado.length, 'vouchers encontrados');
    return resultado;
  };

  // Formatear fecha
  const formatearFecha = (fecha) => {
    if (!fecha) return 'N/A';
    if (fecha.toDate) {
      return fecha.toDate().toLocaleString('es-EC');
    }
    return new Date(fecha).toLocaleString('es-EC');
  };

  // Obtener color del estado
  const obtenerColorEstado = (estado) => {
    switch (estado) {
      case 'Activo': return '#10b981';
      case 'Cancelado': return '#ef4444';
      case 'Finalizado': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  // Ver detalles del voucher
  const verDetalles = (voucher) => {
    setVoucherSeleccionado(voucher);
    setMostrarModal(true);
  };

  // Cerrar modal
  const cerrarModal = () => {
    setVoucherSeleccionado(null);
    setMostrarModal(false);
    setModoEdicion(false);
    setVoucherEditado({});
  };

  // Abrir modo de edición
  const abrirEdicion = () => {
    setModoEdicion(true);
    setVoucherEditado({ ...voucherSeleccionado });
  };

  // Cancelar edición
  const cancelarEdicion = () => {
    setModoEdicion(false);
    setVoucherEditado({});
  };

  // Guardar edición
  const guardarEdicion = async () => {
    try {
      const voucherRef = doc(db, 'voucherCorporativos', voucherSeleccionado.id);
      await updateDoc(voucherRef, {
        nombreCliente: voucherEditado.nombreCliente,
        empresa: voucherEditado.empresa,
        destino: voucherEditado.destino,
        direccion: voucherEditado.direccion,
        valor: voucherEditado.valor,
        motivo: voucherEditado.motivo,
        fechaHoraInicio: voucherEditado.fechaHoraInicio,
        fechaHoraFinal: voucherEditado.fechaHoraFinal,
        fechaActualizacion: new Date()
      });

      // Actualizar el voucher seleccionado
      setVoucherSeleccionado({ ...voucherSeleccionado, ...voucherEditado });
      setModoEdicion(false);
      setVoucherEditado({});
      
      // Recargar la lista de vouchers
      cargarVouchers();
      
      alert('Voucher actualizado exitosamente');
    } catch (error) {
      console.error('Error al actualizar voucher:', error);
      alert('Error al actualizar el voucher');
    }
  };



  // Cargar datos al montar el componente
  useEffect(() => {
    cargarVouchers();
    obtenerSiguienteNumeroAutorizacion();
  }, []);

  // Función para obtener el siguiente número de autorización
  const obtenerSiguienteNumeroAutorizacion = async () => {
    try {
      const vouchersRef = collection(db, 'voucherCorporativos');
      const q = query(vouchersRef, orderBy('numeroAutorizacion', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const ultimoVoucher = querySnapshot.docs[0].data();
        const siguienteNumero = Math.max(40000, (ultimoVoucher.numeroAutorizacion || 39999) + 1);
        setSiguienteNumeroAutorizacion(siguienteNumero);
      } else {
        setSiguienteNumeroAutorizacion(40000);
      }
    } catch (error) {
      console.error('Error al obtener número de autorización:', error);
      setSiguienteNumeroAutorizacion(40000);
    }
  };

  const vouchersFiltrados = aplicarFiltros();

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#1f2937' }}>Gestión de Vouchers</h2>
        <p style={{ margin: 0, color: '#6b7280' }}>Administra los vouchers corporativos del sistema.</p>
        {operadorAutenticado && (
          <div style={{
            marginTop: '10px',
            padding: '8px 12px',
            background: '#f3f4f6',
            borderRadius: '6px',
            border: '1px solid #e5e7eb',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '14px', color: '#374151' }}>👤 Operador:</span>
            <span style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              color: '#1f2937',
              background: '#3b82f6',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px'
            }}>
              {operadorAutenticado.nombre}
            </span>
          </div>
        )}
      </div>

      {/* Resumen Superior */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px'
      }}>
        {/* Total de Vouchers */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 'bold',
            color: '#3b82f6',
            marginBottom: '8px'
          }}>
            {vouchersFiltrados.length}
          </div>
          <div style={{
            fontSize: '14px',
            color: '#6b7280',
            fontWeight: '500'
          }}>
            Total de Vouchers
          </div>
        </div>

        {/* Valor Total */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 'bold',
            color: '#f59e0b',
            marginBottom: '8px'
          }}>
            ${vouchersFiltrados.reduce((total, voucher) => {
              const valor = parseFloat(voucher.valor) || 0;
              return total + valor;
            }, 0).toFixed(2)}
          </div>
          <div style={{
            fontSize: '14px',
            color: '#6b7280',
            fontWeight: '500'
          }}>
            Valor Total
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{
        background: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#374151' }}>Filtros</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#374151' }}>
              Empresa
            </label>
            <input
              type="text"
              value={filtros.empresa}
              onChange={(e) => setFiltros(prev => ({ ...prev, empresa: e.target.value }))}
              placeholder="Buscar por empresa..."
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#374151' }}>
              N° Autorización
            </label>
            <input
              type="text"
              value={filtros.numeroAutorizacion}
              onChange={(e) => setFiltros(prev => ({ ...prev, numeroAutorizacion: e.target.value }))}
              placeholder="Buscar por número..."
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#374151' }}>
              Fecha Inicio
            </label>
            <input
              type="date"
              value={filtros.fechaInicio}
              onChange={(e) => setFiltros(prev => ({ ...prev, fechaInicio: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#374151' }}>
              Fecha Fin
            </label>
            <input
              type="date"
              value={filtros.fechaFin}
              onChange={(e) => setFiltros(prev => ({ ...prev, fechaFin: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>
        
        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setFiltros({
              empresa: '',
              fechaInicio: '',
              fechaFin: '',
              numeroAutorizacion: ''
            })}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Limpiar Filtros
          </button>
          
          <button
            onClick={cargarVouchers}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🔄 Actualizar
          </button>
          
          <button
            onClick={() => {
              const vouchersFiltrados = aplicarFiltros();
              
              // Crear datos para XLSX
              const headers = [
                'N° Autorización',
                'Cliente',
                'Teléfono',
                'Empresa',
                'Operador',
                'Dirección',
                'Destino',
                'Unidad',
                'Estado',
                'Valor',
                'Fecha'
              ];
              
              // Crear array de datos para XLSX
              const excelData = [
                headers,
                ...vouchersFiltrados.map(voucher => [
                  voucher.numeroAutorizacion,
                  voucher.nombreCliente,
                  voucher.telefono,
                  voucher.empresa,
                  voucher.operadora || 'Sin operador',
                  voucher.direccion,
                  voucher.destino,
                  voucher.numeroUnidad,
                  voucher.estado,
                  voucher.valor,
                  formatearFecha(voucher.fechaCreacion)
                ])
              ];
              
              // Crear workbook y worksheet
              const wb = XLSX.utils.book_new();
              const ws = XLSX.utils.aoa_to_sheet(excelData);
              
              // Ajustar ancho de columnas
              const colWidths = [
                { wch: 15 }, // N° Autorización
                { wch: 20 }, // Cliente
                { wch: 15 }, // Teléfono
                { wch: 20 }, // Empresa
                { wch: 30 }, // Dirección
                { wch: 25 }, // Destino
                { wch: 10 }, // Unidad
                { wch: 12 }, // Estado
                { wch: 12 }, // Valor
                { wch: 20 }  // Fecha
              ];
              ws['!cols'] = colWidths;
              
              // Agregar worksheet al workbook
              XLSX.utils.book_append_sheet(wb, ws, 'Vouchers');
              
              // Generar archivo XLSX
              const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
              const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              
              // Descargar archivo
              const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.href = url;
              link.download = `vouchers_${new Date().toISOString().split('T')[0]}.xlsx`;
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              // Cleanup safely in next tick to avoid DOM removal race conditions
              setTimeout(() => {
                if (link.parentNode) {
                  link.parentNode.removeChild(link);
                }
                try { URL.revokeObjectURL(url); } catch {}
              }, 0);
            }}
            style={{
              padding: '8px 16px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            📊 Descargar Reporte
          </button>
        </div>
      </div>



      {/* Lista de Vouchers */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Cargando vouchers...
          </div>
        ) : vouchersFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            No se encontraron vouchers con los filtros aplicados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    N° Autorización
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Cliente
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Teléfono
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Empresa
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Operador
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Dirección
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Destino
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Unidad
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Estado
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Valor
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Fecha
                  </th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {vouchersFiltrados.map((voucher) => (
                  <tr key={voucher.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td>
                      {voucher.numeroAutorizacion}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                      {voucher.nombreCliente}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#374151' }}>
                      {voucher.telefono}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#374151' }}>
                      {voucher.empresa}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#374151' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        background: '#3b82f6',
                        color: 'white'
                      }}>
                        {voucher.operadora || 'Sin operador'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#374151' }}>
                      {voucher.direccion}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1f2937' }}>
                      {voucher.destino}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#374151' }}>
                      {voucher.numeroUnidad}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        background: obtenerColorEstado(voucher.estado) + '20',
                        color: obtenerColorEstado(voucher.estado)
                      }}>
                        {voucher.estado}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500', color: '#059669' }}>
                      {'$'}{voucher.valor}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#6b7280' }}>
                      {formatearFecha(voucher.fechaCreacion)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => verDetalles(voucher)}
                        style={{
                          padding: '6px 12px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        👁️ Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Detalles */}
      {mostrarModal && voucherSeleccionado && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>Detalles del Voucher</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {!modoEdicion && (
                  <button
                    onClick={abrirEdicion}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    ✏️ Editar
                  </button>
                )}
                <button
                  onClick={cerrarModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            
            <div style={{ display: 'grid', gap: '15px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Cliente</label>
                  {modoEdicion ? (
                    <input
                      type="text"
                      value={voucherEditado.nombreCliente || ''}
                      onChange={(e) => setVoucherEditado({...voucherEditado, nombreCliente: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        fontWeight: '500',
                        color: '#1f2937'
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#1f2937' }}>
                      {voucherSeleccionado.nombreCliente}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Teléfono</label>
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {voucherSeleccionado.telefono}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Empresa</label>
                  {modoEdicion ? (
                    <input
                      type="text"
                      value={voucherEditado.empresa || ''}
                      onChange={(e) => setVoucherEditado({...voucherEditado, empresa: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        color: '#374151'
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '16px', color: '#374151' }}>
                      {voucherSeleccionado.empresa}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Número Autorización</label>
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {voucherSeleccionado.numeroAutorizacion}
                  </div>
                </div>
              </div>
              
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Destino</label>
                {modoEdicion ? (
                  <input
                    type="text"
                    value={voucherEditado.destino || ''}
                    onChange={(e) => setVoucherEditado({...voucherEditado, destino: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '16px',
                      color: '#374151'
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {voucherSeleccionado.destino}
                  </div>
                )}
              </div>
              
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Dirección</label>
                {modoEdicion ? (
                  <input
                    type="text"
                    value={voucherEditado.direccion || ''}
                    onChange={(e) => setVoucherEditado({...voucherEditado, direccion: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '16px',
                      color: '#374151'
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {voucherSeleccionado.direccion}
                  </div>
                )}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Unidad</label>
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {voucherSeleccionado.numeroUnidad}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Estado</label>
                  <div style={{ fontSize: '16px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: '500',
                      background: obtenerColorEstado(voucherSeleccionado.estado) + '20',
                      color: obtenerColorEstado(voucherSeleccionado.estado)
                    }}>
                      {voucherSeleccionado.estado}
                    </span>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Valor</label>
                  {modoEdicion ? (
                    <input
                      type="number"
                      step="0.01"
                      value={voucherEditado.valor || ''}
                      onChange={(e) => setVoucherEditado({...voucherEditado, valor: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#059669'
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#059669' }}>
                      {'$'}{voucherSeleccionado.valor}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Fecha</label>
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {formatearFecha(voucherSeleccionado.fechaCreacion)}
                  </div>
                </div>
              </div>
              
              {voucherSeleccionado.informacionViaje && (
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Información del Viaje</label>
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {voucherSeleccionado.informacionViaje}
                  </div>
                </div>
              )}
              
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Motivo</label>
                {modoEdicion ? (
                  <input
                    type="text"
                    value={voucherEditado.motivo || ''}
                    onChange={(e) => setVoucherEditado({...voucherEditado, motivo: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '16px',
                      color: '#374151'
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '16px', color: '#374151' }}>
                    {voucherSeleccionado.motivo || 'Sin motivo'}
                  </div>
                )}
              </div>

              {/* Campos adicionales para edición */}
              {modoEdicion && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Fecha/Hora Inicio</label>
                      <input
                        type="datetime-local"
                        value={voucherEditado.fechaHoraInicio || ''}
                        onChange={(e) => setVoucherEditado({...voucherEditado, fechaHoraInicio: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '16px',
                          color: '#374151'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Fecha/Hora Final</label>
                      <input
                        type="datetime-local"
                        value={voucherEditado.fechaHoraFinal || ''}
                        onChange={(e) => setVoucherEditado({...voucherEditado, fechaHoraFinal: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '16px',
                          color: '#374151'
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Botones de acción cuando está en modo edición */}
            {modoEdicion && (
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                justifyContent: 'flex-end', 
                marginTop: '20px',
                paddingTop: '20px',
                borderTop: '1px solid #e5e7eb'
              }}>
                <button
                  onClick={cancelarEdicion}
                  style={{
                    padding: '10px 20px',
                    border: '2px solid #6b7280',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: '#6b7280',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarEdicion}
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Guardar Cambios
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// Componente principal
function MainContent({ activeSection, operadorAutenticado, setOperadorAutenticado, reporteDiario, setReporteDiario, authTrigger, setIsCollapsed }) {
  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <TaxiForm 
          operadorAutenticado={operadorAutenticado}
          setOperadorAutenticado={setOperadorAutenticado}
          reporteDiario={reporteDiario}
          setReporteDiario={setReporteDiario}
          authTrigger={authTrigger}
          setIsCollapsed={setIsCollapsed}
        />;

      case 'conductores':
        return <ConductoresContent />;
      case 'mapa-conductores':
        return <DriverTracking />;
      case 'reportes':
        return <ReportesContent />;
      case 'pedidos-archivados':
        return (
          <div style={{ padding: '2rem' }}>
            <ReporteViajes />
          </div>
        );
      case 'operadores':
        return <OperadoresContent />;
      case 'vouchers':
        return <VouchersContent operadorAutenticado={operadorAutenticado} />;
      case 'reservas':
        return <ReservasContent operadorAutenticado={operadorAutenticado} />;
      // Las opciones de WhatsApp ahora se abren en ventanas nuevas
      // para evitar problemas de SSL
      default:
        return <TaxiForm 
          operadorAutenticado={operadorAutenticado}
          setOperadorAutenticado={setOperadorAutenticado}
          reporteDiario={reporteDiario}
          setReporteDiario={setReporteDiario}
          authTrigger={authTrigger}
          setIsCollapsed={setIsCollapsed}
        />;
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