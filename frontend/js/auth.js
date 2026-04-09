// Módulo de autenticación
const AuthModule = {
  lucideScriptPromise: null,

  ensureLucideLoaded() {
    if (window.lucide) {
      return Promise.resolve();
    }

    if (this.lucideScriptPromise) {
      return this.lucideScriptPromise;
    }

    this.lucideScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lucide-script="1"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Lucide.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/lucide@latest';
      script.defer = true;
      script.setAttribute('data-lucide-script', '1');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Lucide.'));
      document.head.appendChild(script);
    });

    return this.lucideScriptPromise;
  },

  renderLucideIcons() {
    if (!window.lucide?.createIcons) return;
    window.lucide.createIcons({
      attrs: {
        'stroke-width': 2,
        class: 'lucide-icon'
      },
      nameAttr: 'data-lucide'
    });
  },

  isAdminRole(rol) {
    const value = (rol ?? '').toString().trim().toLowerCase();
    return value === 'administrador' || value === 'admin' || value === '3';
  },

  getHomeByRole(usuario) {
    if (this.isAdminRole(usuario?.rol)) {
      return 'admin-dashboard.html';
    }

    return 'inicio.html';
  },

  config: {
    loginForm: '#formLogin',
    registerForm: '#formRegistro',
    loginContainer: '.login-container',
    registerContainer: '.register-container'
  },

  init() {
    this.ensureLucideLoaded().catch(() => null);
    this.setupEventListeners();
    this.checkAuth();
  },

  setupEventListeners() {
    const loginForm = document.querySelector(this.config.loginForm);
    const registerForm = document.querySelector(this.config.registerForm);

    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    if (registerForm) {
      registerForm.addEventListener('submit', (e) => this.handleRegister(e));
    }
  },

  async handleLogin(e) {
    e.preventDefault();

    const email = document.querySelector('#email')?.value;
    const password = document.querySelector('#password')?.value;

    if (!email || !password) {
      this.showError('Por favor completa todos los campos');
      return;
    }

    try {
      const response = await api.login(email, password);

      if (response.success) {
        api.setToken(response.token);
        localStorage.setItem('usuario', JSON.stringify(response.usuario));
        
        this.showSuccess('¡Bienvenido!');
        setTimeout(() => {
          window.location.href = this.getHomeByRole(response.usuario);
        }, 1500);
      }
    } catch (error) {
      this.showError(error.message);
    }
  },

  async handleRegister(e) {
    e.preventDefault();

    const nombre = document.querySelector('#nombre')?.value;
    const email = document.querySelector('#email')?.value;
    const password = document.querySelector('#password')?.value;
    const confirmPassword = document.querySelector('#confirmPassword')?.value;
    const telefono = document.querySelector('#telefono')?.value;

    if (!nombre || !email || !password || !confirmPassword) {
      this.showError('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      this.showError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      this.showError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      const response = await api.registrar(nombre, email, password, telefono);

      if (response.success) {
        this.showSuccess('¡Registro exitoso! Redirigiendo al login...');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
      } else {
        this.showError(response.message);
      }
    } catch (error) {
      this.showError(error.message);
    }
  },

  checkAuth() {
    const token = api.obtenerToken();
    const usuarioGuardado = localStorage.getItem('usuario');
    const usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : null;
    const paginaActual = window.location.pathname.toLowerCase();
    const isAuthPage = paginaActual.includes('login') || paginaActual.includes('registro');

    // Si estamos en página de login/registro y hay sesión activa
    if (token && isAuthPage) {
      window.location.href = this.getHomeByRole(usuario);
    }

    // Si no hay sesión y queremos acceder a página protegida
    if (!token && !isAuthPage && !paginaActual.includes('index')) {
      window.location.href = 'login.html';
    }
  },

  async logout() {
    try {
      await api.logout();
      api.limpiarToken();
      localStorage.removeItem('usuario');
      const isInPages = window.location.pathname.includes('/pages/');
      window.location.href = isInPages ? '../index.html' : 'index.html';
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  },

  showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-error';
    alertDiv.innerHTML = `<span><i data-lucide="triangle-alert"></i></span><span>${message}</span>`;
    
    const form = document.querySelector('form');
    if (form) {
      form.prepend(alertDiv);
      this.renderLucideIcons();
      setTimeout(() => alertDiv.remove(), 5000);
    }
  },

  showSuccess(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success';
    alertDiv.innerHTML = `<span><i data-lucide="circle-check"></i></span><span>${message}</span>`;
    
    const form = document.querySelector('form');
    if (form) {
      form.prepend(alertDiv);
      this.renderLucideIcons();
    }
  }
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AuthModule.init());
} else {
  AuthModule.init();
}
