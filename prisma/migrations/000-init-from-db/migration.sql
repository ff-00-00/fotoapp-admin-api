-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Moneda" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "public"."TipoCarrera" AS ENUM ('RUNNING', 'BICI', 'OTRO');

-- CreateEnum
CREATE TYPE "public"."TipoProducto" AS ENUM ('PREVENTA', 'PACK', 'UNIDAD', 'OTRO');

-- CreateTable
CREATE TABLE "public"."Carrera" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monedaBase" "public"."Moneda" NOT NULL DEFAULT 'ARS',
    "organizadorId" INTEGER,
    "proveedorId" INTEGER,
    "ingresoARSCents" BIGINT NOT NULL DEFAULT 0,
    "ingresoUSDCents" BIGINT NOT NULL DEFAULT 0,
    "mpPct" DECIMAL(6,4),
    "ibPct" DECIMAL(6,4),
    "ivaPct" DECIMAL(6,4),
    "provPct" DECIMAL(6,4),
    "orgPrePct" DECIMAL(6,4),
    "orgPostPct" DECIMAL(6,4),
    "accesos" INTEGER,
    "corredores" INTEGER,
    "debCredPct" DECIMAL(6,4),
    "lugar" TEXT,
    "tipo" "public"."TipoCarrera",

    CONSTRAINT "Carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CarreraPreventa" (
    "id" SERIAL NOT NULL,
    "carreraId" INTEGER NOT NULL,
    "preventaTipoId" INTEGER NOT NULL,
    "unidades" INTEGER NOT NULL DEFAULT 0,
    "precioUnitarioCents" BIGINT NOT NULL,
    "moneda" "public"."Moneda" NOT NULL,

    CONSTRAINT "CarreraPreventa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Fotografo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "alias" TEXT,

    CONSTRAINT "Fotografo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organizacion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "provPct" DECIMAL(6,4),
    "orgPrePct" DECIMAL(6,4),
    "orgPostPct" DECIMAL(6,4),

    CONSTRAINT "Organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ParametroFiscal" (
    "id" SERIAL NOT NULL,
    "pais" TEXT NOT NULL DEFAULT 'AR',
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),
    "mpPct" DECIMAL(6,4),
    "ibPct" DECIMAL(6,4),
    "ivaPct" DECIMAL(6,4),

    CONSTRAINT "ParametroFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PreventaTipo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "PreventaTipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RegistroFotografo" (
    "id" SERIAL NOT NULL,
    "carreraId" INTEGER NOT NULL,
    "fotografoId" INTEGER NOT NULL,
    "rol" TEXT NOT NULL,
    "horas" DECIMAL(8,2) NOT NULL,
    "tarifaHoraCents" BIGINT,
    "tarifaFijaCents" BIGINT,
    "plusPct" DECIMAL(6,4),
    "plusCents" BIGINT,
    "pagoEstado" TEXT,
    "facturaEstado" TEXT,

    CONSTRAINT "RegistroFotografo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TipoMovimiento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "alcance" TEXT NOT NULL,
    "formula" TEXT,

    CONSTRAINT "TipoMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaccion" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "carreraId" INTEGER,
    "tipoId" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "montoCents" BIGINT NOT NULL,
    "moneda" "public"."Moneda" NOT NULL,
    "nota" TEXT,

    CONSTRAINT "Transaccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrera_fotografo" (
    "id" SERIAL NOT NULL,
    "carreraId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "costoCents" BIGINT NOT NULL DEFAULT 0,
    "descargas" INTEGER NOT NULL DEFAULT 0,
    "descargasUnicas" INTEGER NOT NULL DEFAULT 0,
    "facturo" BOOLEAN NOT NULL DEFAULT false,
    "fotosTomadas" INTEGER NOT NULL DEFAULT 0,
    "horasTrabajadas" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "rol" TEXT,

    CONSTRAINT "carrera_fotografo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrera_venta_tipo" (
    "id" SERIAL NOT NULL,
    "carreraId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "public"."TipoProducto" NOT NULL,
    "moneda" "public"."Moneda" NOT NULL,
    "precioCents" BIGINT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "comisionPct" DECIMAL(6,4),

    CONSTRAINT "carrera_venta_tipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pedidos_meta" (
    "id" SERIAL NOT NULL,
    "carreraId" INTEGER NOT NULL,
    "preventaCount" INTEGER NOT NULL DEFAULT 0,
    "preventaPriceCents" BIGINT NOT NULL DEFAULT 0,
    "ventaPackCount" INTEGER NOT NULL DEFAULT 0,
    "ventaPackPriceCents" BIGINT NOT NULL DEFAULT 0,
    "ventaFotoCount" INTEGER NOT NULL DEFAULT 0,
    "ventaFotoPriceCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarreraPreventa_carreraId_preventaTipoId_key" ON "public"."CarreraPreventa"("carreraId" ASC, "preventaTipoId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PreventaTipo_codigo_key" ON "public"."PreventaTipo"("codigo" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "public"."Usuario"("email" ASC);

-- CreateIndex
CREATE INDEX "carrera_fotografo_carreraId_idx" ON "public"."carrera_fotografo"("carreraId" ASC);

-- CreateIndex
CREATE INDEX "carrera_venta_tipo_carreraId_idx" ON "public"."carrera_venta_tipo"("carreraId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_meta_carreraId_key" ON "public"."pedidos_meta"("carreraId" ASC);

-- AddForeignKey
ALTER TABLE "public"."Carrera" ADD CONSTRAINT "Carrera_organizadorId_fkey" FOREIGN KEY ("organizadorId") REFERENCES "public"."Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Carrera" ADD CONSTRAINT "Carrera_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "public"."Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CarreraPreventa" ADD CONSTRAINT "CarreraPreventa_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "public"."Carrera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CarreraPreventa" ADD CONSTRAINT "CarreraPreventa_preventaTipoId_fkey" FOREIGN KEY ("preventaTipoId") REFERENCES "public"."PreventaTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroFotografo" ADD CONSTRAINT "RegistroFotografo_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "public"."Carrera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroFotografo" ADD CONSTRAINT "RegistroFotografo_fotografoId_fkey" FOREIGN KEY ("fotografoId") REFERENCES "public"."Fotografo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaccion" ADD CONSTRAINT "Transaccion_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "public"."Carrera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaccion" ADD CONSTRAINT "Transaccion_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "public"."TipoMovimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrera_fotografo" ADD CONSTRAINT "carrera_fotografo_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "public"."Carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrera_venta_tipo" ADD CONSTRAINT "carrera_venta_tipo_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "public"."Carrera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pedidos_meta" ADD CONSTRAINT "pedidos_meta_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "public"."Carrera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

