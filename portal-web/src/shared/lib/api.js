import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
});

/** Extracts a user-facing message and field errors from an Axios error. */
export function parseApiError(err) {
  if (!err.response) {
    return { message: 'Unable to reach the server. Please check your connection and try again.', errors: {} };
  }
  const { data, status } = err.response;
  return {
    status,
    code: data?.code,
    message: data?.message || 'Something went wrong. Please try again.',
    errors: data?.errors || {},
  };
}
