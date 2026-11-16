import { createContext, useContext } from 'react'
import { DEFAULT_BRAND, type BrandId } from '@/shared/types/brands'

interface BrandState {
  brand: BrandId
  setBrand: (b: BrandId) => void
}

/** Marca activa; la provee BrandProvider (shared/ui/components/brand.tsx). */
export const BrandContext = createContext<BrandState>({ brand: DEFAULT_BRAND, setBrand: () => {} })

export const useBrand = () => useContext(BrandContext)
