export class AppError extends Error {
  constructor(message, status = 500, code = "APP_ERROR", details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
}

export function errorHandler(error, req, res, _next) {
  const status = error.status || 500;
  const showMessage = status < 500 || String(error.code || "").endsWith("_NOT_CONFIGURED");
  const payload = {
    error: {
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: showMessage ? error.message : "Something went wrong."
    }
  };

  if (error.details) payload.error.details = error.details;
  if (process.env.NODE_ENV !== "production" && status >= 500) payload.error.debug = error.message;

  res.status(status).json(payload);
}
