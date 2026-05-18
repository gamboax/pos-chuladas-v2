# BUSINESS CONTEXT — POS CHULADAS V2

## Qué es Joyería Chuladas Mayoreo

Joyería Chuladas Mayoreo es un negocio de eventos físicos itinerantes de joyería al mayoreo.

El modelo NO es una joyería fija tradicional.
El modelo es:
- eventos temporales
- distintas ciudades
- operación rápida
- alto flujo
- ventas desde celular
- equipo pequeño

El sistema POS debe diseñarse alrededor de esa realidad operativa.

---

# OPERACIÓN REAL

## Eventos

Cada evento:
- ocurre en una ciudad específica
- tiene fecha específica
- tiene gastos propios
- tiene ventas propias
- tiene corte de caja propio

Ejemplos:
- Matehuala
- Rioverde
- San Luis Potosí

NO mezclar métricas entre eventos.

---

# OPERACIÓN CAJERA

La cajera:
- trabaja desde celular
- puede estar bajo presión
- necesita velocidad
- no puede navegar interfaces complejas

Por eso:
- botones grandes
- pocas decisiones
- flujo rápido
- edición pesada fuera de caja principal

---

# FLUJO DE VENTA

La mayoría de ventas son rápidas:
- cliente toma piezas
- cajera captura
- cobra
- siguiente cliente

El POS debe optimizar:
- velocidad
- claridad
- mínima fricción

---

# FILOSOFÍA DEL PRODUCTO

Esto NO debe parecer:
- ERP corporativo
- dashboard genérico
- software administrativo viejo

Debe sentirse:
- moderno
- limpio
- premium
- rápido
- móvil
- elegante

Inspiración:
- iPhone POS
- Square
- Stripe Terminal
- apps minimalistas

---

# MULTI-CIUDAD

El sistema debe crecer a:
- múltiples ciudades simultáneas
- múltiples cajeros
- múltiples eventos

Debe soportar:
- métricas por ciudad
- métricas por evento
- métricas por cajero

---

# FUTURO OCR

El futuro objetivo es:
- escanear artículos automáticamente
- leer códigos impresos
- detectar material/categoría

Por eso existe:
- product_codes
- code_detected
- capture_origin

---

# INVENTARIO FUTURO

El negocio funciona por lotes de compra.

Después el sistema deberá soportar:
- lotes
- costos
- utilidad
- margen
- ROI
- mercancía restante

---

# DASHBOARD ADMIN

Admin necesita:
- ventas del día
- ticket promedio
- gastos
- utilidad
- cortes
- métricas por ciudad

Pero SIEMPRE:
- mobile-first
- limpio
- simple

---

# INVESTOR VIEW

A futuro:
- inversionistas podrán ver:
  - utilidad
  - ROI
  - rendimiento por evento
  - rendimiento por lote

Pero NO deben poder modificar operaciones.

---

# WHATSAPP

WhatsApp es parte central de la operación.

El sistema debe:
- generar tickets compartibles
- abrir wa.me
- facilitar seguimiento cliente

---

# DESCUENTOS

Compras arriba de $5,000:
- pueden recibir 10%

El sistema debe mantener:
- flexibilidad
- descuentos manuales
- reglas comerciales simples

---

# PRINCIPIOS IMPORTANTES

1. Mobile-first SIEMPRE.
2. Velocidad operativa > features innecesarias.
3. UX limpia > dashboard complejo.
4. Cajera primero.
5. Eventos reales primero.
6. Código limpio y escalable.
7. Evitar librerías innecesarias.
8. Mantener build limpio.
---

# OPERACION REAL POST-EVENTO

## Conectividad debil

En eventos reales puede fallar internet o Supabase. La regla de negocio es: no perder ventas.
Si el guardado remoto no esta disponible, la venta puede quedar local como pendiente y debe mostrarse a la cajera para reintentar sincronizacion.

## Ciudad / evento

Cambiar ciudad limpia la venta actual y separa las metricas. Si hay articulos en carrito, la app debe avisar antes de cambiar ciudad.
Dashboards, resumen de caja, gastos, cortes y pendientes deben filtrar por ciudad/evento activo.

## Gastos y cortes

Manager/admin operativo captura solo gastos variables de evento:
- Renta del lugar
- Gasolina
- Comida
- Pago de colaborador
- Casetas
- Otros

El corte debe mostrar diferencia clara:
- Sobrante
- Faltante
- Exacto

## Inventario

Los codigos de producto deben ser unicos. Si un codigo ya existe, se debe mostrar error claro y no crear duplicado.
Una venta con `code_detected` debe intentar enlazarse a product_codes/purchase_lot_items sin romper la venta si no encuentra codigo.
