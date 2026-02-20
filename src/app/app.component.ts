import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Coco Colima - AWS Amplify Presentation';

  // Connection Form Data
  url: string = '';
  username: string = '';
  password: string = '';
  companyDb: string = '';

  // UI State
  loading: boolean = false;
  successMessage: string = '';
  errorMessage: string = '';

  // App State after connection
  isConnected: boolean = false;
  sessionId: string = '';
  sslWarning: boolean = false; // Mostrar guía de certificado SSL

  // Articles Data
  items: any[] = [];
  loadingItems: boolean = false;
  itemsError: string = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    // Recuperar credenciales al cargar la página (Variables de Entorno o local)
    this.url = environment.url || localStorage.getItem('amplifyDemo_url') || '';
    this.companyDb = environment.companyDb || localStorage.getItem('amplifyDemo_companyDb') || '';
    this.username = environment.username || localStorage.getItem('amplifyDemo_username') || '';
    this.password = environment.password || localStorage.getItem('amplifyDemo_password') || '';
  }

  // Detectar si estamos en localhost (desarrollo) o en Amplify (producción)
  private isLocalhost(): boolean {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }

  // Limpiar la URL base del ServiceLayer ingresada por el usuario
  private getSapBaseUrl(): string {
    let sapUrl = this.url.trim();
    // Eliminar trailing slash y la parte /b1s/v1 o /b1s/v2 si ya la incluyeron
    sapUrl = sapUrl.replace(/\/b1s\/(v1|v2)\/?$/i, '').replace(/\/$/, '');
    return sapUrl;
  }

  // URL del certificado para que el usuario lo acepte en el browser
  get certAcceptUrl(): string {
    return this.getSapBaseUrl() || 'https://tu-servidor-sap:50000';
  }

  onConnect() {
    this.successMessage = '';
    this.errorMessage = '';
    this.sslWarning = false;

    if (!this.url || !this.username || !this.password || !this.companyDb) {
      this.errorMessage = 'Por favor, complete todos los campos de conexión.';
      return;
    }

    this.loading = true;

    // Guardar credenciales para la próxima vez
    localStorage.setItem('amplifyDemo_url', this.url);
    localStorage.setItem('amplifyDemo_companyDb', this.companyDb);
    localStorage.setItem('amplifyDemo_username', this.username);
    localStorage.setItem('amplifyDemo_password', this.password);

    // En LOCAL usamos el proxy relativo (/b1s/v2) → proxy.conf.json lo redirige a SAP
    // En PRODUCCIÓN (Amplify) llamamos directamente a SAP con la URL completa del formulario
    let loginUrl: string;
    if (this.isLocalhost()) {
      loginUrl = '/b1s/v2/Login';
    } else {
      const sapBase = this.getSapBaseUrl();
      loginUrl = `${sapBase}/b1s/v2/Login`;
    }

    const body = {
      CompanyDB: this.companyDb,
      UserName: this.username,
      Password: this.password
    };

    const options: any = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      }),
      responseType: 'text'
    };

    this.http.post(loginUrl, body, options).subscribe({
      next: (res: any) => {
        let response = res;
        try { response = JSON.parse(res); } catch (e) { }

        this.loading = false;
        this.isConnected = true;
        this.sessionId = response?.SessionId || '';
        this.successMessage = `¡Conexión exitosa a ServiceLayer! SessionId: ${this.sessionId}`;
      },
      error: (err) => {
        this.loading = false;
        console.error('Detalle del Error DEV:', err);

        // Caso 1: Amplify regresó su propia página HTML (rewrite mal configurado)
        if (err.error && typeof err.error === 'string' && err.error.includes('<html')) {
          this.errorMessage = 'El servidor devolvió HTML. En entorno local, verifica proxy.conf.json. En Amplify, la llamada directa a SAP está bloqueada por el navegador (CORS/SSL).';
          this.sslWarning = !this.isLocalhost();

          // Caso 2: Error de red / CORS / SSL (status 0 = browser rechazó la petición)
        } else if (err.status === 0) {
          if (!this.isLocalhost()) {
            this.sslWarning = true;
            this.errorMessage = 'El navegador bloqueó la conexión a SAP. Esto es por el certificado SSL auto-firmado del servidor SAP. Sigue las instrucciones abajo para resolverlo.';
          } else {
            this.errorMessage = 'Error de conexión (CORS o fallo de red). Verifica que el proxy local esté activo y que SAP ServiceLayer esté corriendo.';
          }

          // Caso 3: SAP respondió pero con error (credenciales, BD, etc.)
        } else {
          let errMsg = err.message;
          try {
            const parsedError = JSON.parse(err.error);
            errMsg = parsedError.error?.message?.value || errMsg;
          } catch (e) {
            errMsg = err.error || errMsg;
          }
          this.errorMessage = `Error SAP (${err.status}): ${(errMsg || '').substring(0, 200)}`;
        }
      }
    });
  }

  fetchItems() {
    this.loadingItems = true;
    this.itemsError = '';

    // En LOCAL usamos proxy relativo; en producción, URL directa a SAP
    let itemsUrl: string;
    if (this.isLocalhost()) {
      itemsUrl = `/b1s/v2/Items?$top=5&$select=ItemCode,ItemName`;
    } else {
      const sapBase = this.getSapBaseUrl();
      itemsUrl = `${sapBase}/b1s/v2/Items?$top=5&$select=ItemCode,ItemName`;
    }

    const options = {
      withCredentials: true, // Envía la cookie B1SESSION automáticamente
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    };

    this.http.get(itemsUrl, options).subscribe({
      next: (response: any) => {
        this.loadingItems = false;
        this.items = response?.value || [];
      },
      error: (err) => {
        this.loadingItems = false;
        if (err.status === 0) {
          this.itemsError = 'Error de conexión al consultar artículos. Es posible un problema de CORS o con las cookies de sesión (B1SESSION). Intenta re-conectar.';
        } else {
          this.itemsError = `Error al obtener artículos (${err.status}): ${err.error?.error?.message?.value || err.message}`;
        }
      }
    });
  }
}

