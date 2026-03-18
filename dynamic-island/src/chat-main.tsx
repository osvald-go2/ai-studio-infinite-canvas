import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChatPanel } from '@/components/ChatPanel/ChatPanel'
import '@/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatPanel />
  </StrictMode>
)
