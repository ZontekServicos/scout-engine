export function successResponse(data: any, meta: Record<string, any> = {}) {
  return {
    success: true,
    data,
    error: null,
    meta,
  };
}

export function errorResponse(message: string, meta: Record<string, any> = {}) {
  return {
    success: false,
    data: null,
    error: message,
    meta,
  };
}
