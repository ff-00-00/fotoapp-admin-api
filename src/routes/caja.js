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

const CAJA_TIPO_ID = "caja_global";


/* ========= Router caja ========= */
export default function cajaRoutes(prisma) {
    const r = Router();

    // GET /api/caja/cuentas
    r.get("/cuentas", async (_req, res) => {
        try {
            const rows = await prisma.cuenta.findMany({
                where: { activa: true },
                orderBy: { nombre: "asc" },
            });
            res.json(serializeBigInt(rows));
        } catch (err) {
            console.error("ERROR GET /caja/cuentas", err);
            res.status(500).json({ error: "Error al obtener cuentas" });
        }
    });

    // POST /api/caja/cuentas
    r.post("/cuentas", async (req, res) => {
        try {
            const { nombre } = req.body ?? {};
            const clean = String(nombre || "").trim();
            if (!clean) return res.status(400).json({ error: "nombre requerido" });

            const cuenta = await prisma.cuenta.upsert({
                where: { nombre: clean },
                update: { activa: true },
                create: { nombre: clean },
            });

            res.json(serializeBigInt(cuenta));
        } catch (err) {
            console.error("ERROR POST /caja/cuentas", err);
            res.status(500).json({ error: "Error al crear cuenta" });
        }
    });


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


    r.get("/movimientos", async (_req, res) => {
        try {
            const rows = await prisma.transaccion.findMany({
                where: { carreraId: null },
                orderBy: [{ fecha: "desc" }, { id: "desc" }],
                include: {
                    cuentaSalida: true,
                    cuentaEntrada: true,
                },
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
                tipoOperacion,
                moneda,
                monto,
                categoria,
                cuentaSalidaId,
                cuentaEntradaId,
                estado,
                facturaEstado,
                nota,
            } = req.body ?? {};

            const f = parseDateISO(fecha);
            if (!f) return res.status(400).json({ error: "fecha requerida (YYYY-MM-DD)" });

            const tipoOp = String(tipoOperacion || "egreso").toLowerCase();
            const TIPOS_VALIDOS = ["ingreso", "egreso", "transferencia", "inicial"];
            if (!TIPOS_VALIDOS.includes(tipoOp)) {
                return res.status(400).json({ error: "tipoOperacion inválido" });
            }

            const monedaNorm = String(moneda || "ARS").toUpperCase();

            const tipoCaja = await prisma.tipoMovimiento.upsert({
                where: { id: "caja_global" },
                update: {},
                create: {
                    id: "caja_global",
                    nombre: "Caja global",
                    grupo: "global",
                    alcance: "global",
                },
            });

            let salidaId = cuentaSalidaId ? Number(cuentaSalidaId) : null;
            if (!Number.isFinite(salidaId)) salidaId = null;

            let entradaId = cuentaEntradaId ? Number(cuentaEntradaId) : null;
            if (!Number.isFinite(entradaId)) entradaId = null;

            const data = {
                fecha: f,
                carreraId: null,
                tipoId: tipoCaja.id,
                grupo: tipoCaja.grupo,
                montoCents: parseMoneyToCents(monto),
                moneda: monedaNorm,

                nota: nota ? String(nota).trim() : null,

                tipoOperacion: tipoOp,
                categoria: categoria ? String(categoria).trim() : null,
                cuentaSalidaId: salidaId,
                cuentaEntradaId: entradaId,

                estado: String(estado || "pendiente"),
                facturaEstado: String(facturaEstado || "no_corresponde"),
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
                if (!f) {
                    return res.status(400).json({ error: "fecha debe ser YYYY-MM-DD" });
                }
                data.fecha = f;
            }

            if (payload.moneda !== undefined) {
                data.moneda = String(payload.moneda || "ARS").toUpperCase();
            }

            if (payload.monto !== undefined) {
                data.montoCents = parseMoneyToCents(payload.monto);
            }

            if (payload.tipoOperacion !== undefined) {
                const tipoOp = String(payload.tipoOperacion || "").toLowerCase();
                const TIPOS_VALIDOS = ["ingreso", "egreso", "transferencia", "inicial"];
                if (!TIPOS_VALIDOS.includes(tipoOp)) {
                    return res.status(400).json({ error: "tipoOperacion inválido" });
                }
                data.tipoOperacion = tipoOp;
            }

            if (payload.categoria !== undefined) {
                data.categoria =
                    String(payload.categoria || "").trim() || null;
            }

            if (payload.cuentaSalida !== undefined) {
                data.cuentaSalida =
                    String(payload.cuentaSalida || "").trim() || null;
            }

            if (payload.cuentaEntrada !== undefined) {
                data.cuentaEntrada =
                    String(payload.cuentaEntrada || "").trim() || null;
            }

            if (payload.estado !== undefined) {
                data.estado = String(payload.estado || "pendiente");
            }

            if (payload.facturaEstado !== undefined) {
                data.facturaEstado = String(
                    payload.facturaEstado || "no_corresponde"
                );
            }

            if (payload.nota !== undefined) {
                data.nota = String(payload.nota || "").trim() || null;
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
