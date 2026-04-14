const HomeModule = {
  fallbackImages: [
    'publi/e1.jpg',
    'publi/e2.jpg',
    'publi/e3.jpg',
    'publi/e4.jpg',
    'publi/e5.jpg'
  ],

  normalizeRole(rol) {
    const value = (rol ?? '').toString().trim().toLowerCase();
    if (value === '3' || value === 'admin' || value === 'administrador') return 'administrador';
    if (value === '2' || value === 'organizador') return 'organizador';
    return 'usuario';
  },

  async init() {
    this.renderTopActions();
    this.bindSearchForm();
    await this.loadCategoryOptions();
    await this.loadCategoryChips();
    await this.loadConcerts();
  },

  renderTopActions() {
    const container = document.querySelector('#homeTopActions');
    if (!container) return;

    const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    const token = localStorage.getItem('token');

    if (!usuario || !token) {
      return;
    }

    const rol = this.normalizeRole(usuario.rol ?? usuario.rol_id ?? usuario.id_rol);

    if (rol === 'administrador') {
      container.innerHTML = `
        <a class="btn" href="pages/inicio.html">Explorar</a>
        <a class="btn btn-primary" href="pages/admin-dashboard.html">Panel admin</a>
      `;
      return;
    }

    if (rol === 'organizador') {
      container.innerHTML = `
        <a class="btn" href="pages/inicio.html">Explorar</a>
        <a class="btn btn-primary" href="pages/mis-eventos.html">Mis eventos</a>
      `;
      return;
    }

    container.innerHTML = `
      <a class="btn" href="pages/inicio.html">Explorar</a>
      <a class="btn btn-primary" href="pages/mis-boletos.html">Mis boletos</a>
    `;
  },

  bindSearchForm() {
    const form = document.querySelector('#homeSearchForm');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const params = new URLSearchParams();
      const q = (formData.get('q') || '').toString().trim();
      const id_categoria = (formData.get('id_categoria') || '').toString().trim();

      if (q) params.set('q', q);
      if (id_categoria) params.set('id_categoria', id_categoria);

      window.location.href = `pages/inicio.html${params.toString() ? `?${params.toString()}` : ''}`;
    });
  },

  async loadCategoryOptions() {
    const select = document.querySelector('#homeCategoriaSelect');
    if (!select) return;

    try {
      const response = await api.listarCategorias();
      const categories = response.categorias || [];

      const seen = new Set();
      categories.forEach(cat => {
        if (!cat.id || !cat.nombre) return;

        const normalized = cat.nombre.trim().toLowerCase();
        if (seen.has(normalized)) return;

        seen.add(normalized);

        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.nombre;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Error al cargar categorias en home:', error);
    }
  },

  async loadCategoryChips() {
    const chips = document.querySelector('#homeCategoryChips');
    if (!chips) return;

    try {
      const response = await api.listarCategorias();
      const categories = response.categorias || [];

      const seen = new Set();
      categories.forEach(cat => {
        if (!cat.id || !cat.nombre) return;

        const normalized = cat.nombre.trim().toLowerCase();
        if (seen.has(normalized)) return;

        seen.add(normalized);

        const a = document.createElement('a');
        a.className = 'chip';
        a.href = `pages/inicio.html?id_categoria=${cat.id}`;
        a.textContent = cat.nombre;
        chips.appendChild(a);
      });
    } catch (error) {
      console.error('Error al cargar chips de categorias:', error);
    }
  },

  async loadConcerts() {
    const container = document.querySelector('#homeConcerts');
    if (!container) return;

    const imagenesLocal = {
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
      const slug = titulo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      return `/publi/${slug}.jpg`;
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

    const esUploadLocal = (url) => String(url || '').startsWith('/publi/uploads/');

    const esPlaceholderExterno = (url) => {
      const parsed = String(url || '').toLowerCase();
      return parsed.includes('ejemplo.com') || parsed.includes('example.com');
    };

    try {
      const response = await api.listarEventos({ tipo: 'musica', limit: 5 });
      const eventos = response.eventos || [];

      if (eventos.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="thumb">
              <img src="${this.fallbackImages[0]}" alt="Conciertos disponibles pronto">
            </div>
            <div class="card-body">
              <div class="tag">SIN DATOS AUN</div>
              <h3>Esperando inserts de conciertos</h3>
              <p class="meta">Cuando cargues conciertos en la base, esta seccion los mostrara primero.</p>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = eventos.map((evento, index) => {
        const image = normalizarImagenUrl(evento.imagen_url) || this.fallbackImages[index % this.fallbackImages.length];
        const fecha = evento.fecha_inicio
          ? new Date(evento.fecha_inicio).toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })
          : 'Fecha por confirmar';

        const normalizedTitle = normalizeTitle(evento.titulo);
        const localTitleKey = normalizedTitle || evento.titulo?.toString().toLowerCase();
        const localImage = imagenesLocal[normalizedTitle] || imagenesLocal[localTitleKey] || imagenesLocal[normalizeTitle(evento.titulo?.replace(/-/g, ' '))] || null;
        const generatedImage = imagenPorTitulo(evento.titulo);
        const imagenApi = normalizarImagenUrl(evento.imagen_url);
        const imgSrc = esUploadLocal(imagenApi)
          ? imagenApi
          : (localImage || (esPlaceholderExterno(imagenApi) ? null : imagenApi) || generatedImage || image);

        return `
          <a class="card" href="pages/detalle-evento.html?id=${evento.id}">
            <div class="thumb">
              <img src="${imgSrc}" alt="${evento.titulo}" onerror="this.onerror=null;this.src='/publi/fallback.jpg';">
            </div>
            <div class="card-body">
              <div class="tag">${evento.categoria || 'CONCIERTO'}</div>
              <h3>${evento.titulo}</h3>
              <p class="meta">${fecha} · ${evento.ubicacion || 'Ubicacion por confirmar'}</p>
            </div>
          </a>
        `;
      }).join('');
    } catch (error) {
      console.error('Error cargando conciertos del home:', error);
      container.innerHTML = `
        <div class="card">
          <div class="thumb">
            <img src="${this.fallbackImages[0]}" alt="Error al cargar conciertos">
          </div>
          <div class="card-body">
            <div class="tag">ERROR</div>
            <h3>No se pudieron cargar los conciertos</h3>
            <p class="meta">Revisa la conexion del backend y la base de datos.</p>
          </div>
        </div>
      `;
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => HomeModule.init());
} else {
  HomeModule.init();
}
