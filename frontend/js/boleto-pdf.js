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

  function drawBarcodeLike(doc, text, x, y, width, height) {
    const source = String(text || 'EVENTOS').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const chars = (source + 'EVENTOSPLUS').slice(0, 18);
    const step = width / (chars.length * 2);
    let cursor = x;

    for (let i = 0; i < chars.length; i += 1) {
      const code = chars.charCodeAt(i);
      const barW = (code % 2 === 0 ? 1.1 : 0.7) * step;
      const barH = (code % 3 === 0 ? 1 : 0.75) * height;
      doc.rect(cursor, y + (height - barH), barW, barH, 'F');
      cursor += step * 2;
    }
  }

  async function abrirPdfBoleto(boleto) {
    if (!window.jspdf?.jsPDF) {
      throw new Error('No se cargo la libreria jsPDF');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a6' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const outerX = 5;
    const outerY = 5;
    const outerW = pageW - 10;
    const outerH = pageH - 10;
    const stubW = 44;
    const splitX = outerX + outerW - stubW;

    doc.setFillColor(241, 244, 249);
    doc.rect(0, 0, pageW, pageH, 'F');

    doc.setFillColor(10, 27, 54);
    doc.roundedRect(outerX, outerY, outerW, outerH, 6, 6, 'F');

    doc.setFillColor(14, 37, 73);
    doc.roundedRect(outerX + 1.3, outerY + 1.3, outerW - stubW - 2.6, outerH - 2.6, 4, 4, 'F');

    doc.setFillColor(17, 45, 88);
    doc.roundedRect(splitX + 1.3, outerY + 1.3, stubW - 2.6, outerH - 2.6, 4, 4, 'F');

    doc.setDrawColor(113, 149, 205);
    doc.setLineWidth(0.3);
    doc.setLineDash([1, 1], 0);
    doc.line(splitX, outerY + 4, splitX, outerY + outerH - 4);
    doc.setLineDash([], 0);

    doc.setFillColor(241, 244, 249);
    for (let y = outerY + 10; y <= outerY + outerH - 10; y += 10) {
      doc.circle(splitX, y, 1.5, 'F');
    }

    const logoData = await svgPathToPngDataUrl('/favicon.svg', 120);
    if (logoData) {
      doc.addImage(logoData, 'PNG', outerX + 7, outerY + 7, 8.5, 8.5);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('eventos+', outerX + 18, outerY + 12.7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(122, 186, 255);
    doc.text('Boleto oficial de acceso', outerX + 7, outerY + 18.4);

    doc.setTextColor(60, 255, 174);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('ADMITE 1 PERSONA', outerX + 7, outerY + 23.3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(255, 255, 255);
    const titulo = String(boleto.evento || 'Evento');
    const tituloLines = doc.splitTextToSize(titulo, outerW - stubW - 18);
    doc.text(tituloLines.slice(0, 2), outerX + 7, outerY + 31);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(220, 231, 255);
    const eventDate = formatDateTime(boleto.fecha_evento || boleto.fecha_inicio || boleto.fecha);
    const buyDate = formatDateTime(boleto.fecha_compra || boleto.fecha_pago || boleto.fecha_emision);
    doc.text(`Tipo: ${boleto.tipo_boleto || 'General'}`, outerX + 7, outerY + 42);
    doc.text(`Lugar: ${boleto.ubicacion || 'No disponible'}`, outerX + 7, outerY + 48.4, { maxWidth: outerW - stubW - 18 });
    doc.text(`Fecha: ${eventDate}`, outerX + 7, outerY + 54.8, { maxWidth: outerW - stubW - 18 });
    doc.text(`Compra: ${buyDate}`, outerX + 7, outerY + 61.2, { maxWidth: outerW - stubW - 18 });

    const referencia = boleto.referencia_externa || boleto.id_orden || boleto.orden_id || 'No disponible';
    const codigo = boleto.codigo_qr || 'SIN-CODIGO';
    const precio = Number(boleto.precio_pagado || boleto.precio || 0).toFixed(2);

    doc.setTextColor(149, 203, 255);
    doc.text(`Ref: ${referencia}`, outerX + 7, outerY + 69);
    doc.text(`Codigo: ${codigo}`, outerX + 7, outerY + 75.2, { maxWidth: outerW - stubW - 18 });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(47, 255, 157);
    doc.setFontSize(13);
    doc.text(`$${precio} MXN`, outerX + 7, outerY + outerH - 7.3);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text('SECCION DE CONTROL', splitX + 6, outerY + 10.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(190, 214, 252);
    doc.setFontSize(7.3);
    doc.text(`Evento`, splitX + 6, outerY + 17);
    const stubEventLines = doc.splitTextToSize(titulo, stubW - 12);
    doc.text(stubEventLines.slice(0, 2), splitX + 6, outerY + 21.3);

    const qrData = await qrToDataUrl(codigo);
    if (qrData) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(splitX + 7, outerY + 31, stubW - 14, 30, 2.5, 2.5, 'F');
      doc.addImage(qrData, 'PNG', splitX + 9.5, outerY + 33.5, stubW - 19, 25);
    }

    doc.setFillColor(210, 226, 252);
    drawBarcodeLike(doc, codigo, splitX + 6, outerY + outerH - 17, stubW - 12, 9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);
    doc.text('Presenta este boleto en acceso', splitX + 6, outerY + outerH - 3.5);

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