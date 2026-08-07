# Tutor IA de Física — soporte de imágenes

Esta versión permite iniciar una tutoría de tres formas:

1. Solo texto.
2. Texto + imagen.
3. Solo una captura que contenga el enunciado completo y la figura.

## Uso por el estudiante

En la sección **Imagen o captura del ejercicio** puede:

- pegar una captura con `Ctrl+V`;
- arrastrar una imagen;
- seleccionar un archivo PNG, JPG/JPEG o WEBP.

La captura queda visible durante toda la sesión. El navegador la redimensiona antes de enviarla para reducir el tamaño de la solicitud.

## Funcionamiento con IA

El backend envía el texto y la imagen juntos a Azure OpenAI mediante contenido multimodal. Por lo tanto, el deployment configurado en `AZURE_OPENAI_DEPLOYMENT` debe admitir entrada de imágenes.

Si el ejercicio se carga únicamente como imagen, el tutor recibe la instrucción de leer tanto el texto visible como diagramas, datos, ángulos, gráficos, tablas y demás información visual.

## Exportación y guardado

- La imagen se incluye en el PDF exportado debajo del enunciado.
- La imagen se guarda junto con la sesión JSON.
- La evaluación final también recibe la imagen para interpretar correctamente el ejercicio.

## Cambio de tamaño de solicitudes

El límite JSON del servidor se aumentó de 1 MB a 12 MB. En el navegador la imagen se optimiza a un máximo de 1800 px por lado y se convierte a JPEG de alta calidad antes de enviarla.
