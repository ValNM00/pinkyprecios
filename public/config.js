// Configuración de la página. Los precios vienen de las funciones en /api (carpeta netlify/functions).
window.APP_CONFIG = {
  nombre: 'PinkyPrecios',
  logo: 'img/logo.png',      // Ícono de la barra (carpeta img/)
  mostrarNombre: true,       // false si el logo ya incluye el nombre escrito
  api: '/api'                // No cambiar salvo que muevas las funciones
};
