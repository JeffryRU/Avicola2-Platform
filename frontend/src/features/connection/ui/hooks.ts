import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'

export function useStatus() {
  const { status } = useContainer()
  return useQuery({ queryKey: ['status'], queryFn: status.status, retry: false })
}
