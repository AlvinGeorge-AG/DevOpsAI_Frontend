import axios from 'axios'
import type { ChatAction, TelemetryData } from '../types/chat'
import { apiClient, normalizeBackendResponse, type BackendWebhookResponse } from './backendApi'

export interface ExecuteResult {
  message: string
  telemetryPatch: Partial<TelemetryData>
}

export async function executeApi(action: ChatAction): Promise<ExecuteResult> {
  try {
    const response = await apiClient.post<BackendWebhookResponse>('/execute', {
      action: action.action,
      description: action.description,
    })

    const normalizedResponse = normalizeBackendResponse(action.description, response.data)

    return {
      message: normalizedResponse.response,
      telemetryPatch: normalizedResponse.telemetry,
    }
  } catch (error) {
    console.error('Execute API error:', error)
    throw new Error(
      error instanceof axios.AxiosError
        ? `Backend error: ${error.response?.status} - ${error.message}`
        : 'Failed to execute action',
    )
  }
}
