# Informe de Auditoría de Código Seguro

Fecha: 2026-03-05  
Repositorio: `axellab/juice-shop`

## Resumen ejecutivo

Se realizó una revisión de seguridad del código fuente con enfoque **security-first** y trazabilidad contra **OWASP Top 10/ASVS**, **NIST SSDF (PS.1, PW.4, PW.6, RV.1, RV.3)** y **COBIT (EDM03, APO13, BAI03, DSS05)**.

Resultado: se identificaron vulnerabilidades de **alta criticidad** que permiten inyección SQL, exposición de datos y ejecución de código en navegador. La prioridad inmediata es remediar hallazgos **P1/P2**.

---

## Lista priorizada de vulnerabilidades

1. **P1 (Crítica): Inyección SQL en login**
2. **P1 (Crítica): Inyección SQL en búsqueda de productos**
3. **P2 (Alta): SSRF en carga de imagen por URL**
4. **P2 (Alta): XSS en frontend por `bypassSecurityTrustHtml` + `innerHTML`**
5. **P2 (Alta): XXE/DoS por parser XML con expansión de entidades**
6. **P3 (Media): Uso de hash MD5 para contraseñas**
7. **P3 (Media): Secretos/llaves versionadas o hardcodeadas**

---

### [Inyección SQL en login]

**Severidad:**  
Crítica (P1)

**Descripción:**  
La autenticación construye SQL con interpolación directa de `email` y `password` desde el request.

**Líneas afectadas:**  
`/home/runner/work/juice-shop/juice-shop/routes/login.ts:34`

**Riesgo asociado:**  
Bypass de autenticación y acceso no autorizado a cuentas.

**Estándares afectados:**  
OWASP A03:2021 Injection, OWASP ASVS V5 (Validation), NIST SSDF PW.4/PW.6, COBIT DSS05/BAI03.

**Evidencia:**
```ts
models.sequelize.query(`SELECT * FROM Users WHERE email = '${req.body.email || ''}' AND password = '${security.hash(req.body.password || '')}' AND deletedAt IS NULL`, { model: UserModel, plain: true })
```

**Remediación recomendada:**  
Usar consultas parametrizadas (`replacements`) y validación estricta de entrada.

**Código seguro sugerido:**
```ts
await models.sequelize.query(
  'SELECT * FROM Users WHERE email = :email AND password = :password AND deletedAt IS NULL',
  {
    replacements: {
      email: req.body.email ?? '',
      password: security.hash(req.body.password ?? '')
    },
    model: UserModel,
    plain: true
  }
)
```

---

### [Inyección SQL en búsqueda de productos]

**Severidad:**  
Crítica (P1)

**Descripción:**  
El parámetro `q` se concatena en sentencia SQL con `LIKE`, permitiendo manipulación de la consulta.

**Líneas afectadas:**  
`/home/runner/work/juice-shop/juice-shop/routes/search.ts:23`

**Riesgo asociado:**  
Exfiltración de información y enumeración de esquema/base de datos.

**Estándares afectados:**  
OWASP A03:2021 Injection, OWASP ASVS V5, NIST SSDF PW.4/PW.6, COBIT DSS05.

**Evidencia:**
```ts
models.sequelize.query(`SELECT * FROM Products WHERE ((name LIKE '%${criteria}%' OR description LIKE '%${criteria}%') AND deletedAt IS NULL) ORDER BY name`)
```

**Remediación recomendada:**  
Parametrizar `q`, escapar comodines SQL (`%`, `_`) y mantener longitud máxima validada.

**Código seguro sugerido:**
```ts
const q = `%${String(criteria).replace(/[%_]/g, '\\$&')}%`
await models.sequelize.query(
  `SELECT * FROM Products
   WHERE ((name LIKE :q ESCAPE '\\' OR description LIKE :q ESCAPE '\\')
   AND deletedAt IS NULL)
   ORDER BY name`,
  { replacements: { q } }
)
```

---

### [SSRF en carga de imagen por URL]

**Severidad:**  
Alta (P2)

**Descripción:**  
El backend realiza `fetch` a una URL controlada por usuario sin restricciones robustas.

**Líneas afectadas:**  
`/home/runner/work/juice-shop/juice-shop/routes/profileImageUrlUpload.ts:19-25`

**Riesgo asociado:**  
Acceso a recursos internos (metadata cloud, servicios internos), pivot lateral.

**Estándares afectados:**  
OWASP A10:2021 SSRF, OWASP API Security, NIST SSDF PW.6/RV.1, COBIT DSS05.

**Evidencia:**
```ts
const url = req.body.imageUrl
const response = await fetch(url)
```

**Remediación recomendada:**  
Implementar allowlist de hosts, forzar `https`, bloquear IP privadas/loopback/link-local tras resolución DNS y aplicar timeouts.

**Código seguro sugerido:**
```ts
const u = new URL(req.body.imageUrl)
if (u.protocol !== 'https:') throw new Error('Only https URLs are allowed')
if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error('Host not allowed')
```

---

### [XSS por uso de bypassSecurityTrustHtml con parámetro de URL]

**Severidad:**  
Alta (P2)

**Descripción:**  
Se marca como confiable contenido proveniente de `queryParams` y se renderiza con `innerHTML`.

**Líneas afectadas:**  
`/home/runner/work/juice-shop/juice-shop/frontend/src/app/search-result/search-result.component.ts:159`  
`/home/runner/work/juice-shop/juice-shop/frontend/src/app/search-result/search-result.component.html:13`

**Riesgo asociado:**  
Ejecución de script en navegador y secuestro de sesión/acciones de usuario.

**Estándares afectados:**  
OWASP A03:2021 Injection (XSS), OWASP ASVS V5, NIST SSDF PW.6/RV.1, COBIT APO13.

**Evidencia:**
```ts
this.searchValue = this.sanitizer.bypassSecurityTrustHtml(queryParam)
```
```html
<span id="searchValue" [innerHTML]="searchValue"></span>
```

**Remediación recomendada:**  
Renderizar como texto plano (`{{ }}`), no usar `bypassSecurityTrustHtml` con input no confiable.

**Código seguro sugerido:**
```ts
this.searchValue = queryParam
```
```html
<span id="searchValue">{{ searchValue }}</span>
```

---

### [XXE/DoS por parser XML inseguro]

**Severidad:**  
Alta (P2)

**Descripción:**  
Se parsea XML con `noent: true` habilitando expansión de entidades.

**Líneas afectadas:**  
`/home/runner/work/juice-shop/juice-shop/routes/fileUpload.ts:83`

**Riesgo asociado:**  
DoS por entity expansion y potencial lectura de recursos locales según parser/configuración.

**Estándares afectados:**  
OWASP A05:2021 Security Misconfiguration, OWASP XXE Prevention Cheat Sheet, NIST SSDF PW.6, COBIT DSS05.

**Evidencia:**
```ts
libxml.parseXml(data, { noblanks: true, noent: true, nocdata: true })
```

**Remediación recomendada:**  
Deshabilitar expansión de entidades, limitar tamaño/profundidad del XML y validar esquema.

**Código seguro sugerido:**
```ts
libxml.parseXml(data, { noblanks: true, noent: false, nocdata: true })
```

---

### [Hash criptográfico débil (MD5) en contraseñas]

**Severidad:**  
Media (P3)

**Descripción:**  
Se emplea MD5 para hashing de contraseñas, algoritmo rápido y obsoleto.

**Líneas afectadas:**  
`/home/runner/work/juice-shop/juice-shop/lib/insecurity.ts:43`  
`/home/runner/work/juice-shop/juice-shop/models/user.ts:77`

**Riesgo asociado:**  
Crack offline acelerado ante fuga de base de datos.

**Estándares afectados:**  
OWASP A02:2021 Cryptographic Failures, OWASP Password Storage Cheat Sheet, NIST SSDF PW.4/RV.3, COBIT APO13.

**Evidencia:**
```ts
crypto.createHash('md5')
```

**Remediación recomendada:**  
Migrar a Argon2id o bcrypt con costo adecuado y estrategia de rehash progresivo.

**Código seguro sugerido:**
```ts
const hash = await bcrypt.hash(clearTextPassword, 12)
```

---

### [Secretos hardcodeados/versionados]

**Severidad:**  
Media (P3)

**Descripción:**  
Existen llaves/secretos embebidos o versionados en el repositorio.

**Líneas afectadas:**  
`/home/runner/work/juice-shop/juice-shop/lib/insecurity.ts:23`  
`/home/runner/work/juice-shop/juice-shop/ctf.key:1`  
`/home/runner/work/juice-shop/juice-shop/lib/utils.ts:83`

**Riesgo asociado:**  
Compromiso de tokens/firmas y mayor impacto ante filtración de código.

**Estándares afectados:**  
OWASP A02/A05, NIST SSDF PS.1/PW.4, COBIT APO13/DSS05.

**Evidencia:**  
Llave privada y archivo de clave en repositorio.

**Remediación recomendada:**  
Mover secretos a variables de entorno o gestor de secretos (Vault/KMS), rotar claves, activar secret scanning en CI.

**Código seguro sugerido:**
```ts
const privateKey = process.env.JWT_PRIVATE_KEY
if (!privateKey) throw new Error('Missing JWT private key')
```

---

## Recomendaciones inmediatas (quick wins)

1. Parametrizar consultas SQL de login y búsqueda (P1).
2. Eliminar `bypassSecurityTrustHtml` en datos no confiables (P2).
3. Aplicar mitigación SSRF por allowlist + validación de red (P2).
4. Desactivar expansión de entidades XML y limitar payloads (P2).
5. Iniciar plan de migración de MD5 a Argon2id/bcrypt (P3).
6. Retirar y rotar secretos versionados, con controles de CI (P3).

## Roadmap de remediación

### 0-30 días
- Corregir todos los hallazgos P1/P2.
- Agregar pruebas de seguridad para SQLi/XSS/SSRF.
- Activar controles de CI para bloquear regresiones críticas.

### 31-60 días
- Completar migración de hashing de contraseñas.
- Estandarizar validación de entrada por esquema.
- Endurecer configuración de cookies, CORS y cabeceras.

### 61-90 días
- Integrar SAST/SCA/DAST continuo con gates por severidad.
- Trazar matriz formal de cumplimiento OWASP ASVS L2 + NIST SSDF + COBIT.
- Definir proceso de gestión de vulnerabilidades con SLA por severidad.
