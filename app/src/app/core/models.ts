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
 * - cronometrado: cuenta hacia arriba, se cobra al cerrar según tiempo jugado (redondeo hacia arriba).
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
  precio_manual: number | null;
  precio_base: number | null;
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
}

export interface Gasto {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  categoria: string | null;
  admin_id: string;
  created_at: string;
}
