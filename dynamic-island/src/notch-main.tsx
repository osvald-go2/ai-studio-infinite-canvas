import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NotchView } from '@/components/NotchView/NotchView'
import '@/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotchView />
  </StrictMode>
)
