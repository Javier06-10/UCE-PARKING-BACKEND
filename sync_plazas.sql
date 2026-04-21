 -- SCRIPT PARA SINCRONIZAR PLAZAS CON ARDUINO (15 PLAZAS TOTAL)
-- 1-10: General (Zona 23)
-- 11-15: Administrativa (Zona 7)

-- Limpiar plazas anteriores para evitar duplicados en numero_plaza si es necesario
-- (Opcional: puedes comentar estas lineas si quieres conservar datos historicos)
-- DELETE FROM public.acceso WHERE id_plaza IN (SELECT id_plaza FROM public.plaza);
-- DELETE FROM public.reserva WHERE id_plaza IN (SELECT id_plaza FROM public.plaza);
-- DELETE FROM public.plaza;

-- Resetear secuencia si borraste todo
-- ALTER SEQUENCE "PLAZA_Id_Plaza_seq" RESTART WITH 1;

-- INSERTAR O ACTUALIZAR PLAZAS GENERALES (1-10)
DO $$
BEGIN
    FOR i IN 1..10 LOOP
        INSERT INTO public.plaza (numero_plaza, id_zona, id_estado, organizacion_id, id_tipo)
        VALUES (i::text, 23, 1, 1, 8)
        ON CONFLICT (numero_plaza) DO UPDATE 
        SET id_zona = 23, id_estado = 1, id_tipo = 8;
    END LOOP;
END $$;

-- INSERTAR O ACTUALIZAR PLAZAS ADMINISTRATIVAS (11-15)
DO $$
BEGIN
    FOR i IN 11..15 LOOP
        INSERT INTO public.plaza (numero_plaza, id_zona, id_estado, organizacion_id, id_tipo)
        VALUES (i::text, 7, 1, 1, 9)
        ON CONFLICT (numero_plaza) DO UPDATE 
        SET id_zona = 7, id_estado = 1, id_tipo = 9;
    END LOOP;
END $$;

-- Verificar resultados
SELECT p.id_plaza, p.numero_plaza, z.nombre as zona, tp.nombre as tipo, ep.nombre as estado
FROM public.plaza p
JOIN public.zona z ON p.id_zona = z.id_zona
JOIN public.tipo_plaza tp ON p.id_tipo = tp.id_tipo
JOIN public.estado_plaza ep ON p.id_estado = ep.id_estado
ORDER BY p.id_plaza;
