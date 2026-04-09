// Sistema de protección de rutas - redirige al login si no está autenticado
const AuthGuard = {
  // Páginas que requieren estar logueado
  protectedPages: [
    'mis-boletos.html',
    'mis-ordenes.html',
    'mis-eventos.html',
    'perfil.html',
    'aplicar-organizador.html',
    'admin-dashboard.html'
  ],

  init() {
    this.checkAuthentication();
  },

  checkAuthentication() {
    const token = api.obtenerToken();
    const currentPage = this.getCurrentPage();

    // Si está en una página protegida y no tiene token, redirigir al login
    if (this.isProtectedPage(currentPage) && !token) {
      window.location.href = 'login.html';
      return false;
    }

    return true;
  },

  getCurrentPage() {
    const pathname = window.location.pathname;
    return pathname.split('/').pop() || 'index.html';
  },

  isProtectedPage(page) {
    return this.protectedPages.some(protectedPage => page.includes(protectedPage));
  }
};

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof api !== 'undefined') {
      AuthGuard.init();
    }
  });
} else {
  if (typeof api !== 'undefined') {
    AuthGuard.init();
  }
}
