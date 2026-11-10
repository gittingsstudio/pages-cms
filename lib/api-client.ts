type ApiResponseLike = {
  status?: string;
  message?: string;
  code?: string;
};

// Error thrown for failed API calls, keeping the HTTP status and any error code.
class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

const parseJsonSafely = async <T = unknown>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const requireApiSuccess = async <T = any>(
  response: Response,
  fallbackMessage: string,
): Promise<T> => {
  const payload = await parseJsonSafely<T & ApiResponseLike>(response);

  if (!response.ok) {
    const message = payload?.message || `${fallbackMessage}: ${response.status} ${response.statusText}`;
    throw new ApiRequestError(message, response.status, payload?.code);
  }

  if (payload && typeof payload === "object" && "status" in payload && payload.status !== "success") {
    throw new Error(payload.message || fallbackMessage);
  }

  return (payload ?? ({} as T)) as T;
};

export { requireApiSuccess, ApiRequestError };
