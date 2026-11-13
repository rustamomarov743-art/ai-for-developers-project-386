import { useEffect } from 'react'

type ApiResult<T> = {
  data?: T
  response?: Response
}

export function useApiRequest<T>(
  attempt: number,
  request: (() => Promise<ApiResult<T>>) | null,
  onSuccess: (data: T) => void,
  onFailure: () => void,
) {
  useEffect(() => {
    if (!request) return
    let active = true
    request()
      .then(({ data, response }) => {
        if (!active) return
        if (response?.ok && data !== undefined) {
          onSuccess(data)
        } else {
          onFailure()
        }
      })
      .catch(() => {
        if (active) onFailure()
      })
    return () => {
      active = false
    }
  }, [attempt, request, onSuccess, onFailure])
}
