import { Router } from 'express'
import { authenticateUser, supabase } from '../middleware/auth.js'

const router = Router()

router.use(authenticateUser)

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('similarity_feedback')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

router.post('/', async (req, res) => {
  const { data, error } = await supabase
    .from('similarity_feedback')
    .insert(req.body)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(201).json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('similarity_feedback')
    .delete()
    .eq('id', req.params.id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(204).send()
})

export default router
