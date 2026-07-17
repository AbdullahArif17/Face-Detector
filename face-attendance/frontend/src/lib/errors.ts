import axios from "axios";

type ApiDetail =
  | string
  | Array<string | Record<string, unknown>>
  | Record<string, unknown>
  | null
  | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatLocation(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const path = value
    .filter((segment) => typeof segment === "string" || typeof segment === "number")
    .filter((segment) => segment !== "body")
    .join(".");

  return path ? `${path}: ` : "";
}

export function formatApiDetail(detail: ApiDetail, fallback: string): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (isRecord(item) && typeof item.msg === "string") {
          return `${formatLocation(item.loc)}${item.msg}`;
        }
        return null;
      })
      .filter((message): message is string => Boolean(message));

    return messages.length > 0 ? messages.join(" ") : fallback;
  }

  if (isRecord(detail)) {
    if (typeof detail.message === "string") {
      return detail.message;
    }
    if (typeof detail.msg === "string") {
      return detail.msg;
    }
    if (typeof detail.error === "string") {
      return detail.error;
    }
    if ("detail" in detail) {
      return formatApiDetail(detail.detail as ApiDetail, fallback);
    }
  }

  return fallback;
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string,
  networkFallback = "Cannot reach the service. Check your connection and try again.",
): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  if (error.code === "ECONNABORTED" || !error.response) {
    return networkFallback;
  }

  return formatApiDetail(error.response.data?.detail as ApiDetail, fallback);
}
