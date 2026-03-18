import { Router } from 'express'
import { authenticateUser, supabase } from '../middleware/auth.js'

const router = Router()

router.use(authenticateUser)

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('similarity_instellingen')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

router.post('/', async (req, res) => {
  const { data, error } = await supabase
    .from('similarity_instellingen')
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
    .from('similarity_instellingen')
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

export default router
