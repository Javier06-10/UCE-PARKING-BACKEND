// src/core/cron.service.js
// CAMBIO: quitado placa_vehiculo del select de reserva_zona (campo eliminado)
// CAMBIO: al expirar reserva_zona se cierran también sus tickets activos vinculados

import cron from "node-cron";
import supabase from "../config/supabase.js";
import { notifyUser } from "./notifications.service.js";

const ESTADO_ACTIVA   = 1;
const ESTADO_EXPIRADA = 3;

export function initCronJobs() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date().toISOString();

      // ── Expirar reservas de plaza ────────────────────────────────────────────
      const { data: expiradas, error } = await supabase
        .from("reserva")
        .select("id_reserva, id_plaza, id_persona")
        .eq("id_estado", ESTADO_ACTIVA)
        .lt("fecha_hora_fin", now);

      if (error) {
        console.error("[cron] Error buscando reservas expiradas:", error.message);
        return;
      }

      for (const reserva of expiradas ?? []) {
        const { error: updError } = await supabase
          .from("reserva")
          .update({ id_estado: ESTADO_EXPIRADA })
          .eq("id_reserva", reserva.id_reserva);

        if (!updError) {
          notifyUser(reserva.id_persona, "RESERVA_EXPIRADA", {
            mensaje: "Tu reserva ha alcanzado su límite de tiempo y ha sido cancelada.",
            reservaId: reserva.id_reserva,
            plazaId:   reserva.id_plaza
          });
        }
      }

      // ── Expirar reservas de zona ─────────────────────────────────────────────
      // CAMBIO: quitado placa_vehiculo del select (campo eliminado de BD)
      const { data: expiradas_zona } = await supabase
        .from("reserva_zona")
        .select("id_reserva_zona, id_plaza_asignada, id_persona, codigo_reserva, organizacion_id")
        .eq("id_estado", ESTADO_ACTIVA)
        .lt("fecha_hora_fin", now);

      for (const rz of expiradas_zona ?? []) {
        const { error: updRzError } = await supabase
          .from("reserva_zona")
          .update({ id_estado: 4 }) // Vencida
          .eq("id_reserva_zona", rz.id_reserva_zona);

        if (!updRzError) {
          console.log(`[cron] ReservaZona ${rz.id_reserva_zona} expirada automáticamente.`);

          // Liberar plaza asignada si tenía una
          if (rz.id_plaza_asignada) {
            await supabase
              .from("plaza")
              .update({ id_estado: 1 }) // Libre
              .eq("id_plaza", rz.id_plaza_asignada);
          }

          // NUEVO: cerrar tickets activos vinculados a esta reserva de zona
          if (rz.codigo_reserva) {
            const { data: estadoActivo } = await supabase
              .from("estado_ticket")
              .select("id_estado")
              .eq("nombre", "Activo")
              .maybeSingle();

            if (estadoActivo) {
              const { data: estadoCerrado } = await supabase
                .from("estado_ticket")
                .select("id_estado")
                .eq("nombre", "Cerrado")
                .maybeSingle();

              if (estadoCerrado) {
                await supabase
                  .from("ticket")
                  .update({ id_estado: estadoCerrado.id_estado })
                  .eq("id_codigo_reserva", rz.codigo_reserva)
                  .eq("id_estado", estadoActivo.id_estado);

                console.log(`[cron] Tickets de reserva ${rz.codigo_reserva} cerrados automáticamente.`);
              }
            }
          }

          // Notificar al solicitante
          notifyUser(rz.id_persona, "RESERVA_ZONA_EXPIRADA", {
            mensaje: "Tu reserva de zona ha vencido.",
            reservaZonaId: rz.id_reserva_zona
          });

          // Notificar a participantes registrados
          const { data: participantes } = await supabase
            .from("reserva_zona_participantes")
            .select("id_persona")
            .eq("id_reserva_zona", rz.id_reserva_zona);

          for (const p of participantes ?? []) {
            notifyUser(p.id_persona, "RESERVA_ZONA_EXPIRADA", {
              mensaje: "La reserva de zona en la que eras participante ha vencido.",
              reservaZonaId: rz.id_reserva_zona
            });
          }
        }
      }
    } catch (err) {
      console.error("[cron] Error en job de expiración:", err);
    }
  });

  console.log("Cron jobs inicializados.");
}