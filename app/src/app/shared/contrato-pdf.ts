import { DatosContrato } from '../core/alquiler.service';
import { ZONA_HORARIA } from '../core/zona-horaria';

/** Lo que se marca al entregar (casillas del formato del dueño). */
export interface AccesoriosContrato {
  mandos: number;
  cablePoder: boolean;
  cableHdmi: boolean;
  cableCarga: boolean;
  otro: string;
}

/** Condiciones del formato del dueño (Contrato_Alquiler_Consola_ALFA_GAMES.docx), texto literal. */
export const CONDICIONES_CONTRATO: { titulo: string; texto: string }[] = [
  {
    titulo: 'Estado del equipo',
    texto:
      'El cliente declara recibir el equipo y accesorios en perfecto estado operativo y estético, comprometiéndose a devolverlo en las mismas condiciones.',
  },
  {
    titulo: 'Uso y Garantía',
    texto:
      'Prohibido destapar la consola, violar sellos de garantía, modificar software, golpearla, mojarla o trasladarla de la dirección registrada.',
  },
  {
    titulo: 'Daños o Pérdida',
    texto:
      'En caso de avería, fallo por mal uso, daño parcial, pérdida de accesorios, robo o extravío, el cliente responderá cancelando el valor total de la reparación o la reposición del equipo a valor comercial actual.',
  },
  {
    titulo: 'Devolución',
    texto:
      'El cliente se obliga a entregar la consola en la fecha y hora acordadas. El retraso no notificado generará un cobro adicional por hora de mora.',
  },
];

/** "20 / 11 / 2026 -- 07:30 PM" en hora de Colombia. */
export function fechaHoraContrato(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA_HORARIA,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p['day']} / ${p['month']} / ${p['year']}  --  ${p['hour']}:${p['minute']} ${p['dayPeriod']}`;
}

export function fechaContrato(iso: string): string {
  return fechaHoraContrato(iso).split('  --  ')[0];
}

/** "13 h 55 min" entre dos fechas. */
export function duracionContrato(desdeIso: string, hastaIso: string): string {
  const min = Math.max(0, Math.round((new Date(hastaIso).getTime() - new Date(desdeIso).getTime()) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} ${h === 1 ? 'hora' : 'horas'}`;
}

/**
 * Plan y tiempo total, para que se entienda la hora de devolución:
 * "4 horas · total 4 horas", "La noche (7 PM a 9 AM) · total 12 h 55 min",
 * "GTA 6 · 6 horas + 2 extensiones de tiempo · total 43 horas".
 */
export function planContrato(plan: string, inicio: string, fin: string, extensiones: number): string {
  const ext = extensiones > 0 ? ` + ${extensiones} ${extensiones === 1 ? 'extensión' : 'extensiones'} de tiempo` : '';
  return `${plan}${ext} · total ${duracionContrato(inicio, fin)}`;
}

export function pesosContrato(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

/** Arma el PDF del contrato lleno y firmado (formato del dueño). */
export async function generarContratoPdf(
  d: DatosContrato,
  acc: AccesoriosContrato,
  firmaCliente: string,
  firmaArrendador: string | null,
  firmadoEn: Date,
  /** true = el cliente firmó desde su celular con el enlace de la reserva. */
  enLinea = false,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const a = d.alquiler;
  const M = 18; // margen
  const ANCHO = 210 - M * 2;
  let y = 18;

  const marca = (v: boolean) => (v ? '[X]' : '[  ]');
  const linea = (txt: string, tam = 10, negrita = false, x = M) => {
    pdf.setFont('helvetica', negrita ? 'bold' : 'normal');
    pdf.setFontSize(tam);
    const partes = pdf.splitTextToSize(txt, ANCHO - (x - M)) as string[];
    pdf.text(partes, x, y);
    y += partes.length * tam * 0.45 + 1.5;
  };
  const campo = (etiqueta: string, valor: string) => {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(etiqueta, M, y);
    const w = pdf.getTextWidth(etiqueta) + 2;
    pdf.setFont('helvetica', 'normal');
    const partes = pdf.splitTextToSize(valor || '—', ANCHO - w) as string[];
    pdf.text(partes, M + w, y);
    y += partes.length * 4.5 + 1.5;
  };
  const titulo = (txt: string) => {
    y += 2;
    pdf.setFillColor(30, 41, 59);
    pdf.rect(M, y - 4.5, ANCHO, 6.5, 'F');
    pdf.setTextColor(255, 255, 255);
    linea(txt, 10.5, true, M + 2);
    pdf.setTextColor(0, 0, 0);
    y += 1;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('ALFA GAMES', 105, y, { align: 'center' });
  y += 7;
  pdf.setFontSize(12);
  pdf.text('CONTRATO DE ALQUILER DE CONSOLA DE VIDEOJUEGOS', 105, y, { align: 'center' });
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(`Alquiler #${a.id}`, 105, y, { align: 'center' });
  y += 5;

  titulo('1. DATOS DE LAS PARTES');
  campo('FECHA:', fechaContrato(firmadoEn.toISOString()));
  campo('ARRENDADOR:', `${d.arrendadorNombre ?? ''} (ALFA GAMES)    |    C.C.: ${d.arrendadorCedula ?? ''}`);
  campo('CLIENTE / ARRENDATARIO:', a.cliente_nombre);
  campo('C.C. Nº:', `${a.cliente_cedula ?? ''}        TELÉFONO: ${a.cliente_telefono ?? ''}`);
  campo('DIRECCIÓN DE ENTREGA:', (a.cliente_direccion ?? '').replace(/\s*\n\s*/g, ', '));

  titulo('2. DETALLE DEL EQUIPO Y TIEMPOS');
  const tipo = d.consola?.tipo ?? '';
  const otraConsola = tipo !== 'PS5' && tipo !== 'PS4';
  campo(
    'CONSOLA:',
    `${marca(tipo === 'PS5')} PS5     ${marca(tipo === 'PS4')} PS4     ${marca(otraConsola)} OTRA: ${otraConsola ? tipo : ''}    (${d.consola?.nombre ?? ''})`,
  );
  campo('Nº DE SERIE CONSOLA:', d.consola?.serial ?? '');
  linea('ACCESORIOS ENTREGADOS:', 10, true);
  linea(
    `${marca(acc.mandos > 0)} ${acc.mandos} Mando(s) inalámbrico(s)        ${marca(acc.cablePoder)} Cable de poder        ${marca(acc.cableHdmi)} Cable HDMI`,
    10,
    false,
    M + 4,
  );
  linea(`${marca(acc.cableCarga)} Cable de carga de mando        ${marca(!!acc.otro.trim())} Otro / Juego: ${acc.otro.trim()}`, 10, false, M + 4);
  campo('FECHA Y HORA DE ENTREGA:', fechaHoraContrato(a.inicio));
  campo('FECHA Y HORA DE DEVOLUCIÓN:', fechaHoraContrato(a.fin_pactado));
  campo('PLAN / TIEMPO:', planContrato(a.plan_nombre, a.inicio, a.fin_pactado, d.extensiones ?? 0));
  campo('VALOR PAGADO:', pesosContrato(d.pagado));

  titulo('3. CONDICIONES BÁSICAS Y COMPROMISOS');
  CONDICIONES_CONTRATO.forEach((c, i) => linea(`${i + 1}. ${c.titulo}: ${c.texto}`, 9.5));

  titulo('4. FIRMAS DE CONFORMIDAD');
  y += 2;
  const alto = 28;
  const ancho = 72;
  const xIzq = M + 2;
  const xDer = 210 - M - ancho - 2;
  // La firma conserva su forma: se ajusta dentro del recuadro, apoyada sobre la línea.
  const firma = (img: string, x: number) => {
    const p = pdf.getImageProperties(img);
    const k = Math.min(ancho / p.width, alto / p.height);
    const w = p.width * k;
    const h = p.height * k;
    pdf.addImage(img, 'PNG', x + (ancho - w) / 2, y + alto - h, w, h, undefined, 'FAST');
  };
  if (firmaArrendador) firma(firmaArrendador, xIzq);
  firma(firmaCliente, xDer);
  y += alto + 1;
  pdf.line(xIzq, y, xIzq + ancho, y);
  pdf.line(xDer, y, xDer + ancho, y);
  y += 4.5;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('FIRMA ARRENDADOR', xIzq, y);
  pdf.text('FIRMA CLIENTE / ARRENDATARIO', xDer, y);
  y += 4.5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(d.arrendadorNombre ?? '', xIzq, y);
  pdf.text(`Nombre: ${a.cliente_nombre}`, xDer, y);
  y += 4.5;
  pdf.text(`C.C. Nº: ${d.arrendadorCedula ?? ''}`, xIzq, y);
  pdf.text(`C.C. Nº: ${a.cliente_cedula ?? ''}`, xDer, y);

  y += 9;
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    pdf.splitTextToSize(
      enLinea
        ? `Firmado electrónicamente por el cliente desde su celular, con el enlace personal de su reserva, el ${fechaHoraContrato(firmadoEn.toISOString())} (hora de Colombia).`
        : `Firmado electrónicamente en pantalla el ${fechaHoraContrato(firmadoEn.toISOString())} (hora de Colombia), al momento de la entrega del equipo.`,
      ANCHO,
    ) as string[],
    M,
    y,
  );

  return pdf.output('blob');
}
