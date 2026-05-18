# Quick Start Evento - POS Chuladas V2

Guia rapida para operar el POS en eventos reales.

## Antes del evento

1. Abre la app desde el celular que se usara en caja.
2. Verifica internet y bateria.
3. Entra con usuario y PIN.
4. Escribe la ciudad del evento exactamente como se usara en dashboard.
5. Haz una venta de prueba pequena y confirma que se guarde.
6. Abre el scanner, permite camara y prueba una foto.
7. Si hay ventas pendientes, toca reintentar sincronizacion antes de iniciar.

## Iniciar evento

1. Login.
2. Selecciona ciudad/evento.
3. Confirma que el banner superior muestre ciudad activa, conexion y pendientes.
4. Si cambias ciudad con una venta en curso, la app avisa antes de limpiar la venta.

## Cobro manual

1. En caja toca categoria.
2. Captura cantidad.
3. Toca Siguiente.
4. Captura precio.
5. Toca Agregar.
6. Repite si el cliente trae mas piezas.
7. Toca Ver venta para editar cantidad/precio o eliminar articulos.
8. Toca Totalizar para cobrar.

## Scanner IA

1. Toca Escanear articulos.
2. La camara intenta abrirse automaticamente.
3. Acomoda las etiquetas en la foto.
4. Toca Tomar foto.
5. Espera Analizando productos.
6. Revisa sugerencias detectadas.
7. Edita cantidad o precio si hace falta.
8. Toca Confirmar articulos.
9. Elige Volver a caja, Ir a totalizar o Escanear mas.

La IA solo se ejecuta despues de tocar Tomar foto. No analiza en vivo.

## Si la IA falla

Si aparece "No pude leer la foto. Intenta otra o captura manual":

1. Toca Tomar otra foto si la etiqueta salio borrosa.
2. Toca Capturar manual si quieres escribir el codigo.
3. Tambien puedes volver a caja y capturar por categoria normal.

La venta no se bloquea si la IA falla.

## Totalizar

1. Revisa subtotal.
2. Aplica descuento si corresponde.
3. Selecciona metodo de pago: Efectivo, Transferencia, Tarjeta o Mixto.
4. Captura cliente opcional: nombre, WhatsApp y tipo de cliente.
5. Toca Guardar venta.

## WhatsApp

Despues de guardar:

1. Revisa ticket.
2. Toca Enviar WhatsApp.
3. Si hay numero, se abre chat directo.
4. Si no hay numero, se abre WhatsApp con texto listo.

## Si no hay internet

La venta puede quedar como Pendiente de sincronizar.

1. No cierres la venta manualmente en otro lado si ya quedo pendiente.
2. Revisa el banner de pendientes.
3. Cuando vuelva internet, toca Reintentar.
4. Si falla, la venta sigue guardada localmente en el celular.

Importante: las ventas pendientes viven en ese dispositivo. No borres datos del navegador hasta sincronizar.

## Resumen del dia para caja

Desde el menu de caja:

1. Toca Resumen del dia.
2. Revisa venta total, tickets y operaciones recientes.
3. Caja no ve gastos, inventario ni utilidad sensible.

## Manager/admin operativo

Puede revisar dashboard operativo, tickets, gastos del evento y corte de caja.

No debe anular ventas ni modificar inventario maestro.

## Corte de caja

1. Entra como manager/admin operativo o super_admin.
2. Abre dashboard.
3. Captura gastos del evento.
4. En Corte de caja revisa venta total, efectivo esperado, efectivo contado, transferencias, tarjeta, gastos en efectivo y diferencia.
5. Guarda corte.

## Exportaciones

Solo super_admin:

1. Abre dashboard.
2. Usa filtros de ciudad/fecha/mes.
3. Exporta CSV ventas, CSV gastos o CSV corte.
4. Copia o reenvia tickets desde detalle de operacion.

## Checklist durante el evento

- Ciudad correcta en banner.
- Folio visible.
- Sin pendientes acumuladas si hay internet.
- Scanner con permiso de camara.
- Caja no se queda en dashboard.
- Cada venta termina en ticket guardado o pendiente.
- No borrar datos del navegador con pendientes.

## Checklist despues del evento

- Reintentar pendientes hasta que queden en cero.
- Revisar ventas del evento por ciudad.
- Registrar gastos faltantes.
- Hacer corte de caja.
- Exportar CSV si se requiere respaldo.
- Revisar tickets cancelados/anulados si aplica.

## Riesgo conocido MVP

El sistema usa login simple por tabla `users` y Supabase con anon key publica. Las tablas tienen RLS habilitado, pero las policies operativas son amplias para no romper el POS en evento. Antes de abrir el sistema a usuarios externos o datos sensibles, migrar a autenticacion real y policies por rol.
