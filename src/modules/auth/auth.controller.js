import { loginService } from "./auth.services.js";

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await loginService(email, password);

    res.json(result);
  } catch (error) {
    next(error);
  }
};
