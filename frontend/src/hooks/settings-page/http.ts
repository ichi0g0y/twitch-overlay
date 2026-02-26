export const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `HTTP ${response.status}`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const data = JSON.parse(text) as {
        detail?: string;
        error?: string;
        message?: string;
      };
      const detail = data.detail || data.error || data.message;
      if (detail) {
        return `HTTP ${response.status}: ${detail}`;
      }
    } catch {
      // ignore json parse errors
    }
    return `HTTP ${response.status}: ${text}`;
  } catch {
    return fallback;
  }
};
