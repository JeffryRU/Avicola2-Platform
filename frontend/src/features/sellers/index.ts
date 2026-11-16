/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { SellersGateway } from '@/features/sellers/application/ports'
export { useSellers, useTeamSellers } from '@/features/sellers/ui/hooks'
