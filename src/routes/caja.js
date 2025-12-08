import { Router } from "express";

/* ========= Helpers (copiados de carreras.js) ========= */
const serializeBigInt = (obj) =>
    JSON.parse(
        JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
    );

function splitByLastSep(raw) {
    if (raw === null || raw === undefined) return { intDigits: "", fracDigits: "" };
    let s = String(raw).trim();
    if (!s) return { intDigits: "", fracDigits: "" };
    let sign = 1;
    if (s[0] === "-") { sign = -1; s = s.slice(1); }
    s = s.replace(/[^\d.,]/g, "");
    const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    if (lastSep === -1)
        return { sign, intDigits: s.replace(/[.,]/g, ""), fracDigits: "" };
    const intDigits = s.slice(0, lastSep).replace(/[.,]/g, "");
    const fracDigits = s.slice(lastSep + 1).replace(/[.,]/g, "");
    return { sign, intDigits, fracDigits };
}

function parseMoneyToCents(v) {
    const { sign = 1, intDigits = "", fracDigits = "" } = splitByLastSep(v);
    const intSafe = intDigits.replace(/^0+/, "") || "0";
    const fracSafe = (fracDigits + "00").slice(0, 2);
    const centsStr = intSafe + fracSafe;
    let cents = 0n;
    try { cents = BigInt(centsStr); } catch { cents = 0n; }
    return sign < 0 ? -cents : cents;
}

function parseDateISO(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ""))) return null;
    const dt = new Date(`${d}T00:00:00`);
    return isNaN(dt) ? null : dt;
}

/* ========= Router caja ========= */
export default function cajaRoutes(prisma) {
    const r = Router();

    // defaults para tipos de movimiento GLOBAL (caja)
    const GLOBAL_TIPOS_DEFAULTS = [
        { id: 'gasto_fijo', nombre: 'Gasto fijo', grupo: 'fijo', alcance: 'global' },
        { id: 'gasto_operativo', nombre: 'Gasto operativo', grupo: 'variable', alcance: 'global' },
        { id: 'inversion', nombre: 'Inversión', grupo: 'inversion', alcance: 'global' },
        { id: 'adelanto_socio', nombre: 'Adelanto a socio', grupo: 'deuda', alcance: 'global' },
        { id: 'deuda', nombre: 'Deuda / préstamo', grupo: 'deuda', alcance: 'global' },
    ];

    // GET /api/caja/tipos → tipos de movimiento GLOBAL
    r.get("/tipos", async (_req, res) => {
        try {
            let tipos = await prisma.tipoMovimiento.findMany({
                where: { alcance: "global" },
                orderBy: { nombre: "asc" },
            });

            // si no hay ninguno, los creamos on-the-fly
            if (!tipos.length) {
                for (const t of GLOBAL_TIPOS_DEFAULTS) {
                    await prisma.tipoMovimiento.upsert({
                        where: { id: t.id },
                        update: {
                            nombre: t.nombre,
                            grupo: t.grupo,
                            alcance: t.alcance,
                        },
                        create: t,
                    });
                }

                tipos = await prisma.tipoMovimiento.findMany({
                    where: { alcance: "global" },
                    orderBy: { nombre: "asc" },
                });
            }

            res.json(serializeBigInt(tipos));
        } catch (err) {
            console.error("ERROR GET /caja/tipos", err);
            res.status(500).json({ error: "Error al obtener tipos de movimiento globales" });
        }
    });


    // GET /api/caja/movimientos → solo movimientos GLOBAL (carreraId = null)
    r.get("/movimientos", async (_req, res) => {
        try {
            const rows = await prisma.transaccion.findMany({
                where: { carreraId: null },
                orderBy: [{ fecha: "desc" }, { id: "desc" }],
                include: { tipo: true },
            });
            res.json(serializeBigInt(rows));
        } catch (err) {
            console.error("ERROR GET /caja/movimientos", err);
            res.status(500).json({ error: "Error al obtener movimientos de caja" });
        }
    });

    // POST /api/caja/movimientos → alta movimiento GLOBAL
    r.post("/movimientos", async (req, res) => {
        try {
            const {
                fecha,
                tipoId,
                moneda,
                monto,
                subtipo,
                estado,
                facturaEstado,
                nota,
            } = req.body ?? {};

            const f = parseDateISO(fecha);
            if (!f) return res.status(400).json({ error: "fecha requerida (YYYY-MM-DD)" });

            if (!tipoId) return res.status(400).json({ error: "tipoId requerido" });

            // buscamos el tipo para copiar el grupo (fijo / variable / etc.)
            const tipo = await prisma.tipoMovimiento.findUnique({
                where: { id: String(tipoId) },
            });
            if (!tipo) return res.status(400).json({ error: "tipoId inválido" });

            const monedaNorm = String(moneda || "ARS").toUpperCase();

            const data = {
                fecha: f,
                carreraId: null,        // GLOBAL
                tipoId: tipo.id,
                grupo: tipo.grupo,
                montoCents: parseMoneyToCents(monto),
                moneda: monedaNorm,
                nota: nota ? String(nota).trim() : null,
                subtipo: subtipo ? String(subtipo).trim() : null,
                estado: String(estado || "pendiente"),
                facturaEstado: String(facturaEstado || "no_corresponde"),
                cuentaDesde: null,
                cuentaHasta: null,
            };

            const mov = await prisma.transaccion.create({ data });
            res.json(serializeBigInt(mov));
        } catch (err) {
            console.error("ERROR POST /caja/movimientos", err);
            res.status(500).json({ error: "Error al crear movimiento de caja" });
        }
    });

    // PUT /api/caja/movimientos/:id → editar SOLO globales
    r.put("/movimientos/:id", async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return res.status(400).json({ error: "id inválido" });
            }

            const existing = await prisma.transaccion.findUnique({ where: { id } });
            if (!existing) return res.status(404).json({ error: "No encontrado" });
            if (existing.carreraId !== null) {
                return res.status(400).json({ error: "Movimiento de carrera no se puede editar desde caja" });
            }

            const payload = req.body ?? {};
            const data = {};

            if (payload.fecha !== undefined) {
                const f = parseDateISO(payload.fecha);
                if (!f) return res.status(400).json({ error: "fecha debe ser YYYY-MM-DD" });
                data.fecha = f;
            }
            if (payload.moneda !== undefined) {
                data.moneda = String(payload.moneda || "ARS").toUpperCase();
            }
            if (payload.monto !== undefined) {
                data.montoCents = parseMoneyToCents(payload.monto);
            }
            if (payload.subtipo !== undefined) {
                data.subtipo = String(payload.subtipo || "").trim() || null;
            }
            if (payload.estado !== undefined) {
                data.estado = String(payload.estado || "pendiente");
            }
            if (payload.facturaEstado !== undefined) {
                data.facturaEstado = String(payload.facturaEstado || "no_corresponde");
            }
            if (payload.nota !== undefined) {
                data.nota = String(payload.nota || "").trim() || null;
            }

            // cambiar tipoId (opcional)
            if (payload.tipoId !== undefined) {
                const tipo = await prisma.tipoMovimiento.findUnique({
                    where: { id: String(payload.tipoId) },
                });
                if (!tipo) return res.status(400).json({ error: "tipoId inválido" });
                data.tipoId = tipo.id;
                data.grupo = tipo.grupo;
            }

            if (!Object.keys(data).length) {
                return res.status(400).json({ error: "Sin datos para actualizar" });
            }

            const upd = await prisma.transaccion.update({
                where: { id },
                data,
            });
            res.json(serializeBigInt(upd));
        } catch (err) {
            console.error("ERROR PUT /caja/movimientos/:id", err);
            res.status(500).json({ error: "Error al actualizar movimiento de caja" });
        }
    });

    // DELETE /api/caja/movimientos/:id → borrar SOLO globales
    r.delete("/movimientos/:id", async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return res.status(400).json({ error: "id inválido" });
            }

            const existing = await prisma.transaccion.findUnique({ where: { id } });
            if (!existing) return res.status(404).json({ error: "No encontrado" });
            if (existing.carreraId !== null) {
                return res.status(400).json({ error: "Movimiento de carrera no se puede borrar desde caja" });
            }

            await prisma.transaccion.delete({ where: { id } });
            res.json({ ok: true });
        } catch (err) {
            console.error("ERROR DELETE /caja/movimientos/:id", err);
            res.status(500).json({ error: "Error al borrar movimiento de caja" });
        }
    });

    return r;
}
