// Sistema de protección de rutas - redirige al login si no está autenticado
const AuthGuard = {
  // Páginas que requieren estar logueado
  protectedPages: [
    'mis-boletos.html',
    'mis-ordenes.html',
    'mis-eventos.html',
    'organizar-evento.html',
    'aplicar-organizador.html',
    'admin-dashboard.html'
  ],

  roleProtectedPages: {
    'mis-eventos.html': ['administrador', 'organizador'],
    'organizar-evento.html': ['administrador', 'organizador'],
    'admin-dashboard.html': ['administrador']
  },

  normalizeRole(rol) {
    const value = (rol ?? '').toString().trim().toLowerCase();
    if (value === '3' || value === 'admin' || value === 'administrador') return 'administrador';
    if (value === '2' || value === 'organizador') return 'organizador';
    return 'usuario';
  },

  resolveUserRoleValue(usuario) {
    if (!usuario || typeof usuario !== 'object') return '';
    return usuario.rol ?? usuario.role ?? usuario.rol_id ?? usuario.id_rol ?? usuario.idRol ?? '';
  },

  getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('usuario') || 'null');
    } catch (_error) {
      return null;
    }
  },

  async syncUserProfile(usuarioLocal) {
    if (!api?.obtenerPerfil || !api.obtenerToken()) {
      return usuarioLocal;
    }

    try {
      const response = await api.obtenerPerfil();
      const perfil = response?.usuario;
      if (!perfil) return usuarioLocal;

      const mergedUser = {
        ...usuarioLocal,
        ...perfil,
        rol: perfil.rol ?? usuarioLocal?.rol,
        rol_id: perfil.rol_id ?? usuarioLocal?.rol_id,
        id_rol: perfil.id_rol ?? usuarioLocal?.id_rol
      };

      localStorage.setItem('usuario', JSON.stringify(mergedUser));
      return mergedUser;
    } catch (_error) {
      return usuarioLocal;
    }
  },

  init() {
    this.checkAuthentication();
  },

  async checkAuthentication() {
    const token = api.obtenerToken();
    const currentPage = this.getCurrentPage();

    if (!this.isProtectedPage(currentPage)) {
      return true;
    }

    // Si está en una página protegida y no tiene token, redirigir al login
    if (!token) {
      window.location.href = 'login.html';
      return false;
    }

    const allowedRoles = this.roleProtectedPages[currentPage] || null;
    if (!allowedRoles) {
      return true;
    }

    const usuarioLocal = this.getStoredUser();
    const usuario = await this.syncUserProfile(usuarioLocal);
    const roleValue = this.resolveUserRoleValue(usuario);
    const normalizedRole = this.normalizeRole(roleValue);

    if (!allowedRoles.includes(normalizedRole)) {
      window.location.href = 'inicio.html';
      return false;
    }

    return true;
  },

  getCurrentPage() {
    const pathname = window.location.pathname;
    return pathname.split('/').pop() || 'index.html';
  },

  isProtectedPage(page) {
    return this.protectedPages.some((protectedPage) => page.includes(protectedPage));
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
