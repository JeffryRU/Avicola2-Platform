import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createContainer } from '@/app/container'
import '@/shared/ui/styles/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('Falta el elemento #root en index.html.')

createRoot(root).render(
  <StrictMode>
    <App container={createContainer()} />
  </StrictMode>,
)
