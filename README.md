# App Plaza

Una aplicación React para gestión de servicios de plaza, con autenticación usando Firebase, funcionalidades de login, registro y dashboard.

## Características

- 🔐 Autenticación con Firebase
- 📱 Interfaz responsive
- 🎨 Diseño moderno y limpio
- 📊 Dashboard con funcionalidades avanzadas
- 🔒 Protección de rutas

## Tecnologías Utilizadas

- React 19.1.0
- Firebase 12.0.0
- Axios 1.11.0
- Google Maps React Wrapper 1.2.0

## Instalación

1. Clona el repositorio:
```bash
git clone <url-del-repositorio>
cd app-plaza
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura Firebase:
   - Crea un proyecto en [Firebase Console](https://console.firebase.google.com/)
   - Obtén las credenciales de configuración
   - Crea un archivo `.env.local` en la raíz del proyecto con:
   ```
   REACT_APP_FIREBASE_API_KEY=tu_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=tu_auth_domain
   REACT_APP_FIREBASE_PROJECT_ID=tu_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=tu_messaging_sender_id
   REACT_APP_FIREBASE_APP_ID=tu_app_id
   ```

4. Ejecuta la aplicación:
```bash
npm start
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

## Scripts Disponibles

- `npm start` - Ejecuta la aplicación en modo desarrollo
- `npm test` - Ejecuta las pruebas
- `npm run build` - Construye la aplicación para producción
- `npm run eject` - Expone la configuración de webpack (irreversible)

## Estructura del Proyecto

```
src/
├── components/          # Componentes reutilizables
│   ├── Header.js       # Header de la aplicación
│   ├── MainContent.js  # Contenido principal
│   └── Sidebar.js      # Barra lateral
├── AuthContext.js      # Contexto de autenticación
├── Dashboard.js        # Página del dashboard
├── Login.js           # Página de login
├── firebaseConfig.js  # Configuración de Firebase
└── App.js            # Componente principal
```

## Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT.
