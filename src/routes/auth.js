import { Router } from 'express';
import bcrypt from "bcryptjs";


export default function authRoutes(prisma) {
  const r = Router();

  // Login
  r.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'faltan campos' });

      const u = await prisma.usuario.findUnique({ where: { email } });
      if (!u) return res.status(401).json({ error: 'credenciales inválidas' });

      const ok = await bcrypt.compare(password, u.hash);
      if (!ok) return res.status(401).json({ error: 'credenciales inválidas' });

      req.session.uid = u.id;
      res.json({ id: u.id, email: u.email, nombre: u.nombre });
    } catch (e) {
      res.status(500).json({ error: 'error login' });
    }
  });

  // Estado
  r.get('/me', async (req, res) => {
    if (!req.session.uid) return res.status(401).json({ error: 'no auth' });
    const u = await prisma.usuario.findUnique({
      where: { id: req.session.uid },
      select: { id: true, email: true, nombre: true }
    });
    res.json(u);
  });

  // Logout
  r.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  return r;
}
