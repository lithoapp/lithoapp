import type { ChatErrorType } from '../../../shared/types';

export interface ParsedError {
  errorType: ChatErrorType;
  message: string;
  retryAfter?: number;
}

interface AISdkError extends Error {
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  data?: { error?: { message?: string; type?: string } };
}

function isAISdkError(err: Error): err is AISdkError {
  return 'statusCode' in err || 'responseHeaders' in err || 'responseBody' in err;
}

export function parseError(err: unknown): ParsedError {
  if (!(err instanceof Error)) {
    return { errorType: 'unknown', message: String(err) };
  }

  const aiErr = isAISdkError(err) ? (err as AISdkError) : null;
  const statusCode = aiErr?.statusCode;
  const responseHeaders = aiErr?.responseHeaders;
  const message = err.message;

  // Extract retry-after header
  let retryAfter: number | undefined;
  if (responseHeaders?.['retry-after']) {
    retryAfter = parseInt(responseHeaders['retry-after'], 10);
    if (isNaN(retryAfter)) retryAfter = undefined;
  }

  // Extract clean message from response body
  let cleanMessage: string | undefined;
  const bodyErrorType = aiErr?.data?.error?.type;

  if (aiErr?.data?.error?.message) {
    cleanMessage = aiErr.data.error.message;
  } else if (aiErr?.responseBody) {
    try {
      const parsed = JSON.parse(aiErr.responseBody);
      if (parsed.error?.message) cleanMessage = parsed.error.message;
      else if (parsed.message) cleanMessage = parsed.message;
      else if (typeof parsed.detail === 'string') cleanMessage = parsed.detail;
    } catch {
      // Not JSON
    }
  }

  // --- Classify by structured error type first (most specific) ---

  // Rate limit (body type or status code)
  if (
    bodyErrorType === 'FreeUsageLimitError' ||
    bodyErrorType === 'UsageLimitExceeded' ||
    statusCode === 429 ||
    message.toLowerCase().includes('rate limit')
  ) {
    return {
      errorType: 'rate_limit',
      message: cleanMessage ?? 'Rate limit exceeded. Please try again later.',
      retryAfter,
    };
  }

  // Model not found / not supported (body type or 404)
  if (bodyErrorType === 'not_found_error' || bodyErrorType === 'ModelError' || statusCode === 404) {
    const modelMatch = (cleanMessage ?? message).match(/model:?\s*(\S+)/i);
    const modelName = modelMatch?.[1];
    const displayMessage = modelName
      ? `Model "${modelName}" is not available. Try a different model.`
      : (cleanMessage ?? 'Model not found. Try a different model.');
    return { errorType: 'unknown', message: displayMessage };
  }

  // If the response body has a specific error type that isn't auth-related,
  // trust it over the HTTP status code.
  if (bodyErrorType && cleanMessage) {
    return { errorType: 'unknown', message: cleanMessage };
  }

  // --- Fall back to status code classification ---

  // Auth errors (401)
  if (
    statusCode === 401 ||
    message.includes('401') ||
    message.toLowerCase().includes('unauthorized') ||
    message.toLowerCase().includes('invalid api key')
  ) {
    return {
      errorType: 'auth',
      message: cleanMessage ?? 'Authentication failed. Please reconnect your provider.',
    };
  }

  // Server errors (500, 502, 503, 504)
  if (
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return {
      errorType: 'server',
      message: cleanMessage ?? 'Server error. Please try again.',
    };
  }

  // Network errors
  if (
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('econnrefused') ||
    message.toLowerCase().includes('enotfound') ||
    message.toLowerCase().includes('etimedout') ||
    message.toLowerCase().includes('fetch failed')
  ) {
    return {
      errorType: 'network',
      message: 'Connection failed. Please check your internet.',
    };
  }

  return { errorType: 'unknown', message: cleanMessage ?? extractCleanMessage(message) };
}

function extractCleanMessage(message: string): string {
  let cleaned = message
    .replace(/^[A-Z_]+Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^Failed to fetch:\s*/i, '')
    .replace(/^API error:\s*/i, '');

  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 200) + '…';
  }

  return cleaned || 'An unexpected error occurred.';
}
