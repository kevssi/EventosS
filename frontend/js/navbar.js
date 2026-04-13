// Módulo para manejo de navegación
const NavbarModule = {
  lucideScriptPromise: null,

  resolveLocalLucideUrl() {
    const script = document.querySelector('script[src*="/js/navbar.js"], script[src$="js/navbar.js"]');
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

  renderLucideIcons(scope = document) {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({
        attrs: {
          'stroke-width': 2,
          class: 'lucide-icon'
        },
        nameAttr: 'data-lucide'
      });
    }

    // Fallback duro: si por cualquier motivo Lucide no reemplazo nodos,
    // convertimos data-lucide en SVG inline para no mostrar espacios vacios.
    this.renderInlineFallbackIcons(scope);
  },

  getFallbackIconSvg(name) {
    const icons = {
      menu: '<line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line>',
      search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
      x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
      'chevron-right': '<polyline points="9 18 15 12 9 6"></polyline>',
      'chevron-left': '<polyline points="15 18 9 12 15 6"></polyline>',
      'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
      'calendar-days': '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
      'clock-3': '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 16 12"></polyline>',
      'map-pin': '<path d="M12 22s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12z"></path><circle cx="12" cy="10" r="2.5"></circle>',
      'circle-check': '<circle cx="12" cy="12" r="9"></circle><polyline points="9 12 11 14 15 10"></polyline>',
      'triangle-alert': '<path d="M10.3 3.5 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
      tag: '<path d="M20 12 12 20a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1 0-2.8L10.8 2H20v10z"></path><circle cx="16" cy="8" r="1"></circle>',
      'user-round': '<circle cx="12" cy="8" r="4"></circle><path d="M4 20c1.9-3.2 5.1-5 8-5s6.1 1.8 8 5"></path>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><path d="M20 8a4 4 0 0 1 0 8"></path><path d="M23 21v-2a4 4 0 0 0-3-3.9"></path>',
      'bar-chart-3': '<path d="M3 3v18h18"></path><rect x="7" y="12" width="3" height="6"></rect><rect x="12" y="9" width="3" height="9"></rect><rect x="17" y="6" width="3" height="12"></rect>',
      'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
      plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
      'lock-keyhole': '<rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V8a5 5 0 0 1 10 0v3"></path><circle cx="12" cy="16" r="1"></circle>',
      'circle-user-round': '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="10" r="3"></circle><path d="M7 17c1.4-2 3-3 5-3s3.6 1 5 3"></path>'
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

  ensureHelpModal() {
    const existing = document.getElementById('helpModalOverlay');
    if (existing) return existing;

    const modal = document.createElement('div');
    modal.id = 'helpModalOverlay';
    modal.className = 'help-modal-overlay';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="help-modal" role="dialog" aria-modal="true" aria-labelledby="helpModalTitle">
        <header class="help-modal-header">
          <h3 id="helpModalTitle">Centro de Ayuda</h3>
          <button type="button" class="help-modal-close" data-help-close aria-label="Cerrar ayuda">×</button>
        </header>
        <div class="help-modal-body">
          <p class="help-modal-intro">Para recibir soporte mas rapido, incluye esta informacion segun el apartado:</p>
          <p class="help-modal-intro">Correo de soporte: <strong>soporte@eventosplus.mx</strong></p>
          <div class="help-section">
            <h4>1) Cuenta y acceso</h4>
            <p>Email registrado, captura del error y hora aproximada en la que ocurrio.</p>
          </div>
          <div class="help-section">
            <h4>2) Publicar evento</h4>
            <p>Nombre del evento, fecha, tipo, imagen y detalle de en que paso se detuvo el formulario.</p>
          </div>
          <div class="help-section">
            <h4>3) Boletos y pagos</h4>
            <p>ID de orden o referencia, metodo de pago, estado mostrado y captura del mensaje de error.</p>
          </div>
          <div class="help-section">
            <h4>4) QR y acceso al evento</h4>
            <p>Codigo QR, nombre del evento y descripcion de lo que mostro el lector al intentar validar.</p>
          </div>
          <div class="help-section">
            <h4>5) Reembolsos o cancelaciones</h4>
            <p>Folio de compra, motivo de solicitud y cuenta de contacto para seguimiento.</p>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(modal);

    const closeButton = modal.querySelector('[data-help-close]');
    if (closeButton) {
      closeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.cerrarHelpModal();
      });
    }

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        this.cerrarHelpModal();
      }
    });

    return modal;
  },

  abrirHelpModal(event) {
    if (event) event.preventDefault();

    const modal = this.ensureHelpModal();
    modal.hidden = false;
    document.body.classList.add('help-modal-open');

    if (this.closeMobileDrawer) {
      this.closeMobileDrawer();
    }
  },

  cerrarHelpModal() {
    const modal = document.getElementById('helpModalOverlay');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('help-modal-open');
  },

  setupHelpButtons() {
    const helpButtons = document.querySelectorAll('.navbar-utility-help, .navbar-mobile-help');
    helpButtons.forEach((button) => {
      button.onclick = (event) => {
        this.abrirHelpModal(event);
      };
    });
  },

  resolveUserRoleValue(usuario) {
    if (!usuario) return '';
    return usuario.rol ?? usuario.role ?? usuario.rol_id ?? usuario.id_rol ?? usuario.idRol ?? '';
  },

  async syncUsuarioDesdePerfil(usuarioLocal) {
    try {
      if (!api?.obtenerPerfil) return usuarioLocal;

      const response = await api.obtenerPerfil();
      const perfil = response?.usuario;
      if (!perfil) return usuarioLocal;

      const merged = {
        ...usuarioLocal,
        ...perfil,
        rol: perfil.rol ?? usuarioLocal?.rol,
        rol_id: perfil.rol_id ?? usuarioLocal?.rol_id
      };

      localStorage.setItem('usuario', JSON.stringify(merged));
      return merged;
    } catch (_error) {
      return usuarioLocal;
    }
  },

  async actualizarNavbar() {
    const token = api.obtenerToken();
    let usuario = JSON.parse(localStorage.getItem('usuario'));
    const navbarUser = document.querySelector('.navbar-user');
    const navbarMenu = document.querySelector('.navbar-menu');

    if (!navbarUser) return;

    // Actualizar usuario
    if (token && usuario) {
      usuario = await this.syncUsuarioDesdePerfil(usuario);
      const roleValue = this.resolveUserRoleValue(usuario);

      this.ensureAdminOnDashboard(usuario);
      this.removePreAuthUtilityBar();
      this.teardownMobileMenuBehavior();

      const inicioPath = this.isInPages() ? '../index.html' : 'index.html';
      const isAdmin = this.isAdminRole(roleValue);
      const isOrganizador = this.isOrganizadorRole(roleValue);

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
            <div class="user-role">${this.getRoleLabel(roleValue)}</div>
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

    this.setupHelpButtons();
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
    const normalized = (rol ?? '').toString().trim().toLowerCase();
    return roles[normalized] || (normalized ? normalized : 'Comprador');
  },

  actualizarMenu(navbarMenu, token, usuario) {
    if (!token || !usuario) return;

    const btnMisBoletosParent = navbarMenu.querySelector('.menu-mis-boletos');
    const btnMisOrdenasParent = navbarMenu.querySelector('.menu-mis-ordenes');
    const btnMisEventosParent = navbarMenu.querySelector('.menu-mis-eventos');
    const isOrganizador = this.isOrganizadorRole(this.resolveUserRoleValue(usuario));
    
    const bolletosPath = this.resolvePath('mis-boletos.html');
    const ordenesPath = this.resolvePath('mis-ordenes.html');
    const misEventosPath = this.resolvePath('mis-eventos.html');
    
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

    if (isOrganizador && !btnMisEventosParent) {
      const li = document.createElement('li');
      li.className = 'menu-mis-eventos';
      li.innerHTML = `<a href="${misEventosPath}">Mis Eventos</a>`;
      navbarMenu.appendChild(li);
    }
  }
};

window.NavbarModule = NavbarModule;

// Inicializar navbar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NavbarModule.init());
} else {
  NavbarModule.init();
}
