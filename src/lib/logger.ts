type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
};

function write(payload: LogPayload) {
  const serialized = JSON.stringify(payload);

  if (payload.level === "error") {
    console.error(serialized);
    return;
  }

  if (payload.level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    write({ level: "debug", message, timestamp: new Date().toISOString(), context });
  },
  info(message: string, context?: Record<string, unknown>) {
    write({ level: "info", message, timestamp: new Date().toISOString(), context });
  },
  warn(message: string, context?: Record<string, unknown>) {
    write({ level: "warn", message, timestamp: new Date().toISOString(), context });
  },
  error(message: string, context?: Record<string, unknown>) {
    write({ level: "error", message, timestamp: new Date().toISOString(), context });
  },
};

