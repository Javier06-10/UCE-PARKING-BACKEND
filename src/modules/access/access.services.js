// src/modules/access/access.services.js
// CAMBIO: validarEntradaPorCodigo usa p_codigo (nombre correcto del parámetro en BD)
// CAMBIO: validarEntradaPorCodigo retorna tickets_emitidos y capacidad (nueva versión RPC)

import supabase from "../../config/supabase.js";
import { sendCommand } from "../../config/serial.js";

async function resolverVehiculo(placa, organizacion_id) {
  const { data: vehiculo } = await supabase
    .from("vehiculo")
    .select("id_vehiculo, placa, id_persona")
    .eq("placa", placa)
    .maybeSingle();

  if (vehiculo) return vehiculo;

  const { data: nuevo, error } = await supabase
    .from("vehiculo")
    .insert({ placa, organizacion_id, id_modelo: 1, id_color: 1 })
    .select("id_vehiculo, placa, id_persona")
    .single();

  if (error) throw error;
  return nuevo;
}

async function getOrganizacionDeDispositivo(dispositivoId) {
  if (!dispositivoId) return null;
  const { data } = await supabase
    .from("dispositivo")
    .select("organizacion_id")
    .eq("id_dispositivo", dispositivoId)
    .maybeSingle();
  return data?.organizacion_id ?? null;
}

function normalizarPlaca(placa) {
  return placa.replace(/[\s\-]/g, "").toUpperCase();
}

async function buscarVehiculo(placa) {
  const placaNorm = normalizarPlaca(placa);

  const { data: vehiculo } = await supabase
    .from("vehiculo")
    .select("id_vehiculo, placa, id_persona")
    .eq("placa", placa)
    .maybeSingle();

  if (vehiculo) return vehiculo;

  const { data: todos } = await supabase
    .from("vehiculo")
    .select("id_vehiculo, placa, id_persona");

  if (todos) {
    const encontrado = todos.find(v => normalizarPlaca(v.placa) === placaNorm);
    if (encontrado) return encontrado;
  }

  return null;
}

// ─── Registrar entrada (cámara) ───────────────────────────────────────────────
async function registrarEntrada({ placa, dispositivoEntradaId }) {
  if (!placa) throw new Error("Placa requerida");
  placa = placa.trim().toUpperCase();

  const organizacion_id = await getOrganizacionDeDispositivo(dispositivoEntradaId);
  const vehiculo = await buscarVehiculo(placa);

  if (!vehiculo) {
    if (global.io) {
      global.io.emit("entrada-denegada", {
        placa,
        motivo: "VEHICULO_NO_REGISTRADO",
        mensaje: `Vehículo con placa ${placa} no está registrado`,
        timestamp: new Date()
      });
    }
    const error = new Error(`Vehículo con placa ${placa} no está registrado.`);
    error.code = "VEHICULO_NO_REGISTRADO";
    throw error;
  }

  const { data: accesoActivo } = await supabase
    .from("acceso")
    .select("id_registro")
    .eq("id_vehiculo", vehiculo.id_vehiculo)
    .is("salida_at", null)
    .maybeSingle();

  if (accesoActivo) throw new Error("Vehículo ya está dentro del parqueadero");

  const { data: registro, error: accesoError } = await supabase
    .from("acceso")
    .insert({
      entrada_at: new Date(),
      id_vehiculo: vehiculo.id_vehiculo,
      id_dispositivo_entrada: dispositivoEntradaId || null,
      organizacion_id: organizacion_id || 1
    })
    .select()
    .single();

  if (accesoError) throw accesoError;

  if (global.io) {
    global.io.emit("access-event", { type: "ENTRADA", placa: vehiculo.placa, timestamp: registro.entrada_at });
  }

  sendCommand("OPEN_MAIN");
  return registro;
}

// ─── Registrar entrada de visitante ──────────────────────────────────────────
async function registrarEntradaVisitante({ nombre, placa, dispositivoEntradaId, adminPersonaId, motivo }) {
  if (!placa) throw new Error("Placa requerida");

  const organizacion_id = await getOrganizacionDeDispositivo(dispositivoEntradaId);
  const vehiculo = await resolverVehiculo(placa, organizacion_id);

  const { data: registro, error } = await supabase
    .from("acceso")
    .insert({
      entrada_at: new Date(),
      id_vehiculo: vehiculo.id_vehiculo,
      id_dispositivo_entrada: dispositivoEntradaId || null,
      organizacion_id: organizacion_id || 1
    })
    .select()
    .single();

  if (error) throw error;

  if (adminPersonaId) {
    await supabase.from("evento").insert({
      fecha_hora:      new Date(),
      descripcion:     `Visitante autorizado. Nombre: ${nombre || "N/A"}. Motivo: ${motivo || "No especificado"}`,
      id_persona:      adminPersonaId,
      organizacion_id: organizacion_id || 1
    });
  }

  if (global.io) {
    global.io.emit("access-event", { type: "ENTRADA", placa: vehiculo.placa, timestamp: registro.entrada_at });
  }

  sendCommand("OPEN_MAIN");
  return registro;
}

// ─── Registrar salida ─────────────────────────────────────────────────────────
async function registrarSalida({ placa, dispositivoSalidaId }) {
  if (!placa) throw new Error("Placa requerida");

  const { data: vehiculo } = await supabase
    .from("vehiculo")
    .select("id_vehiculo, placa")
    .eq("placa", placa)
    .maybeSingle();

  if (!vehiculo) throw new Error("Vehículo no encontrado");

  const { data: acceso } = await supabase
    .from("acceso")
    .select("id_registro, id_plaza")
    .eq("id_vehiculo", vehiculo.id_vehiculo)
    .is("salida_at", null)
    .maybeSingle();

  if (!acceso) throw new Error("No hay entrada activa para este vehículo");

  const salidaAt = new Date();

  const { data: registro, error: updateError } = await supabase
    .from("acceso")
    .update({ salida_at: salidaAt, id_dispositivo_salida: dispositivoSalidaId || null })
    .eq("id_registro", acceso.id_registro)
    .select()
    .single();

  if (updateError) throw updateError;

  if (acceso.id_plaza) {
    await supabase.from("plaza").update({ id_estado: 1 }).eq("id_plaza", acceso.id_plaza);
  }

  sendCommand("OPEN_EXIT");

  if (global.io) {
    global.io.emit("access-event", { type: "SALIDA", placa: vehiculo.placa, timestamp: salidaAt });
  }

  return registro;
}

// ─── Historial de accesos ─────────────────────────────────────────────────────
async function getHistorialAccesos({ page = 1, limit = 20, fechaDesde, fechaHasta } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("acceso")
    .select(
      `id_registro, entrada_at, salida_at, id_plaza, id_tipo_evento,
       vehiculo ( id_vehiculo, placa ),
       dispositivo_entrada:id_dispositivo_entrada ( id_dispositivo, ip_address ),
       dispositivo_salida:id_dispositivo_salida ( id_dispositivo, ip_address )`,
      { count: "exact" }
    )
    .order("entrada_at", { ascending: false })
    .range(from, to);

  if (fechaDesde) query = query.gte("entrada_at", fechaDesde);
  if (fechaHasta) query = query.lte("entrada_at", fechaHasta);

  const { data, error, count } = await query;
  if (error) throw error;

  const registros = data.map(r => {
    let duracion_minutos = null;
    if (r.entrada_at && r.salida_at) {
      duracion_minutos = Math.round((new Date(r.salida_at) - new Date(r.entrada_at)) / 60000);
    }
    return { ...r, duracion_minutos };
  });

  return { data: registros, total: count, page, limit };
}

// ─── Validar entrada por código de reserva ────────────────────────────────────
// CAMBIO: parámetro es p_codigo (nombre correcto en la RPC de BD)
// CAMBIO: respuesta ahora incluye tickets_emitidos y capacidad
async function validarEntradaPorCodigo(codigo) {
  if (!codigo || typeof codigo !== "string" || codigo.trim().length === 0)
    throw new Error("El código de reserva es requerido");

  const { data, error } = await supabase.rpc("validar_entrada_por_codigo", {
    p_codigo: codigo.trim().toUpperCase()
  });

  if (error) throw new Error(`Error al validar código: ${error.message}`);
  if (!data)  throw new Error("No se recibió respuesta de la validación");

  return data;
  // Respuesta incluye: valido, motivo|codigo_reserva, id_reserva_zona, id_zona,
  //                    nombre_zona, nombre_persona, apellido_persona, email_persona,
  //                    fecha_inicio, fecha_fin, tickets_emitidos, capacidad
}

export {
  registrarEntrada,
  registrarEntradaVisitante,
  registrarSalida,
  getHistorialAccesos,
  validarEntradaPorCodigo
};