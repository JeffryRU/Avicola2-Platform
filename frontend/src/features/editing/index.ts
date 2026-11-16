/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { EditingGateway } from '@/features/editing/application/ports'
export { activeUnlocks, closedDays, openDates, windowDates, type Unlock } from '@/features/editing/domain/editing'
export {
  closedDaysNote,
  closesLabel,
  GRANT_LABEL,
  grantedLabel,
  MY_REQUESTS_NAV,
  MY_REQUESTS_TITLE,
  REVOKE_LABEL,
  revokeDone,
  UNLOCKS_TITLE,
} from '@/features/editing/types/editing'
export { EditingDays } from '@/features/editing/ui/components/editing-days'
export { GrantEditingDialog } from '@/features/editing/ui/components/grant-editing'
export { useEditingWindow, useFirstEditableDay, useRevokeEditing, useUnlocks } from '@/features/editing/ui/hooks'
