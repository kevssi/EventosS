const SubirImagen = {
  init() {
    const input = document.querySelector('#imagen');
    const preview = document.querySelector('#previewImagen');

    if (!input || !preview) return;

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) {
        preview.style.display = 'none';
        preview.src = '';
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      preview.src = objectUrl;
      preview.style.display = 'block';

      preview.onload = () => URL.revokeObjectURL(objectUrl);
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SubirImagen.init());
} else {
  SubirImagen.init();
}
