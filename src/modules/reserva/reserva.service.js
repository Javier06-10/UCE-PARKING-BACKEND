import supabase from "../../config/supabase.js";

// ─── Helper: obtiene el id_estado de estado_reserva por nombre ───────────────
async function getEstadoReservaId(nombre) {
  const { data } = await supabase
    .from("estado_reserva")
    .select("id_estado")
    .ilike("nombre_estado", nombre)
    .maybeSingle();
  if (!data) throw new Error(`Estado de reserva '${nombre}' no encontrado en el catálogo`);
  return data.id_estado;
}

// ─── Helper: reserva activa en una plaza (usa id_estado FK) ──────────────────
export async function getReservaActiva(plazaId) {
  const ID_ACTIVA = await getEstadoReservaId("Activa");

  const { data, error } = await supabase
    .from("RESERVA")
    .select("*")
    .eq("Id_Plaza", plazaId)
    .eq("id_estado", ID_ACTIVA)
    .lte("Fecha_Hora_Inicio", new Date().toISOString())
    .gte("Fecha_Hora_Fin", new Date().toISOString())
    .maybeSingle();

  if (error) return null;
  return data;
}

// ─── Crear reserva ────────────────────────────────────────────────────────────
// userId         = auth.users.id (UUID)
// organizacion_id = FK de la org del parqueo donde se reserva (requerido por RLS)
export async function crearReserva(plazaId, userId, start, end, organizacion_id) {
  if (!organizacion_id) throw new Error("organizacion_id es requerido para crear una reserva");

  // 1. Resolver persona_id desde auth.users.id → public.usuarios.id_persona
  const { data: usuarioRow, error: userError } = await supabase
    .from("usuarios")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario autenticado.");
  }
  const personaId = usuarioRow.id_persona;

  // 2. Verificar solapamiento de reservas en esa plaza
  const ID_ACTIVA = await getEstadoReservaId("Activa");

  const { data: overlapping, error: checkError } = await supabase
    .from("RESERVA")
    .select("Id_Reserva")
    .eq("Id_Plaza", plazaId)
    .eq("id_estado", ID_ACTIVA)
    .lt("Fecha_Hora_Inicio", end.toISOString())
    .gt("Fecha_Hora_Fin", start.toISOString());

  if (checkError) {
    throw new Error("Error verificando disponibilidad de la plaza: " + checkError.message);
  }
  if (overlapping && overlapping.length > 0) {
    throw new Error("La plaza ya está reservada en ese horario.");
  }

  // 3. Insertar reserva con id_estado FK y organizacion_id
  const { data, error } = await supabase
    .from("RESERVA")
    .insert({
      Id_Plaza:          plazaId,
      id_persona:        personaId,
      Fecha_Hora_Inicio: start.toISOString(),
      Fecha_Hora_Fin:    end.toISOString(),
      id_estado:         ID_ACTIVA,
      organizacion_id,
    })
    .select()
    .single();

  if (error) throw new Error("Error al crear la reserva: " + error.message);
  return data;
}

// ─── Listar reservas del usuario ──────────────────────────────────────────────
export async function listarReservasUser(userId) {
  const { data: usuarioRow, error: userError } = await supabase
    .from("usuarios")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario.");
  }

  const { data, error } = await supabase
    .from("RESERVA")
    .select(`
      Id_Reserva,
      Fecha_Hora_Inicio,
      Fecha_Hora_Fin,
      id_estado,
      created_at,
      Id_Plaza,
      estado_reserva ( id_estado, nombre_estado ),
      plazas (
        Id_Plaza,
        Numero_Plaza,
        zonas_estacionamiento ( Id_Zona, Nombre_Zona )
      )
    `)
    .eq("id_persona", usuarioRow.id_persona)
    .order("Fecha_Hora_Inicio", { ascending: false });

  if (error) throw new Error("Error al listar reservas: " + error.message);
  return data || [];
}

// ─── Cancelar reserva ─────────────────────────────────────────────────────────
export async function cancelarReserva(reservaId, userId) {
  const { data: usuarioRow, error: userError } = await supabase
    .from("usuarios")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario.");
  }

  const ID_ACTIVA      = await getEstadoReservaId("Activa");
  const ID_CANCELADA   = await getEstadoReservaId("Cancelada");

  const { data, error } = await supabase
    .from("RESERVA")
    .update({ id_estado: ID_CANCELADA })
    .eq("Id_Reserva", reservaId)
    .eq("id_persona", usuarioRow.id_persona)
    .eq("id_estado", ID_ACTIVA)         // Solo si está activa
    .select()
    .single();

  if (error) throw new Error("Error al cancelar la reserva: " + error.message);
  if (!data)  throw new Error("Reserva no encontrada, ya cancelada o no pertenece al usuario.");
  return data;
}