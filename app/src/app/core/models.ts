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

export interface Sesion {
  id: number;
  puesto_id: number;
  empleado_id: string;
  cliente_nombre: string | null;
  hora_inicio: string;
  hora_fin: string | null;
  horas_cobradas: number | null;
  controles_adicionales: number;
  precio_manual: number | null;
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
