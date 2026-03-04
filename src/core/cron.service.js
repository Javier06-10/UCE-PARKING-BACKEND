import cron from 'node-cron';
import supabase from '../config/supabase.js';
import { notifyUser } from './notifications.service.js';

export function initCronJobs() {
  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date().toISOString();

      // Buscar reservas activas cuya Fecha_Hora_Fin ya pasó
      const { data: expiradas, error } = await supabase
        .from('RESERVA')
        .select('*')
        .eq('Estado_Reserva', 'Activa')
        .lt('Fecha_Hora_Fin', now);

      if (error) {
        console.error('[cron] Error buscando reservas expiradas:', error.message);
        return;
      }

      if (expiradas && expiradas.length > 0) {
        for (const reserva of expiradas) {
          // Actualizar estado a Expirada/Cancelada Automáticamente
          const { error: updError } = await supabase
            .from('RESERVA')
            .update({ Estado_Reserva: 'Expirada' })
            .eq('Id_Reserva', reserva.Id_Reserva);

          if (!updError) {
             console.log(`[cron] Reserva ${reserva.Id_Reserva} expirada automáticamente.`);
             
             // Emitir notificación al usuario de que su reserva venció
             notifyUser(reserva.Id_Usuario, 'RESERVA_EXPIRADA', {
                mensaje: 'Tu reserva ha alcanzado su límite de tiempo y ha sido cancelada.',
                reservaId: reserva.Id_Reserva,
                plazaId: reserva.Id_Plaza
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
