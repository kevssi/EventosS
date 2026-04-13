// Módulo de autenticación
const AuthModule = {
  lucideScriptPromise: null,

  resolveLocalLucideUrl() {
    const script = document.querySelector('script[src*="/js/auth.js"], script[src$="js/auth.js"]');
    if (!script?.src) return null;

    try {
      return new URL('vendor/lucide.min.js', script.src).toString();
    } catch (_error) {
      return null;
    }
  },

  getLucideSources() {
    const local = this.resolveLocalLucideUrl();
    const sources = [];

    if (local) {
      sources.push(local);
    }

    sources.push(
      'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js',
      'https://unpkg.com/lucide@latest/dist/umd/lucide.js'
    );

    return sources;
  },

  loadScriptWithFallback(urls, index = 0) {
    return new Promise((resolve, reject) => {
      if (index >= urls.length) {
        reject(new Error('No se pudo cargar Lucide desde ningun CDN.'));
        return;
      }

      const script = document.createElement('script');
      script.src = urls[index];
      script.defer = true;
      script.setAttribute('data-lucide-script', '1');
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        this.loadScriptWithFallback(urls, index + 1).then(resolve).catch(reject);
      };
      document.head.appendChild(script);
    });
  },

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
        if (window.lucide) {
          resolve();
          return;
        }

        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Lucide.')), { once: true });
        return;
      }

      this.loadScriptWithFallback(this.getLucideSources())
        .then(resolve)
        .catch(reject);
    });

    return this.lucideScriptPromise;
  },

  renderLucideIcons() {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({
        attrs: {
          'stroke-width': 2,
          class: 'lucide-icon'
        },
        nameAttr: 'data-lucide'
      });
    }

    this.renderInlineFallbackIcons(document);
  },

  getFallbackIconSvg(name) {
    const icons = {
      'triangle-alert': '<path d="M10.3 3.5 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
      'circle-check': '<circle cx="12" cy="12" r="9"></circle><polyline points="9 12 11 14 15 10"></polyline>'
    };

    return icons[name] || '<circle cx="12" cy="12" r="9"></circle>';
  },

  renderInlineFallbackIcons(scope = document) {
    const root = scope || document;
    const iconNodes = root.querySelectorAll('[data-lucide]');

    iconNodes.forEach((node) => {
      const name = node.getAttribute('data-lucide');
      if (!name) return;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', 'lucide-icon');
      svg.innerHTML = this.getFallbackIconSvg(name);

      node.replaceWith(svg);
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
    const telefonoRaw = document.querySelector('#telefono')?.value?.trim() || '';
    const telefono = telefonoRaw.replace(/\D/g, '');

    if (!nombre || !email || !password || !confirmPassword) {
      this.showError('Por favor completa todos los campos');
      return;
    }

    const nombreNormalizado = String(nombre || '').trim().replace(/\s+/g, ' ');
    const partesNombre = nombreNormalizado.split(' ').filter(Boolean);
    if (partesNombre.length < 2) {
      this.showError('Escribe nombre(s) y apellido(s)');
      return;
    }

    if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]+$/.test(nombreNormalizado)) {
      this.showError('El nombre solo puede contener letras y espacios');
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

    if (telefonoRaw && !/^\d{10}$/.test(telefonoRaw)) {
      this.showError('El telefono debe tener exactamente 10 numeros, sin letras ni espacios');
      return;
    }

    try {
      const response = await api.registrar(nombreNormalizado, email, password, telefono);

      if (response.success) {
        if (response.token) {
          api.setToken(response.token);
        }

        if (response.usuario) {
          localStorage.setItem('usuario', JSON.stringify(response.usuario));
        }

        this.showSuccess('¡Registro exitoso! Iniciando sesion...');
        setTimeout(() => {
          window.location.href = this.getHomeByRole(response.usuario);
        }, 1500);
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
