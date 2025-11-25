import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('> Migrando fotógrafos desde CarreraFotografo...');

  // 1) Traer todas las filas actuales
  const rows = await prisma.carreraFotografo.findMany();

  // 2) Agrupar por nombre "normalizado"
  const grupos = new Map();
  for (const r of rows) {
    const nombre = (r.nombre || '').trim();
    if (!nombre) continue;
    const key = nombre.toLowerCase();
    if (!grupos.has(key)) {
      grupos.set(key, { nombre, rows: [] });
    }
    grupos.get(key).rows.push(r);
  }

  console.log(`> Encontrados ${grupos.size} fotógrafos distintos por nombre`);

  // 3) Crear maestro Fotografo + mapear id
  const mapNombreToId = new Map();

  for (const [key, grp] of grupos.entries()) {
    const fot = await prisma.fotografo.create({
      data: {
        nombre: grp.nombre,
      },
    });
    mapNombreToId.set(key, fot.id);
    console.log(`  - creado Fotografo "${grp.nombre}" (id ${fot.id})`);
  }

  // 4) Actualizar CarreraFotografo.fotografoId
  for (const r of rows) {
    const nombre = (r.nombre || '').trim();
    if (!nombre) continue;
    const key = nombre.toLowerCase();
    const fotId = mapNombreToId.get(key);
    if (!fotId) continue;

    await prisma.carreraFotografo.update({
      where: { id: r.id },
      data: { fotografoId: fotId },
    });
  }

  console.log('> Migración OK');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
