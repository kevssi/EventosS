// Módulo para manejo de navegación
const NavbarModule = {
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
      script.src = 'https://unpkg.com/lucide@latest/dist/umd/lucide.js';
      script.defer = true;
      script.setAttribute('data-lucide-script', '1');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Lucide.'));
      document.head.appendChild(script);
    });

    return this.lucideScriptPromise;
  },

  renderLucideIcons(scope = document) {
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

  isOrganizadorRole(rol) {
    const value = (rol ?? '').toString().trim().toLowerCase();
    return value === 'organizador' || value === '2';
  },

  ensureAdminOnDashboard(usuario) {
    if (!this.isAdminRole(usuario?.rol)) return;

    const currentPath = window.location.pathname.toLowerCase();
    const isAdminPage = currentPath.includes('admin-dashboard.html');
    const isAuthPage = currentPath.includes('login.html') || currentPath.includes('registro.html');

    if (!isAdminPage && !isAuthPage) {
      window.location.href = this.resolvePath('admin-dashboard.html');
    }
  },

  init() {
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleMobileKeydown = this.handleMobileKeydown.bind(this);
    this.ensureLucideLoaded()
      .catch(() => null)
      .finally(() => this.actualizarNavbar());
  },

  async logout(event) {
    if (event) {
      event.preventDefault();
    }

    try {
      await api.logout();
    } catch (error) {
      // Aunque falle el endpoint, limpiamos sesión local para no dejar al usuario bloqueado.
      console.error('Error al cerrar sesión en servidor:', error);
    } finally {
      api.limpiarToken();
      localStorage.removeItem('usuario');

      const inicioPath = this.isInPages() ? '../index.html' : 'index.html';
      window.location.href = inicioPath;
    }
  },

  handleDocumentClick() {
    const dropdown = document.querySelector('.dropdown.open');
    if (!dropdown) return;

    dropdown.classList.remove('open');
    const toggle = dropdown.querySelector('.navbar-menu-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  },

  setupDropdownBehavior() {
    const dropdown = document.querySelector('.dropdown');
    const toggle = dropdown?.querySelector('.navbar-menu-toggle');
    if (!dropdown || !toggle) return;

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = dropdown.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    dropdown.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.removeEventListener('click', this.handleDocumentClick);
    document.addEventListener('click', this.handleDocumentClick);
  },

  teardownDropdownBehavior() {
    document.removeEventListener('click', this.handleDocumentClick);
  },

  buildPreAuthMobileItems(paths) {
    return [
      { href: paths.conciertosPath, label: 'Conciertos y Festivales' },
      { href: paths.teatroPath, label: 'Teatro y Cultura' },
      { href: paths.deportesPath, label: 'Deportes' },
      { href: paths.familiaresPath, label: 'Familiares' },
      { href: paths.especialesPath, label: 'Especiales' },
      { href: paths.ciudadesPath, label: 'Ciudades' }
    ];
  },

  setupMobileMenuBehavior() {
    const trigger = document.querySelector('[data-mobile-menu-open]');
    const closeBtn = document.querySelector('[data-mobile-menu-close]');
    const drawer = document.querySelector('.navbar-mobile-drawer');

    if (!trigger || !closeBtn || !drawer) return;

    const closeDrawer = () => {
      drawer.classList.remove('open');
      document.body.classList.remove('navbar-mobile-open');
      trigger.setAttribute('aria-expanded', 'false');
      window.setTimeout(() => {
        if (!drawer.classList.contains('open')) {
          drawer.hidden = true;
        }
      }, 200);
    };

    const openDrawer = () => {
      drawer.hidden = false;
      requestAnimationFrame(() => {
        drawer.classList.add('open');
      });
      document.body.classList.add('navbar-mobile-open');
      trigger.setAttribute('aria-expanded', 'true');
    };

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      if (drawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      closeDrawer();
    });

    drawer.addEventListener('click', (event) => {
      if (event.target === drawer) {
        closeDrawer();
      }
    });

    this.closeMobileDrawer = closeDrawer;
    document.removeEventListener('keydown', this.handleMobileKeydown);
    document.addEventListener('keydown', this.handleMobileKeydown);
  },

  handleMobileKeydown(event) {
    if (event.key === 'Escape' && this.closeMobileDrawer) {
      this.closeMobileDrawer();
    }
  },

  teardownMobileMenuBehavior() {
    document.removeEventListener('keydown', this.handleMobileKeydown);
    document.body.classList.remove('navbar-mobile-open');
    const drawer = document.querySelector('.navbar-mobile-drawer');
    if (drawer) drawer.remove();
  },

  isInPages() {
    return window.location.pathname.includes('/pages/');
  },

  resolvePath(fileName) {
    return this.isInPages() ? fileName : `pages/${fileName}`;
  },

  ensurePreAuthUtilityBar() {
    const navbar = document.querySelector('.navbar');
    const navbarContent = document.querySelector('.navbar-content');
    if (!navbar || !navbarContent) return;

    const existing = navbar.querySelector('.navbar-utility');
    if (existing) return;

    const utility = document.createElement('div');
    utility.className = 'navbar-utility';
    utility.innerHTML = `
      <div class="container navbar-utility-content">
        <div class="navbar-utility-left">
          <span>MX</span>
          <span>ES</span>
          <span>Todo Mexico</span>
        </div>
        <a href="#" class="navbar-utility-help">Ayuda</a>
      </div>
    `;

    navbar.insertBefore(utility, navbarContent.parentElement);
  },

  removePreAuthUtilityBar() {
    const utility = document.querySelector('.navbar-utility');
    if (utility) utility.remove();
  },

  actualizarNavbar() {
    const token = api.obtenerToken();
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    const navbarUser = document.querySelector('.navbar-user');
    const navbarMenu = document.querySelector('.navbar-menu');

    if (!navbarUser) return;

    // Actualizar usuario
    if (token && usuario) {
      this.ensureAdminOnDashboard(usuario);
      this.removePreAuthUtilityBar();
      this.teardownMobileMenuBehavior();

      const inicioPath = this.isInPages() ? '../index.html' : 'index.html';
      const isAdmin = this.isAdminRole(usuario.rol);
      const isOrganizador = this.isOrganizadorRole(usuario.rol);

      if (navbarMenu) {
        if (isAdmin) {
          const adminPath = this.resolvePath('admin-dashboard.html');
          navbarMenu.innerHTML = `
            <li><a href="${adminPath}">Panel Admin</a></li>
          `;
        } else {
          navbarMenu.innerHTML = `
            <li><a href="${inicioPath}">Inicio</a></li>
          `;
          this.actualizarMenu(navbarMenu, token, usuario);
        }
      }

      const boletosPath = this.resolvePath('mis-boletos.html');
      const ordenesPath = this.resolvePath('mis-ordenes.html');
      const organizarPath = this.resolvePath('organizar-evento.html');
      const aplicarPath = this.resolvePath('aplicar-organizador.html');
      const misEventosPath = this.resolvePath('mis-eventos.html');
      const adminPath = this.resolvePath('admin-dashboard.html');

      navbarUser.innerHTML = `
        <div class="navbar-account">
          <div class="user-info">
            <div class="user-name">${usuario.nombre}</div>
            <div class="user-role">${this.getRoleLabel(usuario.rol)}</div>
          </div>
          <div class="dropdown">
            <button class="btn btn-primary navbar-menu-toggle" id="btnDropdown" type="button">
              Menú ▼
            </button>
            <div class="dropdown-content">
              ${isAdmin ? `
                <a href="${adminPath}">Panel Admin</a>
              ` : `
                <a href="${boletosPath}">Mis Boletos</a>
                <a href="${ordenesPath}">Mis Órdenes</a>
                ${isOrganizador ? `<a href="${organizarPath}" target="_blank">Organizar Evento</a>` : `<a href="${aplicarPath}" target="_blank">Aplicar para organizar eventos</a>`}
                ${isOrganizador ? `<a href="${misEventosPath}">Mis Eventos</a>` : ''}
              `}
              <hr class="dropdown-separator">
              <a href="#" onclick="NavbarModule.logout(event); return false;" class="dropdown-danger">Cerrar Sesión</a>
            </div>
          </div>
        </div>
      `;

      this.setupDropdownBehavior();
      this.renderLucideIcons(document);
    } else {
      this.teardownDropdownBehavior();
      this.ensurePreAuthUtilityBar();

      const inicioPath = this.isInPages() ? '../index.html' : 'index.html';
      const loginPath = this.resolvePath('login.html');
      const conciertosPath = `${inicioPath}?tipo=musica`;
      const teatroPath = `${inicioPath}?q=teatro`;
      const deportesPath = `${inicioPath}?q=deportes`;
      const familiaresPath = `${inicioPath}?q=familia`;
      const especialesPath = `${inicioPath}?q=festival`;
      const ciudadesPath = `${inicioPath}?q=ciudad%20de%20mexico`;
      const mobileItems = this.buildPreAuthMobileItems({
        conciertosPath,
        teatroPath,
        deportesPath,
        familiaresPath,
        especialesPath,
        ciudadesPath
      });

      if (navbarMenu) {
        navbarMenu.innerHTML = `
          <li><a href="${conciertosPath}">Conciertos y Festivales</a></li>
          <li><a href="${teatroPath}">Teatro y Cultura</a></li>
          <li><a href="${deportesPath}">Deportes</a></li>
          <li><a href="${familiaresPath}">Familiares</a></li>
          <li><a href="${especialesPath}">Especiales</a></li>
          <li><a href="${ciudadesPath}">Ciudades</a></li>
        `;
      }

      navbarUser.innerHTML = `
        <div class="navbar-mobile-controls">
          <button class="navbar-mobile-trigger" data-mobile-menu-open type="button" aria-label="Abrir menú" aria-expanded="false"><i data-lucide="menu"></i></button>
          <a class="navbar-mobile-account" href="${loginPath}" aria-label="Ingresar">
            <span class="navbar-mobile-user-icon"><i data-lucide="circle-user-round"></i></span>
          </a>
        </div>
        <form class="navbar-search" action="${inicioPath}" method="get">
          <label for="navbarSearchInput">Buscar</label>
          <input id="navbarSearchInput" name="q" type="text" placeholder="Artista, evento o inmueble">
          <button type="submit" aria-label="Buscar"><i data-lucide="search"></i></button>
        </form>
        <div class="navbar-auth-links navbar-auth-links-main">
          <a href="${loginPath}" class="btn btn-primary navbar-auth-link">Ingresa</a>
        </div>
      `;

      const existingDrawer = document.querySelector('.navbar-mobile-drawer');
      if (existingDrawer) {
        existingDrawer.remove();
      }

      const mobileDrawer = document.createElement('aside');
      mobileDrawer.className = 'navbar-mobile-drawer';
      mobileDrawer.hidden = true;
      mobileDrawer.innerHTML = `
        <div class="navbar-mobile-panel">
          <div class="navbar-mobile-panel-header">
            <span class="navbar-mobile-panel-brand">eventos+</span>
            <button type="button" class="navbar-mobile-close" data-mobile-menu-close aria-label="Cerrar menú"><i data-lucide="x"></i></button>
          </div>
          <nav class="navbar-mobile-links">
            ${mobileItems.map((item) => `<a href="${item.href}">${item.label}<span><i data-lucide="chevron-right"></i></span></a>`).join('')}
          </nav>
          <a class="navbar-mobile-help" href="#">Ayuda</a>
        </div>
      `;

      document.body.appendChild(mobileDrawer);
      this.setupMobileMenuBehavior();
      this.renderLucideIcons(document);
    }
  },

  getRoleLabel(rol) {
    const roles = {
      'usuario': 'Comprador',
      'organizador': 'Organizador',
      'administrador': 'Administrador',
      '1': 'Comprador',
      '2': 'Organizador',
      '3': 'Administrador'
    };
    const normalized = (rol ?? '').toString().toLowerCase();
    return roles[normalized] || rol;
  },

  actualizarMenu(navbarMenu, token, usuario) {
    if (!token || !usuario) return;

    const btnMisBoletosParent = navbarMenu.querySelector('.menu-mis-boletos');
    const btnMisOrdenasParent = navbarMenu.querySelector('.menu-mis-ordenes');
    
    const bolletosPath = this.resolvePath('mis-boletos.html');
    const ordenesPath = this.resolvePath('mis-ordenes.html');
    
    if (!btnMisBoletosParent) {
      const li = document.createElement('li');
      li.className = 'menu-mis-boletos';
      li.innerHTML = `<a href="${bolletosPath}">Mis Boletos</a>`;
      navbarMenu.appendChild(li);
    }
    if (!btnMisOrdenasParent) {
      const li = document.createElement('li');
      li.className = 'menu-mis-ordenes';
      li.innerHTML = `<a href="${ordenesPath}">Mis Órdenes</a>`;
      navbarMenu.appendChild(li);
    }
  }
};

// Inicializar navbar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NavbarModule.init());
} else {
  NavbarModule.init();
}
