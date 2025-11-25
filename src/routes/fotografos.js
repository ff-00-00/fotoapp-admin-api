// routes/fotografos.js
import { Router } from "express";

const serializeBigInt = (obj) =>
  JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

const toBigInt = (x) => (typeof x === "bigint" ? x : BigInt(x || 0));

export default function fotografosRoutes(prisma) {
  const r = Router();

  // GET /api/fotografos/ranking → ranking global / por carrera
  r.get("/ranking", async (req, res) => {
    try {
      const { carreraId } = req.query;

      let carreraIdNum = null;
      if (carreraId !== undefined && carreraId !== "") {
        const n = Number(carreraId);
        if (!Number.isFinite(n)) {
          return res.status(400).json({ error: "carreraId inválido" });
        }
        carreraIdNum = n;
      }

      const includeVolumen = req.query.includeVolumen !== "0";
      const includeDescargas = req.query.includeDescargas !== "0";
      const includeEficiencia = req.query.includeEficiencia !== "0";
      const includeReach = req.query.includeReach !== "0";

      const where = {};
      if (carreraIdNum) {
        where.carreraId = carreraIdNum;
      }

      const grupos = await prisma.carreraFotografo.groupBy({
        by: ["fotografoId"],
        where,
        _sum: {
          fotosTomadas: true,
          descargas: true,
          descargasUnicas: true,
        },
      });

      if (!grupos.length) {
        return res.json([]);
      }

      const ids = grupos
        .map((g) => g.fotografoId)
        .filter((id) => id != null);

      const fotografos = await prisma.fotografo.findMany({
        where: { id: { in: ids } },
      });

      const mapFot = new Map(fotografos.map((f) => [f.id, f]));

      const rowsBase = grupos
        .map((g) => {
          const f = mapFot.get(g.fotografoId);
          if (!f) return null;

          const fotosTotales = Number(g._sum.fotosTomadas ?? 0);
          const descargasTotales = Number(g._sum.descargas ?? 0);
          const descUnicasTotales = Number(g._sum.descargasUnicas ?? 0);

          const pctDescFotos =
            fotosTotales > 0 ? descargasTotales / fotosTotales : 0;
          const reach =
            descargasTotales > 0 ? descUnicasTotales / descargasTotales : 0;

          return {
            fotografoId: f.id,
            nombre: f.nombre,
            fotosTotales,
            descargasTotales,
            descargasUnicasTotales: descUnicasTotales,
            pctDescFotos,
            reach,
          };
        })
        .filter(Boolean);

      let maxVol = 0;
      let maxDesc = 0;
      let maxEfi = 0;
      let maxReach = 0;

      for (const r of rowsBase) {
        if (r.fotosTotales > maxVol) maxVol = r.fotosTotales;
        if (r.descargasTotales > maxDesc) maxDesc = r.descargasTotales;
        if (r.pctDescFotos > maxEfi) maxEfi = r.pctDescFotos;
        if (r.reach > maxReach) maxReach = r.reach;
      }

      const out = rowsBase.map((r) => {
        const scoreVolumen = maxVol > 0 ? r.fotosTotales / maxVol : 0;
        const scoreDescargas = maxDesc > 0 ? r.descargasTotales / maxDesc : 0;
        const scoreEficiencia = maxEfi > 0 ? r.pctDescFotos / maxEfi : 0;
        const scoreReach = maxReach > 0 ? r.reach / maxReach : 0;

        const componentes = [];
        if (includeVolumen) componentes.push(scoreVolumen);
        if (includeDescargas) componentes.push(scoreDescargas);
        if (includeEficiencia) componentes.push(scoreEficiencia);
        if (includeReach) componentes.push(scoreReach);

        const scoreSupremo =
          componentes.length > 0
            ? componentes.reduce((a, b) => a + b, 0) / componentes.length
            : 0;

        return {
          ...r,
          scoreVolumen,
          scoreDescargas,
          scoreEficiencia,
          scoreReach,
          scoreSupremo,
        };
      });

      out.sort(
        (a, b) =>
          (b.scoreSupremo ?? 0) - (a.scoreSupremo ?? 0) ||
          String(a.nombre || "").localeCompare(String(b.nombre || ""))
      );

      res.json(out);
    } catch (err) {
      console.error("ERROR GET /fotografos/ranking", err);
      res.status(500).json({ error: "Error al calcular ranking" });
    }
  });


  // GET /api/fotografos → listado global
  r.get("/", async (_req, res) => {
    try {
      const lista = await prisma.fotografo.findMany({
        orderBy: { nombre: "asc" },
        include: { carreras: true },
      });

      const out = lista.map((f) => {
        let fotos = 0n;
        let desc = 0n;
        let uniq = 0n;
        let costo = 0n;

        for (const cf of f.carreras) {
          fotos += toBigInt(cf.fotosTomadas ?? 0);
          desc += toBigInt(cf.descargas ?? 0);
          uniq += toBigInt(cf.descargasUnicas ?? 0);
          costo += toBigInt(cf.costoCents ?? 0n);
        }

        const fNum = Number(fotos);
        const dNum = Number(desc);
        const uNum = Number(uniq);

        const pctDescFotos = fNum > 0 ? (dNum / fNum) * 100 : null;
        const pctUniDesc = dNum > 0 ? (uNum / dNum) * 100 : null;

        return serializeBigInt({
          ...f,
          kpis: {
            carreras: f.carreras.length,
            fotosTotales: fNum,
            descargasTotales: dNum,
            descargasUnicas: uNum,
            costoTotalCents: costo,
            pctDescFotos,
            pctUniDesc,
          },
        });
      });

      res.json(out);
    } catch (err) {
      console.error("ERROR GET /fotografos", err);
      res.status(500).json({ error: "Error al obtener fotógrafos" });
    }
  });

  // GET /api/fotografos/:id → detalle
  r.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "ID inválido" });

      const fot = await prisma.fotografo.findUnique({
        where: { id },
        include: {
          carreras: { include: { carrera: true }, orderBy: { id: "asc" } },
        },
      });

      if (!fot) return res.status(404).json({ error: "No encontrado" });

      let fotos = 0n;
      let desc = 0n;
      let uniq = 0n;
      let costo = 0n;

      const detalle = fot.carreras.map((cf) => {
        const f = toBigInt(cf.fotosTomadas ?? 0);
        const d = toBigInt(cf.descargas ?? 0);
        const u = toBigInt(cf.descargasUnicas ?? 0);
        const c = toBigInt(cf.costoCents ?? 0n);

        fotos += f;
        desc += d;
        uniq += u;
        costo += c;

        const fNum = Number(f);
        const dNum = Number(d);
        const uNum = Number(u);

        return {
          id: cf.id,
          carreraId: cf.carreraId,
          carreraNombre: cf.carrera?.nombre || null,
          carreraFecha: cf.carrera?.fecha || null,
          rol: cf.rol,
          fotos: fNum,
          descargas: dNum,
          descargasUnicas: uNum,
          costoCents: c,
          facturo: cf.facturo,
          pagado: cf.pagado,
          horasTrabajadas: cf.horasTrabajadas,
          pctDescFotos: fNum > 0 ? (dNum / fNum) * 100 : null,
          pctUniDesc: dNum > 0 ? (uNum / dNum) * 100 : null,
        };
      });

      const F = Number(fotos);
      const D = Number(desc);
      const U = Number(uniq);

      res.json(
        serializeBigInt({
          ...fot,
          carreras: detalle,
          kpis: {
            carreras: detalle.length,
            fotosTotales: F,
            descargasTotales: D,
            descargasUnicas: U,
            costoTotalCents: costo,
            costoPorDescarga: D > 0 ? Number(costo) / 100 / D : null,
            pctDescFotos: F > 0 ? (D / F) * 100 : null,
            pctUniDesc: D > 0 ? (U / D) * 100 : null,
          },
        })
      );
    } catch (err) {
      console.error("ERROR GET /fotografos/:id", err);
      res.status(500).json({ error: "Error al obtener detalle" });
    }
  });
  // GET /api/fotografos/ranking → ranking global / por carrera
  r.get("/ranking", async (req, res) => {
    try {
      const { carreraId } = req.query;

      let carreraIdNum = null;
      if (carreraId !== undefined && carreraId !== "") {
        const n = Number(carreraId);
        if (!Number.isFinite(n)) {
          return res.status(400).json({ error: "carreraId inválido" });
        }
        carreraIdNum = n;
      }

      const includeVolumen = req.query.includeVolumen !== "0";
      const includeDescargas = req.query.includeDescargas !== "0";
      const includeEficiencia = req.query.includeEficiencia !== "0";
      const includeReach = req.query.includeReach !== "0";

      const where = {};
      if (carreraIdNum) {
        where.carreraId = carreraIdNum;
      }

      // agrupamos por fotografoId en carrera_fotografo
      const grupos = await prisma.carreraFotografo.groupBy({
        by: ["fotografoId"],
        where,
        _sum: {
          fotosTomadas: true,
          descargas: true,
          descargasUnicas: true,
        },
      });

      if (!grupos.length) {
        return res.json([]);
      }

      const ids = grupos
        .map((g) => g.fotografoId)
        .filter((id) => id != null);

      const fotografos = await prisma.fotografo.findMany({
        where: { id: { in: ids } },
      });

      const mapFot = new Map(fotografos.map((f) => [f.id, f]));

      const rowsBase = grupos
        .map((g) => {
          const f = mapFot.get(g.fotografoId);
          if (!f) return null;

          const fotosTotales = Number(g._sum.fotosTomadas ?? 0);
          const descargasTotales = Number(g._sum.descargas ?? 0);
          const descUnicasTotales = Number(g._sum.descargasUnicas ?? 0);

          const pctDescFotos =
            fotosTotales > 0 ? descargasTotales / fotosTotales : 0;
          const reach =
            descargasTotales > 0 ? descUnicasTotales / descargasTotales : 0;

          return {
            fotografoId: f.id,
            nombre: f.nombre,
            fotosTotales,
            descargasTotales,
            descargasUnicasTotales: descUnicasTotales,
            pctDescFotos,
            reach,
          };
        })
        .filter(Boolean);

      // normalización 0–1
      let maxVol = 0;
      let maxDesc = 0;
      let maxEfi = 0;
      let maxReach = 0;

      for (const r of rowsBase) {
        if (r.fotosTotales > maxVol) maxVol = r.fotosTotales;
        if (r.descargasTotales > maxDesc) maxDesc = r.descargasTotales;
        if (r.pctDescFotos > maxEfi) maxEfi = r.pctDescFotos;
        if (r.reach > maxReach) maxReach = r.reach;
      }

      const out = rowsBase.map((r) => {
        const scoreVolumen = maxVol > 0 ? r.fotosTotales / maxVol : 0;
        const scoreDescargas = maxDesc > 0 ? r.descargasTotales / maxDesc : 0;
        const scoreEficiencia = maxEfi > 0 ? r.pctDescFotos / maxEfi : 0;
        const scoreReach = maxReach > 0 ? r.reach / maxReach : 0;

        const componentes = [];
        if (includeVolumen) componentes.push(scoreVolumen);
        if (includeDescargas) componentes.push(scoreDescargas);
        if (includeEficiencia) componentes.push(scoreEficiencia);
        if (includeReach) componentes.push(scoreReach);

        const scoreSupremo =
          componentes.length > 0
            ? componentes.reduce((a, b) => a + b, 0) / componentes.length
            : 0;

        return {
          ...r,
          scoreVolumen,
          scoreDescargas,
          scoreEficiencia,
          scoreReach,
          scoreSupremo,
        };
      });

      out.sort(
        (a, b) =>
          (b.scoreSupremo ?? 0) - (a.scoreSupremo ?? 0) ||
          String(a.nombre || "").localeCompare(String(b.nombre || ""))
      );

      res.json(out);
    } catch (err) {
      console.error("ERROR GET /fotografos/ranking", err);
      res.status(500).json({ error: "Error al calcular ranking" });
    }
  });

  // POST /api/fotografos → crear
  r.post("/", async (req, res) => {
    try {
      const nombre = String(req.body?.nombre || "").trim();
      if (!nombre) return res.status(400).json({ error: "Nombre requerido" });

      const nuevo = await prisma.fotografo.create({ data: { nombre } });
      res.json(serializeBigInt(nuevo));
    } catch (err) {
      console.error("ERROR POST /fotografos", err);
      res.status(500).json({ error: "Error al crear" });
    }
  });

  // PUT /api/fotografos/:id → update personal data
  r.put("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "ID inválido" });

      const campos = req.body || {};
      const data = {};

      for (const k of [
        "nombre",
        "mail",
        "telefono",
        "ubicacion",
        "cuit",
        "dni",
        "cbu",
        "alias",
        "tipoFacturacion",
        "notas",
      ]) {
        if (campos[k] !== undefined)
          data[k] = campos[k] === null ? null : String(campos[k]).trim();
      }

      if (!Object.keys(data).length)
        return res.status(400).json({ error: "Sin datos" });

      const upd = await prisma.fotografo.update({ where: { id }, data });
      res.json(serializeBigInt(upd));
    } catch (err) {
      console.error("ERROR PUT /fotografos/:id", err);
      res.status(500).json({ error: "Error al actualizar" });
    }
  });

  // DELETE /api/fotografos/:id → delete maestro + relaciones
  r.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "ID inválido" });

      await prisma.carreraFotografo.deleteMany({ where: { fotografoId: id } });
      await prisma.fotografo.delete({ where: { id } });

      res.json({ ok: true });
    } catch (err) {
      console.error("ERROR DELETE /fotografos/:id", err);
      res.status(500).json({ error: "Error al eliminar" });
    }
  });

  return r;
}
