# Kids on Going · Landings dinámicas de Google Ads (Search)

Landing de admisiones de Kids on Going (guardería y kínder bilingüe en Granjas Palo Alto, Cuajimalpa). Sitio estático: HTML + CSS + JS en línea, sin dependencias ni build.

## Versiones (una por grupo de anuncios)

| Grupo de anuncios | Ruta |
| :--- | :--- |
| General (se adapta sola por palabra clave) | `/` |
| Guarderías cerca de mí | `/guarderia-cerca-de-mi/` |
| Kínder cerca de mí | `/kinder-cerca-de-mi/` |
| Kínder bilingüe | `/kinder-bilingue/` |
| Guardería bilingüe | `/guarderia-bilingue/` |
| Maternal / estimulación temprana cerca de mí | `/maternal-cerca-de-mi/` |

Cada página cambia titular, subtítulo, orden de secciones y preguntas frecuentes según la palabra clave del anuncio:

- `?v=<variante>` fuerza una versión (`general`, `guarderia-cerca`, `kinder-cerca`, `kinder-bilingue`, `guarderia-bilingue`, `maternal`).
- `?kw={keyword}` (o `utm_term`) la infiere de la palabra clave y detecta la zona (Santa Fe, Bosques, Cuajimalpa, Interlomas…).

Plantilla de seguimiento sugerida para Google Ads:

```
{lpurl}?kw={keyword}&utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}
```

## Notas

- Este repositorio contiene solo la versión compilada. La fuente y el motor de compilación viven en el módulo 02_Web_Dev de la agencia; los cambios se hacen allá y se vuelven a publicar aquí.
- `ghl/` contiene los fragmentos para pegar en GoHighLevel (elemento "Código personalizado").
- `.htaccess` controla la caché si se publica en Hostinger/Apache; GitHub Pages lo ignora.
