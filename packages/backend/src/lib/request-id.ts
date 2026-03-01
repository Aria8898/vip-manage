export const createRequestId = (request: Request): string => {
  const ray = request.headers.get("cf-ray");
  if (ray) {
    return ray;
  }

  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};
