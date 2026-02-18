import { getUsers } from "./user.services.js";

export const listUsers = async (req, res, next) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
};
