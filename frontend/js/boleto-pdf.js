(function () {
  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function svgPathToPngDataUrl(path, size) {
    const response = await fetch(path);
    if (!response.ok) return null;

    const svgText = await response.text();
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);

      return canvas.toDataURL('image/png');
    } catch (error) {
      return null;
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  async function qrToDataUrl(qrText) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(qrText || '')}`;
    const response = await fetch(qrUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blobToDataUrl(blob);
  }

  function formatDateTime(value) {
    if (!value) return 'No disponible';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No disponible';

    return date.toLocaleString('es-MX', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function abrirPdfBoleto(boleto) {
    if (!window.jspdf?.jsPDF) {
      throw new Error('No se cargo la libreria jsPDF');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: [210, 99] });

    doc.setFillColor(7, 18, 39);
    doc.roundedRect(5, 5, 200, 89, 6, 6, 'F');

    doc.setFillColor(13, 33, 67);
    doc.roundedRect(7, 7, 130, 85, 5, 5, 'F');

    doc.setFillColor(21, 52, 102);
    doc.roundedRect(139, 7, 64, 85, 5, 5, 'F');

    const logoData = await svgPathToPngDataUrl('/favicon.svg', 120);
    if (logoData) {
      doc.addImage(logoData, 'PNG', 12, 11, 10, 10);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('eventos+', 24, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(122, 186, 255);
    doc.text('Boleto oficial de acceso', 12, 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(String(boleto.evento || 'Evento'), 12, 34, { maxWidth: 120 });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(220, 231, 255);
    doc.text(`Tipo: ${boleto.tipo_boleto || 'General'}`, 12, 44);
    doc.text(`Lugar: ${boleto.ubicacion || 'No disponible'}`, 12, 50, { maxWidth: 122 });
    doc.text(`Fecha: ${formatDateTime(boleto.fecha_evento || boleto.fecha_inicio || boleto.fecha)}`, 12, 56);
    doc.text(`Compra: ${formatDateTime(boleto.fecha_compra || boleto.fecha_pago || boleto.fecha_emision)}`, 12, 62);

    const referencia = boleto.referencia_externa || boleto.id_orden || boleto.orden_id || 'No disponible';
    const codigo = boleto.codigo_qr || 'SIN-CODIGO';
    const precio = Number(boleto.precio_pagado || boleto.precio || 0).toFixed(2);

    doc.setTextColor(149, 203, 255);
    doc.text(`Ref: ${referencia}`, 12, 70, { maxWidth: 122 });
    doc.text(`Codigo: ${codigo}`, 12, 76, { maxWidth: 122 });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(47, 255, 157);
    doc.setFontSize(12);
    doc.text(`$${precio} MXN`, 12, 86);

    const qrData = await qrToDataUrl(codigo);
    if (qrData) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(150, 18, 42, 42, 3, 3, 'F');
      doc.addImage(qrData, 'PNG', 153, 21, 36, 36);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('Presenta este QR en acceso', 142, 67);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(181, 203, 240);
    doc.text('Valido para una entrada.', 142, 73);
    doc.text('No compartir este boleto.', 142, 78);

    const safeName = String(boleto.evento || 'boleto')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const pdfBlobUrl = doc.output('bloburl');
    const opened = window.open(pdfBlobUrl, '_blank', 'noopener');

    if (!opened) {
      doc.save(`boleto-${safeName || 'evento'}.pdf`, { returnPromise: false });
    }
  }

  window.BoletoPdf = {
    abrirPdfBoleto
  };
})();