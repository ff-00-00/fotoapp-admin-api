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
  
