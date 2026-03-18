import { supabase } from './supabase'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

if (!BACKEND_URL) {
  console.warn('VITE_BACKEND_URL is niet geconfigureerd. Voeg deze toe aan je .env bestand.')
}

function requireBackendUrl(): string {
  if (!BACKEND_URL) {
    throw new Error('VITE_BACKEND_URL is niet geconfigureerd. Voeg deze toe aan je .env bestand.')
  }
  return BACKEND_URL
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Niet ingelogd')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const baseUrl = requireBackendUrl()
  const headers = await getAuthHeaders()
  const response = await fetch(`${baseUrl}${path}`, { headers })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error((errorBody as { error?: string }).error ?? `API fout: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = requireBackendUrl()
  const headers = await getAuthHeaders()
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error((errorBody as { error?: string }).error ?? `API fout: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = requireBackendUrl()
  const headers = await getAuthHeaders()
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error((errorBody as { error?: string }).error ?? `API fout: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  const baseUrl = requireBackendUrl()
  const headers = await getAuthHeaders()
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error((errorBody as { error?: string }).error ?? `API fout: ${response.status} ${response.statusText}`)
  }
}
