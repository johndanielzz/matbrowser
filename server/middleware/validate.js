import { AppError } from "../utils/errors.js";

export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError("Invalid request payload.", 422, "VALIDATION_ERROR", parsed.error.flatten()));
    }
    req.body = parsed.data;
    next();
  };
}
