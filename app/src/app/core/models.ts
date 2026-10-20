export type Rol = 'admin' | 'empleado';

export interface Profile {
  id: string;
  full_name: string | null;
  role: Rol;
  created_at: string;
}

export interface Puesto {
  id: number;
  nombre: string;
  activo: boolean;
  created_at: string;
}

export type EstadoSesion = 'activa' | 'finalizada' | 'cancelada';

/**
 * Modalidad de cobro:
 * - cronometrado: cuenta hacia arriba, se cobra al cerrar según tiempo jugado (redondeo a la media hora más cercana).
 * - conteo_regresivo: tiempo fijo pactado al abrir (ej. 45, 90, 120 min); precio queda pactado de una vez.
 */
export type Modalidad = 'cronometrado' | 'conteo_regresivo';

export interface Sesion {
  id: number;
  puesto_id: number;
  empleado_id: string;
  cliente_nombre: string | null;
  hora_inicio: string;
  hora_fin: string | null;
  modalidad: Modalidad;
  minutos_asignados: number | null;
  horas_cobradas: number | null;
  controles_adicionales: number;
  horas_controles: number;
  precio_manual: number | null;
  precio_base: number | null;
  /** Precio que calculó el sistema al cobrar; precio_total puede ser distinto si quien cobró lo cambió. */
  precio_sugerido: number | null;
  precio_total: number | null;
  estado: EstadoSesion;
  created_at: string;
}

/** Fila de la vista `vista_puestos`: puesto + su sesión activa, si tiene una. */
export interface PuestoConEstado {
  id: number;
  nombre: string;
  activo: boolean;
  sesion_id: number | null;
  cliente_nombre: string | null;
  hora_inicio: string | null;
  empleado_id: string | null;
  modalidad: Modalidad | null;
  minutos_asignados: number | null;
  controles_adicionales: number | null;
  precio_total: number | null;
  precio_base: number | null;
  precio_manual: number | null;
  /** Controles adicionales de la sesión: se cobra de `desde` a `hasta` (null = sigue en uso). */
  controles: ControlAdicional[];
  pausada: boolean | null;
  /** Pausas de la sesión: ese tiempo no se cobra (hasta = null: pausa en curso). */
  pausas: Intervalo[];
}

export interface Intervalo {
  desde: string;
  hasta: string | null;
}

export type ControlAdicional = Intervalo;

export interface Gasto {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  categoria: string | null;
  admin_id: string;
  created_at: string;
}

// ── Alquiler de consolas ───────────────────────────────────────────────

export type TipoConsola = 'PS4' | 'PS5';
export type EstadoAlquiler = 'activo' | 'devuelto' | 'cancelado';

export interface AlquilerConsola {
  id: number;
  nombre: string;
  tipo: TipoConsola;
  descripcion: string | null;
  controles_incluidos: number;
  activo: boolean;
  created_at: string;
  capacidad: string | null;
  juegos: string[];
  detalles: string | null;
}

export interface AlquilerTarifa {
  id: number;
  tipo: TipoConsola;
  nombre: string;
  horas: number | null;
  es_noche: boolean;
  precio: number;
  orden: number;
  activo: boolean;
}

export interface AlquilerConfig {
  id: number;
  /** Controles sueltos en inventario, por tipo (no son intercambiables). */
  controles_sueltos_ps4: number;
  controles_sueltos_ps5: number;
  precio_control_extra: number;
  noche_desde: string;
  noche_hasta: string;
}

export interface Alquiler {
  id: number;
  consola_id: number;
  empleado_id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  tarifa_id: number | null;
  plan_nombre: string;
  inicio: string;
  fin_pactado: string;
  devuelto_en: string | null;
  controles: number;
  controles_extra: number;
  precio_sugerido: number | null;
  precio_total: number;
  estado: EstadoAlquiler;
  notas: string | null;
  created_at: string;
  /** Copia de la ficha de la consola al momento de entregarla. */
  juegos_entregados: string[];
  detalles_entregados: string | null;
  /** Pagos por más tiempo (viene embebido en el historial). */
  alquiler_extensiones?: AlquilerExtension[];
  /** Cómo entró el dinero, por pote (viene embebido en el historial). */
  alquiler_pagos?: AlquilerPago[];
}

export interface AlquilerPago {
  id: number;
  alquiler_id: number;
  extension_id: number | null;
  concepto: 'entrega' | 'extension' | 'ajuste';
  pote: 'llave' | 'efectivo';
  monto: number;
  created_at: string;
}

export interface AlquilerExtension {
  id: number;
  alquiler_id: number;
  descripcion: string;
  fin_anterior: string;
  fin_nuevo: string;
  precio_sugerido: number | null;
  precio: number;
  created_at: string;
}

/** Fila de `vista_alquiler_consolas`: consola + su alquiler activo, si tiene. */
export interface ConsolaConEstado {
  id: number;
  nombre: string;
  tipo: TipoConsola;
  descripcion: string | null;
  controles_incluidos: number;
  activo: boolean;
  alquiler_id: number | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  plan_nombre: string | null;
  inicio: string | null;
  fin_pactado: string | null;
  controles: number | null;
  controles_extra: number | null;
  precio_total: number | null;
  notas: string | null;
  extensiones: number | null;
  total_extensiones: number | null;
  capacidad: string | null;
  juegos: string[];
  detalles: string | null;
  juegos_entregados: string[] | null;
  detalles_entregados: string | null;
}

// ── Potes: movimientos de dinero (préstamos, inversiones, traslados) ──

export type TipoMovimiento = 'saldo_inicial' | 'prestamo' | 'abono_prestamo' | 'inversion' | 'otro_egreso' | 'otro_ingreso' | 'traslado';

export interface PoteMovimiento {
  id: number;
  fecha: string; // YYYY-MM-DD (Colombia)
  tipo: TipoMovimiento;
  pote: 'llave' | 'efectivo';
  pote_destino: 'llave' | 'efectivo' | null;
  monto: number;
  persona: string | null;
  descripcion: string | null;
  created_at: string;
}

/** Fila de `vista_potes`: saldo actual de un pote. */
export interface SaldoPote {
  pote: 'llave' | 'efectivo';
  cobros_alquiler: number;
  entradas: number;
  salidas: number;
  saldo: number;
}

export interface PrestamoPendiente {
  persona: string;
  prestado: number;
  abonado: number;
  pendiente: number;
  ultimo_movimiento: string;
}

// ── Productos de la sala ───────────────────────────────────────────────

export interface Producto {
  id: number;
  nombre: string;
  precio_compra: number;
  precio_venta: number;
  stock: number;
  activo: boolean;
  created_at: string;
}

export interface VentaProducto {
  id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  costo_unitario: number;
  total: number;
  estado: 'vendida' | 'anulada';
  empleado_id: string;
  created_at: string;
}

// ── Usuarios (función "usuarios") ──────────────────────────────────────

export interface UsuarioApp {
  id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
  ultimo_ingreso: string | null;
  yo: boolean;
}
