import cron from 'node-cron';
import supabase from '../config/supabase.js';
import { notifyUser } from './notifications.service.js';

export function initCronJobs() {
  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date().toISOString();

      // Obtener ids de estado desde el catálogo (usando FK, no texto libre)
      const { data: estados } = await supabase
        .from('estado_reserva')
        .select('id_estado, nombre_estado');

      const ID_ACTIVA  = estados?.find(e => e.nombre_estado === 'Activa')?.id_estado;
      const ID_VENCIDA = estados?.find(
        e => e.nombre_estado === 'Vencida' || e.nombre_estado === 'Expirada'
      )?.id_estado;

      if (!ID_ACTIVA || !ID_VENCIDA) {
        console.error('[cron] No se encontraron los estados de reserva en el catálogo.');
        return;
      }

      // Buscar reservas activas cuya Fecha_Hora_Fin ya pasó
      const { data: expiradas, error } = await supabase
        .from('RESERVA')
        .select('Id_Reserva, id_persona, Id_Plaza')
        .eq('id_estado', ID_ACTIVA)
        .lt('Fecha_Hora_Fin', now);

      if (error) {
        console.error('[cron] Error buscando reservas expiradas:', error.message);
        return;
      }

      if (expiradas && expiradas.length > 0) {
        for (const reserva of expiradas) {
          const { error: updError } = await supabase
            .from('RESERVA')
            .update({ id_estado: ID_VENCIDA })
            .eq('Id_Reserva', reserva.Id_Reserva);

          if (!updError) {
            console.log(`[cron] Reserva ${reserva.Id_Reserva} expirada automáticamente.`);

            // Notificar al usuario — campo correcto: id_persona (UUID)
            notifyUser(reserva.id_persona, 'RESERVA_EXPIRADA', {
              mensaje: 'Tu reserva ha alcanzado su límite de tiempo y ha sido cancelada.',
              reservaId: reserva.Id_Reserva,
              plazaId:   reserva.Id_Plaza,
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
