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

# CIERRE MVP OPERATIVO

## Estado actual

El MVP esta preparado para operar eventos reales con foco en caja movil:
- caja rapida mobile-first
- captura manual por categoria
- scanner con camara e IA visual bajo demanda
- venta editable
- checkout con descuento, pago y cliente opcional
- guardado en Supabase con fallback local pendiente
- ticket y WhatsApp
- dashboard operativo por rol
- gastos, cortes, inventario/lotes y exportaciones basicas

---

# SEGURIDAD MVP Y HARDENING

## Login actual

El login actual es un login operativo simple contra tabla `users` con:
- nombre
- PIN
- rol
- active

Para acelerar operacion en evento:
- la consulta de login debe pedir solo `id, name, role, active`
- `last_active_at` se actualiza en segundo plano si existe
- la sesion local se guarda de forma simple por hasta 12 horas para evitar relogin lento

Riesgo conocido:
- este login no reemplaza Supabase Auth
- el PIN no debe considerarse autenticacion fuerte
- no usar para usuarios externos o datos altamente sensibles sin migrar auth

Ruta gradual recomendada:
1. Migrar usuarios reales a Supabase Auth.
2. Mover roles a `app_metadata` o tabla privada de perfiles.
3. Endurecer RLS por rol y ciudad/evento.
4. Mantener anon key solo para flujos publicos estrictamente permitidos.

## Endpoint IA

El endpoint de analisis de etiquetas:
- nunca expone `OPENAI_API_KEY` al frontend
- valida metodo, content-type y tamano maximo de payload
- acepta solo imagen base64 jpeg/png/webp
- no guarda imagenes
- no debe loggear imagenes ni secretos
- si falta key o falla IA, la app cae a captura manual sin bloquear venta

## Permisos por rol

- cashier: caja y resumen del dia; sin gastos, utilidad, inventario ni anulaciones.
- manager/admin_operativo/admin: dashboard operativo, tickets, gastos y cortes; sin inventario maestro ni anulaciones.
- super_admin: control completo, auditoria, exportaciones e importaciones V1.
- investor: solo lectura; sin botones operativos.

## Performance

- Login carga solo la pantalla de login.
- Caja y dashboard se cargan con lazy loading.
- Scanner se carga solo al tocar Escanear articulos.
- La IA del scanner solo se ejecuta despues de Tomar foto.
- Tesseract/OCR local no forma parte del flujo visible del scanner MVP.
- Service worker usa cache versionada y red primero para navegacion/assets.

## Riesgos conocidos

- El login actual es simple por tabla `users`, no autenticacion Supabase Auth completa.
- RLS esta habilitado en SQL, pero las policies actuales son amplias para mantener operacion con anon key.
- Las ventas pendientes viven en localStorage del dispositivo hasta sincronizar.
- La IA visual no debe ser obligatoria para vender; siempre debe existir captura manual.

## Regla de cierre

Antes de cada evento:
- correr `npm run lint`
- correr `npm run build`
- confirmar ciudad activa
- probar una venta manual
- probar scanner/camara
- revisar pendientes
- verificar que dashboard no mezcle ciudades

---

# FUNCIONES YA IMPLEMENTADAS

- login
- roles
- caja mobile-first
- captura manual
- scanner con camara e IA visual
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

---

# QA OPERATIVO POST-EVENTO

## Roles definitivos

- cashier: caja, resumen del dia, pendientes, cambiar ciudad, cerrar sesion. No ve gastos, utilidad, inventario ni costos.
- manager / admin_operativo / admin: caja, dashboard operativo, tickets, gastos operativos y corte. No administra lotes ni inventario maestro.
- super_admin: acceso completo a caja, dashboard, gastos, cortes, inventario, lotes, product_codes, utilidad y ROI.
- investor: solo lectura de ventas, utilidad estimada, inversion y ROI. No cobra, no edita y no registra operaciones.

## Fallback local seguro

Si Supabase falla al guardar una venta antes de confirmar persistencia real, la venta queda local como `Pendiente de sincronizar`.
La caja tiene vista `Pendientes` por ciudad/evento y boton `Reintentar sincronizar`.
No se debe perder carrito si Supabase responde error despues de crear venta pero antes de guardar `sale_items`.

## QA ventas

- Evitar doble guardado con loading/disabled.
- Cada folio se recuerda localmente para reducir colisiones por ciudad.
- `sale_items` debe usar el `sale_id` devuelto por `sales`.
- Ticket y payload de venta deben compartir folio, ciudad, cajera, total, descuento, pago e items.

## Categoria nueva

- `Caja` representa caja de regalo.
- Debe mostrarse como `Caja` en POS, ticket, resumen y sale_items.
- No reemplaza ni afecta codigos de scanner existentes.
