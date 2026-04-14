// Módulo de eventos
const EventosModule = {
  eventos: [],
  categorias: [],
  filtroActual: null,
  busquedaActual: '',
  tipoActual: '',
  cacheImagenesArtista: new Map(),
  refreshTimer: null,
  currentLoadId: 0,

  async init() {
    this.inicializarDesdeURL();
    await this.cargarCategorias();

    if (!this.filtroActual && this.busquedaActual && !this.tipoActual) {
      const categoriaDetectada = this.resolverCategoriaDesdeBusqueda(this.busquedaActual);
      if (categoriaDetectada?.id) {
        this.filtroActual = String(categoriaDetectada.id);
        this.busquedaActual = '';
      }
    }

    await this.cargarEventos();
    this.setupEventListeners();
    this.iniciarAutoRefresh();
  },

  iniciarAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      const elementoActivo = document.activeElement;
      if (elementoActivo && (elementoActivo.id === 'filtroBusqueda' || elementoActivo.id === 'filtroCategoria')) {
        return;
      }

      this.cargarEventos(this.filtroActual || null, this.busquedaActual || '', this.tipoActual || '');
    }, 10000);
  },

  inicializarDesdeURL() {
    const params = new URLSearchParams(window.location.search);
    this.filtroActual = params.get('id_categoria') || '';
    this.busquedaActual = params.get('q') || '';
    this.tipoActual = params.get('tipo') || '';
  },

  normalizarTexto(value) {
    return (value || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  },

  resolverCategoriaDesdeBusqueda(busqueda) {
    const query = this.normalizarTexto(busqueda);
    if (!query || !Array.isArray(this.categorias) || this.categorias.length === 0) {
      return null;
    }

    const exacta = this.categorias.find((categoria) => this.normalizarTexto(categoria?.nombre) === query);
    if (exacta) return exacta;

    return this.categorias.find((categoria) => {
      const nombre = this.normalizarTexto(categoria?.nombre);
      return nombre && (nombre.includes(query) || query.includes(nombre));
    }) || null;
  },

  obtenerLinkAplicarOrganizador() {
    const isInPages = window.location.pathname.includes('/pages/');
    return isInPages ? 'aplicar-organizador.html' : 'pages/aplicar-organizador.html';
  },

  setupEventListeners() {
    const filtroCategoria = document.querySelector('#filtroCategoria');
    const filtroBusqueda = document.querySelector('#filtroBusqueda');
    const btnBuscar = document.querySelector('#btnBuscar');

    if (filtroCategoria) {
      filtroCategoria.value = this.filtroActual || '';
      filtroCategoria.addEventListener('change', () => this.handleFiltro());
    }

    if (filtroBusqueda) {
      filtroBusqueda.value = this.busquedaActual;
      filtroBusqueda.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.handleFiltro();
        }
      });
    }

    if (btnBuscar) {
      btnBuscar.addEventListener('click', () => this.handleFiltro());
    }
  },

  async cargarCategorias() {
    try {
      const response = await api.listarCategorias();
      this.categorias = response.categorias;
      this.renderCategorias();
    } catch (error) {
      console.error('Error al cargar categorías:', error);
    }
  },

  renderCategorias() {
    const select = document.querySelector('#filtroCategoria');
    if (!select) return;

    select.innerHTML = '<option value="">Todas las categorías</option>';
    this.categorias.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = `${cat.nombre} (${cat.eventos_disponibles})`;
      select.appendChild(option);
    });
  },

  async cargarEventos(id_categoria = this.filtroActual || null, q = this.busquedaActual || '', tipo = this.tipoActual || '') {
    const loadId = ++this.currentLoadId;

    try {
      const response = await api.listarEventos({ id_categoria, q, tipo });
      let eventosAPI = response.eventos || [];

      if (id_categoria) {
        const selectedCategoria = this.categorias.find((c) => String(c.id) === String(id_categoria));
        const selectedCategoriaNombre = this.normalizarTexto(selectedCategoria?.nombre || '');

        eventosAPI = eventosAPI.filter((evt) => {
          const idMatch = String(evt.id_categoria || evt.idCategoria || '').trim() === String(id_categoria).trim();
          const categoriaNombre = this.normalizarTexto(evt.categoria || '');
          const nameMatch = selectedCategoriaNombre ? categoriaNombre === selectedCategoriaNombre : false;
          return idMatch || nameMatch;
        });
      }

      // Primer render rapido sin llamadas de red adicionales.
      this.eventos = this.enriquecerEventosConImagen(eventosAPI);
      this.renderEventos();

      // Si llega una carga mas nueva, ignoramos esta respuesta.
      if (loadId !== this.currentLoadId) {
        return;
      }
    } catch (error) {
      console.error('Error al cargar eventos:', error);
      this.mostrarError('Error al cargar eventos');
    }
  },

  enriquecerEventosConImagen(eventos) {
    const imagenesPorEvento = {
      'kenia os tour prototipo 2025': '/publi/keniaos.jpg',
      'rosalia motomami world tour mexico': '/publi/rosalia.jpg',
      'peso pluma doble p tour 2025': '/publi/pesopluma.jpg',
      'coldplay music of the spheres world tour': '/publi/coldplay.jpg',      
      'corona capital 2025': '/publi/coronacapital.jpg',
      'karol g manana sera bonito tour': '/publi/karolg.jpg',
      'tech house night fisher b2b chris lake': '/publi/techhouse.jpg',        
      'comic fest 2025': '/publi/comicfest.jpg',
      'bad bunny most wanted tour mexico': '/publi/badbunny.jpg',
      'bad bunny most wanted tour': '/publi/badbunny.jpg',
      'bad bunny world tour': '/publi/badbunny.jpg',
      'bad bunny': '/publi/badbunny.jpg'
    };

    const normalizeTitle = (titulo) => {
      if (!titulo) return '';
      return titulo
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const imagenPorTitulo = (titulo) => {
      if (!titulo) return null;
      const normalized = normalizeTitle(titulo);
      const slug = normalized.replace(/\s+/g, '-');
      return '/publi/' + slug + '.jpg';
    };

    const normalizarImagenUrl = (valor) => {
      const raw = String(valor || '').trim();
      if (!raw) return null;
      if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
      if (raw.startsWith('/')) return raw;
      if (raw.startsWith('publi/')) return `/${raw}`;
      if (raw.startsWith('uploads/')) return `/publi/${raw}`;
      return raw;
    };

    return eventos.map((evento) => {
      const artista = this.extraerNombreArtista(evento?.titulo || '');
      const normalizedTitulo = normalizeTitle(evento?.titulo || '');
      const imagenSubida = normalizarImagenUrl(evento?.imagen_url);
      const localImage = imagenesPorEvento[normalizedTitulo] || imagenesPorEvento[evento?.titulo] || null;
      const imagenGenerada = imagenPorTitulo(evento?.titulo);
      const tituloNormalizado = (evento?.titulo || '').toLowerCase();

      // Soporte de coincidencia parcial por artista para eventos con nombre ligeramente diferente
      const partidoGlobal = !localImage && Object.keys(imagenesPorEvento).find((key) => {
        if (!key) return false;
        return tituloNormalizado.includes(key.toLowerCase().split('-')[0].trim());
      });

      const fallbackLocal = partidoGlobal ? imagenesPorEvento[partidoGlobal] : null;
      const imagenFallback = this.obtenerImagenCategoria(evento?.categoria || evento?.titulo || 'Evento');

      // Prioriza la imagen cargada por el organizador si existe.
      const imagenFinal = imagenSubida || localImage || fallbackLocal || imagenGenerada || imagenFallback;

      return {
        ...evento,
        artista_detectado: artista,
        // Prioriza imagen local (y coincidencias parciales) para cada evento
        imagen_resuelta: imagenFinal,
        imagen_fallback: imagenFallback
      };
    });
  },

  esEventoMusical(evento = {}) {
    const categoria = String(evento?.categoria || '').toLowerCase();
    const titulo = String(evento?.titulo || '').toLowerCase();
    const texto = `${categoria} ${titulo}`;

    return [
      'rock',
      'pop',
      'electronica',
      'electrónica',
      'urbano',
      'trap',
      'concierto',
      'festival',
      'tour',
      'dj',
      'b2b'
    ].some((token) => texto.includes(token));
  },

  extraerNombreArtista(titulo = '') {
    const limpio = String(titulo).trim();
    if (!limpio) return '';

    if (limpio.includes(' - ')) {
      return limpio.split(' - ')[0].trim();
    }

    if (limpio.includes(':')) {
      const partePosterior = limpio.split(':').slice(1).join(':').trim();
      if (partePosterior) return partePosterior;
    }

    return limpio.split(' ').slice(0, 3).join(' ').trim();
  },

  obtenerImagenSemilla(termino = 'evento') {
    const semilla = encodeURIComponent(String(termino).toLowerCase().replace(/\s+/g, '-'));
    return `https://picsum.photos/seed/${semilla}/1200/700`;
  },

  obtenerImagenCategoria(categoria = 'Evento') {
    const texto = encodeURIComponent(String(categoria).trim().slice(0, 32) || 'Evento');
    return `https://dummyimage.com/1200x700/123767/ffffff.png&text=${texto}`;
  },

  async obtenerImagenArtista(termino = 'evento') {
    const nombre = String(termino).trim() || 'evento';

    if (this.cacheImagenesArtista.has(nombre)) {
      return this.cacheImagenesArtista.get(nombre);
    }

    try {
      const response = await api.obtenerImagenArtista(nombre);
      const imageUrl = response?.image_url || this.obtenerImagenSemilla(nombre);
      this.cacheImagenesArtista.set(nombre, imageUrl);
      return imageUrl;
    } catch (error) {
      const fallback = this.obtenerImagenCategoria(nombre);
      this.cacheImagenesArtista.set(nombre, fallback);
      return fallback;
    }
  },

  obtenerPlaceholderSVG(termino = 'Evento') {
    const texto = String(termino).trim().slice(0, 40) || 'Evento';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#123767"/><stop offset="100%" stop-color="#11607d"/></linearGradient></defs><rect width="1200" height="700" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="54" font-weight="700">${texto}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  },

  renderEventos() {
    const container = document.querySelector('#eventosContainer');
    if (!container) return;

    const isInPages = window.location.pathname.includes('/pages/');
    const detalleBase = isInPages ? 'detalle-evento.html' : 'pages/detalle-evento.html';
    const eventosAMostrar = this.eventos;

    if (eventosAMostrar.length === 0) {
      const categoriaSeleccionada = this.categorias.find((cat) => String(cat.id) === String(this.filtroActual));
      const nombreCategoria = categoriaSeleccionada?.nombre || this.busquedaActual || 'seleccionada';
      const linkAplicar = this.obtenerLinkAplicarOrganizador();

      this.actualizarResumenExplora(0);
      container.innerHTML = `
        <div class="sin-resultados">
          <p class="sin-resultados-titulo">NO HAY NINGUN EVENTO EN LA CATEGORIA "${nombreCategoria}"</p>
          <p class="sin-resultados-subtitulo">Prueba con otra categoria o vuelve a intentarlo mas tarde.</p>
          <a class="sin-resultados-link" href="${linkAplicar}">Quisieras organizar tu propio evento?</a>
        </div>
      `;
      return;
    }

    container.innerHTML = eventosAMostrar.map(evento => `
      <div class="evento-card">
        <div class="evento-imagen">
          ${evento.imagen_resuelta
            ? `<img class="evento-imagen-real" src="${evento.imagen_resuelta}" data-fallback="${evento.imagen_fallback || this.obtenerImagenSemilla(evento.titulo || 'evento')}" alt="${evento.titulo}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=this.dataset.fallback || '/publi/fallback.jpg';">`
            : '<span class="evento-imagen-placeholder">Imagen del evento</span>'}
        </div>
        <div class="evento-contenido">
          ${evento.categoria ? `<div class="evento-categoria">${evento.categoria}</div>` : ''}
          <h3 class="evento-titulo">${evento.titulo}</h3>
          <div class="evento-info">
            <div class="evento-info-item"><span class="icon-label"><i data-lucide="calendar-days"></i><span>${new Date(evento.fecha_inicio).toLocaleDateString()}</span></span></div>
            <div class="evento-info-item"><span class="icon-label"><i data-lucide="clock-3"></i><span>${new Date(evento.fecha_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span></div>
            <div class="evento-info-item"><span class="icon-label"><i data-lucide="map-pin"></i><span>${evento.ubicacion}</span></span></div>
          </div>
          <div class="evento-disponibilidad">
            <span class="icon-label"><i data-lucide="circle-check"></i><span>${evento.boletos_disponibles} boletos disponibles</span></span>
          </div>
          <div class="evento-precio">
            Desde $${evento.precio_desde}
          </div>
          <div class="evento-accion">
            <button class="btn btn-primary" onclick="location.href='${detalleBase}?id=${evento.id}'">
              Ver Detalles
            </button>
          </div>
        </div>
      </div>
    `).join('');

    this.actualizarResumenExplora(eventosAMostrar.length);
    window.NavbarModule?.renderLucideIcons?.(container);

    this.configurarFallbackImagenes();
  },

  actualizarResumenExplora(cantidadEventos) {
    const resumen = document.querySelector('#exploraResumen');
    if (!resumen) return;

    if (this.busquedaActual) {
      resumen.textContent = `Mostrando ${cantidadEventos} resultado(s) para "${this.busquedaActual}".`;
      return;
    }

    resumen.textContent = `Mostrando ${cantidadEventos} evento(s) disponibles ahora mismo.`;
  },

  configurarFallbackImagenes() {
    const imagenes = document.querySelectorAll('.evento-imagen-real');

    imagenes.forEach((img) => {
      img.addEventListener('error', function onImageError() {
        const fallback = this.dataset.fallback || EventosModule.obtenerImagenSemilla('evento-musica');
        const local = EventosModule.obtenerPlaceholderSVG(this.alt || 'Evento');

        if (this.dataset.fallbackIntentado === '1') {
          this.onerror = null;
          this.src = local;
          return;
        }

        this.dataset.fallbackIntentado = '1';
        this.src = fallback;
      });
    });
  },

  async handleFiltro() {
    const filtroCategoria = document.querySelector('#filtroCategoria')?.value || '';
    const filtroBusqueda = document.querySelector('#filtroBusqueda')?.value?.trim() || '';
    const categoriaDetectada = !filtroCategoria ? this.resolverCategoriaDesdeBusqueda(filtroBusqueda) : null;
    const categoriaFinal = filtroCategoria || (categoriaDetectada ? String(categoriaDetectada.id) : '');
    const busquedaFinal = categoriaDetectada ? '' : filtroBusqueda;

    this.filtroActual = categoriaFinal;
    this.busquedaActual = busquedaFinal;
    this.tipoActual = '';

    const params = new URLSearchParams();
    if (categoriaFinal) params.set('id_categoria', categoriaFinal);
    if (busquedaFinal) params.set('q', busquedaFinal);
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', newUrl);

    const inputBusqueda = document.querySelector('#filtroBusqueda');
    if (inputBusqueda) {
      inputBusqueda.value = busquedaFinal;
    }

    const selectCategoria = document.querySelector('#filtroCategoria');
    if (selectCategoria) {
      selectCategoria.value = categoriaFinal;
    }

    await this.cargarEventos(categoriaFinal || null, busquedaFinal, '');
  },

  mostrarError(mensaje) {
    const container = document.querySelector('#eventosContainer');
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

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EventosModule.init());
} else {
  EventosModule.init();
}
