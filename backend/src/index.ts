import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import dossiersRouter from './routes/dossiers.js'
import rapportenRouter from './routes/rapporten.js'
import feedbackRouter from './routes/feedback.js'
import instellingenRouter from './routes/instellingen.js'

const app = express()
const port = process.env.PORT || 4000

const allowedOrigins = [
  'https://valyze.nl',
  'https://www.valyze.nl',
  'http://localhost:5173',
  'http://localhost:4173',
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Niet toegestaan door CORS'))
    }
  },
  credentials: true,
}))

app.use(express.json())

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/dossiers', dossiersRouter)
app.use('/api/rapporten', rapportenRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/instellingen', instellingenRouter)

app.listen(port, () => {
  console.log(`Taxatie backend draait op poort ${port}`)
})

export { app }
