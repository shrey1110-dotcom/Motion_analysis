import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {clerkPubKey ? (
      <ClerkProvider publishableKey={clerkPubKey}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    ) : (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0f14", color: "#e6edf3", fontFamily: "sans-serif" }}>
        Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code> in frontend env.
      </div>
    )}
  </StrictMode>,
)
