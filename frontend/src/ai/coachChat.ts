import { authHeader } from '@/auth/session'
import { API_BASE } from '@/sync/client'

export interface CoachChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachChatResponse {
  answer: string
  provider?: 'groq' | 'rules'
  model?: string | null
  fallback?: boolean
}

async function apiError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === 'string') return new Error(payload.detail)
    if (
      payload.detail &&
      typeof payload.detail === 'object' &&
      'message' in payload.detail &&
      typeof payload.detail.message === 'string'
    ) {
      return new Error(payload.detail.message)
    }
  } catch {
    // Proxies sometimes return non-JSON failure pages.
  }
  return new Error(`Coach chat failed (${response.status})`)
}

export async function askCoach(
  question: string,
  context: Record<string, unknown>,
  messages: CoachChatMessage[],
): Promise<CoachChatResponse> {
  if (!API_BASE) throw new Error('Coach chat needs the backend.')
  const response = await fetch(`${API_BASE}/api/coach-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader() },
    body: JSON.stringify({ question, context, messages }),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as CoachChatResponse
}
