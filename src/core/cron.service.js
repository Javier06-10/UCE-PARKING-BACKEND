import cron from 'node-cron';
import supabase from '../config/supabase.js';
import { notifyUser } from './notifications.service.js';

export function initCronJobs() {
  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date().toISOString();

      // Obtener ids de estado desde el catálogo global, contexto='reserva'
      const { data: estados } = await supabase
        .from('estado')
        .select('id, nombre')
        .eq('contexto', 'reserva');

      const ID_ACTIVA  = estados?.find(e => e.nombre === 'Activa')?.id;
      const ID_VENCIDA = estados?.find(
        e => e.nombre === 'Vencida' || e.nombre === 'Expirada'
      )?.id;

      if (!ID_ACTIVA || !ID_VENCIDA) {
        console.error('[cron] No se encontraron los estados de reserva en el catálogo.');
        return;
      }

      // Buscar reservas activas cuya fecha_hora_fin ya pasó
      const { data: expiradas, error } = await supabase
        .from('reserva')
        .select('id_reserva, id_persona, id_plaza')
        .eq('id_estado', ID_ACTIVA)
        .lt('fecha_hora_fin', now);

      if (error) {
        console.error('[cron] Error buscando reservas expiradas:', error.message);
        return;
      }

      if (expiradas && expiradas.length > 0) {
        for (const reserva of expiradas) {
          const { error: updError } = await supabase
            .from('reserva')
            .update({ id_estado: ID_VENCIDA })
            .eq('id_reserva', reserva.id_reserva);

          if (!updError) {
            console.log(`[cron] Reserva ${reserva.id_reserva} expirada automáticamente.`);

            notifyUser(reserva.id_persona, 'RESERVA_EXPIRADA', {
              mensaje:  'Tu reserva ha alcanzado su límite de tiempo y ha sido cancelada.',
              reservaId: reserva.id_reserva,
              plazaId:   reserva.id_plaza,
            });
          }
        }
      }
    } catch (err) {
      console.error('[cron] Error en job de expiración de reservas:', err);
    }
  });

  console.log('⏱️ Cron jobs inicializados.');
}
