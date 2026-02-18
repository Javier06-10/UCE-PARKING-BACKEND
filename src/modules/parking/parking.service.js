import supabase from "../../config/supabase.js";

const ESTADO_LIBRE = 1;
const ESTADO_OCUPADA = 2;

// UUID del sistema (crear uno real en personas)
const SISTEMA_UUID = "3e2067cf-64fd-427b-9d4a-0c5d0bb777ea";

async function updatePlazas(plazas) {
  for (const plaza of plazas) {
    const nuevoEstado = plaza.occupied ? ESTADO_OCUPADA : ESTADO_LIBRE;

    // 1️⃣ Actualizar estado plaza
    const { error: updateError } = await supabase
      .from("plazas")
      .update({ id_estado: nuevoEstado })
      .eq("Id_Plaza", plaza.id);

    if (updateError) {
      console.error("Error actualizando plaza:", plaza.id, updateError);
      continue;
    }

    // 2️⃣ Insertar evento
    const { error: eventError } = await supabase.from("eventos").insert({
      Fecha_Hora: new Date(),
      Tipo_Evento: plaza.occupied ? "PLAZA_OCUPADA" : "PLAZA_LIBERADA",
      Descripcion: `Plaza ${plaza.id} ${plaza.occupied ? "ocupada" : "liberada"}`,
      Id_Plaza: plaza.id,
      id_persona: SISTEMA_UUID,
      origen_evento: "SENSOR",
    });

    if (eventError) {
      console.error("Error insertando evento:", eventError);
    }
  }

  console.log("✅ Plazas actualizadas correctamente");
}

export { updatePlazas };
