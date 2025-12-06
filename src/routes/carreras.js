import { Router } from 'express';

/* ========= Helpers ========= */
const serializeBigInt = (obj) =>
    JSON.parse(JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

function splitByLastSep(raw) {
    if (raw === null || raw === undefined) return { intDigits: "", fracDigits: "" };
    let s = String(raw).trim();
    if (!s) return { intDigits: "", fracDigits: "" };
    let sign = 1;
    if (s[0] === '-') { sign = -1; s = s.slice(1); }
    s = s.replace(/[^\d.,]/g, '');
    const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (lastSep === -1) return { sign, intDigits: s.replace(/[.,]/g, ''), fracDigits: "" };
    const intDigits = s.slice(0, lastSep).replace(/[.,]/g, '');
    const fracDigits = s.slice(lastSep + 1).replace(/[.,]/g, '');
    return { sign, intDigits, fracDigits };
}
function parseMoneyToCents(v) {
    const { sign = 1, intDigits = "", fracDigits = "" } = splitByLastSep(v);
    const intSafe = intDigits.replace(/^0+/, '') || "0";
    const fracSafe = (fracDigits + "00").slice(0, 2);
    const centsStr = intSafe + fracSafe;
    let cents = 0n;
    try { cents = BigInt(centsStr); } catch { cents = 0n; }
    return sign < 0 ? -cents : cents;
}
function parsePct(v) {
    const { sign = 1, intDigits = "", fracDigits = "" } = splitByLastSep(v);
    const norm = `${intDigits.replace(/^0+/, '') || "0"}.${fracDigits || '0'}`;
    const out = sign * parseFloat(norm);
    return Number.isFinite(out) ? out : null;
}
function parsePctOrDefault(v, def) {
    // si viene vacío / null / undefined → uso default
    if (v === undefined || v === null || String(v).trim() === '') {
        return def;
    }
    return parsePct(v);
}
function parseDateISO(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return null;
    const dt = new Date(`${d}T00:00:00`);
    return isNaN(dt) ? null : dt;
}
const toBigInt = (x) => (typeof x === 'bigint' ? x : BigInt(x || 0));
const pctToBasisPoints = (p) => BigInt(Math.round((p ?? 0) * 100));

/* ========= Router ========= */
export default function carrerasRoutes(prisma) {
    const r = Router();

    /* ===== GET / → listado ejecutivo de carreras ===== */
    r.get('/', async (_req, res) => {
        try {
            const filas = await prisma.carrera.findMany({
                orderBy: { fecha: 'desc' },
            });

            if (!filas.length) {
                return res.json([]);
            }

            const ids = filas.map((c) => c.id);

            // Fotógrafos por carrera (suma costos en ARS)
            const costosFot = await prisma.carreraFotografo.groupBy({
                by: ['carreraId'],
                _sum: { costoCents: true },
            });
            const mapCostoFot = new Map(
                costosFot.map((row) => [row.carreraId, row._sum.costoCents || 0n])
            );

            // Ventas por carrera (para pedidos + comisiones)
            const ventas = await prisma.carreraVentaTipo.findMany({
                where: { carreraId: { in: ids } },
            });

            // carreraId → { pedidos, comARS, comUSD }
            const agg = new Map();

            for (const v of ventas) {
                const id = v.carreraId;
                if (!agg.has(id)) {
                    agg.set(id, {
                        pedidos: 0n,
                        comARS: 0n,
                        comUSD: 0n,
                    });
                }

                const row = agg.get(id);
                const cant = BigInt(v.cantidad ?? 0);
                const precio = toBigInt(v.precioCents ?? 0);
                const subtotal = precio * cant;

                row.pedidos += cant;

                if (v.comisionPct != null) {
                    const bp = pctToBasisPoints(Number(v.comisionPct));
                    const com = (subtotal * BigInt(bp)) / 10000n;
                    if (v.moneda === 'USD') row.comUSD += com;
                    else row.comARS += com;
                }
            }

            // helpers iguales a los del detalle
            const asBig = (x) =>
                typeof x === 'bigint' ? x : BigInt(x || 0);
            const costoPct = (base, p) => {
                if (p == null) return 0n;
                const bp = pctToBasisPoints(Number(p)); // percent → basis points
                return (asBig(base) * bp) / 10000n;
            };

            const rows = filas.map((c) => {
                const ingresoARS = toBigInt(c.ingresoARSCents ?? 0n);

                const costoMP = costoPct(ingresoARS, c.mpPct);
                const costoIB = costoPct(ingresoARS, c.ibPct);
                const costoIVA = costoPct(ingresoARS, c.ivaPct);
                const costoProv = costoPct(ingresoARS, c.provPct);
                const costoDebCred = costoPct(ingresoARS, c.debCredPct);

                const costoFot = toBigInt(mapCostoFot.get(c.id) || 0n);

                const g = agg.get(c.id) || {
                    pedidos: 0n,
                    comARS: 0n,
                    comUSD: 0n,
                };

                const gastosARSCents =
                    costoFot +
                    costoMP +
                    costoIB +
                    costoIVA +
                    costoProv +
                    costoDebCred +
                    g.comARS; // solo comisiones ARS

                const resultadoARSCents = ingresoARS - gastosARSCents;

                return serializeBigInt({
                    ...c,
                    costoMPARSCents: costoMP,
                    costoFotografosARSCents: costoFot,
                    gastosARSCents,
                    resultadoARSCents,
                    pedidosTotales: g.pedidos,
                    comisionARS: g.comARS,
                    comisionUSD: g.comUSD,
                });
            });

            res.json(rows);
        } catch (err) {
            console.error('ERROR /api/carreras GET:', err);
            res.status(500).json({ error: 'Error al obtener carreras' });
        }
    });



    /* ===== GET /:id  → detalle extendido con ventas y fotógrafos ===== */
    r.get('/:id', async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            // carrera "core"
            const carrera = await prisma.carrera.findUnique({
                where: { id },
            });

            if (!carrera) {
                return res.status(404).json({ error: 'no encontrada' });
            }

            // ventas de esta carrera
            const ventaTipos = await prisma.carreraVentaTipo.findMany({
                where: { carreraId: id },
                orderBy: { id: 'asc' },
            });

            // fotógrafos de esta carrera
            const fotografos = await prisma.carreraFotografo.findMany({
                where: { carreraId: id },
                orderBy: { id: 'asc' },
            });

            const gastosEspecificos = await prisma.gastoEspecifico.findMany({
                where: { carreraId: id },
                orderBy: { id: 'asc' },
            });

            let costoGastosEspecificos = 0n;
            for (const g of gastosEspecificos) {
                costoGastosEspecificos += toBigInt(g.montoCents ?? 0);
            }


            // ==== Cálculos ====
            let ingresosARS = 0n;
            let ingresosUSD = 0n;

            for (const v of ventaTipos) {
                const precio = toBigInt(v.precioCents ?? 0);
                const cant = toBigInt(v.cantidad ?? 0);
                const subtotal = precio * cant;
                if (v.moneda === 'USD') ingresosUSD += subtotal;
                else ingresosARS += subtotal;
            }

            // costo fotógrafos (se asume ARS)
            let costoFot = 0n;
            for (const f of fotografos) {
                costoFot += toBigInt(f.costoCents ?? 0);
            }

            const asBig = (x) => (typeof x === 'bigint' ? x : BigInt(x || 0));
            const costoPct = (base, p) => {
                if (p == null) return 0n;
                const bp = pctToBasisPoints(Number(p)); // percent → basis points
                return (asBig(base) * bp) / 10000n;
            };

            const costoMP = costoPct(ingresosARS, carrera.mpPct);
            const costoIB = costoPct(ingresosARS, carrera.ibPct);
            const costoIVA = costoPct(ingresosARS, carrera.ivaPct);
            const costoProv = costoPct(ingresosARS, carrera.provPct);
            const costoDebCred = costoPct(ingresosARS, carrera.debCredPct);

            // comisión por tipo de venta (organizador/externo) + pedidos
            let pedidosTotales = 0n;
            let comisionARS = 0n;
            let comisionUSD = 0n;

            for (const v of ventaTipos) {
                const cant = toBigInt(v.cantidad ?? 0);
                pedidosTotales += cant;

                if (v.comisionPct != null) {
                    const bp = pctToBasisPoints(Number(v.comisionPct));
                    const precio = toBigInt(v.precioCents ?? 0);
                    const subtotal = precio * cant;
                    const com = (subtotal * bp) / 10000n;
                    if (v.moneda === 'USD') comisionUSD += com;
                    else comisionARS += com;
                }
            }

            const costoVentaTiposARSCents = comisionARS;
            const costoVentaTiposUSDCents = comisionUSD;

            // gastos y resultado por moneda
            const gastosTotalesARSCents =
                costoFot +
                costoMP +
                costoIB +
                costoIVA +
                costoProv +
                costoDebCred +
                costoVentaTiposARSCents +
                costoGastosEspecificos;


            const gastosTotalesUSDCents = costoVentaTiposUSDCents;

            const resultadoFinalARSCents = ingresosARS - gastosTotalesARSCents;
            const resultadoFinalUSDCents = ingresosUSD - gastosTotalesUSDCents;

            // campos legacy para compatibilidad con el front actual
            const costoVentaTipos = costoVentaTiposARSCents + costoVentaTiposUSDCents;
            const gastosTotales = gastosTotalesARSCents;
            const resultadoFinal = resultadoFinalARSCents;

            res.json(
                serializeBigInt({
                    ...carrera,
                    ventaTipos,
                    fotografos,
                    calculo: {
                        ingresosARS,
                        ingresosUSD,
                        costoFot,
                        costoMP,
                        costoIB,
                        costoIVA,
                        costoProv,
                        // orgPre/Post dejan de usarse, los devolvemos en 0n por compat
                        costoOrgPre: 0n,
                        costoOrgPost: 0n,
                        costoDebCred,
                        // nuevo detalle por moneda
                        costoVentaTiposARSCents,
                        costoVentaTiposUSDCents,
                        costoGastosEspecificos,
                        gastosTotalesARSCents,
                        gastosTotalesUSDCents,
                        resultadoFinalARSCents,
                        resultadoFinalUSDCents,
                        // legacy (lo que ya usa el front hoy)
                        costoVentaTipos,
                        gastosTotales,
                        resultadoFinal,
                        // KPIs extra
                        pedidosTotales,
                        comisionARS,
                        comisionUSD,
                    },
                })
            );
        } catch (err) {
            console.error('ERROR /api/carreras/:id GET:', err);
            res.status(500).json({ error: 'Error al obtener carrera' });
        }
    });





    /* ===== GET /:id/ventas  → tipos de venta de una carrera ===== */
    r.get('/:id/ventas', async (req, res) => {
        try {
            const carreraId = Number(req.params.id);
            if (!Number.isFinite(carreraId)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            const rows = await prisma.carreraVentaTipo.findMany({
                where: { carreraId },
                orderBy: { id: 'asc' },
            });

            res.json(serializeBigInt(rows));
        } catch (err) {
            console.error('ERROR ventas GET:', err);
            res.status(500).json({ error: 'Error al obtener ventas' });
        }
    });



    /* ===== GET /:id/fotografos  → fotógrafos de una carrera ===== */
    r.get('/:id/fotografos', async (req, res) => {
        try {
            const carreraId = Number(req.params.id);
            if (!Number.isFinite(carreraId)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            const rows = await prisma.carreraFotografo.findMany({
                where: { carreraId },
                orderBy: { id: 'asc' },
            });

            res.json(serializeBigInt(rows));
        } catch (err) {
            console.error('ERROR /api/carreras/:id/fotografos GET:', err);
            res.status(500).json({ error: 'Error al obtener fotógrafos' });
        }
    });





    // ===== PUT /:id/fotografos  → reemplaza lista completa =====
    r.put('/:id/fotografos', async (req, res) => {
        try {
            const carreraId = Number(req.params.id);
            if (!Number.isFinite(carreraId)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            const { items } = req.body ?? {};
            if (!Array.isArray(items)) {
                return res.status(400).json({ error: 'items debe ser un array' });
            }

            // 1) miro cuántos había ANTES
            const existentes = await prisma.carreraFotografo.count({
                where: { carreraId },
            });

            const cleaned = [];

            for (const row of items) {
                const nombrePlano = String(row.nombre || '').trim();
                let fotografoId = row.fotografoId ? Number(row.fotografoId) : null;
                let fot = null;

                // si viene id, lo busco
                if (fotografoId) {
                    fot = await prisma.fotografo.findUnique({ where: { id: fotografoId } });
                }

                // si no, pruebo por nombre
                if (!fot && nombrePlano) {
                    fot = await prisma.fotografo.findFirst({ where: { nombre: nombrePlano } });
                }

                // si sigue sin existir y hay nombre → lo creo
                if (!fot && nombrePlano) {
                    fot = await prisma.fotografo.create({
                        data: { nombre: nombrePlano },
                    });
                }

                // si no hay ni id ni nombre válido, salto fila
                if (!fot) continue;

                cleaned.push({
                    carreraId,
                    fotografoId: fot.id,
                    nombre: fot.nombre,
                    costoCents: parseMoneyToCents(row.costo),
                    fotosTomadas: Number(row.fotosTomadas || 0),
                    descargas: Number(row.descargas || 0),
                    descargasUnicas: Number(row.descargasUnicas || 0),
                    facturo: !!row.facturo,
                    pagado: !!row.pagado,
                    horasTrabajadas: row.horasTrabajadas
                        ? parseFloat(String(row.horasTrabajadas).replace(',', '.'))
                        : 0,
                    rol: row.rol || null,
                });
            }

            // 2) Freno de seguridad:
            // si antes había fotógrafos y ahora viene todo vacío → NO hago nada.
            if (existentes > 0 && cleaned.length === 0) {
                return res
                    .status(400)
                    .json({ error: 'No podés dejar la carrera sin fotógrafos por error. Agregá al menos uno.' });
            }

            // 3) recién ahora borro y re-inserto
            await prisma.carreraFotografo.deleteMany({ where: { carreraId } });

            if (cleaned.length) {
                await prisma.carreraFotografo.createMany({ data: cleaned });
            }

            const nuevos = await prisma.carreraFotografo.findMany({
                where: { carreraId },
                orderBy: { id: 'asc' },
            });

            res.json(serializeBigInt(nuevos));
        } catch (err) {
            console.error('ERROR /api/carreras/:id/fotografos PUT:', err);
            res.status(500).json({ error: 'Error guardando fotógrafos' });
        }
    });


    r.put('/:id/gastos-especificos', async (req, res) => {
        try {
            const carreraId = Number(req.params.id);
            if (!Number.isFinite(carreraId)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            const { items } = req.body ?? {};
            if (!Array.isArray(items)) {
                return res.status(400).json({ error: 'items debe ser un array' });
            }

            // borrar todos los gastos específicos actuales de esa carrera
            await prisma.gastoEspecifico.deleteMany({ where: { carreraId } });

            const toCreate = items
                .filter((row) => String(row.nombre || '').trim() !== '')
                .map((row) => ({
                    carreraId,
                    nombre: String(row.nombre || '').trim(),
                    tipo: (row.tipo || null),
                    montoCents: parseMoneyToCents(row.monto || '0'),
                    pagado: !!row.pagado,
                    facturado: !!row.facturado,
                }));

            if (toCreate.length) {
                await prisma.gastoEspecifico.createMany({ data: toCreate });
            }

            res.json({ ok: true, created: toCreate.length });
        } catch (err) {
            console.error('ERROR PUT /carreras/:id/gastos-especificos', err);
            res.status(500).json({ error: 'Error al guardar gastos específicos' });
        }
    });





    /* ===== POST /  → alta carrera ===== */
    r.post('/', async (req, res) => {
        try {
            const {
                nombre, fecha,
                ingresoARS, ingresoUSD,
                mpPct, ibPct, ivaPct, provPct, debCredPct,
            } = req.body ?? {};

            if (!String(nombre || '').trim())
                return res.status(400).json({ error: 'nombre requerido' });

            const f = parseDateISO(fecha);
            if (!f) return res.status(400).json({ error: 'fecha debe ser YYYY-MM-DD' });

            const data = {
                nombre: String(nombre).trim(),
                fecha: f,
                monedaBase: "ARS",
                ingresoARSCents: parseMoneyToCents(ingresoARS),
                ingresoUSDCents: parseMoneyToCents(ingresoUSD),

                // defaults:
                mpPct: parsePctOrDefault(mpPct, 2),    // MP 2%
                ibPct: parsePctOrDefault(ibPct, 4),    // IB 4%
                ivaPct: parsePctOrDefault(ivaPct, 10.5), // IVA 10.5%
                provPct: parsePctOrDefault(provPct, 17),   // Proveedor 17%
                debCredPct: parsePctOrDefault(debCredPct, 1.2),  // Déb/Cred 1.2%
            };

            const carrera = await prisma.carrera.create({ data });
            res.json(serializeBigInt(carrera));
        } catch (err) {
            console.error('ERROR /api/carreras POST:', err);
            res.status(500).json({ error: 'Error al crear carrera' });
        }
    });


    /* ===== PUT /:id  → actualizar meta ===== */
    r.put('/:id', async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            const {
                nombre,
                fecha,
                lugar,
                tipo,
                corredores,
                accesos,
                ingresoARS,
                ingresoUSD,
                mpPct,
                ibPct,
                ivaPct,
                provPct,
                debCredPct,
            } = req.body ?? {};

            const data = {};

            // texto / básicos
            if (nombre !== undefined) data.nombre = String(nombre).trim();
            if (lugar !== undefined) data.lugar = String(lugar).trim();
            if (tipo !== undefined && tipo !== '') data.tipo = tipo;
            if (corredores !== undefined) data.corredores = Number(corredores);
            if (accesos !== undefined) data.accesos = Number(accesos);

            // fecha
            if (fecha !== undefined && String(fecha).trim() !== '') {
                const f = parseDateISO(fecha);
                if (!f) {
                    return res.status(400).json({ error: 'fecha debe ser YYYY-MM-DD' });
                }
                data.fecha = f;
            }

            // dinero
            const setMoney = (k, v) => {
                if (v !== undefined && String(v).trim() !== '') data[k] = parseMoneyToCents(v);
            };

            // porcentajes
            const setPct = (k, v) => {
                if (v !== undefined && String(v).trim() !== '') data[k] = parsePct(v);
            };

            setMoney('ingresoARSCents', ingresoARS);
            setMoney('ingresoUSDCents', ingresoUSD);
            setPct('mpPct', mpPct);
            setPct('ibPct', ibPct);
            setPct('ivaPct', ivaPct);
            setPct('provPct', provPct);
            setPct('debCredPct', debCredPct);

            if (Object.keys(data).length === 0) {
                return res.status(400).json({ error: 'sin datos para actualizar' });
            }

            const carrera = await prisma.carrera.update({
                where: { id },
                data,
            });

            res.json(serializeBigInt(carrera));
        } catch (err) {
            console.error('ERROR /api/carreras PUT:', err);
            res.status(500).json({ error: 'Error al actualizar carrera' });
        }
    });

    /* ===== PUT /:id/ventas  → reemplaza tipos de venta y recalcula ingresos ===== */
    r.put('/:id/ventas', async (req, res) => {
        try {
            const carreraId = Number(req.params.id);
            if (!Number.isFinite(carreraId)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            const { items } = req.body ?? {};
            if (!Array.isArray(items)) {
                return res.status(400).json({ error: 'items debe ser un array' });
            }

            // limpiamos todos los tipos de venta de esa carrera
            await prisma.carreraVentaTipo.deleteMany({ where: { carreraId } });

            const toCreate = items
                .filter((v) => String(v.nombre || '').trim() !== '')
                .map((v) => ({
                    carreraId,
                    nombre: String(v.nombre || '').trim(),
                    tipo: v.tipo,       // "PREVENTA" | "PACK" | "UNIDAD" | "OTRO"
                    moneda: v.moneda,   // "ARS" | "USD"
                    precioCents: parseMoneyToCents(v.precio),
                    cantidad: Number(v.cantidad || 0),
                    comisionPct:
                        v.comisionPct !== undefined &&
                            v.comisionPct !== null &&
                            String(v.comisionPct).trim() !== ''
                            ? parsePct(v.comisionPct)
                            : null,
                }));

            if (toCreate.length) {
                await prisma.carreraVentaTipo.createMany({ data: toCreate });
            }

            const nuevos = await prisma.carreraVentaTipo.findMany({
                where: { carreraId },
                orderBy: { id: 'asc' },
            });

            // recalcular ingresos en Carrera a partir de ventas
            let ingresoARS = 0n;
            let ingresoUSD = 0n;
            for (const v of nuevos) {
                const precio = toBigInt(v.precioCents ?? 0);
                const cant = toBigInt(v.cantidad ?? 0);
                const subtotal = precio * cant;
                if (v.moneda === 'USD') ingresoUSD += subtotal;
                else ingresoARS += subtotal;
            }

            await prisma.carrera.update({
                where: { id: carreraId },
                data: {
                    ingresoARSCents: ingresoARS,
                    ingresoUSDCents: ingresoUSD,
                },
            });

            res.json(serializeBigInt(nuevos));
        } catch (err) {
            console.error('ERROR /api/carreras/:id/ventas PUT:', err);
            res.status(500).json({ error: 'Error al guardar ventas' });
        }
    });

    /* ===== DELETE /:id → eliminar carrera completa ===== */
    r.delete('/:id', async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return res.status(400).json({ error: 'id inválido' });
            }

            // 1. borrar ventas
            await prisma.carreraVentaTipo.deleteMany({
                where: { carreraId: id }
            });

            // 2. borrar fotógrafos
            await prisma.carreraFotografo.deleteMany({
                where: { carreraId: id }
            });

            // 3. borrar carrera
            await prisma.carrera.delete({
                where: { id }
            });

            res.json({ ok: true });
        } catch (err) {
            console.error('ERROR /api/carreras DELETE:', err);
            res.status(500).json({ error: 'Error al eliminar carrera' });
        }
    });


    return r;
}
