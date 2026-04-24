import supabase from "../../config/supabase.js";

export const getUsers = async () => {
  const { data, error } = await supabase
    .from("usuario")
    .select(`
      id, rol_id, id_tipo_usuario, organizacion_id, created_at, id_estado,
      persona ( 
        id_persona, nombre, apellido, email, telefono, cedula,
        id_tipo_persona,
        tipo_persona ( id_tipo_persona, nombre, puede_reservar )
      )
    `);

  if (error) throw error;

  // Si necesitamos el cargo, debemos obtenerlo de la tabla empleado.
  // Podríamos hacer un join si la relación lo permite o mapear después.
  // Dado que Supabase no permite joins profundos entre tablas no relacionadas directamente de forma sencilla si no hay FK,
  // y empleado tiene id_persona, podemos intentar incluirlo si hay relación.
  
  // Vamos a enriquecer los datos con el cargo si es posible.
  const usersWithCargo = await Promise.all(data.map(async (u) => {
    const { data: empData } = await supabase
      .from("empleado")
      .select("id_cargo, cargo(nombre, nivel_privilegio)")
      .eq("id_persona", u.persona.id_persona)
      .maybeSingle();
    
    return {
      ...u,
      cargo: empData?.cargo || null
    };
  }));

  return usersWithCargo;
};
