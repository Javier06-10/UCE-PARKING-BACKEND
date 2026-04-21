import cron from "node-cron";
import supabase from "../config/supabase.js";
import { notifyUser } from "./notifications.service.js";

// IDs de estado_reserva
const ESTADO_ACTIVA = 1;
const ESTADO_EXPIRADA = 3;

export function initCronJobs() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date().toISOString();

      const { data: expiradas, error } = await supabase
        .from("reserva")
        .select("id_reserva, id_plaza, id_persona")
        .eq("id_estado", ESTADO_ACTIVA)
        .lt("fecha_hora_fin", now);

      if (error) {
        console.error("[cron] Error buscando reservas expiradas:", error.message);
        return;
      }

      if (expiradas && expiradas.length > 0) {
        for (const reserva of expiradas) {
          const { error: updError } = await supabase
            .from("reserva")
            .update({ id_estado: ESTADO_EXPIRADA })
            .eq("id_reserva", reserva.id_reserva);

          if (!updError) {
            console.log(`[cron] Reserva ${reserva.id_reserva} expirada automaticamente.`);

            notifyUser(reserva.id_persona, "RESERVA_EXPIRADA", {
              mensaje: "Tu reserva ha alcanzado su limite de tiempo y ha sido cancelada.",
              reservaId: reserva.id_reserva,
              plazaId: reserva.id_plaza
            });
          }
        }
      }
    } catch (err) {
      console.error("[cron] Error en job de expiracion de reservas:", err);
    }
  });

  console.log("Cron jobs inicializados.");
}
