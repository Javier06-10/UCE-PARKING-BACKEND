import supabase from "../../config/supabase.js";

export const getUsers = async () => {
  const { data, error } = await supabase
    .from("users")
    .select("*");

  if (error) throw error;

  return data;
};
