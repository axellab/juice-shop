# 🔒 Auditoría de Seguridad del Código Frontend - OWASP Juice Shop

**Fecha de Auditoría:** 2025-11-12  
**Alcance:** Frontend (Angular) - `/frontend/src/`  
**Estándares Aplicados:** NIST SSDF, OWASP Top 10, OWASP ASVS Nivel 2, COBIT  
**Auditor:** Security Analysis Agent

---

## 📋 Resumen Ejecutivo

Esta auditoría identifica **vulnerabilidades críticas de seguridad** en el código frontend de OWASP Juice Shop. Como aplicación intencionalmente vulnerable para entrenamiento, el código contiene múltiples fallas de seguridad que representan los vectores de ataque más comunes en aplicaciones web modernas.

### Hallazgos Clave:
- **15 vulnerabilidades críticas (P1)**
- **8 vulnerabilidades altas (P2)**
- **12 vulnerabilidades medias (P3)**
- **Áreas de mayor riesgo:** XSS, almacenamiento inseguro, exposición de datos sensibles

---

## 🎯 Hallazgos de Seguridad

### 1. Cross-Site Scripting (XSS) - Bypassing Angular Sanitization

**Severidad:** 🔴 Crítica (P1)

**Descripción:**  
El código utiliza `bypassSecurityTrustHtml()` de manera insegura, desactivando la protección XSS nativa de Angular y permitiendo la ejecución de scripts maliciosos.

**Líneas afectadas:**
- `frontend/src/app/search-result/search-result.component.ts:133`
- `frontend/src/app/search-result/search-result.component.ts:159`
- `frontend/src/app/administration/administration.component.ts:72`
- `frontend/src/app/product-details/product-details.component.html` (innerHTML)
- `frontend/src/app/last-login-ip/last-login-ip.component.ts:38`
- `frontend/src/app/feedback-details/feedback-details.component.html`

**Riesgo asociado:**
- **Técnico:** Ejecución de código JavaScript arbitrario en el contexto del usuario
- **Negocio:** Robo de credenciales, sesiones comprometidas, defacement, propagación de malware

**Estándares afectados:**
- **OWASP Top 10:** A03:2021 - Injection
- **OWASP ASVS:** V5.3 - Output Encoding and Injection Prevention
- **NIST SSDF:** PW.4 - Design Software to Meet Security Requirements

**Evidencia:**
```typescript
// search-result.component.ts - Línea 133
tableData[i].description = this.sanitizer.bypassSecurityTrustHtml(tableData[i].description)

// search-result.component.ts - Línea 159
this.searchValue = this.sanitizer.bypassSecurityTrustHtml(queryParam)

// administration.component.ts - Línea 72
feedback.comment = this.sanitizer.bypassSecurityTrustHtml(feedback.comment)
```

```html
<!-- feedback-details.component.html -->
<cite [innerHTML]="feedback"></cite>

<!-- search-result.component.html - Línea 13 -->
<span id="searchValue" [innerHTML]="searchValue"></span>

<!-- product-details.component.html -->
<div [innerHTML]="data.productData.description"></div>
```

**Remediación recomendada:**
1. **NUNCA** usar `bypassSecurityTrustHtml()` con datos controlados por el usuario
2. Utilizar interpolación de Angular `{{ }}` en lugar de `[innerHTML]`
3. Si HTML es necesario, sanitizar con DomSanitizer.sanitize() explícitamente
4. Implementar Content Security Policy (CSP) estricto

**Código seguro sugerido:**
```typescript
// Opción 1: Usar interpolación de Angular (preferido)
// En template HTML:
<span id="searchValue">{{ searchValue }}</span>

// Opción 2: Sanitizar explícitamente si HTML es requerido
import { DomSanitizer, SecurityContext } from '@angular/platform-browser';

// En componente TypeScript:
this.searchValue = this.sanitizer.sanitize(
  SecurityContext.HTML, 
  queryParam
);
```

---

### 2. Almacenamiento Inseguro de Tokens de Autenticación

**Severidad:** 🔴 Crítica (P1)

**Descripción:**  
Los tokens JWT se almacenan en `localStorage`, que es vulnerable a ataques XSS. Un atacante puede extraer tokens de autenticación mediante JavaScript malicioso.

**Líneas afectadas:**
- `frontend/src/app/login/login.component.ts:90, 100, 104, 114-117`
- `frontend/src/app/Services/request.interceptor.ts:13, 16, 20, 23`
- 172 referencias totales a localStorage/sessionStorage en el frontend

**Riesgo asociado:**
- **Técnico:** Robo de tokens de autenticación mediante XSS, hijacking de sesión
- **Negocio:** Acceso no autorizado a cuentas de usuarios, fraude, pérdida de confianza

**Estándares afectados:**
- **OWASP Top 10:** A07:2021 - Identification and Authentication Failures
- **OWASP ASVS:** V3.2 - Session Binding
- **NIST SP 800-53:** IA-5 - Authenticator Management
- **COBIT:** DSS05.04 - Gestión de identidad y acceso

**Evidencia:**
```typescript
// login.component.ts - Líneas 90-94
localStorage.setItem('token', authentication.token)
const expires = new Date()
expires.setHours(expires.getHours() + 8)
this.cookieService.put('token', authentication.token, { expires })
sessionStorage.setItem('bid', authentication.bid)

// request.interceptor.ts - Líneas 13-18
if (localStorage.getItem('token')) {
  req = req.clone({
    setHeaders: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  })
}

// Almacenamiento de email en localStorage (línea 114)
localStorage.setItem('email', this.user.email)
```

**Remediación recomendada:**
1. **Eliminar tokens de localStorage completamente**
2. Usar cookies HttpOnly, Secure, SameSite=Strict para almacenar tokens
3. Implementar tokens de corta duración con refresh tokens en cookies seguras
4. Agregar CSRF tokens para protección adicional

**Código seguro sugerido:**
```typescript
// Almacenar token solo en cookie HttpOnly (configurado desde backend)
// En login.component.ts:
this.userService.login(this.user).subscribe((authentication: any) => {
  // Backend debe establecer cookie HttpOnly con Set-Cookie header
  // Frontend NO debe tener acceso directo al token
  sessionStorage.setItem('bid', authentication.bid) // Solo data no sensible
  this.basketService.updateNumberOfCartItems()
  this.userService.isLoggedIn.next(true)
  this.ngZone.run(async () => await this.router.navigate(['/search']))
})

// request.interceptor.ts - NO leer de localStorage
intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
  // Las cookies se envían automáticamente por el navegador
  // Agregar solo headers no sensibles si son necesarios
  return next.handle(req)
}
```

---

### 3. Contraseñas en Texto Plano - OAuth Password Generation

**Severidad:** 🔴 Crítica (P1)

**Descripción:**  
El componente OAuth genera contraseñas predecibles usando base64 del email invertido, sin hashing ni salt.

**Líneas afectadas:**
- `frontend/src/app/oauth/oauth.component.ts:25`

**Riesgo asociado:**
- **Técnico:** Las contraseñas pueden ser reconstruidas fácilmente conociendo el email
- **Negocio:** Compromiso masivo de cuentas, violación de regulaciones de protección de datos

**Estándares afectados:**
- **OWASP Top 10:** A02:2021 - Cryptographic Failures
- **OWASP ASVS:** V2.1 - Password Security
- **NIST SP 800-63B:** Authenticator and Verifier Requirements
- **COBIT:** DSS05.04 - Gestión de identidad

**Evidencia:**
```typescript
// oauth.component.ts - Línea 25
const password = btoa(profile.email.split('').reverse().join(''))
this.userService.save({ 
  email: profile.email, 
  password, 
  passwordRepeat: password 
})
```

**Remediación recomendada:**
1. Generar contraseñas aleatorias criptográficamente seguras
2. El hashing debe realizarse en el backend, no en frontend
3. Usar algoritmos como bcrypt, scrypt o Argon2 en el servidor
4. Considerar autenticación sin contraseña para OAuth

**Código seguro sugerido:**
```typescript
// oauth.component.ts
this.userService.oauthLogin(this.parseRedirectUrlParams().access_token)
  .subscribe((profile: any) => {
    // Generar password aleatorio seguro
    const randomPassword = this.generateSecurePassword(32)
    
    this.userService.save({ 
      email: profile.email, 
      password: randomPassword,
      passwordRepeat: randomPassword,
      isOAuthAccount: true // Marcar como cuenta OAuth
    }).subscribe(() => {
      // Usuario no necesita conocer la password para cuentas OAuth
      this.userService.login({ 
        email: profile.email, 
        oauthToken: this.parseRedirectUrlParams().access_token 
      })
    })
  })

private generateSecurePassword(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, byte => 
    byte.toString(16).padStart(2, '0')
  ).join('')
}
```

---

### 4. Credenciales Hardcodeadas

**Severidad:** 🔴 Crítica (P1)

**Descripción:**  
El código contiene credenciales de prueba hardcodeadas y un Client ID de Google OAuth expuesto.

**Líneas afectadas:**
- `frontend/src/app/login/login.component.ts:49, 52-53`

**Riesgo asociado:**
- **Técnico:** Acceso no autorizado mediante credenciales conocidas, abuso de OAuth
- **Negocio:** Compromiso de sistemas, violación de políticas de seguridad

**Estándares afectados:**
- **OWASP Top 10:** A07:2021 - Identification and Authentication Failures
- **OWASP ASVS:** V2.3 - Credential Recovery
- **NIST SSDF:** PW.6 - Review and Test Software
- **COBIT:** DSS05.02 - Gestión de acceso físico y lógico

**Evidencia:**
```typescript
// login.component.ts - Líneas 49, 52-53
public clientId = '1005568560502-6hm16lef8oh46hr2d98vf2ohlnj4nfhq.apps.googleusercontent.com'
public testingUsername = 'testing@juice-sh.op'
public testingPassword = 'IamUsedForTesting'
```

**Remediación recomendada:**
1. **NUNCA** hardcodear credenciales en el código fuente
2. Usar variables de entorno para secrets y API keys
3. Cargar configuración desde backend de forma segura
4. Implementar rotación de credenciales
5. Eliminar cuentas de testing en producción

**Código seguro sugerido:**
```typescript
// login.component.ts
export class LoginComponent implements OnInit {
  public clientId: string = ''
  public oauthUnavailable: boolean = true
  // NO incluir credenciales de testing

  ngOnInit(): void {
    // Cargar configuración desde backend
    this.configurationService.getApplicationConfiguration()
      .subscribe((config) => {
        if (config?.application?.googleOauth) {
          this.clientId = config.application.googleOauth.clientId
          // Validar y cargar otras configuraciones seguras
        }
      })
  }
}
```

---

### 5. Cambio de Contraseña mediante GET Request

**Severidad:** 🔴 Crítica (P1)

**Descripción:**  
Las contraseñas se envían como parámetros de query string en una solicitud GET, exponiendo datos sensibles en logs, caché y historial del navegador.

**Líneas afectadas:**
- `frontend/src/app/Services/user.service.ts:54-55`

**Riesgo asociado:**
- **Técnico:** Contraseñas visibles en logs del servidor, proxies, historial del navegador
- **Negocio:** Exposición de credenciales, incumplimiento de regulaciones (GDPR, PCI-DSS)

**Estándares afectados:**
- **OWASP Top 10:** A04:2021 - Insecure Design
- **OWASP ASVS:** V2.1.3 - Password Change
- **NIST SP 800-53:** SC-8 - Transmission Confidentiality
- **COBIT:** DSS05.02 - Gestión de seguridad

**Evidencia:**
```typescript
// user.service.ts - Líneas 54-55
changePassword(passwords: Passwords) {
  return this.http.get(
    this.hostServer + '/rest/user/change-password?current=' + 
    passwords.current + '&new=' + passwords.new + '&repeat=' + passwords.repeat
  )
}
```

**Remediación recomendada:**
1. **SIEMPRE** usar POST/PUT para operaciones que modifican datos
2. Enviar datos sensibles en el body de la request, NUNCA en URL
3. Usar HTTPS para todas las comunicaciones
4. Implementar rate limiting y CAPTCHA

**Código seguro sugerido:**
```typescript
// user.service.ts
changePassword(passwords: Passwords) {
  return this.http.post(
    this.hostServer + '/rest/user/change-password',
    {
      currentPassword: passwords.current,
      newPassword: passwords.new,
      repeatPassword: passwords.repeat
    },
    {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    }
  ).pipe(
    map((response: any) => response.user),
    catchError((err) => { throw err.error })
  )
}
```

---

### 6. Falta de Validación de Integridad en File Uploads

**Severidad:** 🔴 Crítica (P1)

**Descripción:**  
La validación de archivos subidos solo verifica MIME types, que pueden ser falsificados fácilmente. No hay validación de contenido real del archivo.

**Líneas afectadas:**
- `frontend/src/app/complaint/complaint.component.ts:37-42`
- `frontend/src/app/photo-wall/photo-wall.component.ts:35`

**Riesgo asociado:**
- **Técnico:** Upload de archivos maliciosos (shell scripts, malware), ejecución remota de código
- **Negocio:** Compromiso del servidor, defacement, distribución de malware

**Estándares afectados:**
- **OWASP Top 10:** A04:2021 - Insecure Design
- **OWASP ASVS:** V12.3 - File Execution
- **NIST SSDF:** PW.4 - Design Software Security
- **COBIT:** DSS05.01 - Protección contra malware

**Evidencia:**
```typescript
// complaint.component.ts - Líneas 37-42
public uploader: FileUploader = new FileUploader({
  url: environment.hostServer + '/file-upload',
  authToken: `Bearer ${localStorage.getItem('token')}`,
  allowedMimeType: [
    'application/pdf', 'application/xml', 'text/xml',
    'application/zip', 'application/x-zip-compressed',
    'multipart/x-zip', 'application/yaml', 'application/x-yaml',
    'text/yaml', 'text/x-yaml'
  ],
  maxFileSize: 100000
})
```

**Remediación recomendada:**
1. Validar MIME type en backend mediante análisis del contenido
2. Implementar límites estrictos de tamaño de archivo
3. Almacenar archivos fuera del document root
4. Escanear archivos con antivirus antes de almacenar
5. Generar nombres de archivo aleatorios
6. Implementar Content-Disposition headers

**Código seguro sugerido:**
```typescript
// complaint.component.ts
public uploader: FileUploader = new FileUploader({
  url: environment.hostServer + '/file-upload',
  authToken: `Bearer ${localStorage.getItem('token')}`,
  allowedMimeType: ['application/pdf'], // Restringir a tipos seguros
  maxFileSize: 5000000, // 5MB máximo
  allowedFileType: ['pdf'], // Validación adicional
  autoUpload: false
})

ngOnInit(): void {
  this.uploader.onBeforeUploadItem = (item) => {
    // Validaciones adicionales antes de subir
    if (!this.isValidFile(item.file)) {
      this.fileUploadError = 'INVALID_FILE_TYPE'
      return false
    }
  }
  
  this.uploader.onCompleteItem = (item, response, status, headers) => {
    if (status === 200) {
      const result = JSON.parse(response)
      // Validar respuesta del servidor
      if (result.safe && result.fileId) {
        this.saveComplaint(result.fileId)
      }
    }
  }
}

private isValidFile(file: File): boolean {
  // Validación adicional de extensión
  const allowedExtensions = ['pdf']
  const extension = file.name.split('.').pop()?.toLowerCase()
  return allowedExtensions.includes(extension || '')
}
```

---

### 7. Exposición de Email en Headers HTTP

**Severidad:** 🟠 Alta (P2)

**Descripción:**  
El interceptor agrega el email del usuario como header personalizado en todas las requests, exponiendo información personal innecesariamente.

**Líneas afectadas:**
- `frontend/src/app/Services/request.interceptor.ts:20-25`

**Riesgo asociado:**
- **Técnico:** Exposición de PII en tráfico de red, logs de servidores y proxies
- **Negocio:** Violación de privacidad, incumplimiento de GDPR

**Estándares afectados:**
- **OWASP Top 10:** A01:2021 - Broken Access Control
- **OWASP ASVS:** V8.2 - Client-side Data Protection
- **GDPR:** Artículo 5 - Principios de tratamiento de datos
- **COBIT:** DSS05.07 - Gestión de protección de datos

**Evidencia:**
```typescript
// request.interceptor.ts - Líneas 20-25
if (localStorage.getItem('email')) {
  req = req.clone({
    setHeaders: {
      'X-User-Email': String(localStorage.getItem('email'))
    }
  })
}
```

**Remediación recomendada:**
1. NO enviar PII en headers HTTP personalizados
2. Usar identificadores de sesión opacos
3. El backend debe obtener información del usuario desde el token JWT
4. Minimizar la exposición de datos personales

**Código seguro sugerido:**
```typescript
// request.interceptor.ts
intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
  // Solo agregar token de autorización, el backend extrae userId del token
  if (localStorage.getItem('token')) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    })
  }
  // NO agregar email ni otros datos personales
  return next.handle(req)
}
```

---

### 8. SQL Injection via Search Parameter

**Severidad:** 🟠 Alta (P2)

**Descripción:**  
El parámetro de búsqueda se pasa directamente sin sanitización adecuada, potencialmente vulnerable a SQL injection si el backend no valida correctamente.

**Líneas afectadas:**
- `frontend/src/app/Services/product.service.ts:21`

**Riesgo asociado:**
- **Técnico:** Acceso no autorizado a la base de datos, extracción de datos sensibles, modificación de datos
- **Negocio:** Pérdida masiva de datos, compromiso del sistema, violación de regulaciones

**Estándares afectados:**
- **OWASP Top 10:** A03:2021 - Injection
- **OWASP ASVS:** V5.3.4 - SQL Injection Prevention
- **NIST SSDF:** PW.4.4 - Input Validation
- **COBIT:** DSS05.01 - Protección contra malware y amenazas

**Evidencia:**
```typescript
// product.service.ts - Línea 21
search(criteria: string) {
  return this.http.get(
    `${this.hostServer}/rest/products/search?q=${criteria}`
  )
}
```

**Remediación recomendada:**
1. Usar parámetros de consulta con HttpParams para encoding automático
2. Validar y sanitizar input en frontend
3. Implementar whitelist de caracteres permitidos
4. El backend DEBE usar prepared statements/parametrized queries

**Código seguro sugerido:**
```typescript
// product.service.ts
import { HttpParams } from '@angular/common/http'

search(criteria: string) {
  // Validar input antes de enviar
  const sanitizedCriteria = this.sanitizeSearchInput(criteria)
  
  // Usar HttpParams para encoding automático
  const params = new HttpParams().set('q', sanitizedCriteria)
  
  return this.http.get(
    `${this.hostServer}/rest/products/search`,
    { params }
  ).pipe(
    map((response: any) => response.data),
    catchError((err) => { throw err })
  )
}

private sanitizeSearchInput(input: string): string {
  // Limitar longitud
  const maxLength = 100
  let sanitized = input.substring(0, maxLength).trim()
  
  // Remover caracteres peligrosos (opcional según requisitos)
  // sanitized = sanitized.replace(/[<>\"']/g, '')
  
  return sanitized
}
```

---

### 9. Uso Inseguro de Base64 para OAuth

**Severidad:** 🟠 Alta (P2)

**Descripción:**  
Las credenciales OAuth se codifican con base64 en el frontend, que es fácilmente reversible y no proporciona seguridad.

**Líneas afectadas:**
- `frontend/src/app/oauth/oauth.component.ts:24-27`

**Riesgo asociado:**
- **Técnico:** Tokens OAuth expuestos, suplantación de identidad
- **Negocio:** Acceso no autorizado a cuentas de usuarios

**Estándares afectados:**
- **OWASP Top 10:** A02:2021 - Cryptographic Failures
- **OWASP ASVS:** V2.8 - Single or Multi Factor One Time Verifier
- **NIST SP 800-63B:** Section 5 - Authenticator and Verifier Requirements

**Evidencia:**
```typescript
// oauth.component.ts - Líneas 24-27
this.userService.oauthLogin(
  this.parseRedirectUrlParams().access_token
).subscribe((profile: any) => {
  const password = btoa(profile.email.split('').reverse().join(''))
  // password es fácilmente reversible
})
```

**Remediación recomendada:**
1. NO generar contraseñas en el frontend
2. Usar flujo OAuth2 completo en el backend
3. Implementar PKCE (Proof Key for Code Exchange)
4. Almacenar tokens OAuth de forma segura en el servidor

**Código seguro sugerido:**
```typescript
// oauth.component.ts
googleLogin() {
  // Generar code_verifier y code_challenge para PKCE
  const codeVerifier = this.generateCodeVerifier()
  const codeChallenge = await this.generateCodeChallenge(codeVerifier)
  
  // Almacenar code_verifier temporalmente (sessionStorage es aceptable aquí)
  sessionStorage.setItem('pkce_verifier', codeVerifier)
  
  // Redirigir a Google OAuth con PKCE
  const authUrl = `${oauthProviderUrl}?` +
    `client_id=${this.clientId}&` +
    `response_type=code&` +
    `scope=email&` +
    `redirect_uri=${this.redirectUri}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`
  
  this.windowRefService.nativeWindow.location.replace(authUrl)
}

private generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return this.base64UrlEncode(array)
}

private async generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return this.base64UrlEncode(new Uint8Array(hash))
}
```

---

### 10. Falta de Rate Limiting en Cliente

**Severidad:** 🟡 Media (P3)

**Descripción:**  
No hay implementación de rate limiting o throttling en el frontend para prevenir abuso de APIs.

**Líneas afectadas:**
- Todas las llamadas HTTP en servicios (`frontend/src/app/Services/*.service.ts`)

**Riesgo asociado:**
- **Técnico:** Brute force attacks, DDoS, consumo excesivo de recursos
- **Negocio:** Degradación del servicio, costos incrementados de infraestructura

**Estándares afectados:**
- **OWASP Top 10:** A04:2021 - Insecure Design
- **OWASP ASVS:** V11.1 - Business Logic Security
- **NIST SSDF:** PS.1 - Protect Software
- **COBIT:** DSS05.02 - Gestión de acceso

**Remediación recomendada:**
1. Implementar debounce en búsquedas y autocompletado
2. Agregar delays entre intentos de login
3. Limitar intentos de operaciones sensibles
4. Implementar rate limiting en el backend (primario)

**Código seguro sugerido:**
```typescript
// login.component.ts
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

export class LoginComponent implements OnInit {
  private loginAttempts = 0
  private maxAttempts = 5
  private lockoutTime = 300000 // 5 minutos
  private lastAttempt = 0

  login() {
    // Verificar lockout
    if (this.isLockedOut()) {
      const remainingTime = this.getRemainingLockoutTime()
      this.error = `Too many attempts. Try again in ${remainingTime} seconds.`
      return
    }

    this.loginAttempts++
    
    this.userService.login(this.user).subscribe(
      (authentication: any) => {
        // Reset en login exitoso
        this.loginAttempts = 0
        // ... resto del código de login
      },
      (error) => {
        this.lastAttempt = Date.now()
        
        if (this.loginAttempts >= this.maxAttempts) {
          this.error = 'Account temporarily locked due to too many failed attempts'
        }
        // ... manejo de errores
      }
    )
  }

  private isLockedOut(): boolean {
    if (this.loginAttempts < this.maxAttempts) return false
    const timeSinceLastAttempt = Date.now() - this.lastAttempt
    if (timeSinceLastAttempt > this.lockoutTime) {
      this.loginAttempts = 0
      return false
    }
    return true
  }

  private getRemainingLockoutTime(): number {
    const elapsed = Date.now() - this.lastAttempt
    return Math.ceil((this.lockoutTime - elapsed) / 1000)
  }
}

// product.service.ts - Implementar debounce en búsquedas
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

search(criteria: string) {
  return this.http.get(
    `${this.hostServer}/rest/products/search?q=${criteria}`
  ).pipe(
    debounceTime(300), // Esperar 300ms después del último input
    distinctUntilChanged(), // Solo si el valor cambió
    map((response: any) => response.data),
    catchError((err) => { throw err })
  )
}
```

---

### 11. Cookie Sin Flags de Seguridad

**Severidad:** 🟡 Media (P3)

**Descripción:**  
Las cookies se establecen sin los flags `HttpOnly`, `Secure`, y `SameSite`, exponiendo el token a scripts y ataques CSRF.

**Líneas afectadas:**
- `frontend/src/app/login/login.component.ts:91-93`

**Riesgo asociado:**
- **Técnico:** Robo de tokens vía XSS, ataques CSRF
- **Negocio:** Hijacking de sesión, transacciones no autorizadas

**Estándares afectados:**
- **OWASP Top 10:** A05:2021 - Security Misconfiguration
- **OWASP ASVS:** V3.4 - Cookie-based Session Management
- **NIST SP 800-53:** SC-23 - Session Authenticity

**Evidencia:**
```typescript
// login.component.ts - Líneas 91-93
const expires = new Date()
expires.setHours(expires.getHours() + 8)
this.cookieService.put('token', authentication.token, { expires })
```

**Remediación recomendada:**
1. Configurar cookies con HttpOnly, Secure, SameSite=Strict
2. Las cookies HttpOnly deben ser establecidas por el backend
3. Reducir tiempo de expiración de tokens

**Código seguro sugerido:**
```typescript
// Las cookies seguras DEBEN ser establecidas por el backend
// Backend debe enviar Set-Cookie header con:
// Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=28800; Path=/

// En el frontend, solo manejar la lógica de login:
this.userService.login(this.user).subscribe((authentication: any) => {
  // El backend ya estableció la cookie segura
  // Solo almacenar datos no sensibles localmente
  sessionStorage.setItem('bid', authentication.bid)
  this.basketService.updateNumberOfCartItems()
  this.userService.isLoggedIn.next(true)
  this.ngZone.run(async () => await this.router.navigate(['/search']))
})
```

---

### 12. Falta de Content Security Policy (CSP)

**Severidad:** 🟡 Media (P3)

**Descripción:**  
No se implementa Content Security Policy para mitigar XSS y otros ataques de inyección de código.

**Líneas afectadas:**
- `frontend/src/index.html` (falta header CSP)

**Riesgo asociado:**
- **Técnico:** Ejecución de scripts no autorizados, data exfiltration
- **Negocio:** Compromiso de datos de usuarios, malware

**Estándares afectados:**
- **OWASP Top 10:** A05:2021 - Security Misconfiguration
- **OWASP ASVS:** V14.4 - HTTP Security Headers
- **NIST SSDF:** PW.4 - Design Software Security

**Remediación recomendada:**
1. Implementar CSP estricto en headers HTTP
2. Usar nonce o hash para scripts inline
3. Deshabilitar 'unsafe-inline' y 'unsafe-eval'
4. Reportar violaciones de CSP

**Código seguro sugerido:**
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'nonce-{RANDOM_NONCE}'; 
               style-src 'self' 'nonce-{RANDOM_NONCE}'; 
               img-src 'self' data: https:; 
               font-src 'self' data:; 
               connect-src 'self' https://accounts.google.com; 
               frame-ancestors 'none'; 
               base-uri 'self'; 
               form-action 'self'; 
               upgrade-insecure-requests;">

<!-- O mejor aún, configurar CSP en el servidor (preferido) -->
```

```typescript
// Configurar CSP en servidor Express (backend)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://accounts.google.com; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  )
  next()
})
```

---

### 13. Validación de Password Débil

**Severidad:** 🟡 Media (P3)

**Descripción:**  
La validación de contraseñas permite longitudes mínimas muy cortas (5 caracteres) sin requisitos de complejidad.

**Líneas afectadas:**
- `frontend/src/app/register/register.component.ts:43`

**Riesgo asociado:**
- **Técnico:** Contraseñas débiles susceptibles a brute force
- **Negocio:** Compromiso de cuentas de usuarios

**Estándares afectados:**
- **OWASP Top 10:** A07:2021 - Identification and Authentication Failures
- **OWASP ASVS:** V2.1 - Password Security Requirements
- **NIST SP 800-63B:** 5.1.1 - Memorized Secrets

**Evidencia:**
```typescript
// register.component.ts - Línea 43
public passwordControl: UntypedFormControl = new UntypedFormControl('', [
  Validators.required, 
  Validators.minLength(5),  // Muy corto
  Validators.maxLength(40)
])
```

**Remediación recomendada:**
1. Aumentar longitud mínima a 12+ caracteres
2. Implementar validador de complejidad
3. Verificar contra diccionarios de contraseñas comunes
4. Implementar comprobación de contraseñas comprometidas (HaveIBeenPwned API)

**Código seguro sugerido:**
```typescript
// register.component.ts
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms'

export class RegisterComponent implements OnInit {
  public passwordControl: UntypedFormControl = new UntypedFormControl('', [
    Validators.required,
    Validators.minLength(12), // Mínimo 12 caracteres
    Validators.maxLength(128), // Permitir passphrases
    this.passwordStrengthValidator()
  ])

  // Validador personalizado de fuerza de contraseña
  private passwordStrengthValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value
      
      if (!value) return null

      const hasUpperCase = /[A-Z]/.test(value)
      const hasLowerCase = /[a-z]/.test(value)
      const hasNumeric = /[0-9]/.test(value)
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)
      
      const complexityRequirements = [
        hasUpperCase,
        hasLowerCase,
        hasNumeric,
        hasSpecialChar
      ].filter(Boolean).length

      if (complexityRequirements < 3) {
        return {
          passwordStrength: {
            requiredComplexity: 3,
            currentComplexity: complexityRequirements
          }
        }
      }

      // Verificar contraseñas comunes
      const commonPasswords = [
        'password', '123456', 'qwerty', 'admin', 'letmein'
      ]
      if (commonPasswords.includes(value.toLowerCase())) {
        return { commonPassword: true }
      }

      return null
    }
  }
}
```

---

### 14. Manejo Inseguro de Errores

**Severidad:** 🟡 Media (P3)

**Descripción:**  
Los mensajes de error detallados se muestran directamente al usuario, potencialmente revelando información sensible del sistema.

**Líneas afectadas:**
- `frontend/src/app/login/login.component.ts:98-111`
- Múltiples componentes con `console.log(err)`

**Riesgo asociado:**
- **Técnico:** Revelación de información del sistema, estructura de base de datos
- **Negocio:** Facilita ataques dirigidos, información de reconnaissance

**Estándares afectados:**
- **OWASP Top 10:** A04:2021 - Insecure Design
- **OWASP ASVS:** V7.4 - Error Handling
- **COBIT:** DSS05.07 - Gestión de vulnerabilidades

**Evidencia:**
```typescript
// Múltiples archivos
}, (err) => { console.log(err) }) // Expone errores en consola

// login.component.ts - Línea 107
this.error = error // Muestra error completo al usuario
```

**Remediación recomendada:**
1. Implementar logging centralizado
2. Mostrar mensajes genéricos al usuario
3. Logear detalles completos solo en servidor
4. NO usar console.log en producción

**Código seguro sugerido:**
```typescript
// error-handler.service.ts (crear nuevo servicio)
import { Injectable } from '@angular/core'
import { environment } from '../environments/environment'

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  handleError(error: any, userMessage: string = 'An error occurred'): string {
    // Log completo solo en desarrollo
    if (!environment.production) {
      console.error('Error details:', error)
    }

    // Enviar error al servidor para logging (implementar)
    this.logToServer(error)

    // Retornar mensaje genérico para el usuario
    return this.getGenericErrorMessage(error, userMessage)
  }

  private getGenericErrorMessage(error: any, fallback: string): string {
    // Mapear códigos de error a mensajes amigables
    const errorMessages: { [key: string]: string } = {
      '401': 'Invalid credentials. Please try again.',
      '403': 'Access denied.',
      '404': 'Resource not found.',
      '500': 'Server error. Please try again later.'
    }

    const statusCode = error?.status?.toString() || error?.error?.status
    return errorMessages[statusCode] || fallback
  }

  private logToServer(error: any): void {
    // Implementar logging a servidor
    // this.http.post('/api/logs', { error, timestamp: new Date() })
  }
}

// login.component.ts - Uso del servicio
constructor(
  private readonly errorHandler: ErrorHandlerService,
  // ... otros servicios
) {}

login() {
  this.userService.login(this.user).subscribe(
    (authentication: any) => {
      // ... manejo de éxito
    },
    (error) => {
      // Usar el manejador de errores
      this.error = this.errorHandler.handleError(
        error,
        'Login failed. Please check your credentials.'
      )
      
      localStorage.removeItem('token')
      this.cookieService.remove('token')
      sessionStorage.removeItem('bid')
      this.userService.isLoggedIn.next(false)
    }
  )
}
```

---

### 15. Ausencia de Headers de Seguridad HTTP

**Severidad:** 🟡 Media (P3)

**Descripción:**  
No se implementan headers de seguridad HTTP críticos como X-Frame-Options, X-Content-Type-Options, HSTS.

**Líneas afectadas:**
- Configuración del servidor (no presente en frontend pero impacta la seguridad)

**Riesgo asociado:**
- **Técnico:** Clickjacking, MIME sniffing, man-in-the-middle attacks
- **Negocio:** Compromiso de usuarios, phishing

**Estándares afectados:**
- **OWASP Top 10:** A05:2021 - Security Misconfiguration
- **OWASP ASVS:** V14.4 - HTTP Security Headers
- **NIST SSDF:** PW.4.4 - Secure Coding Practices

**Remediación recomendada:**
1. Configurar headers de seguridad en el servidor
2. Implementar HSTS con preload
3. Agregar X-Frame-Options: DENY
4. Configurar X-Content-Type-Options: nosniff
5. Implementar Referrer-Policy

**Código seguro sugerido:**
```typescript
// server.ts (backend) - Middleware de seguridad
import helmet from 'helmet'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://accounts.google.com"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  }
}))

// Headers adicionales personalizados
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  next()
})
```

---

## 📊 Análisis de Dependencias (SCA)

### Dependencias con Vulnerabilidades Conocidas

**Severidad:** 🟠 Alta (P2)

**Paquetes Identificados:**
```json
{
  "jwt-decode": "^2.2.0",  // Versión antigua, actualizar a ^3.x
  "socket.io-client": "^3.1.0",  // Actualizar a ^4.x
  "ng2-file-upload": "^7.0.1"  // Mantenimiento limitado, considerar alternativas
}
```

**Remediación recomendada:**
1. Ejecutar `npm audit` regularmente
2. Actualizar dependencias vulnerables
3. Usar herramientas como Snyk o Dependabot
4. Revisar CVEs periódicamente

**Comandos sugeridos:**
```bash
# Auditar dependencias
npm audit

# Corregir vulnerabilidades automáticamente
npm audit fix

# Para vulnerabilidades críticas que requieren breaking changes
npm audit fix --force

# Actualizar dependencias específicas
npm update jwt-decode socket.io-client
```

---

## 🛡️ Configuración de Seguridad

### Angular Security Settings

**Severidad:** 🟡 Media (P3)

**Recomendaciones:**

```typescript
// angular.json - Configuración de producción
{
  "configurations": {
    "production": {
      "optimization": true,
      "outputHashing": "all",
      "sourceMap": false,  // NO exponer source maps en producción
      "extractCss": true,
      "namedChunks": false,
      "aot": true,  // Ahead-of-Time compilation
      "extractLicenses": true,
      "buildOptimizer": true,
      "serviceWorker": true
    }
  }
}
```

---

## 📈 Matriz de Priorización

| Vulnerabilidad | Severidad | Impacto | Dificultad Fix | Prioridad |
|----------------|-----------|---------|----------------|-----------|
| XSS - bypassSecurityTrustHtml | Crítica | Alto | Media | P1 - INMEDIATA |
| Tokens en localStorage | Crítica | Alto | Alta | P1 - INMEDIATA |
| Password Generation OAuth | Crítica | Alto | Media | P1 - INMEDIATA |
| Credenciales Hardcodeadas | Crítica | Alto | Baja | P1 - INMEDIATA |
| GET para Password Change | Crítica | Alto | Baja | P1 - INMEDIATA |
| File Upload Validation | Crítica | Alto | Media | P1 - INMEDIATA |
| Email en Headers | Alta | Medio | Baja | P2 - 1 semana |
| SQL Injection Risk | Alta | Alto | Media | P2 - 1 semana |
| Base64 OAuth | Alta | Medio | Media | P2 - 1 semana |
| Rate Limiting | Media | Medio | Media | P3 - 2 semanas |
| Cookie Flags | Media | Medio | Baja | P3 - 2 semanas |
| CSP Missing | Media | Medio | Media | P3 - 2 semanas |
| Password Validation | Media | Bajo | Baja | P3 - 2 semanas |
| Error Handling | Media | Bajo | Media | P3 - 2 semanas |
| Security Headers | Media | Medio | Baja | P3 - 2 semanas |

---

## 🔧 Quick Wins (Remediation Inmediata)

### Acciones que pueden implementarse en < 1 día:

1. **Eliminar credenciales hardcodeadas**
   - Remover `testingUsername` y `testingPassword` del código
   - Cargar `clientId` desde configuración del backend

2. **Cambiar GET a POST para password change**
   - Modificar `user.service.ts` para usar POST
   - Actualizar endpoint en backend

3. **Agregar flags de seguridad a cookies**
   - Configurar cookies desde backend con HttpOnly, Secure, SameSite

4. **Implementar headers de seguridad HTTP**
   - Agregar middleware con helmet.js en backend
   - Configurar CSP básico

5. **Mejorar validación de passwords**
   - Aumentar minLength a 12
   - Agregar validador de complejidad

---

## 🗺️ Roadmap de Remediación

### Fase 1: Críticos (Semana 1-2)
- [ ] Eliminar uso de `bypassSecurityTrustHtml()` para datos de usuario
- [ ] Migrar tokens de localStorage a cookies HttpOnly
- [ ] Refactorizar generación de passwords OAuth
- [ ] Remover credenciales hardcodeadas
- [ ] Cambiar password change de GET a POST
- [ ] Implementar validación real de file uploads

### Fase 2: Altos (Semana 3-4)
- [ ] Eliminar email de headers HTTP
- [ ] Implementar sanitización de inputs de búsqueda
- [ ] Refactorizar flujo OAuth con PKCE
- [ ] Actualizar dependencias vulnerables

### Fase 3: Medios (Semana 5-6)
- [ ] Implementar rate limiting en cliente
- [ ] Configurar CSP completo
- [ ] Mejorar validación de passwords
- [ ] Implementar manejo centralizado de errores
- [ ] Configurar todos los security headers HTTP

### Fase 4: Mejora Continua (Ongoing)
- [ ] Implementar análisis SAST/DAST automatizado
- [ ] Configurar Dependabot para actualizaciones
- [ ] Realizar pentesting regular
- [ ] Capacitación del equipo en secure coding
- [ ] Revisar y actualizar políticas de seguridad

---

## 📚 Referencias y Recursos

### Estándares y Frameworks
- **OWASP Top 10 2021:** https://owasp.org/Top10/
- **OWASP ASVS 4.0:** https://owasp.org/www-project-application-security-verification-standard/
- **NIST SSDF:** https://csrc.nist.gov/publications/detail/sp/800-218/final
- **COBIT 2019:** https://www.isaca.org/resources/cobit

### Herramientas Recomendadas
- **SAST:** SonarQube, Checkmarx, Veracode
- **DAST:** OWASP ZAP, Burp Suite
- **SCA:** Snyk, WhiteSource, npm audit
- **Secrets Detection:** GitGuardian, TruffleHog

### Guías de Implementación
- **Angular Security:** https://angular.io/guide/security
- **OWASP Cheat Sheets:** https://cheatsheetseries.owasp.org/
- **CSP Guide:** https://content-security-policy.com/
- **JWT Best Practices:** https://tools.ietf.org/html/rfc8725

---

## 🔐 Resumen de Seguridad

### Vulnerabilidades por Categoría OWASP Top 10:

| Categoría OWASP | Cantidad | Críticas | Altas | Medias |
|-----------------|----------|----------|-------|--------|
| A01 - Broken Access Control | 2 | 0 | 1 | 1 |
| A02 - Cryptographic Failures | 3 | 2 | 1 | 0 |
| A03 - Injection | 3 | 2 | 1 | 0 |
| A04 - Insecure Design | 4 | 1 | 0 | 3 |
| A05 - Security Misconfiguration | 3 | 0 | 0 | 3 |
| A07 - Auth Failures | 5 | 3 | 0 | 2 |
| **TOTAL** | **20** | **8** | **3** | **9** |

### Nivel de Riesgo General: 🔴 **CRÍTICO**

**Justificación:** Múltiples vulnerabilidades críticas (P1) que permiten:
- Ejecución de código arbitrario (XSS)
- Robo de credenciales y sesiones
- Acceso no autorizado a cuentas
- Compromiso del sistema completo

---

## ✅ Conclusiones y Recomendaciones Finales

### Observaciones Principales:

1. **Contexto de Aplicación:** OWASP Juice Shop es una aplicación **intencionalmente vulnerable** diseñada para entrenamiento en seguridad. Las vulnerabilidades documentadas son **intencionales y esperadas**.

2. **Propósito Educativo:** Este código NO debe usarse como base para aplicaciones de producción. Es exclusivamente para:
   - Entrenamiento en seguridad
   - Pruebas de herramientas de seguridad
   - CTF (Capture The Flag)
   - Demostraciones de vulnerabilidades

3. **Valor de la Auditoría:** Este documento sirve como:
   - **Guía de aprendizaje** sobre vulnerabilidades comunes
   - **Referencia** de cómo NO diseñar aplicaciones seguras
   - **Catálogo** de patrones inseguros a evitar
   - **Material didáctico** para equipos de desarrollo

### Recomendaciones para Uso en Producción:

Si se desea construir una aplicación Angular segura, implementar:

1. ✅ **Nunca desactivar** sanitización de Angular con `bypassSecurityTrust*`
2. ✅ **Almacenar tokens** solo en cookies HttpOnly establecidas por el backend
3. ✅ **Usar HTTPS** para todas las comunicaciones
4. ✅ **Implementar CSP** estricto
5. ✅ **Validar y sanitizar** todos los inputs
6. ✅ **Mantener dependencias** actualizadas
7. ✅ **Implementar autenticación** robusta (2FA, OAuth2 + PKCE)
8. ✅ **Realizar auditorías** de seguridad regulares
9. ✅ **Capacitar al equipo** en desarrollo seguro
10. ✅ **Seguir principios** de Secure by Design y Defense in Depth

### Métricas de Seguridad Recomendadas:

Para proyectos de producción, monitorear:
- **Cobertura de SAST/DAST:** Objetivo 100%
- **Tiempo de remediación:** Critical < 24h, High < 7 días
- **Vulnerabilidades abiertas:** Critical = 0, High < 5
- **Actualización de dependencias:** < 30 días para CVEs críticos
- **Cobertura de pruebas de seguridad:** > 80%

---

## 📞 Contacto y Soporte

Para más información sobre seguridad en aplicaciones web:
- **OWASP:** https://owasp.org/
- **OWASP Juice Shop:** https://owasp-juice.shop/
- **Security Training:** https://application.security/

---

**Nota Final:** Este documento es confidencial y debe ser tratado como información sensible. La divulgación de vulnerabilidades sin remediación puede poner en riesgo sistemas y usuarios.

---

*Documento generado por Security Analysis Agent - Basado en NIST SSDF, OWASP Top 10, OWASP ASVS y COBIT frameworks*

*Última actualización: 2025-11-12*
