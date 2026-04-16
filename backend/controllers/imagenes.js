const path = require('path');
const fs = require('fs');

// Carpeta donde se guardan las imágenes subidas
const UPLOADS_DIR = path.join(__dirname, '../../frontend/publi/uploads');

// Asegurar que la carpeta exista
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

exports.subirImagen = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se ha subido archivo' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const filename = `img_${Date.now()}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filepath, req.file.buffer);

    const imagen_url = `/publi/uploads/${filename}`;

    return res.status(201).json({
      success: true,
      imagen_url
    });
  } catch (error) {
    console.error('Error subirImagen:', error);
    return res.status(500).json({ success: false, error: 'Error al subir imagen' });
  }
};

exports.eliminarImagen = async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ success: false, error: 'public_id requerido' });
    }

    // public_id puede ser la ruta relativa o solo el nombre del archivo
    const filename = path.basename(public_id);
    const filepath = path.join(UPLOADS_DIR, filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error eliminarImagen:', error);
    return res.status(500).json({ success: false, error: 'Error al eliminar imagen' });
  }
};

