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

      // Expirar reservas_zona vencidas
      const { data: expiradas_zona } = await supabase
        .from("reserva_zona")
        .select("id_reserva_zona, id_plaza_asignada, id_persona")
        .eq("id_estado", 1)
        .lt("fecha_hora_fin", now);

      for (const rz of expiradas_zona ?? []) {
        const { error: updRzError } = await supabase
          .from("reserva_zona")
          .update({ id_estado: 4 }) // Vencida
          .eq("id_reserva_zona", rz.id_reserva_zona);

        if (!updRzError) {
          console.log(`[cron] ReservaZona ${rz.id_reserva_zona} expirada automaticamente.`);

          if (rz.id_plaza_asignada) {
            await supabase
              .from("plaza")
              .update({ id_estado: 1 }) // Libre
              .eq("id_plaza", rz.id_plaza_asignada);
          }

          notifyUser(rz.id_persona, "RESERVA_ZONA_EXPIRADA", {
            mensaje: "Tu reserva de zona ha vencido.",
            reservaZonaId: rz.id_reserva_zona
          });
        }
      }
    } catch (err) {
      console.error("[cron] Error en job de expiracion de reservas:", err);
    }
  });

  console.log("Cron jobs inicializados.");
}
