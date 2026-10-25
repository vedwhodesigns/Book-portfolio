import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter-tight/300.css'
import '@fontsource/inter-tight/400.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
