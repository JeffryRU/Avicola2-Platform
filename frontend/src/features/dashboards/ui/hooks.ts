import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'

export function useSellers() {
  const { sellers } = useContainer()
  return useQuery({ queryKey: ['sellers'], queryFn: sellers.sellers, staleTime: 10 * 60_000 })
}
