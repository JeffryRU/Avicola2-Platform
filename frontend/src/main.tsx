import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createContainer } from '@/app/container'
import '@/ui/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App container={createContainer()} />
  </StrictMode>,
)
