// scripts/fix_fotografo_fk.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const rows = await prisma.carreraFotografo.findMany({
        where: { fotografoId: null },
    });

    console.log("Filas a reparar:", rows.length);

    for (const row of rows) {
        const nombre = (row.nombre || "").trim();
        if (!nombre) continue;

        // buscar fotógrafo global por nombre
        let fot = await prisma.fotografo.findFirst({
            where: { nombre },
        });

        // si no existe, lo creo
        if (!fot) {
            fot = await prisma.fotografo.create({
                data: { nombre },
            });
            console.log("Creado fotógrafo", fot.id, fot.nombre);
        }

        await prisma.carreraFotografo.update({
            where: { id: row.id },
            data: { fotografoId: fot.id },
        });

        console.log(
            `CarreraFotografo ${row.id} -> fotografoId=${fot.id} (${fot.nombre})`
        );
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
