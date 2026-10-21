import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * Mantiene una pantalla al día sin recargar, también en el celular:
 * - escucha los cambios de las tablas (realtime) y se vuelve a conectar si la conexión cae;
 * - refresca al volver a la app (pantalla desbloqueada, pestaña activa, internet de vuelta);
 * - y, por si el realtime se pierde sin avisar, refresca cada `cadaMs` mientras se ve la app.
 * Devuelve la función para cancelar todo.
 */
export function suscribirCambios(
  client: SupabaseClient,
  nombre: string,
  tablas: string[],
  callback: () => void,
  cadaMs = 30_000,
): () => void {
  let canal: RealtimeChannel | undefined;
  let activo = true;
  let reintento: ReturnType<typeof setTimeout> | undefined;

  const conectar = () => {
    if (!activo) return;
    if (canal) client.removeChannel(canal);
    let c = client.channel(`${nombre}-${crypto.randomUUID()}`);
    for (const table of tablas) c = c.on('postgres_changes', { event: '*', schema: 'public', table }, callback);
    canal = c.subscribe((estado) => {
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
        clearTimeout(reintento);
        reintento = setTimeout(conectar, 5_000);
      }
    });
  };

  const alVolver = () => {
    if (document.visibilityState !== 'visible') return;
    callback();
    conectar(); // el celular suele cortar el socket con la pantalla apagada
  };
  const sondeo = setInterval(() => {
    if (document.visibilityState === 'visible') callback();
  }, cadaMs);

  conectar();
  document.addEventListener('visibilitychange', alVolver);
  window.addEventListener('online', alVolver);

  return () => {
    activo = false;
    clearTimeout(reintento);
    clearInterval(sondeo);
    document.removeEventListener('visibilitychange', alVolver);
    window.removeEventListener('online', alVolver);
    if (canal) client.removeChannel(canal);
  };
}
