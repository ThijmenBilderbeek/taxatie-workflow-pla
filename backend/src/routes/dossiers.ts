import { Router } from 'express'
import { authenticateUser, supabase } from '../middleware/auth.js'

const router = Router()

router.use(authenticateUser)

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error) {
    res.status(404).json({ error: 'Dossier niet gevonden' })
    return
  }
  res.json(data)
})

router.post('/', async (req, res) => {
  const { data, error } = await supabase
    .from('dossiers')
    .insert(req.body)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('dossiers')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('dossiers')
    .delete()
    .eq('id', req.params.id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(204).send()
})

export default router
