import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add response interceptor to handle errors gracefully
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we have a response with data, check if it says success: true
    if (error.response && error.response.data) {
      const data = error.response.data
      // If the response says success: true, treat it as success
      if (data.success === true) {
        // Return a successful response instead of throwing
        return Promise.resolve({
          ...error.response,
          status: 200,
          statusText: 'OK'
        })
      }
    }
    // Otherwise, let the error propagate
    return Promise.reject(error)
  }
)

export interface Config {
  OAUTH_TOKEN?: string
  YOUR_BIDDER_ID?: number
  GEMINI_API_KEY?: string
  TELEGRAM_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  MIN_BUDGET?: number
  POLL_INTERVAL?: number
  BID_AMOUNT_MULTIPLIER?: number
  DEFAULT_DELIVERY_DAYS?: number
  MY_SKILLS?: string[]
  PROMPT_SELECTION_MODE?: 'manual' | 'dynamic'
}

export interface Bid {
  project_id: number
  title: string
  bid_amount: number
  status: string
  outsource_cost: number | null
  profit: number | null
  applied_at: string
  bid_message?: string | null
  currency_code?: string
  prompt_id?: number | null
  prompt_name?: string | null
}

export interface Stats {
  total_bids: number
  applied: number
  won: number
  replies: number
  total_value: number
  total_profit: number
}

export interface AutobidderStatus {
  running: boolean
  message: string
}

export interface LogsResponse {
  logs: string[]
  total: number
}

export interface PromptAnalytics {
  prompt_hash: string
  prompt_name: string | null
  total_bids: number
  total_replies: number
  total_won: number
  reply_rate: number
  first_used: string | null
  last_used: string | null
}

// Config API
export const getConfig = async (): Promise<Config> => {
  const response = await api.get<Config>('/config')
  return response.data
}

export const updateConfig = async (config: Partial<Config>): Promise<Config> => {
  const response = await api.post<{ success: boolean; config: Config }>('/config', config)
  return response.data.config
}

// Prompt API
export interface PromptResponse {
  prompt: string
  template: string
  name?: string | null
  description?: string | null
}

export const getPrompt = async (): Promise<PromptResponse> => {
  const response = await api.get<PromptResponse>('/prompt')
  return response.data
}

export const updatePrompt = async (prompt: string, name?: string, description?: string): Promise<void> => {
  await api.post('/prompt', { prompt, name: name || '', description: description || '' })
}

// Prompts Arsenal API
export interface PromptArsenal {
  id: number
  name: string
  description?: string | null
  template: string
  is_active: boolean
  created_at: string
  updated_at: string
  stats_bids: number
  stats_replies: number
  stats_won: number
}

export const getPrompts = async (): Promise<PromptArsenal[]> => {
  const response = await api.get<PromptArsenal[]>('/prompts')
  return response.data
}

export const createPrompt = async (name: string, template: string, description?: string): Promise<{ success: boolean; id: number }> => {
  const response = await api.post<{ success: boolean; id: number }>('/prompts', { name, template, description })
  return response.data
}

export const updatePromptArsenal = async (id: number, name?: string, template?: string, description?: string): Promise<void> => {
  await api.put(`/prompts/${id}`, { name, template, description })
}

export const activatePrompt = async (id: number): Promise<void> => {
  await api.post(`/prompts/${id}/activate`)
}

export const deletePrompt = async (id: number): Promise<void> => {
  await api.delete(`/prompts/${id}`)
}

// Bids API
export const getBids = async (): Promise<Bid[]> => {
  const response = await api.get<Bid[]>('/bids')
  return response.data
}

export const syncBids = async (): Promise<{ success: boolean; message: string }> => {
  const response = await api.post<{ success: boolean; message: string }>('/bids/sync')
  return response.data
}

// Stats API
export const getStats = async (): Promise<Stats> => {
  const response = await api.get<Stats>('/stats')
  return response.data
}

// Autobidder Control API
export const getAutobidderStatus = async (): Promise<AutobidderStatus> => {
  const response = await api.get<AutobidderStatus>('/autobidder/status')
  return response.data
}

export const startAutobidder = async (): Promise<void> => {
  await api.post('/autobidder/start')
}

export const stopAutobidder = async (): Promise<void> => {
  try {
    const response = await api.post('/autobidder/stop')
    // The interceptor should have handled any errors, so this should always succeed
    if (response.data && response.data.success === false) {
      console.warn('Stop response indicates failure:', response.data)
    }
  } catch (error: any) {
    // Even if there's an error, check if the response says success: true
    if (error.response?.data?.success === true) {
      // It actually succeeded, just had wrong status code
      return
    }
    // If it's a network error or other issue, log it but don't throw
    // The endpoint should have marked it as stopped anyway
    console.warn('Stop request had issues, but endpoint should have handled it:', error.message)
    // Don't throw - let the UI update based on status check
  }
}

// Logs API
export const getLogs = async (lines: number = 200): Promise<LogsResponse> => {
  const response = await api.get<LogsResponse>(`/autobidder/logs?lines=${lines}`)
  return response.data
}

// Analytics API
export const getPromptAnalytics = async (): Promise<PromptAnalytics[]> => {
  const response = await api.get<PromptAnalytics[]>('/analytics/prompts')
  return response.data
}

