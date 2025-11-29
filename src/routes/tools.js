// GET /api/admin/export
router.get('/export', async (req, res) => {
    try {
      const [
        carreras,
        fotografos,
        preventas,
        ventas,
        movimientos
      ] = await Promise.all([
        prisma.carrera.findMany(),
        prisma.fotografo.findMany(),
        prisma.preventa.findMany(),
        prisma.venta.findMany(),
        prisma.movimiento.findMany(),
      ]);
  
      res.json({
        carreras,
        fotografos,
        preventas,
        ventas,
        movimientos,
      });
    } catch (e) {
      console.error('ERROR EXPORT', e);
      res.status(500).json({ error: 'Error al exportar' });
    }
  });
  

  // POST /api/admin/import
router.post('/import', async (req, res) => {
    try {
      const { carreras, fotografos, preventas, ventas, movimientos } = req.body;
  
      await prisma.$transaction(async (tx) => {
        // Opcional: primero vaciar tablas (o no, según cómo quieras mezclar)
        // await tx.movimiento.deleteMany();
        // await tx.venta.deleteMany();
        // await tx.preventa.deleteMany();
        // await tx.fotografo.deleteMany();
        // await tx.carrera.deleteMany();
  
        if (carreras?.length) {
          await tx.carrera.createMany({ data: carreras });
        }
        if (fotografos?.length) {
          await tx.fotografo.createMany({ data: fotografos });
        }
        // etc...
      });
  
      res.json({ ok: true });
    } catch (e) {
      console.error('ERROR IMPORT', e);
      res.status(500).json({ error: 'Error al importar' });
    }
  });
  
  // POST /api/admin/reset
router.post('/reset', async (req, res) => {
    try {
      await prisma.$transaction([
        prisma.movimiento.deleteMany(),
        prisma.venta.deleteMany(),
        prisma.preventa.deleteMany(),
        prisma.rolFotografo.deleteMany?.(), // si tenés tabla intermedia
        prisma.fotografo.deleteMany(),
        prisma.carrera.deleteMany(),
      ]);
      res.json({ ok: true });
    } catch (e) {
      console.error('ERROR RESET', e);
      res.status(500).json({ error: 'Error al resetear' });
    }
  });
  