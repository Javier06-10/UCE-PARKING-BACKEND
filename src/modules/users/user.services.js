import supabase from "../../config/supabase.js";

export const getUsers = async () => {
  const { data, error } = await supabase
    .from("usuario")
    .select("*");

  if (error) throw error;

  return data;
};
