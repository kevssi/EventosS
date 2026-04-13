exports.subirImagen = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se ha subido archivo' });
    }

    const imagen_url = `/publi/uploads/${req.file.filename}`;

    return res.status(201).json({
      success: true,
      imagen_url,
      public_id: req.file.filename
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
