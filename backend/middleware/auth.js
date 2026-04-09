const jwt = require('jsonwebtoken');

const roleAliases = {
  administrador: ['administrador', 'admin', '3'],
  organizador: ['organizador', '2'],
  usuario: ['usuario', '1']
};

const normalizeRole = (rol) => {
  const value = (rol ?? '').toString().trim().toLowerCase();

  if (roleAliases.administrador.includes(value)) return 'administrador';
  if (roleAliases.organizador.includes(value)) return 'organizador';
  if (roleAliases.usuario.includes(value)) return 'usuario';

  return value;
};

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

const requireRoles = (...allowedRoles) => (req, res, next) => {
  const rol = normalizeRole(req.user?.rol);
  const normalizedAllowed = allowedRoles.map((item) => normalizeRole(item));

  if (!normalizedAllowed.includes(rol)) {
    return res.status(403).json({
      success: false,
      error: 'No tienes permisos para realizar esta accion'
    });
  }

  return next();
};

const requireAdmin = requireRoles('administrador');
const requireOrganizadorOrAdmin = requireRoles('organizador', 'administrador');

module.exports = {
  authMiddleware,
  requireRoles,
  requireAdmin,
  requireOrganizadorOrAdmin
};
