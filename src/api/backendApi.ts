import axios from 'axios'
import type { ChatAction, ChatResponse, MetricSnapshot, TelemetryStatus } from '../types/chat'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
})

export interface BackendDecision {
  action?: string
  reason?: string
  confidence?: number
}

export interface BackendSystemState {
  cpu_usage_percent?: number | string
  memory_usage_mb?: number | string
  error_rate_percent?: number | string
  request_rate_per_sec?: number | string
  active_replicas?: number | string
  recent_history?: string[]
  [key: string]: unknown
}

export interface BackendWebhookResponse {
  status?: string
  message?: string
  system_state?: BackendSystemState
  decision?: BackendDecision
}

const toNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

const statusFor = (value: number, warningThreshold: number, criticalThreshold: number): TelemetryStatus => {
  if (value >= criticalThreshold) {
    return 'critical'
  }

  if (value >= warningThreshold) {
    return 'warning'
  }

  return 'healthy'
}

const formatMetricValue = (value: number, suffix: string) => `${value.toFixed(value % 1 === 0 ? 0 : 2)}${suffix}`

const buildMetrics = (systemState: BackendSystemState): MetricSnapshot[] => {
  const cpu = toNumber(systemState.cpu_usage_percent)
  const memory = toNumber(systemState.memory_usage_mb)
  const errors = toNumber(systemState.error_rate_percent)
  const requests = toNumber(systemState.request_rate_per_sec)
  const replicas = toNumber(systemState.active_replicas)

  return [
    {
      label: 'CPU',
      value: formatMetricValue(cpu, '%'),
      hint: 'Cluster-wide average CPU usage',
      trend: cpu >= 70 ? 'Elevated' : 'Stable',
      status: statusFor(cpu, 60, 80),
    },
    {
      label: 'Memory',
      value: formatMetricValue(memory, ' MB'),
      hint: 'Resident memory usage',
      trend: memory >= 4000 ? 'Rising' : 'Steady',
      status: statusFor(memory, 3500, 5000),
    },
    {
      label: 'Errors',
      value: formatMetricValue(errors, '%'),
      hint: 'Recent 5xx error rate',
      trend: errors >= 5 ? 'Needs attention' : 'Healthy',
      status: statusFor(errors, 1, 5),
    },
    {
      label: 'Requests',
      value: formatMetricValue(requests, '/s'),
      hint: 'Request throughput',
      trend: requests > 0 ? 'Active' : 'Idle',
      status: requests > 0 ? 'healthy' : 'warning',
    },
    {
      label: 'Replicas',
      value: `${replicas.toFixed(0)} running`,
      hint: 'Active app containers',
      trend: replicas <= 1 ? 'Minimum capacity' : replicas >= 5 ? 'Maximum capacity' : 'Balanced',
      status: replicas <= 1 || replicas >= 5 ? 'warning' : 'healthy',
    },
  ]
}

const buildActionSuggestions = (decision?: BackendDecision): ChatAction[] => {
  const action = decision?.action

  if (!action || action === 'no_action') {
    return []
  }

  const reason = decision.reason?.trim() || 'Backend requested an operational change.'

  const actionMap: Record<string, Omit<ChatAction, 'id'>> = {
    scale_up: {
      label: 'Apply scale up',
      action: 'scale_up',
      description: reason,
      tone: 'primary',
    },
    scale_down: {
      label: 'Apply scale down',
      action: 'scale_down',
      description: reason,
      tone: 'warning',
    },
    restart_container: {
      label: 'Restart unhealthy container',
      action: 'restart_container',
      description: reason,
      tone: 'danger',
    },
  }

  const suggested = actionMap[action]
  if (!suggested) {
    return []
  }

  return [
    {
      id: `backend-${action}`,
      ...suggested,
    },
  ]
}

const buildOverallStatus = (metrics: MetricSnapshot[], decision?: BackendDecision): TelemetryStatus => {
  if (decision?.action && decision.action !== 'no_action') {
    return 'critical'
  }

  if (metrics.some((metric) => metric.status === 'critical')) {
    return 'critical'
  }

  if (metrics.some((metric) => metric.status === 'warning')) {
    return 'warning'
  }

  return 'healthy'
}

const buildThoughts = (response: BackendWebhookResponse, metrics: MetricSnapshot[]): string[] => {
  const decision = response.decision
  const historyCount = response.system_state?.recent_history?.length ?? 0

  return [
    decision?.reason?.trim() || 'Backend returned no reasoning text.',
    `Observed ${metrics.length} live metrics and ${historyCount} recent log entries.`,
    decision?.confidence !== undefined ? `Decision confidence: ${Math.round(decision.confidence * 100)}%.` : 'Decision confidence unavailable.',
  ]
}

const buildResponseText = (prompt: string, response: BackendWebhookResponse) => {
  const decision = response.decision
  const action = decision?.action || 'no_action'
  const reason = decision?.reason?.trim() || response.message || 'Backend processed the request.'

  return `Backend processed "${prompt}" and returned ${action}: ${reason}`
}

export function normalizeBackendResponse(prompt: string, response: BackendWebhookResponse): ChatResponse {
  const systemState = response.system_state ?? {}
  const metrics = buildMetrics(systemState)
  const actions = buildActionSuggestions(response.decision)

  return {
    response: buildResponseText(prompt, response),
    thoughts: buildThoughts(response, metrics),
    telemetry: {
      status: buildOverallStatus(metrics, response.decision),
      metrics,
      logs: systemState.recent_history ?? [],
      context: {
        ...systemState,
        decision: response.decision ?? null,
      },
      actions,
    },
    actions,
  }
}
