// Motor de cálculo DGII — toda la lógica fiscal

const ITBIS_RATE = 0.18;

function calcularDesdeVentas(montoTotal) {
  const ventasNetas = montoTotal / (1 + ITBIS_RATE);
  const itbisCobrado = montoTotal - ventasNetas;
  return {
    montoTotal: round(montoTotal),
    ventasNetas: round(ventasNetas),
    itbisCobrado: round(itbisCobrado)
  };
}

function calcularDesdeCompras(montoTotal) {
  const comprasNetas = montoTotal / (1 + ITBIS_RATE);
  const itbisPagado = montoTotal - comprasNetas;
  return {
    montoTotal: round(montoTotal),
    comprasNetas: round(comprasNetas),
    itbisPagado: round(itbisPagado)
  };
}

function calcularResumenMensual(registros) {
  let totalVentas = 0, totalCompras = 0;
  let totalItbisCobrado = 0, totalItbisPagado = 0;
  let totalVentasNetas = 0, totalComprasNetas = 0;

  registros.forEach(r => {
    if (r.ventas > 0) {
      const cv = calcularDesdeVentas(r.ventas);
      totalVentas += cv.montoTotal;
      totalVentasNetas += cv.ventasNetas;
      totalItbisCobrado += cv.itbisCobrado;
    }
    if (r.compras > 0) {
      const cc = calcularDesdeCompras(r.compras);
      totalCompras += cc.montoTotal;
      totalComprasNetas += cc.comprasNetas;
      totalItbisPagado += cc.itbisPagado;
    }
  });

  const itbisAPagar = Math.max(0, totalItbisCobrado - totalItbisPagado);
  const creditoFavor = Math.max(0, totalItbisPagado - totalItbisCobrado);

  return {
    totalVentas: round(totalVentas),
    totalCompras: round(totalCompras),
    totalVentasNetas: round(totalVentasNetas),
    totalComprasNetas: round(totalComprasNetas),
    totalItbisCobrado: round(totalItbisCobrado),
    totalItbisPagado: round(totalItbisPagado),
    itbisAPagar: round(itbisAPagar),
    creditoFavor: round(creditoFavor),
    diasRegistrados: registros.length,
    estado: itbisAPagar > 0 ? 'PAGAR' : 'CREDITO'
  };
}

function generarCSV606(registros, config) {
  // Formato oficial DGII 606 - Compras
  let csv = 'RNC,TIPO_ID,NCF,NCF_MODIFICADO,TIPO_BIENES,FECHA_COMPROBANTE,FECHA_PAGO,';
  csv += 'MONTO_FACTURADO_SERVICIOS,MONTO_FACTURADO_BIENES,TOTAL_MONTO_FACTURADO,';
  csv += 'MONTO_SERVICIO_ITBIS,MONTO_BIENES_ITBIS,TOTAL_ITBIS,FECHA_RETENCION,';
  csv += 'ITBIS_RETENIDO,ITBIS_PERCIBIDO,TIPO_RETENCION_ISR,RENTA_RETENIDA\n';

  registros.filter(r => r.compras > 0).forEach(r => {
    const c = calcularDesdeCompras(r.compras);
    const fecha = r.fecha.replace(/-/g, '');
    csv += `${config.rncProveedor || ''},01,${r.ncfCompra || 'B0100000001'},,1,${fecha},${fecha},`;
    csv += `0,${round(c.comprasNetas)},${round(c.comprasNetas)},`;
    csv += `0,${round(c.itbisPagado)},${round(c.itbisPagado)},,,,,\n`;
  });
  return csv;
}

function generarCSV607(registros, config) {
  // Formato oficial DGII 607 - Ventas
  let csv = 'RNC_NCF,TIPO_ID,NCF,NCF_MODIFICADO,TIPO_INGRESO,FECHA_COMPROBANTE,';
  csv += 'FECHA_COBRO,MONTO_FACTURADO_SERVICIOS,MONTO_FACTURADO_BIENES,TOTAL_MONTO_FACTURADO,';
  csv += 'MONTO_ITBIS,ITBIS_RETENIDO_TERCEROS,ITBIS_PERCIBIDO\n';

  registros.filter(r => r.ventas > 0).forEach(r => {
    const v = calcularDesdeVentas(r.ventas);
    const fecha = r.fecha.replace(/-/g, '');
    csv += `,02,${r.ncfVenta || 'B0200000001'},,1,${fecha},${fecha},`;
    csv += `0,${round(v.ventasNetas)},${round(v.ventasNetas)},`;
    csv += `${round(v.itbisCobrado)},0,0\n`;
  });
  return csv;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function formatearDinero(n) {
  return 'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMesNombre() {
  return new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
}
