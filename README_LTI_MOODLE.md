# Integración Moodle LTI 1.3 — Tutor IA de Física

Esta versión mantiene el acceso independiente del Tutor IA y agrega un primer flujo LTI 1.3 para que Moodle autentique al estudiante.

## Qué permite esta versión

- Abrir el Tutor IA desde una actividad de Moodle mediante LTI 1.3.
- Recibir una identidad LTI segura del estudiante (`sub`, nombre si Moodle lo comparte, curso/contexto y rol).
- Completar automáticamente el nombre del estudiante y bloquear su edición cuando el acceso proviene de Moodle.
- Asociar los JSON de sesión al identificador LTI del usuario, no al nombre escrito manualmente.
- Recuperar desde el servidor la última sesión no finalizada asociada a ese usuario Moodle, incluso si el navegador no tiene el identificador local de la sesión.
- Mantener un campo opcional para agregar manualmente otros integrantes cuando el trabajo se realiza en equipo.
- Seguir usando el tutor normalmente fuera de Moodle.

> Importante: el identificador LTI `sub` es un identificador opaco que Moodle entrega a la herramienta. Es el dato adecuado para asociar sesiones al usuario dentro de esta integración; no conviene depender del nombre o correo como clave.

## Endpoints LTI incluidos

- Inicio OIDC: `/lti/login`
- Redirección / launch: `/lti/launch`
- JWKS público de la herramienta: `/lti/jwks`
- Identidad actual para la interfaz: `/api/lti/me`

## Variables de entorno nuevas

Además de las variables de Azure OpenAI existentes, agregar en Render:

```env
PUBLIC_BASE_URL=https://TU-SERVICIO.onrender.com
LTI_CLIENT_ID=
LTI_ISSUER=
LTI_AUTH_LOGIN_URL=
LTI_PLATFORM_JWKS_URL=
LTI_DEPLOYMENT_ID=
LTI_SESSION_SECRET=una-cadena-larga-aleatoria
```

`LTI_DEPLOYMENT_ID` puede dejarse vacío durante la primera prueba y completarse después con el dato que muestre Moodle.

### Clave de la herramienta

La app publica un JWKS válido en `/lti/jwks`. Si no se define `LTI_PRIVATE_KEY`, se genera una clave RSA al iniciar. Esto alcanza para probar el lanzamiento LTI Core, pero para una configuración estable y para futuros servicios LTI Advantage conviene fijar una clave privada permanente:

```env
LTI_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

## Campos a completar en Moodle

Cuando la aplicación esté desplegada públicamente, en la herramienta LTI 1.3 usar:

- **Nombre de la herramienta:** Tutor IA de Física
- **URL de la herramienta:** `https://TU-SERVICIO.onrender.com/`
- **Versión LTI:** LTI 1.3
- **Tipo de clave pública:** URL del conjunto de claves
- **Conjunto de claves públicas:** `https://TU-SERVICIO.onrender.com/lti/jwks`
- **Iniciar URL de inicio de sesión:** `https://TU-SERVICIO.onrender.com/lti/login`
- **URI(s) de redirección:** `https://TU-SERVICIO.onrender.com/lti/launch`

En **Privacidad**, habilitar al menos compartir el nombre del lanzador si se desea mostrar el nombre real dentro del tutor. El Tutor puede funcionar con el identificador `sub` aunque no se comparta correo.

## Datos que Moodle debe entregar luego del registro

Después de guardar/configurar la herramienta, Moodle proporciona datos de plataforma que deben copiarse a las variables de entorno del Tutor:

- Client ID → `LTI_CLIENT_ID`
- Platform ID / Issuer → `LTI_ISSUER`
- Authentication request URL → `LTI_AUTH_LOGIN_URL`
- Public keyset URL → `LTI_PLATFORM_JWKS_URL`
- Deployment ID → `LTI_DEPLOYMENT_ID` (si está disponible)

Los nombres exactos pueden variar según la versión de Moodle.

## Trabajo en equipo

En esta primera etapa, la sesión queda asociada al usuario Moodle que abre la actividad. Los demás integrantes se escriben en el campo **Otros integrantes del equipo** y aparecen en la sesión/evaluación/PDF. Una mejora posterior puede usar Names and Roles Provisioning Service (NRPS) para seleccionar compañeros directamente desde la lista de participantes del curso y vincular la misma sesión a varios identificadores Moodle.

## Persistencia

La asociación a Moodle ya existe, pero los archivos JSON continúan guardándose en la carpeta `sessions`. En un servicio Render sin disco persistente esos archivos pueden perderse al reiniciar o desplegar de nuevo. Para producción se recomienda después migrar este almacenamiento a PostgreSQL o a un Persistent Disk.
