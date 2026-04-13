// Módulo de boletos y compras
const BoletosModule = {
  evento: null,
  carrito: {},
  total: 0,
  idEventoActual: null,
  disponibilidadTimer: null,

  imagenesLocal: {
    'kenia os tour prototipo 2025': '/publi/keniaos.jpg',
    'rosalia motomami world tour mexico': '/publi/rosalia.jpg',
    'peso pluma doble p tour 2025': '/publi/pesopluma.jpg',
    'coldplay music of the spheres world tour': '/publi/coldplay.jpg',
    'corona capital 2025': '/publi/coronacapital.jpg',
    'karol g manana sera bonito tour': '/publi/karolg.jpg',
    'tech house night fisher b2b chris lake': '/publi/techhouse.jpg',
    'comic fest 2025': '/publi/comicfest.jpg',
    'bad bunny world tour': '/publi/badbunny.jpg',
    'bad bunny el ultimo tour': '/publi/badbunny.jpg',
    'bad bunny most wanted tour mexico': '/publi/badbunny.jpg',
    'bad bunny most wanted tour': '/publi/badbunny.jpg',
    'bad bunny': '/publi/badbunny.jpg'
  },

  fallbackImage: '/publi/fallback.jpg',

  imagenPorTitulo(titulo) {
    if (!titulo) return null;
    const slug = titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `/publi/${slug}.jpg`;
  },

  normalizeTitle(titulo) {
    if (!titulo) return '';
    return titulo
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  obtenerImagenEvento(evento) {
    if (!evento) return this.fallbackImage;

    const normalizedTitle = this.normalizeTitle ? this.normalizeTitle(evento.titulo) : evento.titulo?.toString().toLowerCase() || '';
    const plainTitle = evento.titulo?.toString().toLowerCase() || '';
    const localImage = this.imagenesLocal[normalizedTitle] || this.imagenesLocal[plainTitle] || this.imagenesLocal[this.normalizeTitle(plainTitle.replace(/-/g, ' '))] || null;
    const generatedImage = this.imagenPorTitulo(evento.titulo);

    return localImage || evento.imagen_url || generatedImage || this.fallbackImage;
  },

  async init() {
    this.idEventoActual = this.obtenerIdEvento();
    this.cargarCarritoEvento();

    if (window.location.pathname.includes('detalle-evento')) {
      await this.cargarEventoDetalle();
      this.setupEventListeners();
      this.iniciarAutoRefreshDisponibilidad();
    }
  },

  iniciarAutoRefreshDisponibilidad() {
    if (this.disponibilidadTimer) {
      clearInterval(this.disponibilidadTimer);
    }

    this.disponibilidadTimer = setInterval(() => {
      this.refrescarDisponibilidadTipos();
    }, 8000);
  },

  async refrescarDisponibilidadTipos() {
    if (!this.evento?.id) return;

    try {
      const response = await api.listarTiposBoleto(this.evento.id);
      const latestTipos = response?.tipos_boleto || [];

      latestTipos.forEach((latest) => {
        const tipoId = Number(latest.id);
        const disponibles = Number(latest.disponibles ?? latest.cantidad_disponible ?? latest.cantidad ?? 0);

        const existing = this.evento.tipos_boleto?.find((t) => Number(t.id) === tipoId);
        if (existing) {
          existing.disponibles = disponibles;
          existing.cantidad_disponible = disponibles;
          existing.cantidad = disponibles;
        }

        const input = document.querySelector(`.cantidad-${tipoId}`);
        if (input) {
          input.max = String(Math.max(0, disponibles));
          const actual = Number(input.value || 0);
          if (actual > disponibles) {
            input.value = String(Math.max(0, disponibles));
          }
        }

        const tipoCard = document.querySelector(`.cantidad-${tipoId}`)?.closest('.tipo-boleto');
        const disponibilidadText = tipoCard?.querySelector('.tipo-boleto-info p:last-child');
        if (disponibilidadText) {
          disponibilidadText.innerHTML = `Disponibles: <strong>${Math.max(0, disponibles)}</strong>`;
        }
      });

      this.actualizarResumen();
    } catch (error) {
      // Si falla el refresh, mantenemos la ultima disponibilidad conocida.
    }
  },

  getCarritoKey() {
    return this.idEventoActual ? `carrito_evento_${this.idEventoActual}` : 'carrito_evento';
  },

  cargarCarritoEvento() {
    this.carrito = JSON.parse(localStorage.getItem(this.getCarritoKey())) || {};
  },

  guardarCarritoEvento() {
    localStorage.setItem(this.getCarritoKey(), JSON.stringify(this.carrito));
  },

  limpiarCarritoEvento() {
    this.carrito = {};
    localStorage.removeItem(this.getCarritoKey());
  },

  resetearSeleccionBoletos() {
    const inputs = document.querySelectorAll('.cantidad-input');
    inputs.forEach((input) => {
      input.value = '0';
    });

    this.carrito = {};
    this.total = 0;
    this.renderResumen(0);
    this.limpiarCarritoEvento();
  },

  obtenerIdEvento() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  },

  async cargarEventoDetalle() {
    try {
      const id = this.obtenerIdEvento();
      const response = await api.obtenerEvento(id);
      this.evento = response.evento;
      this.renderEventoDetalle(response);
    } catch (error) {
      console.error('Error:', error);
      this.mostrarError('Evento no encontrado');
    }
  },

  renderEventoDetalle(response) {
    const container = document.querySelector('#eventoDetalle');
    if (!container) return;

    this.evento.tipos_boleto = response.tipos_boleto || [];
    const tiposBoletos = this.evento.tipos_boleto;

    const imagenSrc = this.obtenerImagenEvento(this.evento);
    const imagenBg = String(imagenSrc || '').replace(/'/g, '%27').replace(/"/g, '%22');

    let pageBg = document.querySelector('.detalle-evento-page-bg');
    if (!pageBg) {
      pageBg = document.createElement('div');
      pageBg.className = 'detalle-evento-page-bg';
      document.body.prepend(pageBg);
    }

    let pageOverlay = document.querySelector('.detalle-evento-page-overlay');
    if (!pageOverlay) {
      pageOverlay = document.createElement('div');
      pageOverlay.className = 'detalle-evento-page-overlay';
      document.body.prepend(pageOverlay);
    }

    pageBg.style.setProperty('--evento-bg-page', `url('${imagenBg}')`);

    container.innerHTML = `
      <div class="evento-detalle" style="--evento-bg: url('${imagenBg}');">
        <div class="evento-detalle-imagen">
          <img src="${imagenSrc}" alt="${this.evento.titulo}" onerror="this.onerror=null;this.src='/publi/fallback.jpg';">
        </div>
        <div class="evento-detalle-contenido">
          <h2>${this.evento.titulo}</h2>
          ${this.evento.categoria ? `<p style="color: var(--primary); font-weight: 600; margin-bottom: 15px;"><span class="icon-label"><i data-lucide="tag"></i><span>${this.evento.categoria}</span></span></p>` : ''}
          
          <div class="evento-detalle-info">
            <p><span class="icon-label"><i data-lucide="calendar-days"></i><strong>${new Date(this.evento.fecha_inicio).toLocaleDateString('es-es', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></span></p>
            <p><span class="icon-label"><i data-lucide="clock-3"></i><strong>${new Date(this.evento.fecha_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span></p>
            <p><span class="icon-label"><i data-lucide="map-pin"></i><strong>${this.evento.ubicacion}</strong></span></p>
            <p><span class="icon-label"><i data-lucide="user-round"></i><strong>Organizador: ${this.evento.organizador}</strong></span></p>
            <p><span class="icon-label"><i data-lucide="users"></i><strong>Capacidad: ${this.evento.capacidad} personas</strong></span></p>
          </div>

          <div class="evento-descripcion">
            ${this.evento.descripcion || 'Sin descripción disponible'}
          </div>
        </div>
      </div>

      <div class="boletos-selector">
        <h3>Selecciona tus boletos</h3>
        <div id="tiposBoletos"></div>
      </div>

      <div class="resumen-compra">
        <h3>Resumen de Compra</h3>
        <div id="resumenDetalle"></div>
      </div>

      <button class="btn btn-primary btn-comprar" id="btnComprar">
        Proceder al Pago
      </button>
    `;

    this.renderTiposBoletos(tiposBoletos);
    window.NavbarModule?.renderLucideIcons?.(container);
  },

  renderTiposBoletos(tipos) {
    const container = document.querySelector('#tiposBoletos');
    if (!container) return;

    container.innerHTML = tipos.map(tipo => {
      const disponibles = Number(tipo.disponibles ?? tipo.cantidad_disponible ?? tipo.cantidad ?? 0);

      return `
      <div class="tipo-boleto" id="tipoBoleto-${tipo.id}" data-tipo-id="${tipo.id}">
        <div class="tipo-boleto-info">
          <h4>${tipo.nombre}</h4>
          <p>${tipo.descripcion || 'Acceso general'}</p>
          <p>Disponibles: <strong>${disponibles}</strong></p>
        </div>
        <div class="tipo-boleto-precio">$${parseFloat(tipo.precio).toFixed(2)}</div>
        <div class="tipo-boleto-cantidad">
          <div class="cantidad-control">
            <button type="button"
              class="cantidad-arrow cantidad-arrow-left"
              aria-label="Quitar boleto"
              onclick="BoletosModule.cambiarCantidad(${tipo.id}, -1)"><i data-lucide="chevron-left"></i></button>
            <input type="number" 
             class="cantidad-input cantidad-${tipo.id}" 
             data-tipo-id="${tipo.id}"
             min="0" 
             max="${disponibles}"
             value="${this.carrito[tipo.id]?.cantidad || 0}"
             onchange="BoletosModule.validarCantidadInput(${tipo.id})"
             placeholder="0">
            <button type="button"
              class="cantidad-arrow cantidad-arrow-right"
              aria-label="Agregar boleto"
              onclick="BoletosModule.cambiarCantidad(${tipo.id}, 1)"><i data-lucide="chevron-right"></i></button>
          </div>
          <small>boletos</small>
        </div>
      </div>
    `;
    }).join('');

    this.actualizarResumen();
    window.NavbarModule?.renderLucideIcons?.(container);
  },

  cambiarCantidad(tipoId, delta) {
    const input = document.querySelector(`.cantidad-${tipoId}`);
    if (!input) return;

    const min = Number(input.min || 0);
    const max = Number(input.max || 0);
    const actual = Number(input.value || 0);
    const siguiente = Math.min(max, Math.max(min, actual + delta));

    input.value = String(siguiente);
    this.actualizarResumen();
  },

  validarCantidadInput(tipoId) {
    const input = document.querySelector(`.cantidad-${tipoId}`);
    if (!input) return;

    const min = Number(input.min || 0);
    const max = Number(input.max || 0);
    const value = Number(input.value || 0);

    if (Number.isNaN(value) || value < min) {
      input.value = String(min);
    } else if (value > max) {
      input.value = String(max);
    }

    this.actualizarResumen();
  },

  actualizarResumen() {
    const tipoInputs = document.querySelectorAll('.cantidad-input');
    this.carrito = {};
    this.total = 0;
    let itemsCount = 0;

    tipoInputs.forEach(input => {
      const cantidad = parseInt(input.value) || 0;
      const tipoId = input.dataset.tipoId;
      const tipo = this.evento.tipos_boleto?.find(t => t.id == tipoId);
      
      if (tipo && cantidad > 0) {
        this.carrito[tipoId] = { tipo, cantidad };
        this.total += tipo.precio * cantidad;
        itemsCount += cantidad;
      } else {
        delete this.carrito[tipoId];
      }
    });

    this.renderResumen(itemsCount);
    this.guardarCarritoEvento();
  },

  renderResumen(itemsCount) {
    const container = document.querySelector('#resumenDetalle');
    if (!container) return;

    let items = '';
    Object.values(this.carrito).forEach(item => {
      items += `
        <div class="resumen-item">
          <span>${item.tipo.nombre} (x${item.cantidad})</span>
          <span>$${(item.tipo.precio * item.cantidad).toFixed(2)}</span>
        </div>
      `;
    });

    container.innerHTML = `
      ${items}
      <div class="resumen-subtotal">
        <span>Total de boletos:</span>
        <span>${itemsCount}</span>
      </div>
      <div class="resumen-total">
        <span>Total:</span>
        <span>$${this.total.toFixed(2)}</span>
      </div>
    `;
  },

  setupEventListeners() {
    const btnComprar = document.querySelector('#btnComprar');
    if (btnComprar) {
      btnComprar.addEventListener('click', () => this.procesarCompra());
    }
  },

  async procesarCompra() {
    // Verificar si el usuario está logueado
    const token = api.obtenerToken();
    if (!token) {
      alert('Necesitas iniciar sesión para comprar boletos');
      window.location.href = 'login.html';
      return;
    }

    if (Object.keys(this.carrito).length === 0) {
      alert('Por favor selecciona al menos un boleto');
      return;
    }

    try {
      const ordenes = [];
      const itemsCarrito = Object.values(this.carrito);

      for (const item of itemsCarrito) {
        const compra = await api.comprarBoletos(item.tipo.id, item.cantidad);
        if (!compra?.success || !compra?.orden) {
          throw new Error(compra?.message || 'No se pudo reservar el boleto');
        }

        ordenes.push({
          id_orden: compra.orden.id_orden,
          total: Number(compra.orden.total || 0)
        });
      }

      const preferencia = await api.crearPreferenciaMercadoPago({
        ordenes,
        evento_titulo: this.evento?.titulo || 'Compra de boletos'
      });

      if (!preferencia?.success || !(preferencia.init_point || preferencia.sandbox_init_point)) {
        throw new Error('No se pudo iniciar el checkout de Mercado Pago');
      }

      this.resetearSeleccionBoletos();

      window.location.href = preferencia.init_point || preferencia.sandbox_init_point;
    } catch (error) {
      console.error('Error al procesar compra con Mercado Pago:', error);

      const mensaje = error.message || 'No se pudo iniciar el proceso de pago';
      const sesionExpirada = error?.status === 401 || mensaje.toLowerCase().includes('token inválido o expirado') || mensaje.toLowerCase().includes('token invalido o expirado');

      if (sesionExpirada) {
        api.limpiarToken();
        alert('Tu sesion expiro. Inicia sesion para continuar con la compra.');
        window.location.href = 'login.html';
        return;
      }

      if (mensaje.toLowerCase().includes('token de mercado pago')) {
        const confirmar = window.confirm('No tienes Mercado Pago vinculado. Quieres vincularlo ahora?');
        if (confirmar) {
          const pagesIndex = window.location.pathname.lastIndexOf('/pages/');
          const appBasePath = pagesIndex >= 0 ? window.location.pathname.slice(0, pagesIndex) : '';
          const redirectUri = `${window.location.origin}${appBasePath}/pages/mercadopago-callback.html`;
          window.location.href = `/api/auth/mercadopago/oauth/iniciar?redirect_uri=${encodeURIComponent(redirectUri)}`;
          return;
        }
      }

      alert(mensaje);
    }
  },

  mostrarError(mensaje) {
    const container = document.querySelector('#eventoDetalle');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-error">
          <span><i data-lucide="triangle-alert"></i></span>
          <span>${mensaje}</span>
        </div>
      `;
      window.NavbarModule?.renderLucideIcons?.(container);
    }
  }
};

// Inicializar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => BoletosModule.init());
} else {
  BoletosModule.init();
}
