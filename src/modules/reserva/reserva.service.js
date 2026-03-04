import supabase from "../../config/supabase.js";

// ─── Helper: reserva activa en una plaza ──────────────────────────────────────
export async function getReservaActiva(plazaId) {
  const { data, error } = await supabase
    .from('RESERVA')
    .select('*')
    .eq('Id_Plaza', plazaId)
    .eq('Estado_Reserva', 'Activa')
    .lte('Fecha_Hora_Inicio', new Date().toISOString())
    .gte('Fecha_Hora_Fin', new Date().toISOString())
    .maybeSingle(); // ← maybeSingle evita error si no hay ninguna

  if (error) return null;
  return data;
}

// ─── Crear reserva ────────────────────────────────────────────────────────────
// userId = auth.users.id (UUID) → se busca el persona_id correspondiente
export async function crearReserva(plazaId, userId, start, end) {

  // 1. Resolver persona_id desde auth.users.id → public.usuarios.persona_id
  const { data: usuarioRow, error: userError } = await supabase
    .from('usuarios')
    .select('persona_id')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario autenticado.");
  }
  const personaId = usuarioRow.persona_id;

  // 2. Verificar solapamiento de reservas en esa plaza
  // Condición de solapamiento: (NuevoInicio < FinExistente) AND (NuevoFin > InicioExistente)
  const { data: overlapping, error: checkError } = await supabase
    .from('RESERVA')
    .select('Id_Reserva')
    .eq('Id_Plaza', plazaId)
    .eq('Estado_Reserva', 'Activa')
    .lt('Fecha_Hora_Inicio', end.toISOString())
    .gt('Fecha_Hora_Fin', start.toISOString());

  if (checkError) {
    throw new Error("Error verificando disponibilidad de la plaza: " + checkError.message);
  }
  if (overlapping && overlapping.length > 0) {
    throw new Error("La plaza ya está reservada en ese horario.");
  }

  // 3. Insertar reserva con id_persona (campo correcto según schema)
  const { data, error } = await supabase
    .from('RESERVA')
    .insert({
      Id_Plaza:          plazaId,
      id_persona:        personaId,   // ✅ campo correcto del schema
      Fecha_Hora_Inicio: start.toISOString(),
      Fecha_Hora_Fin:    end.toISOString(),
      Estado_Reserva:    'Activa'
    })
    .select()
    .single();

  if (error) throw new Error("Error al crear la reserva: " + error.message);
  return data;
}

// ─── Listar reservas del usuario ──────────────────────────────────────────────
// Incluye: plaza (Numero_Plaza) + zona (Nombre_Zona) para mostrar en Flutter
export async function listarReservasUser(userId) {

  // 1. Resolver persona_id
  const { data: usuarioRow, error: userError } = await supabase
    .from('usuarios')
    .select('persona_id')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario.");
  }

  // 2. Traer reservas con join a plazas y zonas
  const { data, error } = await supabase
    .from('RESERVA')
    .select(`
      Id_Reserva,
      Fecha_Hora_Inicio,
      Fecha_Hora_Fin,
      Estado_Reserva,
      created_at,
      Id_Plaza,
      plazas (
        Id_Plaza,
        Numero_Plaza,
        zonas_estacionamiento ( Id_Zona, Nombre_Zona )
      )
    `)
    .eq('id_persona', usuarioRow.persona_id)   // ✅ campo correcto
    .order('Fecha_Hora_Inicio', { ascending: false });

  if (error) throw new Error("Error al listar reservas: " + error.message);
  return data || [];
}

// ─── Cancelar reserva ─────────────────────────────────────────────────────────
// Protección: solo cancela si pertenece al usuario y está Activa
export async function cancelarReserva(reservaId, userId) {

  // Resolver persona_id
  const { data: usuarioRow, error: userError } = await supabase
    .from('usuarios')
    .select('persona_id')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario.");
  }

  const { data, error } = await supabase
    .from('RESERVA')
    .update({ Estado_Reserva: 'Cancelada' })
    .eq('Id_Reserva', reservaId)
    .eq('id_persona', usuarioRow.persona_id)  // ✅ campo correcto
    .eq('Estado_Reserva', 'Activa')           // Solo si está activa
    .select()
    .single();

  if (error) throw new Error("Error al cancelar la reserva: " + error.message);
  if (!data) throw new Error("Reserva no encontrada, ya cancelada o no pertenece al usuario.");
  return data;
}