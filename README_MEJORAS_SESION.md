# Mejoras de sesión - versión 2

Esta versión incorpora:

- Calificación global y UTEC en el encabezado del PDF.
- Fecha, hora de comienzo y hora de finalización de la sesión en el PDF.
- Guardado automático del borrador en IndexedDB del navegador.
- Botones para recuperar o descartar una sesión no finalizada al volver a abrir el tutor.
- Botón "Guardar sesión" corregido para actualizar el mismo archivo de sesión en el servidor en lugar de crear una copia nueva cada vez.
- El guardado conserva imagen del ejercicio, historial, evaluación y tiempos de sesión.

## Importante sobre producción

El guardado local permite recuperar una sesión en el mismo navegador/equipo. El guardado actual del servidor escribe archivos JSON en `/sessions`; en servicios con disco efímero (por ejemplo ciertos despliegues en Render) esto no debe considerarse almacenamiento permanente. Para recuperación entre equipos, integración con Moodle y trazabilidad institucional conviene una base de datos persistente.

## Moodle

No se incluyó todavía autenticación Moodle. La integración recomendada es LTI 1.3 para que Moodle lance el Tutor IA y entregue identidad/contexto de curso de forma segura. El trabajo en equipo debe modelarse explícitamente (identidad individual + identificador/nombres de integrantes del equipo) y definirse antes de automatizar la calificación o devolución a Moodle.


## Corrección v2.1: recuperación real de sesiones
- Se corrigió un error por el cual la comprobación de borradores no se ejecutaba al cargar la página.
- El tutor ahora hace guardado automático local (IndexedDB) y una copia automática en `/sessions` una vez iniciada la conversación.
- El identificador de la sesión activa se conserva en `localStorage`.
- Al volver a abrir el tutor, `Recuperar sesión` busca primero el borrador local y, si no existe, intenta recuperar la copia del servidor.
- `Guardar sesión` fuerza inmediatamente ambos guardados.

En Render, la carpeta local del servidor puede ser efímera según la configuración del servicio. Para persistencia institucional y recuperación entre dispositivos se recomienda una base de datos o almacenamiento persistente, idealmente ligado a la identidad Moodle/LTI.
