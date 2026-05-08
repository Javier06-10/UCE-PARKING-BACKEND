-- RPC: validar_entrada_por_codigo
-- Busca en reserva_zona por codigo_reserva (campo TEXT UNIQUE).
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run

CREATE OR REPLACE FUNCTION validar_entrada_por_codigo(codigo TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reserva RECORD;
BEGIN
  SELECT
    rz.id_reserva_zona,
    rz.id_plaza_asignada,
    rz.id_persona,
    rz.fecha_hora_inicio,
    rz.fecha_hora_fin,
    rz.codigo_reserva,
    p.nombre || ' ' || p.apellido  AS nombre_completo,
    pl.numero_plaza,
    z.nombre                       AS zona
  INTO v_reserva
  FROM   reserva_zona rz
  JOIN   persona      p   ON p.id_persona       = rz.id_persona
  LEFT JOIN plaza     pl  ON pl.id_plaza         = rz.id_plaza_asignada
  LEFT JOIN zona      z   ON z.id_zona           = pl.id_zona
  WHERE  rz.codigo_reserva    = UPPER(TRIM(codigo))
    AND  rz.id_estado         = 1          -- Activa
    AND  rz.fecha_hora_inicio <= NOW()
    AND  rz.fecha_hora_fin    >= NOW()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'valido',  false,
      'mensaje', 'Código de reserva no válido o expirado'
    );
  END IF;

  RETURN json_build_object(
    'valido',          true,
    'mensaje',         'Reserva válida',
    'id_reserva_zona', v_reserva.id_reserva_zona,
    'id_plaza',        v_reserva.id_plaza_asignada,
    'numero_plaza',    v_reserva.numero_plaza,
    'zona',            v_reserva.zona,
    'nombre_completo', v_reserva.nombre_completo,
    'codigo_reserva',  v_reserva.codigo_reserva,
    'valida_desde',    v_reserva.fecha_hora_inicio,
    'valida_hasta',    v_reserva.fecha_hora_fin
  );
END;
$$;
