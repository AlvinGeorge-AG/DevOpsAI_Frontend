import axios from 'axios'
import type { ChatResponse } from '../types/chat'
import { apiClient, normalizeBackendResponse, type BackendWebhookResponse } from './backendApi'

// Convert text response to a streaming ReadableStream for word-by-word display
const buildStream = (text: string) =>
  new ReadableStream<string>({
    start(controller) {
      void (async () => {
        const words = text.split(/(\s+)/)
        for (const word of words) {
          controller.enqueue(word)
          // Small delay to simulate streaming effect
          await new Promise((resolve) => window.setTimeout(resolve, 25))
        }
        controller.close()
      })().catch((error) => controller.error(error))
    },
  })

export interface ChatApiResult {
  stream: ReadableStream<string>
  response: ChatResponse
}

export async function chatApi(message: string): Promise<ChatApiResult> {
  try {
    const response = await apiClient.post<BackendWebhookResponse>('/chat', {
      message,
    })

    const normalizedResponse = normalizeBackendResponse(message, response.data)

    return {
      stream: buildStream(normalizedResponse.response),
      response: normalizedResponse,
    }
  } catch (error) {
    console.error('Chat API error:', error)
    throw new Error(
      error instanceof axios.AxiosError
        ? `Backend error: ${error.response?.status} - ${error.message}`
        : 'Failed to reach backend',
    )
  }
}
