import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from "bcryptjs";


const prisma = new PrismaClient();

const admins = [
  { email: 'juliangotkin@gmail.com', nombre: 'julo', password: 'fotorun7178' },
  { email: 'tobiasgotkin@gmail.com', nombre: 'toto', password: 'fotorun7178' },
  { email: 'alejandrogotkin@gmail.com', nombre: 'ale', password: 'fotorun7178' }
];

const preventaTipos = [
  { codigo: 'pre1', nombre: 'Preventa 1' },
  { codigo: 'pre2', nombre: 'Preventa 2' },
  { codigo: 'socios_adidas', nombre: 'Socios Adidas' }
];

const tiposMovimiento = [
  { id: 'costo_mercadopago', nombre: 'Costo Mercado Pago', grupo: 'variable', alcance: 'carrera' },
  { id: 'ingresos_brutos', nombre: 'Ingresos Brutos', grupo: 'variable', alcance: 'carrera' },
  { id: 'iva', nombre: 'IVA', grupo: 'variable', alcance: 'carrera' },
  { id: 'comision_proveedor', nombre: 'Comisión Proveedor', grupo: 'variable', alcance: 'carrera' },
  { id: 'comision_org_pre', nombre: 'Comisión Organizador (Preventa)', grupo: 'variable', alcance: 'carrera' },
  { id: 'comision_org_post', nombre: 'Comisión Organizador (Post)', grupo: 'variable', alcance: 'carrera' }
];

async function run() {
  // Usuarios
  for (const a of admins) {
    const hash = await bcrypt.hash(a.password, 10);
    await prisma.usuario.upsert({
      where: { email: a.email },
      update: {},
      create: { email: a.email, nombre: a.nombre, hash }
    });
  }

  // Preventa tipos
  for (const t of preventaTipos) {
    await prisma.preventaTipo.upsert({
      where: { codigo: t.codigo },
      update: {},
      create: t
    });
  }

  // Tipos de movimiento
  for (const t of tiposMovimiento) {
    await prisma.tipoMovimiento.upsert({
      where: { id: t.id },
      update: {},
      create: t
    });
  }

  console.log('Seed OK');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
