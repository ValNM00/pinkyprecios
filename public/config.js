// Configuración de la página. Los precios vienen de las funciones en /api (carpeta netlify/functions).
window.APP_CONFIG = {
  nombre: 'PinkyPrecios',
  logo: 'img/logo.png',
  mostrarNombre: true,
  api: '/api',

  // Cuentas de usuario (Supabase Auth). La clave "publishable" es pública por diseño:
  // la seguridad la dan las reglas de la tabla datos_usuario (cada quien solo ve lo suyo).
  supabaseUrl: 'https://nlyqnsuytfbmkjorgeyi.supabase.co',
  supabaseClavePublica: 'sb_publishable_2fpCVSn1pwa841K-O3OuYQ_JNct-wkz',

  // Contacto y autoría
  autora: 'Valeria Naranjo',
  correo: 'naranjov740@gmail.com',
  whatsapp: '50689376664',          // con código de país, sin + ni espacios
  whatsappVisible: '+506 8937 6664'
};
