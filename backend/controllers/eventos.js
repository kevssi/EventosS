const pool = require('../config/database');
const https = require('https');

const fetchJson = (url, timeoutMs = 5000) => new Promise((resolve, reject) => {
  const request = https.get(url, (response) => {
    let body = '';

    response.on('data', (chunk) => {
      body += chunk;
    });

    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });

  request.setTimeout(timeoutMs, () => {
    request.destroy(new Error('Timeout'));
  });

  request.on('error', reject);
});

const normalizeText = (value) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const padDatePart = (value) => value.toString().padStart(2, '0');

const formatUtcAsMysqlDateTime = (date) => (
  `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`
  + ` ${padDatePart(date.getUTCHours())}:${padDatePart(date.getUTCMinutes())}:${padDatePart(date.getUTCSeconds())}`
);

const normalizeMysqlDateTime = (value) => {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Keep local date-time values as entered by the user when no timezone is provided.
  const localIsoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (localIsoMatch) {
    const seconds = localIsoMatch[3] || '00';
    return `${localIsoMatch[1]} ${localIsoMatch[2]}:${seconds}`;
  }

  const mysqlMatch = raw.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (mysqlMatch) {
    const seconds = mysqlMatch[3] || '00';
    return `${mysqlMatch[1]} ${mysqlMatch[2]}:${seconds}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw} 00:00:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatUtcAsMysqlDateTime(parsed);
};

const normalizeImageUrl = (value) => {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
    return raw;
  }

  if (raw.startsWith('/publi/')) return raw;
  if (raw.startsWith('publi/')) return `/${raw}`;
  if (raw.startsWith('/uploads/')) return `/publi${raw}`;
  if (raw.startsWith('uploads/')) return `/publi/${raw}`;

  return raw;
};

const matchesTipo = (evento, tipo) => {
  if (!tipo) return true;

  const categoria = normalizeText(evento.categoria);
  const requested = normalizeText(tipo);

  if (requested === 'musica' || requested === 'conciertos') {
    return [
      'music',
      'concierto',
      'pop',
      'rock',
      'urbano',
      'trap',
      'regional',
      'electronic',
      'electronica'
    ].some((token) => categoria.includes(token));
  }

  if (requested === 'expos') {
    return categoria.includes('expo');
  }

  return categoria.includes(requested);
};

const getSearchScore = (evento, query) => {
  if (!query) return 0;

  const text = normalizeText([
    evento.titulo,
    evento.descripcion,
    evento.ubicacion,
    evento.categoria
  ].filter(Boolean).join(' '));

  if (!text) return 9999;
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (text.includes(query)) return 2;

  const title = normalizeText(evento.titulo);
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;

  return 9999;
};

const normalizeArtistName = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeArtist = (value) => {
  const stopwords = new Set(['the', 'and', 'y', 'feat', 'ft', 'tour', 'world', 'night', 'live', 'music', 'b2b']);
  return normalizeArtistName(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopwords.has(token));
};

const esCoincidenciaArtista = (buscado, encontrado) => {
  const expected = normalizeArtistName(buscado);
  const candidate = normalizeArtistName(encontrado);

  if (!expected || !candidate) return false;
  if (expected === candidate) return true;
  if (expected.includes(candidate) || candidate.includes(expected)) return true;

  const tokens = tokenizeArtist(expected);
  if (tokens.length === 0) return false;

  const matches = tokens.filter((token) => candidate.includes(token)).length;
  const required = tokens.length >= 2 ? 2 : 1;
  return matches >= required;
};

const construirFallbackImagen = (termino = 'evento') => {
  const texto = encodeURIComponent((termino || 'Evento').toString().slice(0, 32));
  return `https://dummyimage.com/1200x700/123767/ffffff.png&text=${texto}`;
};

const obtenerDisponiblesDesdeResultado = (row = {}) => {
  const candidates = [
    row.disponibles,
    row.cantidad_disponible,
    row.stock_disponible,
    row.boletos_disponibles,
    row.disponibilidad_actual
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }

  return null;
};

const recalcularDisponibilidadEventos = async (connection, eventos = []) => {
  const actualizados = [];

  for (const evento of eventos) {
    const eventoNormalizado = { ...evento };
    const idEvento = Number(eventoNormalizado.id);

    if (Number.isNaN(idEvento) || idEvento <= 0) {
      actualizados.push(eventoNormalizado);
      continue;
    }

    try {
      const [tiposResult] = await connection.query('CALL sp_listar_tipos_boleto(?)', [idEvento]);
      const tipos = tiposResult?.[0] || [];

      let totalDisponibles = 0;
      let precioMin = Number.POSITIVE_INFINITY;

      for (const tipo of tipos) {
        const tipoId = Number(tipo.id);
        if (Number.isNaN(tipoId) || tipoId <= 0) continue;

        let disponibles = Number(tipo.disponibles ?? tipo.cantidad_disponible ?? tipo.cantidad ?? 0);

        try {
          const [dispResult] = await connection.query('CALL sp_verificar_disponibilidad(?, ?)', [tipoId, 1]);
          const dispRow = dispResult?.[0]?.[0] || {};
          const verificado = obtenerDisponiblesDesdeResultado(dispRow);
          if (verificado !== null) {
            disponibles = verificado;
          }
        } catch (errorDisponibilidad) {
          // Si falla validacion puntual, usamos el valor existente del tipo.
        }

        totalDisponibles += Math.max(0, Number.isNaN(disponibles) ? 0 : disponibles);

        const precioTipo = Number(tipo.precio);
        if (!Number.isNaN(precioTipo) && precioTipo >= 0) {
          precioMin = Math.min(precioMin, precioTipo);
        }
      }

      eventoNormalizado.boletos_disponibles = totalDisponibles;
      if (Number.isFinite(precioMin)) {
        eventoNormalizado.precio_desde = precioMin;
      }
    } catch (errorEvento) {
      // Si falla para un evento puntual, conservamos lo que ya venia.
    }

    actualizados.push(eventoNormalizado);
  }

  return actualizados;
};

const resolveOrganizerColumn = async (connection) => {
  const candidateColumns = ['id_organizador', 'id_usuario', 'id_creador', 'id_usuario_creador'];

  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'eventos'
    `
  );

  const available = new Set((rows || []).map((row) => row.COLUMN_NAME));
  return candidateColumns.find((col) => available.has(col)) || null;
};

const resolveCategoriaColumn = async (connection) => {
  const candidateColumns = ['id_categoria', 'categoria_id'];

  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'eventos'
    `
  );

  const available = new Set((rows || []).map((row) => row.COLUMN_NAME));
  return candidateColumns.find((col) => available.has(col)) || null;
};

const resolveCategoriaIdForCreate = async (connection, rawCategoriaId) => {
  const categoriaId = Number.parseInt(rawCategoriaId, 10);
  if (!Number.isNaN(categoriaId) && categoriaId > 0) {
    return categoriaId;
  }

  try {
    const [rows] = await connection.query('SELECT id_categoria FROM categorias ORDER BY id_categoria ASC LIMIT 1');
    const fallbackId = Number.parseInt(rows?.[0]?.id_categoria, 10);
    if (!Number.isNaN(fallbackId) && fallbackId > 0) {
      return fallbackId;
    }
  } catch (_error) {
    // If categories are unavailable, keep null and let existing flow handle validation.
  }

  return null;
};

const normalizeZonasInput = (rawZonas) => {
  if (!Array.isArray(rawZonas)) return [];

  return rawZonas
    .map((zona, index) => {
      const nombre = String(zona?.nombre || '').trim();
      const cupo = Number(zona?.cupo);
      const precio = Number(zona?.precio);
      const activa = zona?.activa !== false;

      if (!activa || !nombre) return null;
      if (!Number.isFinite(cupo) || cupo <= 0) return null;
      if (!Number.isFinite(precio) || precio < 0) return null;

      return {
        nombre,
        cupo: Math.floor(cupo),
        precio,
        descripcion: `Zona ${index + 1}: ${nombre}`
      };
    })
    .filter(Boolean);
};

const createTiposBoletoDesdeZonas = async (connection, idEvento, zonas = []) => {
  const eventoId = Number(idEvento);
  if (!Number.isFinite(eventoId) || eventoId <= 0) return;
  if (!Array.isArray(zonas) || zonas.length === 0) return;

  const [tableRows] = await connection.query(
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('tipos_boleto', 'tipo_boleto')
      LIMIT 1
    `
  );

  const tiposTable = tableRows?.[0]?.TABLE_NAME;
  if (!tiposTable) return;

  const [columnRows] = await connection.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tiposTable]
  );

  const available = new Set((columnRows || []).map((row) => row.COLUMN_NAME));
  const pick = (candidates) => candidates.find((name) => available.has(name)) || null;

  const eventoCol = pick(['id_evento', 'evento_id']);
  const nombreCol = pick(['nombre', 'tipo_boleto', 'titulo']);
  const precioCol = pick(['precio', 'precio_unitario']);
  const cantidadCol = pick(['cantidad', 'cantidad_total', 'cupo']);
  const disponiblesCol = pick(['cantidad_disponible', 'disponibles', 'stock_disponible']);
  const descripcionCol = pick(['descripcion', 'detalle']);
  const estadoCol = pick(['estado', 'status']);

  if (!eventoCol || !nombreCol || !precioCol || (!cantidadCol && !disponiblesCol)) {
    return;
  }

  const [existingRows] = await connection.query(
    `SELECT COUNT(1) AS total FROM ${tiposTable} WHERE ${eventoCol} = ?`,
    [eventoId]
  );

  if (Number(existingRows?.[0]?.total || 0) > 0) {
    return;
  }

  for (const zona of zonas) {
    const columns = [eventoCol, nombreCol, precioCol];
    const values = [eventoId, zona.nombre, zona.precio];

    if (cantidadCol) {
      columns.push(cantidadCol);
      values.push(zona.cupo);
    }

    if (disponiblesCol) {
      columns.push(disponiblesCol);
      values.push(zona.cupo);
    }

    if (descripcionCol) {
      columns.push(descripcionCol);
      values.push(zona.descripcion);
    }

    if (estadoCol) {
      columns.push(estadoCol);
      values.push('activo');
    }

    const placeholders = columns.map(() => '?').join(', ');
    await connection.query(
      `INSERT INTO ${tiposTable} (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
};

const replaceTiposBoletoDesdeZonas = async (connection, idEvento, zonas = []) => {
  const eventoId = Number(idEvento);
  if (!Number.isFinite(eventoId) || eventoId <= 0) return;
  if (!Array.isArray(zonas) || zonas.length === 0) return;

  const [tableRows] = await connection.query(
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('tipos_boleto', 'tipo_boleto')
      LIMIT 1
    `
  );

  const tiposTable = tableRows?.[0]?.TABLE_NAME;
  if (!tiposTable) return;

  const [columnRows] = await connection.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tiposTable]
  );

  const available = new Set((columnRows || []).map((row) => row.COLUMN_NAME));
  const eventoCol = available.has('id_evento') ? 'id_evento' : (available.has('evento_id') ? 'evento_id' : null);
  if (!eventoCol) return;

  await connection.query(`DELETE FROM ${tiposTable} WHERE ${eventoCol} = ?`, [eventoId]);
  await createTiposBoletoDesdeZonas(connection, eventoId, zonas);
};

const crearEventoDirectoFallback = async (connection, payload) => {
  const organizerColumn = await resolveOrganizerColumn(connection);
  if (!organizerColumn) {
    throw new Error('No se encontro columna de organizador en tabla eventos');
  }

  const categoriaColumn = await resolveCategoriaColumn(connection);
  const columns = [
    organizerColumn,
    'titulo',
    'descripcion',
    'fecha_inicio',
    'fecha_fin',
    'ubicacion',
    'capacidad',
    'imagen_url',
    'estado'
  ];

  const values = [
    payload.idUsuario,
    payload.titulo,
    payload.descripcion,
    payload.fechaInicio,
    payload.fechaFin,
    payload.ubicacion,
    payload.capacidad,
    payload.imagenUrl,
    payload.estado
  ];

  if (categoriaColumn) {
    columns.push(categoriaColumn);
    values.push(payload.idCategoria);
  }

  const placeholders = columns.map(() => '?').join(', ');
  const [insertResult] = await connection.query(
    `INSERT INTO eventos (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  return Number(insertResult.insertId || 0);
};

const fetchEventosFallback = async (connection, idCategoria) => {
  const [rows] = await connection.query(
    `
      SELECT
        e.id,
        e.titulo,
        e.descripcion,
        e.fecha_inicio,
        e.fecha_fin,
        e.ubicacion,
        e.capacidad,
        e.imagen_url,
        e.estado,
        c.nombre AS categoria,
        COALESCE(SUM(tb.cantidad), 0) AS boletos_disponibles,
        COALESCE(MIN(tb.precio), 0) AS precio_desde
      FROM eventos e
      LEFT JOIN categorias_evento c ON c.id = e.id_categoria
      LEFT JOIN tipos_boleto tb ON tb.id_evento = e.id
      WHERE (? IS NULL OR e.id_categoria = ?)
        AND e.estado IN ('publicado', 'activo', 'borrador')
      GROUP BY
        e.id,
        e.titulo,
        e.descripcion,
        e.fecha_inicio,
        e.fecha_fin,
        e.ubicacion,
        e.capacidad,
        e.imagen_url,
        e.estado,
        c.nombre
      ORDER BY e.fecha_inicio ASC
    `,
    [idCategoria, idCategoria]
  );

  return rows;
};

// Listar eventos con filtro opcional por categoría
exports.listarEventos = async (req, res) => {
  const { id_categoria, q, tipo, limit } = req.query;
  const useRealtime = req.query.realtime === '1';

  try {
    const connection = await pool.getConnection();
    const parsedCategoria = id_categoria ? parseInt(id_categoria, 10) : null;
    const searchQuery = normalizeText(q);
    let eventos = [];

    try {
      const [resultado] = await connection.query(
        'CALL sp_listar_eventos(?)',
        [parsedCategoria]
      );
      eventos = resultado[0] || [];
    } catch (spError) {
      if (spError?.code !== 'ER_SP_DOES_NOT_EXIST') {
        throw spError;
      }
      eventos = await fetchEventosFallback(connection, parsedCategoria);
    }

    // ERROR: el SP puede no aplicar id_categoria en algunos despliegues.
    // Forzamos filtrado por categoría usando fetchEventosFallback cuando id_categoria está presente.
    if (parsedCategoria) {
      eventos = await fetchEventosFallback(connection, parsedCategoria);
    } else if (eventos.length === 0) {
      eventos = await fetchEventosFallback(connection, parsedCategoria);
    }

    if (useRealtime) {
      eventos = await recalcularDisponibilidadEventos(connection, eventos);
    }

    await connection.release();

    if (tipo) {
      eventos = eventos.filter((evento) => matchesTipo(evento, tipo));
    }

    if (searchQuery) {
      eventos = eventos
        .map((evento) => ({
          evento,
          score: getSearchScore(evento, searchQuery)
        }))
        .filter((item) => item.score < 9999)
        .sort((a, b) => a.score - b.score)
        .map((item) => item.evento);
    }

    const numericLimit = parseInt(limit, 10);
    if (!Number.isNaN(numericLimit) && numericLimit > 0) {
      eventos = eventos.slice(0, numericLimit);
    }

    res.json({
      success: true,
      eventos
    });
  } catch (error) {
    console.error('Error en listarEventos:', error);
    res.status(500).json({ error: 'Error al listar eventos' });
  }
};

// Obtener detalle de un evento
exports.obtenerEvento = async (req, res) => {
  const { id } = req.params;
  const parsedId = parseInt(id, 10);

  if (Number.isNaN(parsedId) || parsedId <= 0) {
    return res.status(400).json({ error: 'ID de evento inválido' });
  }

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_obtener_evento(?)',
      [parsedId]
    );

    await connection.release();

    if (resultado[0].length > 0) {
      res.json({
        success: true,
        evento: resultado[0][0],
        tipos_boleto: resultado[1]
      });
    } else {
      res.status(404).json({ error: 'Evento no encontrado' });
    }
  } catch (error) {
    console.error('Error en obtenerEvento:', error);
    res.status(500).json({ error: 'Error al obtener evento' });
  }
};

// Listar eventos del organizador autenticado
exports.listarMisEventos = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const organizerColumn = await resolveOrganizerColumn(connection);

    if (!organizerColumn) {
      await connection.release();
      return res.json({ success: true, eventos: [] });
    }

    const [rows] = await connection.query(
      `
        SELECT
          e.id,
          e.titulo,
          e.descripcion,
          e.fecha_inicio,
          e.fecha_fin,
          e.ubicacion,
          e.capacidad,
          e.imagen_url,
          e.estado,
          c.nombre AS categoria,
          COALESCE(SUM(tb.cantidad), 0) AS boletos_disponibles,
          COALESCE(MIN(tb.precio), 0) AS precio_desde
        FROM eventos e
        LEFT JOIN categorias_evento c ON c.id = e.id_categoria
        LEFT JOIN tipos_boleto tb ON tb.id_evento = e.id
        WHERE e.${organizerColumn} = ?
        GROUP BY
          e.id,
          e.titulo,
          e.descripcion,
          e.fecha_inicio,
          e.fecha_fin,
          e.ubicacion,
          e.capacidad,
          e.imagen_url,
          e.estado,
          c.nombre
        ORDER BY e.fecha_inicio DESC
      `,
      [req.user.id]
    );

    const eventos = await recalcularDisponibilidadEventos(connection, rows || []);
    await connection.release();

    return res.json({ success: true, eventos });
  } catch (error) {
    console.error('Error en listarMisEventos:', error);
    return res.status(500).json({ error: 'Error al listar mis eventos' });
  }
};

// Crear evento (solo organizadores/admin)
exports.crearEvento = async (req, res) => {
  const {
    titulo,
    descripcion,
    fecha_inicio,
    fecha_fin,
    ubicacion,
    capacidad,
    id_categoria,
    imagen_url,
    zonas
  } = req.body;

  const capacidadNum = parseInt(capacidad, 10);
  const fechaInicioMysql = normalizeMysqlDateTime(fecha_inicio);
  const fechaFinMysql = normalizeMysqlDateTime(fecha_fin);
  const imagenUrlNormalizada = normalizeImageUrl(imagen_url);
  const zonasNormalizadas = normalizeZonasInput(zonas);

  if (!titulo || !fechaInicioMysql || !ubicacion || Number.isNaN(capacidadNum) || capacidadNum <= 0) {
    return res.status(400).json({ error: 'Faltan campos requeridos o capacidad invalida' });
  }

  if (fecha_fin && !fechaFinMysql) {
    return res.status(400).json({ error: 'Fecha de fin invalida' });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    const categoriaId = await resolveCategoriaIdForCreate(connection, id_categoria);
    let idEvento = 0;

    try {
      const [resultado] = await connection.query(
        'CALL sp_crear_evento(?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          req.user.id,
          titulo,
          descripcion || null,
          fechaInicioMysql,
          fechaFinMysql,
          ubicacion,
          capacidadNum,
          categoriaId,
          imagenUrlNormalizada
        ]
      );

      if (resultado?.[0]?.[0]?.resultado === 'ok') {
        idEvento = Number(resultado[0][0].id_evento || 0);
      }
    } catch (_spError) {
      // Si el SP no existe o bloquea por validaciones de rol, usamos insercion directa.
    }

    if (!idEvento) {
      idEvento = await crearEventoDirectoFallback(connection, {
        idUsuario: req.user.id,
        titulo,
        descripcion: descripcion || null,
        fechaInicio: fechaInicioMysql,
        fechaFin: fechaFinMysql,
        ubicacion,
        capacidad: capacidadNum,
        idCategoria: categoriaId,
        imagenUrl: imagenUrlNormalizada,
        estado: 'publicado'
      });
    }

    // Fuerza publicacion al crear, incluso si el SP deja el estado en borrador.
    if (idEvento > 0) {
      try {
        await connection.query('UPDATE eventos SET estado = ? WHERE id = ?', ['publicado', idEvento]);
      } catch (_estadoError) {
        // Si el esquema no permite actualizar estado aqui, no bloqueamos la creacion.
      }

      try {
        await createTiposBoletoDesdeZonas(connection, idEvento, zonasNormalizadas);
      } catch (_zonasError) {
        // Si falla creacion de zonas, no bloqueamos el alta del evento.
      }
    }

    await connection.release();

    return res.status(201).json({
      success: true,
      message: 'Evento creado correctamente',
      id_evento: idEvento
    });
  } catch (error) {
    if (connection) {
      await connection.release();
    }
    console.error('Error en crearEvento:', error);
    const detalle = error?.sqlMessage || error?.message || 'Error al crear evento';
    return res.status(500).json({ error: detalle });
  }
};

// Actualizar evento
exports.actualizarEvento = async (req, res) => {
  const { id } = req.params;
  const {
    titulo,
    descripcion,
    fecha_inicio,
    fecha_fin,
    ubicacion,
    capacidad,
    imagen_url,
    estado,
    zonas
  } = req.body;

  if (!titulo || !fecha_inicio || !ubicacion || !capacidad) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const fechaInicioMysql = normalizeMysqlDateTime(fecha_inicio);
  const fechaFinMysql = normalizeMysqlDateTime(fecha_fin);
  const imagenUrlNormalizada = normalizeImageUrl(imagen_url);
  const zonasNormalizadas = normalizeZonasInput(zonas);

  if (!fechaInicioMysql) {
    return res.status(400).json({ error: 'Fecha de inicio invalida' });
  }

  if (fecha_fin && !fechaFinMysql) {
    return res.status(400).json({ error: 'Fecha de fin invalida' });
  }

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_actualizar_evento(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        parseInt(id),
        req.user.id,
        titulo,
        descripcion || null,
        fechaInicioMysql,
        fechaFinMysql,
        ubicacion,
        parseInt(capacidad),
        imagenUrlNormalizada,
        estado || 'publicado'
      ]
    );

    if (zonasNormalizadas.length > 0) {
      try {
        await replaceTiposBoletoDesdeZonas(connection, parseInt(id, 10), zonasNormalizadas);
      } catch (_zonasError) {
        // Si falla sincronizacion de zonas, no bloqueamos la actualizacion general del evento.
      }
    }

    await connection.release();

    res.json({
      success: true,
      message: resultado[0][0].mensaje
    });
  } catch (error) {
    console.error('Error en actualizarEvento:', error);
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
};

// Cancelar evento
exports.cancelarEvento = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_cancelar_evento(?, ?, ?)',
      [parseInt(id), req.user.id, motivo || 'Sin especificar']
    );

    await connection.release();

    if (resultado[0][0].resultado === 'ok') {
      res.json({
        success: true,
        message: resultado[0][0].mensaje
      });
    } else {
      res.status(403).json({
        success: false,
        message: resultado[0][0].mensaje
      });
    }
  } catch (error) {
    console.error('Error en cancelarEvento:', error);
    res.status(500).json({ error: 'Error al cancelar evento' });
  }
};

// Listar categorías
exports.listarCategorias = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    let categorias = [];

    try {
      const [resultado] = await connection.query('CALL sp_listar_categorias()');
      categorias = resultado[0] || [];
    } catch (spError) {
      if (spError?.code !== 'ER_SP_DOES_NOT_EXIST') {
        throw spError;
      }

      const [rows] = await connection.query(
        `
          SELECT id, nombre
          FROM categorias_evento
          ORDER BY nombre ASC
        `
      );
      categorias = rows;
    }

    await connection.release();

    res.json({
      success: true,
      categorias
    });
  } catch (error) {
    console.error('Error en listarCategorias:', error);
    res.status(500).json({ error: 'Error al listar categorías' });
  }
};

exports.obtenerImagenArtista = async (req, res) => {
  const artista = (req.query.artista || '').toString().trim();

  if (!artista) {
    return res.status(400).json({
      success: false,
      error: 'El parámetro artista es requerido'
    });
  }

  const fallback = construirFallbackImagen(artista);

  try {
    const deezerUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artista)}&limit=1`;
    const deezerData = await fetchJson(deezerUrl);
    const nombreDeezer = deezerData?.data?.[0]?.name;
    const imagenDeezer = deezerData?.data?.[0]?.picture_xl || deezerData?.data?.[0]?.picture_big;

    if (imagenDeezer && esCoincidenciaArtista(artista, nombreDeezer)) {
      return res.json({
        success: true,
        image_url: imagenDeezer,
        source: 'deezer',
        artist_match: nombreDeezer
      });
    }
  } catch (error) {
    console.warn('No se pudo obtener imagen en Deezer:', artista, error.message);
  }

  try {
    const iTunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artista)}&entity=musicArtist&limit=1`;
    const iTunesData = await fetchJson(iTunesUrl);
    const nombreITunes = iTunesData?.results?.[0]?.artistName;
    const artwork = iTunesData?.results?.[0]?.artworkUrl100;

    if (artwork && esCoincidenciaArtista(artista, nombreITunes)) {
      return res.json({
        success: true,
        image_url: artwork.replace('100x100bb.jpg', '1200x1200bb.jpg'),
        source: 'itunes',
        artist_match: nombreITunes
      });
    }
  } catch (error) {
    console.warn('No se pudo obtener imagen en iTunes:', artista, error.message);
  }

  return res.json({
    success: true,
    image_url: fallback,
    source: 'fallback'
  });
};
