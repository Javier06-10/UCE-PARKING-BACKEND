import jwt from "jsonwebtoken";
import supabase from "../../config/supabase.js";
import env from "../../config/env.js";

export const loginService = async (email, password) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) {
    throw new Error("Usuario no encontrado");
  }

  if (data.password !== password) {
    throw new Error("Credenciales inválidas");
  }

  const token = jwt.sign(
    { id: data.id, role: data.role },
    env.jwtSecret,
    { expiresIn: "8h" }
  );

  return { user: data, token };
};
