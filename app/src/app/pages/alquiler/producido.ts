import { fechaColombia, sumarDias } from '../../core/zona-horaria';

export type Periodo = 'diario' | 'semanal' | 'mensual';

/** Lo mínimo de un pago que necesita la gráfica. */
export interface PagoProducido {
  pote: 'llave' | 'efectivo';
  monto: number;
  created_at: string;
  alquileres: { estado: string };
}

export interface BarraProducido {
  clave: string; // YYYY-MM-DD (día o lunes de la semana) o YYYY-MM
  etiqueta: string; // corta, para el eje
  detalle: string; // larga, para el tooltip
  llave: number;
  efectivo: number;
  total: number;
}

/** Cuántas barras muestra cada período. */
export const BARRAS_POR_PERIODO: Record<Periodo, number> = { diario: 30, semanal: 12, mensual: 12 };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function partes(fecha: string): { anio: number; mes: number; dia: number; semana: number } {
  const d = new Date(`${fecha}T12:00:00Z`);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate(), semana: d.getUTCDay() };
}

/** Lunes de la semana (Colombia) a la que pertenece la fecha. */
export function lunesDe(fecha: string): string {
  const { semana } = partes(fecha);
  return sumarDias(fecha, -((semana + 6) % 7));
}

function claveDe(fecha: string, periodo: Periodo): string {
  if (periodo === 'diario') return fecha;
  if (periodo === 'semanal') return lunesDe(fecha);
  return fecha.slice(0, 7);
}

/** Claves de las barras, de la más antigua a la actual. */
function clavesPeriodo(hoy: string, periodo: Periodo): string[] {
  const n = BARRAS_POR_PERIODO[periodo];
  if (periodo === 'diario') return Array.from({ length: n }, (_, i) => sumarDias(hoy, i - n + 1));
  if (periodo === 'semanal') {
    const lunes = lunesDe(hoy);
    return Array.from({ length: n }, (_, i) => sumarDias(lunes, (i - n + 1) * 7));
  }
  const { anio, mes } = partes(hoy);
  return Array.from({ length: n }, (_, i) => {
    const total = anio * 12 + mes + (i - n + 1);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

function etiquetas(clave: string, periodo: Periodo): { etiqueta: string; detalle: string } {
  if (periodo === 'mensual') {
    const [anio, mes] = clave.split('-').map(Number);
    return { etiqueta: MESES[mes - 1], detalle: `${MESES[mes - 1]} ${anio}` };
  }
  const { dia, mes, semana } = partes(clave);
  if (periodo === 'diario') {
    return { etiqueta: String(dia), detalle: `${DIAS[semana]} ${dia} ${MESES[mes]}` };
  }
  const domingo = partes(sumarDias(clave, 6));
  return {
    etiqueta: `${dia} ${MESES[mes]}`,
    detalle: `Semana ${dia} ${MESES[mes]} – ${domingo.dia} ${MESES[domingo.mes]}`,
  };
}

/** Fecha desde la que hay que pedir pagos para llenar todas las barras del período. */
export function inicioPeriodo(hoy: string, periodo: Periodo): string {
  const primera = clavesPeriodo(hoy, periodo)[0];
  return periodo === 'mensual' ? `${primera}-01` : primera;
}

/**
 * Producido del alquiler por día, semana (lunes a domingo) o mes, en hora de Colombia,
 * separado por pote. Cuenta el día en que entró el dinero; ignora alquileres anulados.
 */
export function agruparProducido(pagos: PagoProducido[], periodo: Periodo, hoy = fechaColombia()): BarraProducido[] {
  const barras = new Map<string, BarraProducido>(
    clavesPeriodo(hoy, periodo).map((clave) => [clave, { clave, ...etiquetas(clave, periodo), llave: 0, efectivo: 0, total: 0 }]),
  );
  for (const p of pagos) {
    if (p.alquileres.estado === 'cancelado') continue;
    const barra = barras.get(claveDe(fechaColombia(p.created_at), periodo));
    if (!barra) continue;
    barra[p.pote] += p.monto;
    barra.total += p.monto;
  }
  return Array.from(barras.values());
}
