# Compras SALES — 09 Abril 2026
# 9 notas de compra para cruzar contra DB de productos

## CONTEXTO
- Proveedor: SALES (Laboratorio Óptico, Cd. Juárez)
- Cliente: Carrera / Ivon Alvidrez
- Fecha: 09-Abril-2026
- **Sistema de series**: los primeros dígitos del modelo indican la serie/tier de precio. Los ceros restantes son placeholders (ej: CM68000 = serie 68)
- **"Sp"** = Special, tier premium (agrega ~$50 al precio)
- **"Alum"** = aluminio, diferente material/precio que el modelo base

## CORRECCIONES DE MARCA CONFIRMADAS
| En la nota (letra) | Nombre correcto | Notas |
|---------------------|----------------|-------|
| Manna | **MARINA** | Confirmado por Angel. Código tiene `amCorregirMarinaIVA()` |
| Funky F. | **FUNKY FRED** | Código usa "Funky Fred" como marca |
| Xeox | **XEOS** | Confirmado por Angel |
| Lady Lucky | **LADY LUCK** | Nota 81498 lo escribe correcto |
| Honor Momet | **HONOR MOMENT** | Nota 81509 lo escribe correcto |
| Wanme | **WANNMEE** | Misma nota tiene ambas formas |
| Quarter Squer | **QUARTER SQUARE** | Confirmado por Angel |
| Dignity Ry 5000 | **ROYALTY** Ry5000 | Marca incorrecta en nota, confirmado |
| Polarizado Kids B.Vision | **BRIGHT VISION** (marca), Polarizado (producto) | Confirmado por Angel |

## NOTAS SOBRE VARIANTES
- **Royalty**: prefijos "Te", "Ry", "Tr" son modelos diferentes con precios diferentes. No es error
- **Funky Fred**: tiene muchas variantes/sub-líneas (Active, Hp, FF, Aceo, RB, GR, CA, MA, etc.)
- **Cool Men**: "Alum" es aluminio, precio diferente al plástico del mismo número de serie

## ERROR ARITMÉTICO DETECTADO
- **Nota #81498, Royalty Ry5000**: 8 × $159 = $1,272 pero nota dice $1,292 ($20 de más). El subtotal de la nota ($32,644) confirma que el correcto es $1,272

---

## NOTA #81508 — Total $8,660.52
Subtotal $8,019 + IVA 8% $641.52

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 18 | DREAM LISA | 000 | 29 | 522 |
| 16 | CAFFSEN | 8000 | 39 | 624 |
| 6 | WHARTON | 000 | 29 | 174 |
| 12 | SORAYA | 1000C | 49 | 588 |
| 2 | SORAYA | 8000 | 39 | 78 |
| 12 | ELEGANCIA | E5000 | 29 | 348 |
| 35 | ONOLA | Ons000 | 39 | 1,365 |
| 7 | COOL MEN | CM68000 | 119 | 833 |
| 1 | COOL MEN | CM3000 | 69 | 69 |
| 2 | COOL MEN | Alum77000 | 99 | 198 |
| 5 | COOL MEN | CM68000 | 119 | 595 |
| 8 | QUARTER SQUARE | Sp | 189 | 1,512 |
| 7 | FAMOSA | 2108 Sp | 159 | 1,113 |

## NOTA #81506 — Total $16,522.92
Subtotal $15,299 + IVA 8% $1,223.92

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 4 | NOAH | 2200M | 169 | 676 |
| 2 | NOAH | 200 | 119 | 238 |
| 8 | NOAH | 1101A | 169 | 1,352 |
| 16 | XEOS | J2000p1000 | 59 | 944 |
| 6 | XEOS | Nombre | 249 | 1,494 |
| 1 | PINKY | SE000 | 149 | 149 |
| 3 | PINKY | SE000 | 149 | 447 |
| 2 | PINKY | MAL000 | 159 | 318 |
| 18 | MINAMI | 1000M | 169 | 3,042 |
| 7 | MINAMI | 000 | 119 | 833 |
| 84 | ELEGANCIA | E9000A | 39 | 3,276 |
| 13 | ELEGANCIA | E8000 | 39 | 507 |
| 17 | NIKITANA | NK9000F | 119 | 2,023 |

## NOTA #81509 — Total $3,438.72
Subtotal $3,184 + IVA 8% $254.72

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 1 | FUNKY FRED | FO Sp | 249 | 249 |
| 3 | MARINA | MLN9000 | 189 | 567 |
| 2 | MARINA | MLN88000 | 209 | 418 |
| 4 | MARINA | MRN88000 | 159 | 636 |
| 5 | FUNKY FRED | 3000 Sp | 229 | 1,145 |
| 1 | HONOR MOMENT | TJ2000 Sp | 169 | 169 |

## NOTA #81504 — Total $8,237.16
Subtotal $7,627 + IVA 8% $610.16

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 2 | COOL MEN | C477000 | 99 | 198 |
| 8 | COOL MEN | Alum77000 | 129 | 1,032 |
| 3 | ROYALTY | Ry T8000 | 189 | 567 |
| 2 | ROYALTY | Te | 139 | 278 |
| 2 | ROYALTY | Ry5000 | 159 | 318 |
| 2 | LADY LUCK | N5000 | 129 | 258 |
| 22 | MANISSA | P5000 | 129 | 2,838 |
| 2 | ROYALTY | Ry Z66000 | 139 | 278 |
| 2 | HONOR MOMENT | HM | 149 | 298 |
| 3 | AMASS | 000 | 79 | 237 |
| 1 | VICHY | Am000 | 139 | 139 |
| 7 | VICHY | 2214M | 149 | 1,047 |
| 1 | VICHY | 2000A | 139 | 139 |

## NOTA #81502 — Total $13,776.48
Subtotal $12,756 + IVA 8% $1,020.48

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 5 | BRIGHT VISION | Polarizado Kids | 79 | 395 |
| 8 | TOP MODA | TR900K | 69 | 552 |
| 33 | AREZIA | A8000 | 119 | 3,927 |
| 10 | AREZIA | A8000B | 119 | 1,190 |
| 4 | AREZIA | A3000 | 119 | 476 |
| 6 | AREZIA | 68000 | 139 | 834 |
| 18 | GOOD KIDS | G19600 | 159 | 2,862 |
| 7 | COOL MEN | CM6800 | 119 | 833 |
| 2 | COOL MEN | 9000 | 169 | 338 |
| 3 | COOL MEN | 68000 | 119 | 357 |
| 3 | COOL MEN | Acebo 8000 | 99 | 297 |
| 2 | COOL MEN | CM9000 | 169 | 338 |
| 3 | COOL MEN | Ly180000 | 119 | 357 |

## NOTA #81498 — Total $35,235.52 (corregido: subtotal $32,624 por error aritmético de $20)
Subtotal original nota $32,644 — real $32,624 + IVA 8% $2,609.92 = $35,233.92
(Nota: la diferencia es menor, para registro se puede usar el total de la nota $35,255.52)

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 10 | LADY LUCK | — | 129 | 1,290 |
| 26 | NOVICA | NV11000 | 69 | 1,794 |
| 70 | WANNMEE | WMP00Z | 139 | 9,730 |
| 30 | WANNMEE | WMP002 | 139 | 4,170 |
| 22 | LAMOST | L22000 | 139 | 3,058 |
| 15 | DIGNITY | DG53000 | 79 | 1,185 |
| 8 | DIGNITY | DG77000 | 119 | 952 |
| 2 | DIGNITY | XH22000 | 119 | 238 |
| 9 | ROYALTY | RyR66000 | 139 | 1,251 |
| 8 | ROYALTY | Ry5000 | 159 | 1,272 (nota dice 1,292 — error aritmético) |
| 33 | ROYALTY | Te | 189 | 6,237 |
| 4 | ZAKKA KIDS | 000 | 39 | 156 |
| 19 | TOP MODA | TR00K | 69 | 1,311 |

## NOTA #81481 — Total $38,637.00
Subtotal $35,775 + IVA 8% $2,862

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 48 | FUNKY FRED | Hp | 119 | 5,712 |
| 27 | FUNKY FRED | FF 1500M | 149 | 4,023 |
| 32 | FUNKY FRED | Aceo 1500M | 119 | 3,808 |
| 12 | FUNKY FRED | RB 700 | 169 | 2,028 |
| 74 | MARINA | Blueshield | 159 | 11,766 |
| 10 | MARINA | TR90 M9000 | 149 | 1,490 |
| 3 | MARINA | M21000 | 129 | 387 |
| 3 | MARINA | M9000 | 169 | 507 |
| 3 | MARINA | MRN21000 | 139 | 417 |
| 3 | MARINA | NLN8900 | 129 | 387 |
| 6 | MARINA | M6000 | 129 | 774 |
| 6 | MARINA | Titanium 3000 | 179 | 1,074 |
| 18 | MARINA | MLN8000 | 189 | 3,402 |

## NOTA #81488 — Total $28,928.88
Subtotal $26,786 + IVA 8% $2,142.88

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 17 | FUNKY FRED | 1600M | 129 | 2,193 |
| 18 | FUNKY FRED | 8000M | 79 | 1,422 |
| 3 | FUNKY FRED | Active 100A | 129 | 387 |
| 52 | FUNKY FRED | 9000 | 149 | 7,748 |
| 7 | FUNKY FRED | Active 00A | 99 | 693 |
| 4 | FUNKY FRED | A200N | 139 | 556 |
| 11 | FUNKY FRED | A100 | 59 | 649 |
| 16 | FUNKY FRED | F8000 | 179 | 2,864 |
| 10 | FUNKY FRED | 1000M | 149 | 1,490 |
| 6 | FUNKY FRED | CA1400M | 119 | 714 |
| 12 | FUNKY FRED | GR1000A | 149 | 1,788 |
| 26 | FUNKY FRED | MA2000 | 159 | 4,134 |
| 12 | FUNKY FRED | A3000 | 179 | 2,148 |

## NOTA #81505 — Total $27,681.48
Subtotal $25,631 + IVA 8% $2,050.48

| Cant | Marca | Modelo | P.U. | Importe |
|------|-------|--------|------|---------|
| 46 | FUNKY FRED | A5000 | 179 | 8,234 |
| 14 | FALANGA | — | 79 | 1,106 |
| 11 | VIA AMORE | — | 79 | 869 |
| 3 | AMASS | 000 | 79 | 237 |
| 3 | PRETTY GIRL | PG2000 | 139 | 417 |
| 14 | ROSSELO | Ros0670 | 89 | 1,246 |
| 19 | NOVICA | 2000 | 119 | 2,261 |
| 2 | BISMARCK | 8000 | 79 | 158 |
| 27 | MARINA | Blueshield | 159 | 4,293 |
| 4 | MARINA | MRN5000 | 199 | 796 |
| 25 | MARINA | M18000 | 109 | 2,725 |
| 16 | FUNKY FRED | A2000F | 159 | 2,544 |
| 5 | FUNKY FRED | A2000E | 149 | 745 |

---

## RESUMEN TOTALES POR NOTA

| Nota | Subtotal | IVA 8% | Total |
|------|----------|--------|-------|
| #81508 | $8,019 | $641.52 | $8,660.52 |
| #81506 | $15,299 | $1,223.92 | $16,522.92 |
| #81509 | $3,184 | $254.72 | $3,438.72 |
| #81504 | $7,627 | $610.16 | $8,237.16 |
| #81502 | $12,756 | $1,020.48 | $13,776.48 |
| #81498 | $32,644 | $2,611.52 | $35,255.52 |
| #81481 | $35,775 | $2,862.00 | $38,637.00 |
| #81488 | $26,786 | $2,142.88 | $28,928.88 |
| #81505 | $25,631 | $2,050.48 | $27,681.48 |
| **TOTAL** | **$167,721** | **$13,417.68** | **$181,138.68** |

## RESUMEN POR MARCA (cantidad de piezas + gasto)

| Marca | Piezas | Costo total | Notas |
|-------|--------|-------------|-------|
| FUNKY FRED | 350 | $55,331 | 81481, 81488, 81505, 81509 |
| MARINA | 184 | $27,641 | 81481, 81505, 81509 |
| WANNMEE | 100 | $13,900 | 81498 |
| ELEGANCIA | 111 | $4,479 | 81506, 81508 |
| AREZIA | 53 | $6,427 | 81502 |
| COOL MEN | 50 | $5,832 | 81502, 81504, 81508 |
| ROYALTY | 59 | $9,641 | 81498, 81504 |
| NOVICA | 45 | $4,055 | 81498, 81505 |
| MINAMI | 25 | $3,875 | 81506 |
| TOP MODA | 27 | $1,863 | 81498, 81502 |
| ONOLA | 35 | $1,365 | 81508 |
| DIGNITY | 25 | $2,375 | 81498 |
| MANISSA | 22 | $2,838 | 81504 |
| LAMOST | 22 | $3,058 | 81498 |
| GOOD KIDS | 18 | $2,862 | 81502 |
| DREAM LISA | 18 | $522 | 81508 |
| NIKITANA | 17 | $2,023 | 81506 |
| SORAYA | 14 | $666 | 81508 |
| CAFFSEN | 16 | $624 | 81508 |
| ROSSELO | 14 | $1,246 | 81505 |
| FALANGA | 14 | $1,106 | 81505 |
| NOAH | 14 | $2,266 | 81506 |
| LADY LUCK | 12 | $1,548 | 81498, 81504 |
| VIA AMORE | 11 | $869 | 81505 |
| VICHY | 9 | $1,325 | 81504 |
| XEOS | 22 | $2,438 | 81506 |
| QUARTER SQUARE | 8 | $1,512 | 81508 |
| FAMOSA | 7 | $1,113 | 81508 |
| HONOR MOMENT | 3 | $467 | 81504, 81509 |
| PINKY | 6 | $914 | 81506 |
| WHARTON | 6 | $174 | 81508 |
| AMASS | 6 | $474 | 81504, 81505 |
| BRIGHT VISION | 5 | $395 | 81502 |
| PRETTY GIRL | 3 | $417 | 81505 |
| BISMARCK | 2 | $158 | 81505 |
| ZAKKA KIDS | 4 | $156 | 81498 |

## PENDIENTE: CRUZAR CON DB
Cuando haya acceso a la base de datos:
1. Verificar qué marcas ya existen en tabla `productos` (categoria='Armazón')
2. Verificar qué modelos ya están registrados
3. Comparar precios de compra (costo) vs precios de venta actuales para calcular margen
4. Identificar productos nuevos que necesitan darse de alta
5. Verificar si hay discrepancias de nomenclatura (ej: "COOL MEN" vs "Cool Men")
6. Cruzar contra listas de precios de SALES en app_config (precios_lab_sales)

## PRECIOS POR MARCA Y SERIE (referencia para validación)

### FUNKY FRED
$59: A100
$79: 8000M
$99: Active 00A
$119: Hp, Aceo 1500M, CA1400M
$129: 1600M, Active 100A
$139: A200N
$149: FF 1500M, 9000, 1000M, GR1000A, A2000E
$159: MA2000, A2000F
$169: RB 700
$179: A3000, A5000, F8000
$229: 3000 Sp
$249: FO Sp

### MARINA
$109: M18000
$129: M6000, M21000, NLN8900
$139: MRN21000
$149: TR90 M9000
$159: Blueshield, MRN88000
$169: M9000
$179: Titanium 3000
$189: MLN9000, MLN8000
$199: MRN5000
$209: MLN88000

### COOL MEN
$69: CM3000
$99: C477000, Acebo 8000, Alum77000 (nota 81508)
$119: CM68000, CM6800, 68000, Ly180000
$129: Alum77000 (nota 81504 — aluminio, precio diferente)
$169: 9000, CM9000

### ROYALTY
$139: Te (81504), Ry66000/RyR66000/Ry Z66000
$159: Ry5000
$189: Ry T8000, Te (81498)
