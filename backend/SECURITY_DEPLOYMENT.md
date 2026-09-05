# Despliegue seguro de la API

Esta guía acompaña el cambio a sesiones opacas en cookies, autorización por
cuenta y conciliación de suscripciones. No copie valores de `local.settings.json`
a producción ni guarde secretos en GitHub.

## Antes de publicar

1. Haga una copia verificable de las tablas `Dealerships` y `Sessions` (si ya
   existe), y del contenedor de imágenes. Pruebe la restauración con datos no
   productivos.
2. Publique primero en un slot o entorno de prueba con una cuenta de prueba y
   ejecute registro, verificación de email, login, alta de vehículo, pago y
   webhook.
3. Espere que los usuarios vuelvan a iniciar sesión. Las sesiones anteriores no
   son un mecanismo de migración y no deben convertirse desde `localStorage` o
   tokens antiguos.

## Configuración de aplicación

En Azure App Settings use `__` para separar secciones (por ejemplo,
`Session__SameSite`); en `local.settings.json` se puede usar `:`. Guarde los
secretos como referencias de Key Vault o secretos equivalentes del entorno.

| Ajuste | Producción recomendada |
| --- | --- |
| Requisito de `FrontendUrl` | Defínalo siempre de forma explícita como un único origen HTTPS controlado, sin ruta, consulta ni fragmento. No dependa del origen de respaldo del código. |
| `Cors__AllowedOrigins` | Si se usa, debe contener exactamente los mismos orígenes adicionales que `Session__TrustedOrigins`; de lo contrario, déjelo vacío. |
| `Session__CookieDomain` | Déjelo sin configurar para emitir una cookie host-only. Configúrelo solo si existe una necesidad comprobada de compartir la cookie entre subdominios. |
| `AzureWebJobsStorage` | Cadena de Storage de producción mediante referencia de secreto; nunca `UseDevelopmentStorage=true`. |
| `Smtp__Host`, `Smtp__Port`, `Smtp__User`, `Smtp__Password` | Configuración SMTP de producción, con la contraseña almacenada como secreto. |
| `FrontendUrl` | Un único origen controlado, por ejemplo `https://app.example.com`; sin ruta, consulta ni fragmento. Se usa para enlaces de email y el retorno de Mercado Pago. |
| `Session__SecureCookies` | `true`. |
| `Session__SameSite` | `Strict` cuando frontend y API son same-site. Use `None` solo si realmente son cross-site; exige HTTPS y cookie `Secure`. |
| `Session__LifetimeMinutes` | Un valor entre 5 y 43.200; 720 (12 h) es el valor por defecto actual. Ajustarlo implica el compromiso normal entre comodidad y exposición de sesión. |
| `Session__TrustedOrigins` | Solo orígenes SPA adicionales, separados por coma o punto y coma. Deben ser orígenes HTTPS controlados y coincidir exactamente con CORS. No incluir comodines, previews públicos ni dominios históricos. |
| `PlatformAdmin__Emails` | Lista reducida de correos de inicio de sesión, separados por coma o punto y coma. No use el email público de contacto de una sucursal como identidad administrativa. |
| `MercadoPago__AccessToken` | Credencial de producción de Mercado Pago, almacenada como secreto. |
| `MercadoPago__WebhookSecret` | Secreto de firma configurado también en la notificación de Mercado Pago. Sin él, el webhook se rechaza. |
| `MercadoPago__WebhookMaxAgeSeconds` | Opcional. El valor por defecto es 300 segundos y el máximo aceptado es 86.400. Mantenerlo corto reduce replays. |

No establezca `AZURE_FUNCTIONS_ENVIRONMENT=Development` ni
`EnableDevelopmentEndpoints=true` en producción. `MercadoPago__UseSandbox`
solo tiene efecto en Development; la producción debe usar las credenciales y el
checkout reales.

El ajuste heredado `AdsAdminKey` ya no debe utilizarse para autorizar acciones
administrativas. Retírelo cuando se confirme que no lo consume ningún otro
servicio.

## CORS, cookies y origen

La configuración CORS de la plataforma Azure Functions es una barrera distinta
de las validaciones de la aplicación. En **Function App > CORS**, agregue
únicamente el valor exacto de `FrontendUrl` y cualquier origen explícito de
`Session__TrustedOrigins`; habilite soporte de credenciales. No use `*` cuando
se envían cookies y no deje `localhost` ni dominios de staging en producción.

La lista de la plataforma, la lista permitida por la aplicación y los orígenes
desde los que se entrega el SPA deben ser idénticos. Después del despliegue,
compruebe desde el navegador que un `OPTIONS` y una llamada autenticada devuelven
`Access-Control-Allow-Origin` con el origen exacto y
`Access-Control-Allow-Credentials: true`.

Prefiera servir el SPA y la API bajo el mismo sitio para conservar
`SameSite=Strict`. Si se necesita `SameSite=None`, reduzca todavía más los
orígenes: un origen permitido puede obtener el token CSRF desde la sesión y
realizar operaciones con las cookies del usuario.

El conjunto efectivo de la aplicación se forma con `FrontendUrl`,
`Session__TrustedOrigins` y, si se configura, `Cors__AllowedOrigins`. Mantenga
los tres valores y el CORS de la Function App alineados; la aplicación descarta
orígenes HTTP que no sean loopback de Development.

## Roles de plataforma

`PlatformAdmin__Emails` concede administración de anuncios y de endpoints de
datos de prueba al correo privado de inicio de sesión (`LoginEmail`) de una
cuenta raíz. Mantenga la lista fuera del repositorio, use cuentas nominativas y
revise el acceso periódicamente. El servidor consulta esa configuración en cada
operación administrativa, pero un cambio de App Settings debe ir acompañado de
un recycle o reinicio confirmado de la Function App antes de considerarlo
efectivo. Revocar además sus sesiones es una buena medida de higiene.

## Mercado Pago y webhook

Configure la URL HTTPS pública:

```text
https://<host-de-la-api>/api/subscriptions/webhook
```

El endpoint verifica `x-signature`, `x-request-id`, `data.id` y consulta el
estado en Mercado Pago antes de cambiar un plan. No implemente una regla de
redirección, proxy o WAF que elimine esos encabezados o la consulta `data.id`.
Pruebe al menos los eventos de creación, autorización, pausa y cancelación. La
cuenta que factura es siempre la cuenta raíz: las sucursales no tienen una
suscripción independiente.

Cada checkout queda reservado en la fila de la cuenta antes del `POST` al
proveedor. Si hay timeout, desconexión o 5xx, no borre ni expire esa reserva de
forma automática: el preapproval remoto podría existir. El siguiente intento se
bloqueará para evitar un doble cobro. El botón autenticado **Verificar intento
existente** busca únicamente el nonce de esa reserva, exige exactamente un
`external_reference` coincidente y vuelve a consultar el preapproval antes de
aplicarlo. Si no hay resultado o es ambiguo, la reserva queda intacta y se debe
reintentar la verificación o revisar el proveedor; nunca inicie otro checkout.
Al autorizarse un cambio de plan, la API conserva el identificador previo hasta
que Mercado Pago confirma su cancelación; supervise errores de esa operación.

Los snapshots de una misma suscripción se ordenan por el campo `version` del
proveedor. No quite esas propiedades al pasar por un proxy: una respuesta vieja
no puede restaurar un estado autorizado después de una cancelación más nueva.

### Conciliación programada

El webhook no es el único mecanismo de revocación. La función
`ReconcileAuthorizedSubscriptions` se ejecuta cada quince minutos y consulta el
preapproval canónico de cada **cuenta raíz** que sigue localmente autorizada y
tiene un `SubscriptionId`. Antes de guardar un cambio vuelve a validar la
referencia, el plan, el precio, la moneda, el período y la versión del proveedor;
una notificación perdida de cancelación por tanto no puede conservar acceso de
forma indefinida. Las cancelaciones de `SupersededSubscriptionId` también se
reintentan de manera idempotente hasta que el proveedor las confirme.

El Timer Trigger usa `AzureWebJobsStorage` para el monitor durable del horario.
En producción esa cuenta debe ser la de Storage real, accesible por la Function
App y monitoreada: configure alertas para fallos de
`ReconcileAuthorizedSubscriptions`, ejecuciones atrasadas y resultados con
`rechazadas` distintos de cero. No deshabilite ese timer al rotar secretos o
modificar la configuración de webhooks; compruebe tras cada despliegue que la
función aparece habilitada y registra una ejecución satisfactoria.

## Migración de filas existentes

Las filas antiguas siguen funcionando temporalmente: `OwnerAccountId` vacío se
interpreta como cuenta raíz y `LoginEmail` vacío usa `Email` como compatibilidad.
Conviene materializarlos antes o inmediatamente después del despliegue para no
depender de esas reglas:

1. Para cada cuenta raíz confirmada, establezca `OwnerAccountId = RowKey` y
   `LoginEmail = Email` actual, después de validar que ese email es realmente el
   de acceso.
2. Para cada sucursal conocida, establezca `OwnerAccountId` con el `RowKey` de
   su cuenta raíz. No infiera esa relación por nombre, ciudad o email público;
   revísela con el dueño de la cuenta.
3. No copie `PasswordHash`, `PasswordSalt`, tokens de recuperación ni
   `LoginEmail` a una sucursal. Su `Email` sigue siendo información pública de
   contacto.
4. Aplique cambios con control de concurrencia/ETag, conserve la copia previa y
   audite que solo las cuentas raíz tengan credenciales. Luego pruebe login,
   recuperación y listado de sucursales de cada cuenta migrada.
5. Identifique filas heredadas con `SubscriptionId` y estado `pending` o
   `paused`. La API bloquea un checkout nuevo para esas filas hasta conciliar o
   cancelar el preapproval existente, evitando dos autorizaciones recurrentes.

## Rotación y operación continua

Rote de forma prioritaria los secretos que hayan estado en equipos locales,
conversaciones, logs, perfiles de publicación o configuraciones compartidas:
Mercado Pago (token y secreto de webhook), SMTP, cadena de Storage si se expuso,
y el perfil de publicación/secretos de GitHub. Actualice primero el almacén de
secretos y luego la configuración de la Function App; valide el webhook y el
envío de correo tras cada rotación. Nunca escriba el valor rotado en un issue,
commit, captura de pantalla o log.

Monitoree rechazos de autenticación, errores de firma de webhook, fallos de
Storage y fallos de correo sin registrar cookies, contraseñas, tokens ni cuerpos
sensibles. Configure alertas para esos patrones y para cambios de CORS o de los
administradores.

## Límites que siguen requiriendo operación

- La API no sustituye controles perimetrales contra abuso: añada rate limiting,
  WAF/Front Door o protección equivalente para login, registro, recuperación de
  contraseña y webhook.
- Los datos antiguos no se corrigen solos. La migración de propiedad y el
  inventario de URLs/imágenes existentes necesitan una revisión operativa.
- CORS no es autenticación ni autorización. Un origen permitido debe ser un
  activo que controle el equipo; revisar esa lista es parte de cada despliegue.
