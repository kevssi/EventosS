const cloudinary = require('cloudinary').v2;

// Cloudinary se configura automatically desde CLOUDINARY_URL, o con las vars individuales
if (!process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

exports.subirImagen = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se ha subido archivo' });
    }

    // Subir a Cloudinary desde el buffer en memoria
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'eventos', resource_type: 'image' },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(req.file.buffer);
    });

    return res.status(201).json({
      success: true,
      imagen_url: uploadResult.secure_url,
      public_id: uploadResult.public_id
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

