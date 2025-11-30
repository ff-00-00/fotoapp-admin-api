// src/routes/tools.js
import { Router } from "express";

export default function toolsRoutes(prisma) {
    const router = Router();

    // GET /api/admin/export
    router.get("/export", async (req, res) => {
        try {
            const [
                usuarios,
                organizaciones,
                fotografos,
                carreras,
                pedidosMeta,
                carreraVentaTipos,
                carreraFotografos,
                registrosFotografo,
                preventaTipos,
                carreraPreventas,
                tipoMovimientos,
                transacciones,
                parametrosFiscales,
            ] = await Promise.all([
                prisma.usuario.findMany(),
                prisma.organizacion.findMany(),
                prisma.fotografo.findMany(),
                prisma.carrera.findMany(),
                prisma.pedidosMeta.findMany(),
                prisma.carreraVentaTipo.findMany(),
                prisma.carreraFotografo.findMany(),
                prisma.registroFotografo.findMany(),
                prisma.preventaTipo.findMany(),
                prisma.carreraPreventa.findMany(),
                prisma.tipoMovimiento.findMany(),
                prisma.transaccion.findMany(),
                prisma.parametroFiscal.findMany(),
            ]);

            res.json({
                usuarios,
                organizaciones,
                fotografos,
                carreras,
                pedidosMeta,
                carreraVentaTipos,
                carreraFotografos,
                registrosFotografo,
                preventaTipos,
                carreraPreventas,
                tipoMovimientos,
                transacciones,
                parametrosFiscales,
            });
        } catch (e) {
            console.error("ERROR /admin/export", e);
            res.status(500).json({ error: "Error al exportar backup" });
        }
    });

    // POST /api/admin/import
    // IMPORTA UN BACKUP COMPLETO Y PISA LOS DATOS OPERATIVOS
    router.post("/import", async (req, res) => {
        const payload = req.body || {};

        try {
            await prisma.$transaction(async (tx) => {
                // 1) Borrar datos en orden de dependencias (hijos -> padres)
                await tx.transaccion.deleteMany();
                await tx.carreraPreventa.deleteMany();
                await tx.registroFotografo.deleteMany();
                await tx.carreraFotografo.deleteMany();
                await tx.pedidosMeta.deleteMany();
                await tx.carreraVentaTipo.deleteMany();
                await tx.carrera.deleteMany();

                // Estos los mantengo porque son más "catálogos":
                // organizaciones, fotografos, tipos, usuarios, parámetros.
                await tx.parametroFiscal.deleteMany();
                await tx.tipoMovimiento.deleteMany();
                await tx.preventaTipo.deleteMany();
                await tx.organizacion.deleteMany();
                await tx.fotografo.deleteMany();
                await tx.usuario.deleteMany();

                // 2) Crear de nuevo en orden lógico (padres -> hijos)

                if (payload.usuarios?.length) {
                    await tx.usuario.createMany({ data: payload.usuarios });
                }

                if (payload.organizaciones?.length) {
                    await tx.organizacion.createMany({ data: payload.organizaciones });
                }

                if (payload.fotografos?.length) {
                    await tx.fotografo.createMany({ data: payload.fotografos });
                }

                if (payload.carreras?.length) {
                    await tx.carrera.createMany({ data: payload.carreras });
                }

                if (payload.pedidosMeta?.length) {
                    await tx.pedidosMeta.createMany({ data: payload.pedidosMeta });
                }

                if (payload.carreraVentaTipos?.length) {
                    await tx.carreraVentaTipo.createMany({
                        data: payload.carreraVentaTipos,
                    });
                }

                if (payload.carreraFotografos?.length) {
                    await tx.carreraFotografo.createMany({
                        data: payload.carreraFotografos,
                    });
                }

                if (payload.registrosFotografo?.length) {
                    await tx.registroFotografo.createMany({
                        data: payload.registrosFotografo,
                    });
                }

                if (payload.preventaTipos?.length) {
                    await tx.preventaTipo.createMany({ data: payload.preventaTipos });
                }

                if (payload.carreraPreventas?.length) {
                    await tx.carreraPreventa.createMany({
                        data: payload.carreraPreventas,
                    });
                }

                if (payload.tipoMovimientos?.length) {
                    await tx.tipoMovimiento.createMany({
                        data: payload.tipoMovimientos,
                    });
                }

                if (payload.transacciones?.length) {
                    await tx.transaccion.createMany({ data: payload.transacciones });
                }

                if (payload.parametrosFiscales?.length) {
                    await tx.parametroFiscal.createMany({
                        data: payload.parametrosFiscales,
                    });
                }
            });

            res.json({ ok: true });
        } catch (e) {
            console.error("ERROR /admin/import", e);
            res.status(500).json({ error: "Error al importar backup" });
        }
    });

    // POST /api/admin/reset
    // Limpia SOLO datos operativos (no borra usuarios ni catálogos)
    router.post("/reset", async (req, res) => {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.transaccion.deleteMany();
                await tx.carreraPreventa.deleteMany();
                await tx.registroFotografo.deleteMany();
                await tx.carreraFotografo.deleteMany();
                await tx.pedidosMeta.deleteMany();
                await tx.carreraVentaTipo.deleteMany();
                await tx.carrera.deleteMany();
                // NO tocamos usuarios, tipos, fotógrafos, organizaciones, etc.
            });

            res.json({ ok: true });
        } catch (e) {
            console.error("ERROR /admin/reset", e);
            res.status(500).json({ error: "Error al resetear base" });
        }
    });

    return router;
}
