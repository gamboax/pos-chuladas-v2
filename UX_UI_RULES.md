# UX/UI RULES — POS CHULADAS V2

## OBJETIVO VISUAL

POS Chuladas V2 debe sentirse:
- premium
- moderno
- minimal
- mobile-first
- rápido
- elegante

NO debe sentirse:
- dashboard corporativo
- ERP viejo
- panel administrativo saturado
- app Android genérica
- template bootstrap

Inspiraciones:
- iPhone apps
- Square POS
- Stripe Terminal
- Linear
- Notion mobile
- apps minimalistas modernas

---

# REGLA MÁS IMPORTANTE

## CAJA != DASHBOARD

La pantalla del cajero NO debe verse como dashboard.

La caja debe:
- ser rápida
- limpia
- enfocada
- táctil
- minimal

Debe parecer:
- herramienta operativa
- no software administrativo complejo

---

# MOBILE-FIRST OBLIGATORIO

Diseñar SIEMPRE primero para celular.

Objetivo principal:
- ancho ~390px–430px

Todo debe:
- caber bien
- evitar scroll innecesario
- ser usable con una mano
- tener botones táctiles cómodos

---

# ESTILO GENERAL

## Fondo
- claro
- limpio
- gris muy suave
- NO fondos negros gigantes

Ejemplo:
#f4f4f4
#f7f7f7

---

# TARJETAS

Usar:
- tarjetas blancas
- bordes negros finos
- sombras suaves
- esquinas muy redondeadas

Evitar:
- cajas excesivas
- demasiados bordes internos
- widgets corporativos

---

# BORDER RADIUS

Preferencia:
- 24px
- 28px
- 32px

Evitar:
- esquinas cuadradas
- bordes rígidos

---

# BOTONES

## Caja principal
- grandes
- táctiles
- limpios
- claros

Productos:
- negros
- texto blanco
- bien espaciados

Acciones secundarias:
- blanco con borde

Acciones importantes:
- verde pastel elegante

---

# VERDES

NO usar:
- verde chillón
- verde neon
- #22c55e agresivo

Preferir:
- #9BE7C7
- #A7E8D0
- #8FE3C1

La UI debe verse:
- suave
- premium
- moderna

---

# TIPOGRAFÍA

Debe sentirse:
- limpia
- moderna
- aireada

Evitar:
- exceso de bold
- tamaños exagerados
- headers gigantes

Usar jerarquía clara.

---

# ESPACIADO

Priorizar:
- aire visual
- limpieza
- simplicidad

Pero:
- sin desperdiciar altura

---

# TOTAL EN CAJA

El total:
- debe verse grande
- importante
- elegante

Pero:
- NO dentro de demasiados recuadros
- NO ocupar media pantalla

---

# CALCULADORA

Debe:
- caber casi completa en celular
- evitar scroll
- sentirse táctil
- parecer POS moderno

Teclado:
- limpio
- grande
- cómodo
- 3 columnas

Cantidad/Precio:
- barras horizontales
- no cards miniatura

---

# DASHBOARD ADMIN

Admin sí puede parecer dashboard ligero.
Pero:
- limpio
- minimal
- no saturado

---

# TABLAS

Evitar:
- tablas enormes desktop-style

Preferir:
- cards
- bloques
- métricas compactas

---

# ANIMACIONES

Usar:
- suaves
- rápidas
- sutiles

NO usar:
- animaciones exageradas
- rebotes
- efectos pesados

---

# EXPERIENCIA OBJETIVO

La sensación general debe ser:

“Esto se siente como una app moderna real y no como un proyecto escolar.”

---

# PRINCIPIOS FINALES

1. Mobile-first siempre.
2. Menos es más.
3. Velocidad > complejidad.
4. UX primero.
5. Operación real primero.
6. Evitar UI genérica.
7. Evitar dashboards feos.
8. Mantener consistencia visual.
9. Pensar en estrés real de eventos.
10. Cada pantalla debe sentirse intencional.
---

# QA MOBILE Y ERRORES

## Scroll y touch

La app debe hacer scroll vertical con un dedo en:
- iPhone Safari
- iPhone Chrome
- Android Chrome
- Samsung Internet
- Samsung Fold

Reglas:
- No bloquear scroll vertical global.
- Usar `overflow-x: hidden` solo para eje horizontal.
- Mantener `touch-action: pan-y` en superficies principales.
- Evitar overlays invisibles que capturen gestos.
- Scanner/camara no debe bloquear scroll al salir.

## Mensajes operativos

Evitar alerts feos. Mostrar mensajes visuales cortos dentro de la app:
- Guardando...
- Guardada en Supabase
- Pendiente de sincronizar
- Sin conexion con Supabase
- No hay datos
- Permiso de camara denegado

## Pantallas compactas

Dashboard, scanner, checkout y venta deben evitar overflow horizontal en 360px, 390px, 414px y 430px.
Usar cards compactas, detalle progresivo y botones tactiles.

---

# SCANNER MVP

El scanner debe sentirse como un flujo simple:
- abrir scanner
- camara lista
- Tomar foto
- Analizando productos
- revisar sugerencias
- Confirmar articulos

No mostrar lenguaje tecnico al operador:
- OCR
- tokens
- region
- crop
- modelo
- API

Si la lectura falla, mostrar acciones simples:
- Tomar otra foto
- Capturar manual

La IA no debe analizar en vivo. Solo se ejecuta despues de Tomar foto.

---

# PERFORMANCE UX

La caja debe sentirse inmediata:
- no cargar dashboard al entrar a caja
- no cargar scanner hasta usarlo
- no bloquear la app mientras analiza una foto
- apagar camara al salir o confirmar articulos
- liberar imagenes capturadas cuando ya no se usan

Cuando algo tarda:
- mostrar loading corto y claro
- permitir cancelar analisis
- mantener captura manual disponible
