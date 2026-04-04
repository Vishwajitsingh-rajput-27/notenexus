/**
 * fetchWithRetry.ts — NoteNexus
 *
 * Wraps native fetch with:
 *  - Automatic retry for network-level failures ("Failed to fetch") caused
 *    by the Render free-tier backend cold-starting (takes up to 50 s).
 *  - Safe JSON parsing helper that handles HTML 503 pages Render sends
 *    while it is waking up (avoids "Unexpected token '<'" errors).
 *
 * Strategy:
 *  - On a TypeError (network error / no response), wait `delayMs` then retry.
 *  - Retries up to `retries` times (default 5 × 10 s = 50 s total).
 *  - HTTP errors (4xx / 5xx) are NOT retried — those are real server errors.
 */

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 5,
  delayMs = 10_000
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)
      return res // return even on HTTP errors — caller checks res.ok
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt < retries && err instanceof TypeError) {
        // Network failure — wait and retry (Render cold-start takes ~30-50 s)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }
      break
    }
  }

  throw new Error(
    'Server is starting up — please wait a moment and try again.'
  )
}

/**
 * Safely parse JSON from a Response.
 * Returns parsed data, or throws a user-friendly error when the body is
 * not valid JSON (e.g. an HTML 503 page from Render while it wakes up).
 */
export async function safeJson(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    // Body is not JSON — likely a Render / CDN error page during cold start.
    if (!res.ok) {
      throw new Error(
        `Server is starting up — please wait a moment and try again. (HTTP ${res.status})`
      )
    }
    throw new Error('Unexpected response from server. Please try again.')
  }
}
