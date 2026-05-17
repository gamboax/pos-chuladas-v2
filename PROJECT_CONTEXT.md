# POS CHULADAS V2 — PROJECT CONTEXT

## Visión general

POS Chuladas V2 es un sistema operativo mobile-first para eventos físicos de Joyería Chuladas Mayoreo.

NO es solo una caja.
El objetivo es evolucionar a un sistema completo de operación multi-ciudad para:
- ventas
- gastos
- cortes
- inventario
- lotes
- CRM
- analytics
- inversionistas
- OCR/scanner
- operación distribuida

El sistema debe priorizar:
- velocidad operativa real
- uso desde celular
- simplicidad para cajeras
- UX premium
- diseño minimal tipo iPhone POS
- estabilidad
- escalabilidad

---

# CONTEXTO DEL NEGOCIO

## Modelo operativo

Joyería Chuladas Mayoreo realiza eventos físicos temporales en distintas ciudades.

Ejemplos:
- San Luis Potosí
- Matehuala
- Rioverde
- futuras ciudades

Cada evento:
- tiene ciudad
- fecha
- ventas independientes
- gastos independientes
- cortes independientes

Se requiere separar métricas por ciudad/evento.

---

# FILOSOFÍA UX/UI

## MUY IMPORTANTE

El cajero NO debe parecer dashboard corporativo.

Debe parecer:
- app móvil rápida
- POS elegante
- minimal
- tipo iPhone
- usable en estrés real

Evitar:
- tablas gigantes
- interfaces saturadas
- demasiados inputs
- exceso de texto
- widgets corporativos

Priorizar:
- botones grandes
- spacing limpio
- bordes redondeados
- tarjetas blancas
- mobile-first
- rapidez

---

# STACK

- React
- Vite
- Supabase
- Vercel
- GitHub

NO usar librerías innecesarias.
Tailwind puede considerarse después si realmente mejora consistencia.

---

# ROLES

## cashier
- acceso a caja
- no dashboard avanzado

## admin
- caja
- dashboard
- gastos
- cortes
- métricas

## super_admin
- acceso total

## investor
Placeholder por ahora.
Después:
- métricas
- ROI
- utilidad
- rendimiento por evento/lote

---

# FLUJO CAJERO

## Caja principal

Debe contener:
- ciudad
- folio
- total
- grid categorías
- escanear artículos
- borrar
- ver venta
- totalizar

NO debe tener edición pesada.

---

# CATEGORÍAS

- Anillo
- Pulsera
- Tobillera
- Collar
- Cadena
- Dije
- Rosario
- Juego
- Arete

NO usar Brazalete.

---

# CAPTURA MANUAL

Flujo:
1. cantidad
2. precio
3. agregar

Pantalla tipo calculadora.
Debe caber en celular sin scroll excesivo.

---

# ESCÁNER

Actualmente:
- simulado

Después:
- OCR real
- cámara
- lectura de códigos

Debe soportar:
- category
- material
- code_detected

---

# CÓDIGOS PRODUCTO

Prefijos:

A = Anillo
P = Pulsera
D = Collar con dije
I = Dije
E = Arete
R = Rosario
T = Tobillera
J = Juego
C = Cadena

Materiales:

1 = Acero inoxidable
2 = Oro laminado
3 = Baño de rodio
4 = Baño de plata

---

# CHECKOUT

Debe permitir:
- descuento
- método de pago
- cliente opcional
- WhatsApp
- guardar venta

---

# DESCUENTOS

Regla comercial:
Compras arriba de $5,000 pueden recibir 10%.

Debe existir:
- descuento %
- descuento manual

---

# SUPABASE

Tablas importantes:
- users
- sales
- sale_items
- expenses
- cash_cuts
- cities
- events
- product_codes
- purchase_lots
- purchase_lot_items

---

# FUNCIONES YA IMPLEMENTADAS

- login
- roles
- caja mobile-first
- captura manual
- scanner simulado
- carrito editable
- checkout
- WhatsApp
- Supabase ventas
- dashboard admin básico
- gastos
- corte de caja
- persistencia local

---

# ROADMAP FUTURO

## PRIORIDAD ALTA
- OCR real
- inventario/lotes
- utilidad neta real
- analytics por ciudad
- dashboard mejorado
- multi-evento
- cortes avanzados

## PRIORIDAD MEDIA
- CRM clientes
- historial clientes
- recompra
- exportaciones
- métricas avanzadas

## PRIORIDAD FUTURA
- inversionistas
- ROI por lote
- expansión multi caja
- offline mode
- sincronización dispositivos

---

# DECISIONES IMPORTANTES

## UX
- mantener minimalismo
- evitar dashboards feos
- mobile-first siempre

## Código
- mantener componentes separados
- evitar archivos gigantes
- build limpio siempre

## Negocio
- priorizar velocidad operativa real
- optimizar flujo cajera
- reducir errores humanos
