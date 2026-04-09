const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.subirImagen = async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, error: 'No se ha subido archivo' });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'eventos'
    });

    return res.status(201).json({
      success: true,
      imagen_url: result.secure_url,
      public_id: result.public_id
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

    const result = await cloudinary.uploader.destroy(public_id);
    return res.json({ success: true, result });
  } catch (error) {
    console.error('Error eliminarImagen:', error);
    return res.status(500).json({ success: false, error: 'Error al eliminar imagen' });
  }
};
